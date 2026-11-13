-- Safe to re-run for this schema; existing table definitions are not rewritten.
begin;
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  origin text not null check (char_length(btrim(origin)) between 1 and 120),
  destination text not null check (char_length(btrim(destination)) between 1 and 120),
  trip_date date not null check (trip_date between date '0001-01-01' and date '9999-12-31'),
  flight_no text check (flight_no is null or flight_no = '' or flight_no ~ '^[A-Z0-9]{2}[0-9]{1,4}[A-Z]?$'),
  note text check (char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trips_user_date_idx on public.trips(user_id, trip_date);
create or replace function public.trips_set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  new.created_at = old.created_at;
  return new;
end;
$$;
drop trigger if exists trips_updated_at on public.trips;
create trigger trips_updated_at before update on public.trips
for each row execute function public.trips_set_updated_at();
alter table public.trips enable row level security;
grant usage on schema public to authenticated, service_role;
revoke all on table public.trips from anon;
grant select, insert, update, delete on table public.trips to authenticated;
revoke all on function public.trips_set_updated_at() from public, anon, authenticated;
grant execute on function public.trips_set_updated_at() to service_role;
drop policy if exists trips_select on public.trips;
create policy trips_select on public.trips for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists trips_insert on public.trips;
create policy trips_insert on public.trips for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists trips_update on public.trips;
create policy trips_update on public.trips for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists trips_delete on public.trips;
create policy trips_delete on public.trips for delete to authenticated using (user_id = (select auth.uid()));

create table if not exists public.flight_cache (
  cache_key text primary key,
  tool text not null check (tool in ('searchFlightsByNumber', 'searchFlightsByDepArr', 'getFutureWeatherByAirport')),
  args jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists flight_cache_expiry_idx on public.flight_cache(expires_at);
alter table public.flight_cache enable row level security;
-- No policies: browser roles have no access. Edge Function uses service_role only.
revoke all on table public.flight_cache from anon, authenticated;
grant all on table public.flight_cache to service_role;

commit;
