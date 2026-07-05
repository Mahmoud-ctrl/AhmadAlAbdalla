-- District Manager role: bridge table + branch-set-aware scoping.
-- Run this only after 202607050001_district_manager_enum.sql has been
-- applied and committed on its own.

-- 1. Bridge table: which branches a district_manager is assigned to.
create table if not exists public.district_manager_branches (
  user_id    uuid not null references public.user_profiles(id) on delete cascade,
  branch_id  uuid not null references public.branches(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (user_id, branch_id)
);

create index if not exists district_manager_branches_branch_id_idx
  on public.district_manager_branches (branch_id);

alter table public.district_manager_branches enable row level security;

drop policy if exists "District managers read own branch assignments" on public.district_manager_branches;
create policy "District managers read own branch assignments"
on public.district_manager_branches
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Super admins manage district manager branches" on public.district_manager_branches;
create policy "Super admins manage district manager branches"
on public.district_manager_branches
for all
to authenticated
using (private.is_super_admin())
with check (private.is_super_admin());

-- 2. Update the role/branch invariant: district_manager keeps branch_id
-- null on user_profiles (same as super_admin) — its branches live only
-- in the bridge table above.
alter table public.user_profiles drop constraint if exists user_profiles_role_branch_chk;
alter table public.user_profiles add constraint user_profiles_role_branch_chk
  check (
    (role = 'super_admin' and branch_id is null)
    or (role = 'branch_manager' and branch_id is not null)
    or (role = 'district_manager' and branch_id is null)
  );

-- 3. Role-check helper, mirrors private.is_super_admin().
create or replace function private.is_district_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles
    where id = (select auth.uid())
      and role = 'district_manager'
      and active = true
  );
$$;

-- 4. Set-returning replacement for the scalar private.current_branch_id().
-- Unions branch_manager's scalar branch_id with district_manager's bridge
-- rows. The active=true gate on the bridge-table side is required so a
-- deactivated district manager loses branch access immediately.
create or replace function private.current_branch_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select branch_id
  from public.user_profiles
  where id = (select auth.uid())
    and active = true
    and branch_id is not null

  union

  select dmb.branch_id
  from public.district_manager_branches dmb
  join public.user_profiles up on up.id = dmb.user_id
  where dmb.user_id = (select auth.uid())
    and up.active = true;
$$;

-- 5. Supersede can_read_transfer: scalar equality -> set membership.
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
      or transfer_row.sender_branch_id in (select private.current_branch_ids())
      or transfer_row.receiver_branch_id in (select private.current_branch_ids())
    );
$$;

-- 6. Supersede create_transfer: sender branch must be a member of the
-- caller's assigned-branch set; auto-default only when that set has
-- exactly one branch (preserves today's branch_manager behavior).
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
  my_branches uuid[];
  new_transfer_id uuid;
  line jsonb;
  line_item_id uuid;
  line_quantity numeric;
  line_price numeric;
begin
  if actor is null or not private.is_active_user() then
    raise exception 'Active login is required.';
  end if;

  select array_agg(b) into my_branches from private.current_branch_ids() b;

  if private.is_super_admin() then
    sender_branch := p_sender_branch_id;

    if sender_branch is null then
      raise exception 'Choose a sender branch for super admin-created transfers.';
    end if;
  else
    if p_sender_branch_id is not null then
      if my_branches is null or not (p_sender_branch_id = any(my_branches)) then
        raise exception 'You can create transfers only from a branch assigned to you.';
      end if;
      sender_branch := p_sender_branch_id;
    else
      if my_branches is null or array_length(my_branches, 1) <> 1 then
        raise exception 'Choose a sender branch from your assigned branches.';
      end if;
      sender_branch := my_branches[1];
    end if;
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

-- 7. Supersede receive_transfer: scalar equality -> set membership on the
-- receiver branch check.
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

  if not private.is_super_admin()
     and not exists (select 1 from private.current_branch_ids() b where b = target.receiver_branch_id) then
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

-- 8. Supersede the incoming-transfer notification trigger function: notify
-- via the same branch_id-or-bridge-table membership, not just branch_id.
create or replace function public.notify_branch_on_transfer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_name text;
begin
  select name into v_sender_name
  from public.branches
  where id = new.sender_branch_id;

  insert into public.notifications (user_id, type, title, body, data)
  select distinct
    up.id,
    'incoming_transfer',
    'New Incoming Transfer',
    'Transfer received from ' || coalesce(v_sender_name, 'another branch'),
    jsonb_build_object(
      'transfer_id',      new.id,
      'sender_branch_id', new.sender_branch_id
    )
  from public.user_profiles up
  where up.active = true
    and (
      up.branch_id = new.receiver_branch_id
      or exists (
        select 1
        from public.district_manager_branches dmb
        where dmb.user_id = up.id
          and dmb.branch_id = new.receiver_branch_id
      )
    );

  return new;
end;
$$;

-- 9. Widen branches/items management to also allow district_manager
-- (system-wide, not scoped to their assigned branches). Read policies on
-- both tables are already unrestricted for any active user and are
-- untouched here.
drop policy if exists "Super admins manage branches" on public.branches;
create policy "Super admins and district managers manage branches"
on public.branches
for all
to authenticated
using (private.is_super_admin() or private.is_district_manager())
with check (private.is_super_admin() or private.is_district_manager());

drop policy if exists "Super admins manage items" on public.items;
create policy "Super admins and district managers manage items"
on public.items
for all
to authenticated
using (private.is_super_admin() or private.is_district_manager())
with check (private.is_super_admin() or private.is_district_manager());
