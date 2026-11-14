/* Dependency-free Paddle Billing v2 processing. All dates are UTC ISO strings. */
type Row = Record<string, any>;
export interface Store {
  getEvent(id: string): Promise<Row | null>;
  insertEvent(row: Row): Promise<void>;
  getProfile(id: string): Promise<Row | null>;
  updateProfile(id: string, patch: Row): Promise<void>;
  upsertSubscription(row: Row): Promise<void>;
  // Returns the subscription/one-time row, including user_id and last_event_at.
  findUserBySubscription(id: string): Promise<Row | null>;
  findUserByTransaction(id: string): Promise<Row | null>;
  findUserByCustomer(id: string): Promise<Row | null>;
}
export type Config = { prices: Record<string, string>; now?: () => number };

export async function verifyPaddleSignature(header: string | null, rawBody: string, secret: string,
  { nowSec = Date.now() / 1000, toleranceSec = 300 }: { nowSec?: number; toleranceSec?: number } = {}): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = header.split(';').map(p => p.trim().split('='));
  const timestamps = parts.filter(p => p[0] === 'ts');
  if (timestamps.length !== 1 || !/^\d+$/.test(timestamps[0][1] || '')) return false;
  const ts = timestamps[0][1];
  if (!Number.isSafeInteger(Number(ts)) || Math.abs(nowSec - Number(ts)) > toleranceSec) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ts + ':' + rawBody)));
  let matched = 0;
  for (const [name, value] of parts) {
    if (name !== 'h1' || !/^[a-f\d]{64}$/i.test(value || '')) continue;
    let difference = 0;
    for (let i = 0; i < digest.length; i++) difference |= digest[i] ^ parseInt(value.slice(i * 2, i * 2 + 2), 16);
    matched |= Number(difference === 0);
  }
  return matched === 1;
}
export function effectiveVip(profile: Row | null, now = Date.now()): boolean {
  return !!profile && (profile.role === 'admin' || (profile.role === 'vip' &&
    (profile.vip_until == null || Date.parse(profile.vip_until) > now)));
}
const stamp = (v: unknown): number => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? Date.parse(v) : 0;
const iso = (ms: number): string => new Date(ms).toISOString();

export async function processEvent(event: Row, store: Store, config: Config): Promise<Row> {
  if (!event || typeof event.event_id !== 'string' || typeof event.event_type !== 'string' || !stamp(event.occurred_at) || !event.data) throw new Error('Invalid event');
  if (await store.getEvent(event.event_id)) return { duplicate: true };
  const now = (config.now || Date.now)(), d = event.data, type = event.event_type;
  const subscriptionId = type.startsWith('subscription.') ? d.id : d.subscription_id;
  const transactionId = type.startsWith('transaction.') ? d.id : d.transaction_id;
  const related = (subscriptionId && await store.findUserBySubscription(subscriptionId)) ||
    (transactionId && await store.findUserByTransaction(transactionId)) || null;
  const custom = d.custom_data || {};
  let userId = custom.user_id || related?.user_id;
  if (!userId && d.customer_id) userId = (await store.findUserByCustomer(d.customer_id))?.id;
  let result = 'ignored';
  const recognized = type === 'transaction.completed' || /^subscription\.(created|updated|activated|resumed|canceled|past_due|paused|trialing|imported)$/.test(type) || /^adjustment\.(created|updated)$/.test(type);
  if (recognized) {
    if (!userId) throw new Error('Unresolved payment user'); // Retry rather than silently lose a grant.
    const profile = await store.getProfile(userId);
    if (!profile) throw new Error('Payment profile missing');
    const eventTime = stamp(event.occurred_at);
    if ((type.startsWith('subscription.') || type === 'transaction.completed') && related && stamp(related.last_event_at) > eventTime) result = 'out_of_order';
    else {
      const priceId = d.items?.[0]?.price?.id || d.items?.[0]?.price_id || related?.price_id || null;
      const plan = config.prices[priceId] || custom.plan || related?.plan;
      const end = stamp(d.current_billing_period?.ends_at || d.billing_period?.ends_at);
      const patch: Row = { updated_at: iso(now) };
      if (d.customer_id) patch.paddle_customer_id = d.customer_id;
      let row: Row | null = null;
      // A null expiry on an existing VIP is a manual, unlimited grant. Payments do not shorten it,
      // except an explicitly approved refund/chargeback, which revokes the related access immediately.
      const manual = profile.role === 'vip' && profile.vip_until == null;
      const grant = (until: number) => {
        if (profile.role !== 'admin' && !manual) { patch.role = 'vip'; patch.vip_until = iso(until); }
      };
      if (type.startsWith('subscription.')) {
        if (!subscriptionId) throw new Error('Missing subscription ID');
        const paused = type === 'subscription.paused' || d.status === 'paused';
        if (!paused && ['active', 'trialing', 'past_due'].includes(d.status) && end) grant(end);
        if (paused && profile.role !== 'admin' && !manual) patch.vip_until = iso(now);
        if (!paused && type === 'subscription.canceled') {
          const until = end > now ? end : Math.min(stamp(profile.vip_until) || now, stamp(d.canceled_at) || now);
          if (profile.role !== 'admin' && !manual) patch.vip_until = iso(until);
        }
        row = { id: subscriptionId, user_id: userId, plan, price_id: priceId, status: paused ? 'paused' : d.status || type.split('.')[1],
          current_period_end: end ? iso(end) : related?.current_period_end || null,
          scheduled_change: d.scheduled_change || null,
          cancel_at: d.scheduled_change?.action === 'cancel' ? d.scheduled_change.effective_at || (end ? iso(end) : null) : null };
        result = 'subscription';
      } else if (type === 'transaction.completed') {
        if (plan === 'pass7' && !subscriptionId) {
          const until = Math.max(now, stamp(profile.vip_until)) + 7 * 86400000;
          grant(until);
          row = { id: transactionId, user_id: userId, plan, price_id: priceId, status: 'completed', current_period_end: iso(until) };
        } else if (subscriptionId) {
          if (end) grant(Math.max(end, stamp(profile.vip_until)));
          // Transaction aliases let adjustments resolve a user even when Paddle omits subscription_id.
          row = { id: transactionId, user_id: userId, plan, price_id: priceId, status: 'completed', current_period_end: end ? iso(end) : null };
        } else throw new Error('Unknown one-time payment plan');
        result = 'transaction';
      } else if (['refund', 'chargeback'].includes(d.action) && d.status === 'approved' && d.type !== 'partial') {
        if (profile.role !== 'admin') patch.vip_until = iso(now);
        row = { ...(related || {}), id: subscriptionId || transactionId, user_id: userId, plan, price_id: priceId, status: 'refunded' };
        if (!row.id) throw new Error('Missing refund reference');
        result = 'refunded';
      }
      if (row) await store.upsertSubscription({ ...row, last_event_at: iso(Math.max(eventTime, stamp(related?.last_event_at))), updated_at: iso(now) });
      await store.updateProfile(userId, patch);
    }
  }
  await store.insertEvent({ event_id: event.event_id, event_type: type, occurred_at: event.occurred_at,
    user_id: userId || null, payload: event, result });
  return { duplicate: false, result };
}
