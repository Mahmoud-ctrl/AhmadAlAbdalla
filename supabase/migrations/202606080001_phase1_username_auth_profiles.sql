-- Phase 1: app users / usernames / roles
-- Safe to run before transfer-table redesign.
-- Do NOT add custom columns to auth.users.
-- Managers do not self-sign up. Create manager auth users only with
-- server-side Supabase Admin API calls, then insert their profile here.
-- Disable public signups in the Supabase dashboard.
-- Supabase Auth users use an internal email derived from username.
-- Mobile number is profile/contact data only; do not enable phone login.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('super_admin', 'branch_manager');
  end if;
end $$;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,

  username text not null,
  mobile_number text not null,
  full_name text,

  branch_id uuid null references public.branches(id) on delete restrict,
  role public.app_role not null default 'branch_manager',

  active boolean not null default true,
  must_change_password boolean not null default true,

  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_profiles_username_format_chk
    check (username = lower(username) and username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),

  constraint user_profiles_mobile_format_chk
    check (mobile_number ~ '^\+[1-9][0-9]{7,14}$'),

  constraint user_profiles_role_branch_chk
    check (
      (role = 'super_admin' and branch_id is null)
      or
      (role = 'branch_manager' and branch_id is not null)
    )
);

create unique index if not exists user_profiles_username_unique
  on public.user_profiles (lower(username));

create unique index if not exists user_profiles_mobile_number_unique
  on public.user_profiles (mobile_number);

create index if not exists user_profiles_branch_id_idx
  on public.user_profiles (branch_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_profiles_updated_at on public.user_profiles;

create trigger set_user_profiles_updated_at
before update on public.user_profiles
for each row
execute function public.set_updated_at();

create schema if not exists private;

create or replace function private.has_mfa()
returns boolean
language sql
stable
as $$
  select coalesce((select auth.jwt() ->> 'aal') = 'aal2', false);
$$;

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

create or replace function public.mark_password_changed()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_profiles
  set must_change_password = false
  where id = (select auth.uid())
    and active = true;
end;
$$;

grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;

revoke all on function public.mark_password_changed() from public;
grant execute on function public.mark_password_changed() to authenticated;

alter table public.user_profiles enable row level security;

drop policy if exists "Users can read own profile" on public.user_profiles;
drop policy if exists "Super admins manage profiles" on public.user_profiles;

create policy "Users can read own profile"
on public.user_profiles
for select
to authenticated
using (
  id = (select auth.uid())
  and active = true
);

create policy "Super admins manage profiles"
on public.user_profiles
for all
to authenticated
using (
  private.has_mfa()
  and private.is_super_admin()
)
with check (
  private.has_mfa()
  and private.is_super_admin()
);
