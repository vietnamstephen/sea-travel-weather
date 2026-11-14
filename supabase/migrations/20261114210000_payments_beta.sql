begin;
alter table public.profiles add column if not exists payments_beta boolean not null default false;
-- The existing admin-only UPDATE policy still applies.
grant update (payments_beta) on public.profiles to authenticated;

create or replace function public.my_entitlement() returns jsonb
language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'role', coalesce(p.role, 'normal'),
    'effective_role', case when p.role = 'admin' then 'admin' when private.effective_vip(p.id) then 'vip' else 'normal' end,
    'is_vip', private.effective_vip(p.id), 'vip_until', p.vip_until,
    'payments_beta', coalesce(p.payments_beta, false),
    'payments_visible', (coalesce(p.role = 'admin', false) or coalesce(p.payments_beta, false)),
    'plan', s.plan, 'subscription_status', s.status, 'cancel_at', s.cancel_at)
  from (select auth.uid() as uid) u
  left join public.profiles p on p.id = u.uid
  left join lateral (select plan, status, cancel_at from public.subscriptions
    where user_id = u.uid order by last_event_at desc nulls last, id limit 1) s on true;
$$;
revoke all on function public.my_entitlement() from public, anon;
grant execute on function public.my_entitlement() to authenticated;
commit;
