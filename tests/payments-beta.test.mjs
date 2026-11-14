import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../js/payments.js', import.meta.url), 'utf8');
function setup(value, enabled = true) {
  const scripts = [];
  const db = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'test', email: 'test@example.com' } } } }) },
    rpc: async () => ({ data: value })
  };
  const window = { SEA_CONFIG: { PAYMENTS_ENABLED: enabled, PADDLE: { clientToken: 'test', prices: { monthly: { priceId: 'price' } } } }, SEA_TRIPS_CLIENT: db };
  vm.runInNewContext(source, { window, document: { createElement: () => ({}), head: { appendChild: el => scripts.push(el.src) } } });
  return { api: window.SEA_PAYMENTS, scripts };
}
test('payments visibility requires explicit server boolean and enabled feature', () => {
  const { api, scripts } = setup(null);
  for (const value of [null, {}, { role: 'admin' }, { payments_beta: true }, { payments_visible: 'true' }, { payments_visible: false }]) assert.equal(api.visible(value), false);
  assert.equal(api.visible({ payments_visible: true }), true);
  assert.equal(setup(null, false).api.visible({ payments_visible: true }), false);
  assert.deepEqual(scripts, []);
});
test('checkout rechecks server entitlement and never loads Paddle for ungated users', async () => {
  for (const value of [null, { role: 'normal', payments_visible: false }, { role: 'admin' }]) {
    const { api, scripts } = setup(value);
    await api.openCheckout('monthly');
    assert.deepEqual(scripts, []);
  }
});
