-- Account roles and manually granted VIP access. Safe to re-run; no payment integration.
begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'normal' check (role in ('normal', 'vip', 'admin')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create or replace function private.create_user_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, case when pg_catalog.lower(new.email) = 'vietnamstephen@gmail.com' then 'admin' else 'normal' end)
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function private.create_user_profile() from public, anon, authenticated;
grant execute on function private.create_user_profile() to service_role;
drop trigger if exists create_user_profile on auth.users;
create trigger create_user_profile after insert on auth.users
for each row execute function private.create_user_profile();
insert into public.profiles (id, email, role)
select id, email, case when pg_catalog.lower(email) = 'vietnamstephen@gmail.com' then 'admin' else 'normal' end
from auth.users on conflict (id) do nothing;
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin');
$$;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated, service_role;
grant usage on schema public to authenticated, service_role;
revoke all on table public.profiles from public, anon, authenticated;
grant select, update on table public.profiles to authenticated;
grant all on table public.profiles to service_role;
drop policy if exists profiles_own_select on public.profiles;
create policy profiles_own_select on public.profiles for select to authenticated using (id = (select auth.uid()));
drop policy if exists profiles_admin_select on public.profiles;
create policy profiles_admin_select on public.profiles for select to authenticated using ((select private.is_admin()));
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
commit;
