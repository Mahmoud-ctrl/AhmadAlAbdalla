-- Phase 2: branch movement transfers with line items, events, and RLS.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'transfer_status') then
    create type public.transfer_status as enum (
      'pending_receipt',
      'confirmed',
      'needs_admin_review',
      'admin_resolved',
      'cancelled'
    );
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'transfers'
      and column_name = 'item_id'
  ) and not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'transfer_lines'
  ) then
    alter table public.transfers rename to transfers_legacy_20260608;
  end if;
end $$;

create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  sender_branch_id uuid not null references public.branches(id) on delete restrict,
  receiver_branch_id uuid not null references public.branches(id) on delete restrict,
  status public.transfer_status not null default 'pending_receipt',
  created_by uuid not null references auth.users(id) on delete restrict,
  received_by uuid null references auth.users(id) on delete restrict,
  resolved_by uuid null references auth.users(id) on delete restrict,
  sent_at timestamptz not null default now(),
  received_at timestamptz null,
  resolved_at timestamptz null,
  notes text null,
  admin_notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transfers_different_branches_chk check (sender_branch_id <> receiver_branch_id)
);

create table if not exists public.transfer_lines (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.transfers(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  quantity_sent numeric not null,
  quantity_received numeric null,
  unit_price_snapshot numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transfer_lines_quantity_sent_chk check (quantity_sent > 0),
  constraint transfer_lines_quantity_received_chk check (quantity_received is null or quantity_received >= 0),
  constraint transfer_lines_unit_price_snapshot_chk check (unit_price_snapshot >= 0),
  constraint transfer_lines_item_once_unique unique (transfer_id, item_id)
);

create table if not exists public.transfer_events (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.transfers(id) on delete cascade,
  actor_id uuid null references auth.users(id) on delete set null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.branches
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.items
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'items_price_per_unit_non_negative_chk'
  ) then
    alter table public.items
      add constraint items_price_per_unit_non_negative_chk check (price_per_unit >= 0);
  end if;
end $$;

create unique index if not exists branches_name_unique on public.branches (lower(name));
create unique index if not exists items_name_unit_unique on public.items (lower(name), unit);
create index if not exists transfers_sender_branch_idx on public.transfers (sender_branch_id);
create index if not exists transfers_receiver_branch_idx on public.transfers (receiver_branch_id);
create index if not exists transfers_status_idx on public.transfers (status);
create index if not exists transfers_sent_at_idx on public.transfers (sent_at desc);
create index if not exists transfer_lines_transfer_id_idx on public.transfer_lines (transfer_id);
create index if not exists transfer_lines_item_id_idx on public.transfer_lines (item_id);
create index if not exists transfer_events_transfer_id_idx on public.transfer_events (transfer_id, created_at desc);

drop trigger if exists set_branches_updated_at on public.branches;
create trigger set_branches_updated_at
before update on public.branches
for each row
execute function public.set_updated_at();

drop trigger if exists set_items_updated_at on public.items;
create trigger set_items_updated_at
before update on public.items
for each row
execute function public.set_updated_at();

drop trigger if exists set_transfers_updated_at on public.transfers;
create trigger set_transfers_updated_at
before update on public.transfers
for each row
execute function public.set_updated_at();

drop trigger if exists set_transfer_lines_updated_at on public.transfer_lines;
create trigger set_transfer_lines_updated_at
before update on public.transfer_lines
for each row
execute function public.set_updated_at();

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'transfers_legacy_20260608'
  ) then
    execute $backfill$
      insert into public.transfers (
        id,
        sender_branch_id,
        receiver_branch_id,
        status,
        created_by,
        sent_at,
        received_at,
        notes,
        created_at,
        updated_at
      )
      select
        id,
        from_branch_id,
        to_branch_id,
        case
          when status = 'returned' then 'confirmed'::public.transfer_status
          when status = 'partial' then 'needs_admin_review'::public.transfer_status
          else 'pending_receipt'::public.transfer_status
        end,
        (select id from auth.users order by created_at limit 1),
        date,
        return_date,
        notes,
        date,
        now()
      from public.transfers_legacy_20260608
      where exists (select 1 from auth.users)
      on conflict (id) do nothing
    $backfill$;

    execute $backfill$
      insert into public.transfer_lines (
        transfer_id,
        item_id,
        quantity_sent,
        quantity_received,
        unit_price_snapshot,
        created_at,
        updated_at
      )
      select
        legacy.id,
        legacy.item_id,
        legacy.quantity,
        legacy.quantity_returned,
        coalesce(items.price_per_unit, 0),
        legacy.date,
        now()
      from public.transfers_legacy_20260608 legacy
      left join public.items on items.id = legacy.item_id
      where exists (
        select 1
        from public.transfers
        where transfers.id = legacy.id
      )
      on conflict (transfer_id, item_id) do nothing
    $backfill$;

    execute 'alter table public.transfers_legacy_20260608 enable row level security';
  end if;
end $$;

create or replace function private.is_active_user()
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
      and active = true
  );
$$;

create or replace function private.is_super_admin()
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
      and role = 'super_admin'
      and active = true
  );
$$;

create or replace function private.current_branch_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select branch_id
  from public.user_profiles
  where id = (select auth.uid())
    and active = true;
$$;

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

drop function if exists public.create_transfer(uuid, jsonb, timestamptz, text);

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

revoke all on function public.create_transfer(uuid, jsonb, timestamptz, text, uuid) from public;
revoke all on function public.receive_transfer(uuid, jsonb, text) from public;
revoke all on function public.admin_resolve_transfer(uuid, public.transfer_status, text) from public;

grant execute on function public.create_transfer(uuid, jsonb, timestamptz, text, uuid) to authenticated;
grant execute on function public.receive_transfer(uuid, jsonb, text) to authenticated;
grant execute on function public.admin_resolve_transfer(uuid, public.transfer_status, text) to authenticated;

alter table public.branches enable row level security;
alter table public.items enable row level security;
alter table public.transfers enable row level security;
alter table public.transfer_lines enable row level security;
alter table public.transfer_events enable row level security;

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

drop policy if exists "Users read scoped transfers" on public.transfers;
drop policy if exists "Super admins manage transfers" on public.transfers;
create policy "Users read scoped transfers"
on public.transfers for select to authenticated
using (private.can_read_transfer(transfers));
create policy "Super admins manage transfers"
on public.transfers for all to authenticated
using (private.is_super_admin())
with check (private.is_super_admin());

drop policy if exists "Users read scoped transfer lines" on public.transfer_lines;
drop policy if exists "Super admins manage transfer lines" on public.transfer_lines;
create policy "Users read scoped transfer lines"
on public.transfer_lines for select to authenticated
using (
  exists (
    select 1
    from public.transfers
    where transfers.id = transfer_lines.transfer_id
      and private.can_read_transfer(transfers)
  )
);
create policy "Super admins manage transfer lines"
on public.transfer_lines for all to authenticated
using (private.is_super_admin())
with check (private.is_super_admin());

drop policy if exists "Users read scoped transfer events" on public.transfer_events;
drop policy if exists "Super admins manage transfer events" on public.transfer_events;
create policy "Users read scoped transfer events"
on public.transfer_events for select to authenticated
using (
  exists (
    select 1
    from public.transfers
    where transfers.id = transfer_events.transfer_id
      and private.can_read_transfer(transfers)
  )
);
create policy "Super admins manage transfer events"
on public.transfer_events for all to authenticated
using (private.is_super_admin())
with check (private.is_super_admin());
