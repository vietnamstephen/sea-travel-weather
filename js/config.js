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
  AUTH_PROVIDERS: { google: true, zalo: false }
};
