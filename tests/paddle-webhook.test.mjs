import test from 'node:test';
import assert from 'node:assert/strict';
import { processEvent, verifyPaddleSignature, effectiveVip } from '../supabase/functions/paddle-webhook/logic.ts';

const NOW = Date.parse('2026-11-14T12:00:00Z');
const END = '2026-12-14T12:00:00.000Z';
const config = { prices: { pri_month: 'monthly', pri_pass: 'pass7' }, now: () => NOW };
class MemoryStore {
  events = new Map(); profiles = new Map(); subscriptions = new Map();
  constructor(role = 'normal', vip_until = null) { this.profiles.set('user1', { id: 'user1', role, vip_until }); }
  async getEvent(id) { return this.events.get(id) || null; }
  async insertEvent(row) { this.events.set(row.event_id, structuredClone(row)); }
  async getProfile(id) { return structuredClone(this.profiles.get(id) || null); }
  async updateProfile(id, row) { Object.assign(this.profiles.get(id), row); }
  async upsertSubscription(row) { this.subscriptions.set(row.id, { ...this.subscriptions.get(row.id), ...structuredClone(row) }); }
  async findUserBySubscription(id) { return structuredClone(this.subscriptions.get(id) || null); }
  async findUserByTransaction(id) { return this.findUserBySubscription(id); }
  async findUserByCustomer(id) { return [...this.profiles.values()].find(p => p.paddle_customer_id === id) || null; }
  profile() { return this.profiles.get('user1'); }
}
function event(type = 'subscription.created', data = {}, id = 'evt1', occurred = NOW) {
  return { event_id: id, event_type: type, occurred_at: new Date(occurred).toISOString(), data: {
    id: 'sub1', status: 'active', customer_id: 'ctm1', custom_data: { user_id: 'user1' },
    items: [{ price: { id: 'pri_month' } }], current_billing_period: { ends_at: END }, ...data,
  } };
}
async function signature(raw, ts = NOW / 1000) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('test-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ts + ':' + raw));
  return 'ts=' + ts + ';h1=' + Buffer.from(digest).toString('hex');
}
test('valid raw-body signature and multiple h1 accepted', async () => {
  const raw = JSON.stringify(event());
  assert.equal(await verifyPaddleSignature(await signature(raw) + ';h1=' + '0'.repeat(64), raw, 'test-secret', { nowSec: NOW / 1000 }), true);
});
test('bad signature, altered body and wrong secret rejected', async () => {
  const raw = JSON.stringify(event()), header = await signature(raw);
  for (const [h, body, secret] of [[header, raw + ' ', 'test-secret'], [header, raw, 'wrong'], ['ts=' + NOW / 1000 + ';h1=abcd', raw, 'test-secret']]) {
    assert.equal(await verifyPaddleSignature(h, body, secret, { nowSec: NOW / 1000 }), false);
  }
});
test('stale and future timestamps rejected', async () => {
  for (const offset of [-301, 301]) assert.equal(await verifyPaddleSignature(await signature('{}', NOW / 1000 + offset), '{}', 'test-secret', { nowSec: NOW / 1000 }), false);
});
test('missing, malformed and ambiguous signature timestamps rejected', async () => {
  for (const header of [null, '', 'ts=no;h1=aa', (await signature('{}')) + ';ts=1']) assert.equal(await verifyPaddleSignature(header, '{}', 'test-secret', { nowSec: NOW / 1000 }), false);
});
test('active subscription grants effective VIP and customer id', async () => {
  const store = new MemoryStore(); await processEvent(event(), store, config);
  assert.equal(effectiveVip(store.profile(), NOW), true);
  assert.equal(store.profile().vip_until, END); assert.equal(store.profile().paddle_customer_id, 'ctm1');
  assert.equal(store.subscriptions.get('sub1').plan, 'monthly');
});
test('renewal extends VIP and resolves user through subscription', async () => {
  const store = new MemoryStore(); await processEvent(event(), store, config);
  const next = '2027-01-14T12:00:00.000Z';
  await processEvent(event('subscription.updated', { custom_data: null, current_billing_period: { ends_at: next } }, 'evt2', NOW + 1000), store, config);
  assert.equal(store.profile().vip_until, next);
});
test('scheduled cancellation keeps access until period end, then expires', async () => {
  const store = new MemoryStore(); await processEvent(event('subscription.updated', { scheduled_change: { action: 'cancel', effective_at: END } }), store, config);
  assert.equal(store.subscriptions.get('sub1').cancel_at, END);
  assert.equal(effectiveVip(store.profile(), NOW), true);
  assert.equal(effectiveVip(store.profile(), Date.parse(END)), false);
});
test('canceled event respects a still-paid current period', async () => {
  const store = new MemoryStore('vip', END);
  await processEvent(event('subscription.canceled', { status: 'canceled', canceled_at: new Date(NOW).toISOString() }), store, config);
  assert.equal(effectiveVip(store.profile(), NOW), true);
  await processEvent(event('subscription.canceled', { status: 'canceled', current_billing_period: null, canceled_at: new Date(NOW).toISOString() }, 'evt2', NOW + 1000), store, config);
  assert.equal(effectiveVip(store.profile(), NOW), false);
});
test('past due has no extra grace and expires at period end', async () => {
  const store = new MemoryStore(); await processEvent(event('subscription.past_due', { status: 'past_due' }), store, config);
  assert.equal(effectiveVip(store.profile(), NOW), true);
  assert.equal(effectiveVip(store.profile(), Date.parse(END) + 1), false);
  assert.equal(store.subscriptions.get('sub1').status, 'past_due');
});
test('approved refund and chargeback revoke immediately', async () => {
  for (const action of ['refund', 'chargeback']) {
    const store = new MemoryStore(); await processEvent(event(), store, config);
    await processEvent(event('adjustment.updated', { id: 'adj1', subscription_id: 'sub1', custom_data: null, action, status: 'approved' }, 'evt2', NOW + 1000), store, config);
    assert.equal(effectiveVip(store.profile(), NOW), false);
    assert.equal(store.subscriptions.get('sub1').status, 'refunded');
  }
});
test('unapproved adjustment does not revoke', async () => {
  const store = new MemoryStore('vip', END);
  await processEvent(event('adjustment.created', { action: 'refund', status: 'pending_approval' }), store, config);
  assert.equal(effectiveVip(store.profile(), NOW), true);
});
test('duplicate pass delivery does not extend access twice', async () => {
  const store = new MemoryStore(), payload = event('transaction.completed', { id: 'txn1', items: [{ price: { id: 'pri_pass' } }] });
  await processEvent(payload, store, config); const until = store.profile().vip_until;
  assert.deepEqual(await processEvent(payload, store, config), { duplicate: true });
  assert.equal(store.profile().vip_until, until); assert.equal(store.events.size, 1);
});
test('pass7 grants seven days and a second purchase extends from current expiry', async () => {
  const store = new MemoryStore();
  for (let i = 1; i <= 2; i++) {
    await processEvent(event('transaction.completed', { id: 'txn' + i, items: [{ price: { id: 'pri_pass' } }] }, 'evt' + i, NOW + i), store, config);
    assert.equal(Date.parse(store.profile().vip_until), NOW + i * 7 * 86400000);
  }
});
test('subscription transaction records an alias for refund user resolution', async () => {
  const store = new MemoryStore();
  await processEvent(event('transaction.completed', { id: 'txn1', subscription_id: 'sub1', current_billing_period: null, billing_period: { ends_at: END } }), store, config);
  assert.equal(store.profile().vip_until, END);
  await processEvent(event('adjustment.created', { id: 'adj1', transaction_id: 'txn1', custom_data: null, customer_id: null, action: 'refund', status: 'approved' }, 'evt2', NOW + 1000), store, config);
  assert.equal(effectiveVip(store.profile(), NOW), false);
});
test('admin role and expiry are never changed by grants, cancellation or refunds', async () => {
  const store = new MemoryStore('admin');
  for (const [i, type] of ['subscription.created', 'subscription.canceled', 'adjustment.updated'].entries()) {
    await processEvent(event(type, { subscription_id: 'sub1', action: 'refund', status: type.startsWith('adjustment') ? 'approved' : 'active' }, 'evt' + i, NOW + i), store, config);
    assert.equal(store.profile().role, 'admin'); assert.equal(store.profile().vip_until, null);
  }
});
test('manual unlimited VIP is preserved by billing grants and cancellation', async () => {
  const store = new MemoryStore('vip');
  await processEvent(event(), store, config);
  await processEvent(event('subscription.canceled', { status: 'canceled', current_billing_period: null }, 'evt2', NOW + 1000), store, config);
  assert.equal(store.profile().vip_until, null); assert.equal(effectiveVip(store.profile(), NOW + 1e12), true);
});
test('older subscription update cannot overwrite a renewal', async () => {
  const store = new MemoryStore(); await processEvent(event(), store, config);
  await processEvent(event('subscription.updated', { current_billing_period: { ends_at: '2026-11-15T00:00:00Z' } }, 'old', NOW - 1000), store, config);
  assert.equal(store.profile().vip_until, END); assert.equal(store.events.get('old').result, 'out_of_order');
});
test('customer lookup and custom plan fallback', async () => {
  const store = new MemoryStore(); store.profile().paddle_customer_id = 'ctm1';
  await processEvent(event('transaction.completed', { id: 'txn1', custom_data: { plan: 'pass7' }, items: [] }), store, config);
  assert.equal(Date.parse(store.profile().vip_until), NOW + 7 * 86400000);
});
test('unresolved recognized event fails without receipt, permitting retry', async () => {
  const store = new MemoryStore();
  await assert.rejects(processEvent(event('subscription.created', { custom_data: null }), store, config), /Unresolved/);
  assert.equal(store.events.size, 0);
});
test('SQL-equivalent effective VIP: admin, unlimited, future, expired, normal, missing', () => {
  const sqlEquivalent = p => !!p && (p.role === 'admin' || p.role === 'vip' && (p.vip_until == null || Date.parse(p.vip_until) > NOW));
  for (const p of [null, { role: 'normal' }, { role: 'admin', vip_until: '2000-01-01' }, { role: 'vip', vip_until: null }, { role: 'vip', vip_until: END }, { role: 'vip', vip_until: new Date(NOW).toISOString() }]) assert.equal(effectiveVip(p, NOW), sqlEquivalent(p));
});

test('late approved refund revokes without moving the subscription watermark backwards', async () => {
  const store = new MemoryStore();
  await processEvent(event('subscription.updated', {}, 'renewed', NOW + 3000), store, config);
  await processEvent(event('adjustment.updated', { subscription_id: 'sub1', action: 'refund', status: 'approved' }, 'refund', NOW + 1000), store, config);
  assert.equal(effectiveVip(store.profile(), NOW), false);
  await processEvent(event('subscription.updated', {}, 'old-renewal', NOW + 2000), store, config);
  assert.equal(effectiveVip(store.profile(), NOW), false);
  assert.equal(store.events.get('old-renewal').result, 'out_of_order');
});

test('paused events and paused status revoke now and record paused', async () => {
  for (const [type, status] of [['subscription.paused', 'active'], ['subscription.updated', 'paused']]) {
    const store = new MemoryStore('vip', END);
    await processEvent(event(type, { status }), store, config);
    assert.equal(store.profile().vip_until, new Date(NOW).toISOString());
    assert.equal(effectiveVip(store.profile(), NOW), false);
    assert.equal(store.subscriptions.get('sub1').status, 'paused');
  }
});
test('pause preserves admin and manual unlimited VIP', async () => {
  for (const role of ['admin', 'vip']) {
    const store = new MemoryStore(role);
    await processEvent(event('subscription.paused', { status: 'paused' }), store, config);
    assert.equal(store.profile().vip_until, null);
    assert.equal(effectiveVip(store.profile(), NOW), true);
  }
});
test('resuming after pause restores active access', async () => {
  const store = new MemoryStore('vip', END);
  await processEvent(event('subscription.paused', { status: 'paused' }), store, config);
  await processEvent(event('subscription.resumed', { status: 'active' }, 'resumed', NOW + 1000), store, config);
  assert.equal(store.profile().vip_until, END);
  assert.equal(effectiveVip(store.profile(), NOW), true);
  assert.equal(store.subscriptions.get('sub1').status, 'active');
});
test('trialing, imported and activated subscriptions grant active or trialing access', async () => {
  for (const type of ['subscription.trialing', 'subscription.imported', 'subscription.activated']) {
    for (const status of ['active', 'trialing']) {
      const store = new MemoryStore();
      await processEvent(event(type, { status }), store, config);
      assert.equal(store.profile().vip_until, END);
      assert.equal(effectiveVip(store.profile(), NOW), true);
    }
  }
});
test('partial refunds and chargeback reversals are recorded without revoking', async () => {
  for (const data of [{ action: 'refund', type: 'partial' }, { action: 'chargeback', type: 'partial' }, { action: 'chargeback_reverse', type: 'full' }]) {
    const store = new MemoryStore();
    await processEvent(event(), store, config);
    await processEvent(event('adjustment.updated', { ...data, status: 'approved', subscription_id: 'sub1' }, 'adjustment', NOW + 1000), store, config);
    assert.equal(store.profile().vip_until, END);
    assert.equal(store.subscriptions.get('sub1').status, 'active');
    assert.equal(store.events.get('adjustment').result, 'ignored');
  }
});
