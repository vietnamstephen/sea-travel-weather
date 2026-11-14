import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.119.0';
import { processEvent, verifyPaddleSignature, type Store } from './logic.ts';

Deno.serve(async (request: Request) => {
  const reply = (status: number, body: unknown) => Response.json(body, { status });
  if (request.method !== 'POST') return reply(405, { error: 'POST required' });
  const secret = Deno.env.get('PADDLE_WEBHOOK_SECRET'), service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const url = Deno.env.get('SUPABASE_URL');
  if (!secret || !service || !url) return reply(500, { error: 'not configured' });
  try {
    const raw = await request.text();
    if (!await verifyPaddleSignature(request.headers.get('Paddle-Signature'), raw, secret)) return reply(401, { error: 'Invalid signature' });
    let event;
    try { event = JSON.parse(raw); } catch { return reply(400, { error: 'Invalid JSON' }); }
    const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const read = async (table: string, column: string, id: string) => {
      const { data, error } = await db.from(table).select('*').eq(column, id).maybeSingle();
      if (error) throw error;
      return data;
    };
    // Stage writes, then commit them with the event receipt in one database transaction.
    // Concurrent deliveries retry from fresh snapshots; a pass cannot be added twice.
    for (let attempt = 0; attempt < 3; attempt++) {
      let profile: Record<string, unknown> | null = null;
      let patch = {}, subscription = null, receipt = null;
      const snapshots: Record<string, unknown> = {};
      const subscriptionRead = async (id: string) => {
        const row = await read('subscriptions', 'id', id); snapshots[id] = row; return row;
      };
      const store: Store = {
        getEvent: id => read('payment_events', 'event_id', id),
        insertEvent: async row => { receipt = row; },
        getProfile: async id => { profile = await read('profiles', 'id', id); return profile; },
        updateProfile: async (_id, row) => { patch = row; },
        upsertSubscription: async row => { subscription = row; },
        findUserBySubscription: subscriptionRead,
        findUserByTransaction: subscriptionRead,
        findUserByCustomer: id => read('profiles', 'paddle_customer_id', id),
      };
      const prices = Object.fromEntries(['YEARLY', 'MONTHLY', 'PASS7'].map(key => [Deno.env.get('PADDLE_PRICE_' + key), key.toLowerCase()]).filter(([id]) => id));
      const result = await processEvent(event, store, { prices });
      if (result.duplicate) return reply(200, result);
      const { data, error } = await db.rpc('apply_paddle_event', {
        receipt, profile_patch: patch, subscription_row: subscription,
        expected_profile: profile, expected_subscriptions: snapshots,
      });
      if (error) throw error;
      if (data?.retry) continue;
      return reply(200, data?.duplicate ? { duplicate: true } : result);
    }
    throw new Error('Concurrent billing changes; retry delivery');
  } catch (error) {
    console.error('paddle_webhook_failed', error instanceof Error ? error.name : 'Store error');
    return reply(500, { error: 'Webhook processing failed' });
  }
});
