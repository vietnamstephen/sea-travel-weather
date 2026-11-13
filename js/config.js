/* My Trips public settings. Supabase project created; enable Google Auth next.
 * Only the public anon / publishable key belongs here. NEVER add service-role
 * or Variflight API keys; those are Edge Function secrets.
 * Zalo needs custom OAuth via an Edge Function / custom OIDC (future work).
 */
window.SEA_CONFIG = {
  SUPABASE_URL: 'https://nhrapkbdveuitczbjkee.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_HAFZ_qe7vO-qegDNRn45RQ_kGDNV0LN',
  FLIGHT_PROXY_URL: '',
  AUTH_PROVIDERS: { google: true, zalo: false }
};
