-- Additive sandbox billing; existing manually granted VIPs retain unlimited access.
begin;
alter table public.profiles add column if not exists vip_until timestamptz;
alter table public.profiles add column if not exists paddle_customer_id text;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
create index if not exists profiles_paddle_customer_idx on public.profiles(paddle_customer_id);
revoke update on public.profiles from authenticated;
-- These columns still require the existing admin-only UPDATE RLS policy.
grant update (role, vip_until) on public.profiles to authenticated;

create table if not exists public.subscriptions (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan text, price_id text, status text,
  current_period_end timestamptz, cancel_at timestamptz, scheduled_change jsonb,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_user_idx on public.subscriptions(user_id);
alter table public.subscriptions enable row level security;
revoke all on public.subscriptions from public, anon, authenticated;
grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;
drop policy if exists subscriptions_own_select on public.subscriptions;
create policy subscriptions_own_select on public.subscriptions for select to authenticated
using (user_id = (select auth.uid()));
drop policy if exists subscriptions_admin_select on public.subscriptions;
create policy subscriptions_admin_select on public.subscriptions for select to authenticated
using ((select private.is_admin()));

create table if not exists public.payment_events (
  event_id text primary key, event_type text not null, occurred_at timestamptz not null,
  user_id uuid references public.profiles(id) on delete set null,
  payload jsonb not null, processed_at timestamptz not null default now(), result text
);
alter table public.payment_events enable row level security;
revoke all on public.payment_events from public, anon, authenticated;
grant all on public.payment_events to service_role;

create or replace function private.effective_vip(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = uid and
    (role = 'admin' or (role = 'vip' and (vip_until is null or vip_until > now()))));
$$;
revoke all on function private.effective_vip(uuid) from public, anon, authenticated;
grant execute on function private.effective_vip(uuid) to service_role;

create or replace function public.my_entitlement() returns jsonb
language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'role', coalesce(p.role, 'normal'),
    'effective_role', case when p.role = 'admin' then 'admin' when private.effective_vip(p.id) then 'vip' else 'normal' end,
    'is_vip', private.effective_vip(p.id), 'vip_until', p.vip_until,
    'plan', s.plan, 'subscription_status', s.status, 'cancel_at', s.cancel_at)
  from (select auth.uid() as uid) u
  left join public.profiles p on p.id = u.uid
  left join lateral (select plan, status, cancel_at from public.subscriptions
    where user_id = u.uid order by last_event_at desc nulls last, id limit 1) s on true;
$$;
revoke all on function public.my_entitlement() from public, anon;
grant execute on function public.my_entitlement() to authenticated;
-- Service-only atomic commit for the staged webhook store. Optimistic snapshots plus
-- a transaction lock serialize deliveries and detect admin edits during processing.
create or replace function public.apply_paddle_event(receipt jsonb, profile_patch jsonb,
  subscription_row jsonb, expected_profile jsonb, expected_subscriptions jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare current_profile jsonb; entry record; current_subscription jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(20261114, 200000);
  if exists (select 1 from public.payment_events where event_id = receipt->>'event_id') then
    return '{"duplicate":true}'::jsonb;
  end if;
  if expected_profile is not null then
    select pg_catalog.to_jsonb(p) into current_profile from public.profiles p
      where id = (expected_profile->>'id')::uuid for update;
    if current_profile is distinct from expected_profile then return '{"retry":true}'::jsonb; end if;
  end if;
  for entry in select * from pg_catalog.jsonb_each(expected_subscriptions) loop
    select pg_catalog.to_jsonb(s) into current_subscription from public.subscriptions s where id = entry.key;
    if coalesce(current_subscription, 'null'::jsonb) is distinct from entry.value then return '{"retry":true}'::jsonb; end if;
  end loop;
  if subscription_row is not null then
    insert into public.subscriptions (id,user_id,plan,price_id,status,current_period_end,cancel_at,scheduled_change,last_event_at,updated_at)
    values (subscription_row->>'id',(subscription_row->>'user_id')::uuid,subscription_row->>'plan',subscription_row->>'price_id',
      subscription_row->>'status',(subscription_row->>'current_period_end')::timestamptz,
      (subscription_row->>'cancel_at')::timestamptz,subscription_row->'scheduled_change',
      (subscription_row->>'last_event_at')::timestamptz,(subscription_row->>'updated_at')::timestamptz)
    on conflict (id) do update set plan=excluded.plan,price_id=excluded.price_id,status=excluded.status,
      current_period_end=excluded.current_period_end,cancel_at=excluded.cancel_at,scheduled_change=excluded.scheduled_change,
      last_event_at=excluded.last_event_at,updated_at=excluded.updated_at;
  end if;
  if expected_profile is not null then
    update public.profiles set
      role = case when profile_patch ? 'role' then profile_patch->>'role' else role end,
      vip_until = case when profile_patch ? 'vip_until' then (profile_patch->>'vip_until')::timestamptz else vip_until end,
      paddle_customer_id = case when profile_patch ? 'paddle_customer_id' then profile_patch->>'paddle_customer_id' else paddle_customer_id end,
      updated_at = coalesce((profile_patch->>'updated_at')::timestamptz, updated_at)
    where id = (expected_profile->>'id')::uuid;
  end if;
  insert into public.payment_events(event_id,event_type,occurred_at,user_id,payload,result)
  values(receipt->>'event_id',receipt->>'event_type',(receipt->>'occurred_at')::timestamptz,
    (receipt->>'user_id')::uuid,receipt->'payload',receipt->>'result');
  return '{"duplicate":false}'::jsonb;
end;
$$;
revoke all on function public.apply_paddle_event(jsonb,jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.apply_paddle_event(jsonb,jsonb,jsonb,jsonb,jsonb) to service_role;
commit;
