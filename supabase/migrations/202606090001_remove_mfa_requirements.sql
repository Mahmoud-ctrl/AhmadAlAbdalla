-- Remove app/database MFA requirements from an existing Supabase project.

do $$
begin
  if to_regclass('auth.mfa_challenges') is not null then
    delete from auth.mfa_challenges;
  end if;

  if to_regclass('auth.mfa_factors') is not null then
    delete from auth.mfa_factors;
  end if;
end $$;

create or replace function private.can_read_transfer(transfer_row public.transfers)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.is_active_user()
    and (
      private.is_super_admin()
      or transfer_row.sender_branch_id = private.current_branch_id()
      or transfer_row.receiver_branch_id = private.current_branch_id()
    );
$$;

create or replace function public.create_transfer(
  p_receiver_branch_id uuid,
  p_lines jsonb,
  p_sent_at timestamptz default now(),
  p_notes text default null,
  p_sender_branch_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  sender_branch uuid;
  new_transfer_id uuid;
  line jsonb;
  line_item_id uuid;
  line_quantity numeric;
  line_price numeric;
begin
  if actor is null or not private.is_active_user() then
    raise exception 'Active login is required.';
  end if;

  sender_branch := private.current_branch_id();

  if private.is_super_admin() and p_sender_branch_id is not null then
    sender_branch := p_sender_branch_id;
  end if;

  if not private.is_super_admin() and p_sender_branch_id is not null and p_sender_branch_id <> sender_branch then
    raise exception 'Branch managers can create transfers only from their own branch.';
  end if;

  if sender_branch is null and not private.is_super_admin() then
    raise exception 'Only branch users can create branch transfers.';
  end if;

  if sender_branch is null then
    raise exception 'Choose a sender branch for super admin-created transfers.';
  end if;

  if sender_branch = p_receiver_branch_id then
    raise exception 'Sender and receiver branches must be different.';
  end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one transfer line is required.';
  end if;

  insert into public.transfers (
    sender_branch_id,
    receiver_branch_id,
    status,
    created_by,
    sent_at,
    notes
  )
  values (
    sender_branch,
    p_receiver_branch_id,
    'pending_receipt',
    actor,
    coalesce(p_sent_at, now()),
    nullif(trim(coalesce(p_notes, '')), '')
  )
  returning id into new_transfer_id;

  for line in select * from jsonb_array_elements(p_lines)
  loop
    line_item_id := (line ->> 'item_id')::uuid;
    line_quantity := (line ->> 'quantity_sent')::numeric;

    if line_quantity <= 0 then
      raise exception 'Line quantities must be greater than 0.';
    end if;

    select price_per_unit into line_price
    from public.items
    where id = line_item_id;

    if line_price is null then
      raise exception 'Transfer item does not exist.';
    end if;

    insert into public.transfer_lines (
      transfer_id,
      item_id,
      quantity_sent,
      unit_price_snapshot
    )
    values (
      new_transfer_id,
      line_item_id,
      line_quantity,
      line_price
    );
  end loop;

  insert into public.transfer_events (transfer_id, actor_id, event_type, details)
  values (
    new_transfer_id,
    actor,
    'create',
    jsonb_build_object('line_count', jsonb_array_length(p_lines))
  );

  return new_transfer_id;
end;
$$;

create or replace function public.receive_transfer(
  p_transfer_id uuid,
  p_lines jsonb,
  p_notes text default null
)
returns public.transfer_status
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  target public.transfers;
  line jsonb;
  received_quantity numeric;
  mismatch_count int;
  new_status public.transfer_status;
begin
  if actor is null or not private.is_active_user() then
    raise exception 'Active login is required.';
  end if;

  select * into target
  from public.transfers
  where id = p_transfer_id
  for update;

  if not found then
    raise exception 'Transfer not found.';
  end if;

  if target.status <> 'pending_receipt' then
    raise exception 'Only pending transfers can be received.';
  end if;

  if not private.is_super_admin() and target.receiver_branch_id <> private.current_branch_id() then
    raise exception 'Only the receiving branch can confirm receipt.';
  end if;

  if jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Received lines are required.';
  end if;

  for line in select * from jsonb_array_elements(p_lines)
  loop
    received_quantity := (line ->> 'quantity_received')::numeric;

    if received_quantity < 0 then
      raise exception 'Received quantities cannot be negative.';
    end if;

    update public.transfer_lines
    set quantity_received = received_quantity
    where transfer_id = p_transfer_id
      and id = (line ->> 'line_id')::uuid;

    if not found then
      raise exception 'Received line does not belong to this transfer.';
    end if;
  end loop;

  if exists (
    select 1
    from public.transfer_lines
    where transfer_id = p_transfer_id
      and quantity_received is null
  ) then
    raise exception 'Every transfer line must include a received quantity.';
  end if;

  select count(*) into mismatch_count
  from public.transfer_lines
  where transfer_id = p_transfer_id
    and quantity_received <> quantity_sent;

  new_status := case when mismatch_count = 0 then 'confirmed'::public.transfer_status else 'needs_admin_review'::public.transfer_status end;

  update public.transfers
  set status = new_status,
      received_by = actor,
      received_at = now(),
      notes = case
        when nullif(trim(coalesce(p_notes, '')), '') is null then notes
        when notes is null then trim(p_notes)
        else notes || ' | Receipt note: ' || trim(p_notes)
      end
  where id = p_transfer_id;

  insert into public.transfer_events (transfer_id, actor_id, event_type, details)
  values (
    p_transfer_id,
    actor,
    case when mismatch_count = 0 then 'receive' else 'mismatch' end,
    jsonb_build_object('status', new_status, 'mismatch_count', mismatch_count)
  );

  return new_status;
end;
$$;

create or replace function public.admin_resolve_transfer(
  p_transfer_id uuid,
  p_status public.transfer_status,
  p_admin_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or not private.is_super_admin() then
    raise exception 'Super admin access is required.';
  end if;

  if p_status not in ('admin_resolved', 'cancelled', 'confirmed') then
    raise exception 'Unsupported admin resolution status.';
  end if;

  update public.transfers
  set status = p_status,
      resolved_by = actor,
      resolved_at = now(),
      admin_notes = nullif(trim(coalesce(p_admin_notes, '')), '')
  where id = p_transfer_id
    and status in ('pending_receipt', 'needs_admin_review');

  if not found then
    raise exception 'Transfer is not available for admin resolution.';
  end if;

  insert into public.transfer_events (transfer_id, actor_id, event_type, details)
  values (
    p_transfer_id,
    actor,
    'admin_resolve',
    jsonb_build_object('status', p_status, 'admin_notes', nullif(trim(coalesce(p_admin_notes, '')), ''))
  );
end;
$$;

drop policy if exists "Super admins manage profiles" on public.user_profiles;
create policy "Super admins manage profiles"
on public.user_profiles
for all
to authenticated
using (private.is_super_admin())
with check (private.is_super_admin());

drop policy if exists "Verified users read branches" on public.branches;
drop policy if exists "Active users read branches" on public.branches;
drop policy if exists "Super admins manage branches" on public.branches;
create policy "Active users read branches"
on public.branches for select to authenticated
using (private.is_active_user());
create policy "Super admins manage branches"
on public.branches for all to authenticated
using (private.is_super_admin())
with check (private.is_super_admin());

drop policy if exists "Verified users read items" on public.items;
drop policy if exists "Active users read items" on public.items;
drop policy if exists "Super admins manage items" on public.items;
create policy "Active users read items"
on public.items for select to authenticated
using (private.is_active_user());
create policy "Super admins manage items"
on public.items for all to authenticated
using (private.is_super_admin())
with check (private.is_super_admin());

drop policy if exists "Super admins manage transfers" on public.transfers;
create policy "Super admins manage transfers"
on public.transfers for all to authenticated
using (private.is_super_admin())
with check (private.is_super_admin());

drop policy if exists "Super admins manage transfer lines" on public.transfer_lines;
create policy "Super admins manage transfer lines"
on public.transfer_lines for all to authenticated
using (private.is_super_admin())
with check (private.is_super_admin());

drop policy if exists "Super admins manage transfer events" on public.transfer_events;
create policy "Super admins manage transfer events"
on public.transfer_events for all to authenticated
using (private.is_super_admin())
with check (private.is_super_admin());

drop function if exists private.has_mfa();
