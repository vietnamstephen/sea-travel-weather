/* My Trips public settings. Supabase project created; enable Google Auth next.
 * Only the public anon / publishable key belongs here. NEVER add service-role
 * or Variflight API keys; those are Edge Function secrets.
 * Zalo needs custom OAuth via an Edge Function / custom OIDC (future work).
 */
window.SEA_CONFIG = {
  // Optional site-owned key: restrict HTTP referrers to vietnamstephen.github.io
  // and set a daily quota cap in Google Cloud. Never ask visitors to paste a key.
  GOOGLE_MAPS_KEY: '',
  SUPABASE_URL: 'https://nhrapkbdveuitczbjkee.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_HAFZ_qe7vO-qegDNRn45RQ_kGDNV0LN',
  FLIGHT_PROXY_URL: 'https://nhrapkbdveuitczbjkee.supabase.co/functions/v1/flight-proxy',
  // Sandbox branch only. Main must keep this false until launch approval.
  PAYMENTS_ENABLED: true,
  PADDLE: {
    environment: 'sandbox',
    clientToken: 'test_595ed7998fa2faaa5261b3d2ce5',
    prices: {
      yearly: { priceId: 'pri_REPLACE_YEARLY', display: '$24.99', amount: 24.99, currency: 'USD', period: 'year', featured: true },
      monthly: { priceId: 'pri_REPLACE_MONTHLY', display: '$3.99', amount: 3.99, currency: 'USD', period: 'month' },
      pass7: { priceId: 'pri_REPLACE_PASS7', display: '$2.99', amount: 2.99, currency: 'USD', period: '7 days', oneTime: true }
    },
    successUrl: ''
  },
  AUTH_PROVIDERS: { google: true, zalo: false }
};
