#!/usr/bin/env node
// Minor USD units; mirror the display amounts in js/config.js.
const AMOUNTS = { yearly: 2499, monthly: 399, pass7: 299 };
const PLANS = {
  yearly: { description: 'SEA Travel Weather VIP yearly', billing_cycle: { interval: 'year', frequency: 1 } },
  monthly: { description: 'SEA Travel Weather VIP monthly', billing_cycle: { interval: 'month', frequency: 1 } },
  pass7: { description: 'SEA Travel Weather VIP 7-day pass' }
};
const NAME = 'SEA Travel Weather VIP';
const PRODUCT_KEY = 'sea-travel-weather-vip';
const dryRun = process.argv.includes('--dry-run');
const environment = process.env.PADDLE_ENV || 'sandbox';
if (!['sandbox', 'production'].includes(environment)) throw new Error('PADDLE_ENV must be sandbox or production');
const base = environment === 'sandbox' ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com';
const apiKey = process.env.PADDLE_API_KEY;
if (!dryRun && !apiKey) throw new Error('Set PADDLE_API_KEY in the environment');
if (process.argv.slice(2).some(arg => arg !== '--dry-run')) throw new Error('Only --dry-run is supported; supply credentials through the environment');

async function request(method, path, body) {
  if (dryRun) {
    console.log(`${method} ${base}${path}${body ? '\n' + JSON.stringify(body, null, 2) : ''}`);
    return { data: method === 'GET' ? [] : { id: path === '/products' ? 'pro_DRY_RUN' : `pri_DRY_RUN_${body.custom_data.key.toUpperCase()}` } };
  }
  const response = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  // Do not print request headers, credentials, or remote error bodies.
  if (!response.ok) throw new Error(`Paddle ${method} ${path.split('?')[0]} failed (HTTP ${response.status})`);
  return response.json();
}
async function list(path) {
  const rows = [];
  while (path) {
    const page = await request('GET', path);
    rows.push(...page.data);
    const next = page.meta?.pagination;
    if (!next?.has_more || !next.next) break;
    const url = new URL(next.next, base);
    if (url.origin !== base) throw new Error('Unexpected Paddle pagination origin');
    path = url.pathname + url.search;
  }
  return rows;
}
async function main() {
  const products = await list('/products?status=active&per_page=200');
  const product = products.find(p => p.custom_data?.key === PRODUCT_KEY || p.name === NAME) ||
    (await request('POST', '/products', { name: NAME, tax_category: 'standard', custom_data: { key: PRODUCT_KEY } })).data;
  const prices = await list(`/prices?product_id=${encodeURIComponent(product.id)}&status=active&per_page=200`);
  const ids = {};
  for (const [key, plan] of Object.entries(PLANS)) {
    const price = prices.find(p => p.custom_data?.key === key || p.name === plan.description || p.description === plan.description) ||
      (await request('POST', '/prices', { product_id: product.id, ...plan,
        unit_price: { amount: String(AMOUNTS[key]), currency_code: 'USD' }, custom_data: { key } })).data;
    ids[key] = price.id;
  }
  console.log('\nPrice IDs:', JSON.stringify(ids, null, 2));
  console.log('\n// js/config.js\nprices: {');
  for (const [key, id] of Object.entries(ids)) {
    const period = key === 'yearly' ? 'year' : key === 'monthly' ? 'month' : '7 days';
    console.log(`  ${key}: { priceId: '${id}', display: '$${(AMOUNTS[key] / 100).toFixed(2)}', amount: ${AMOUNTS[key] / 100}, currency: 'USD', period: '${period}'${key === 'yearly' ? ', featured: true' : key === 'pass7' ? ', oneTime: true' : ''} },`);
  }
  console.log('},');
  console.log(`\nsupabase secrets set PADDLE_PRICE_YEARLY=${ids.yearly} PADDLE_PRICE_MONTHLY=${ids.monthly} PADDLE_PRICE_PASS7=${ids.pass7}`);
}
main().catch(() => { console.error('Paddle setup failed. Check environment settings, API permissions, and connectivity. No credentials were logged.'); process.exitCode = 1; });
