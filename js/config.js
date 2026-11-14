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
  // Payments are available only for users gated by the server entitlement.
  PAYMENTS_ENABLED: true,
  PADDLE: {
    environment: 'sandbox',
    clientToken: 'test_595ed7998fa2faaa5261b3d2ce5',
    prices: {
      yearly: { priceId: 'pri_01m7cjwr03pc4ke7t7343y5n26', display: '$24.99', amount: 24.99, currency: 'USD', period: 'year', featured: true },
      monthly: { priceId: 'pri_01m7cjwr1fnq9gn0nesbvkhvzy', display: '$3.99', amount: 3.99, currency: 'USD', period: 'month' },
      pass7: { priceId: 'pri_01m7cjwr2pbbyfqjyjdv0hzcj0', display: '$2.99', amount: 2.99, currency: 'USD', period: '7 days', oneTime: true }
    },
    successUrl: ''
  },
  AUTH_PROVIDERS: { google: true, zalo: false }
};
