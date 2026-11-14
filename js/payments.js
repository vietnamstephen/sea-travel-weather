/* Paddle Billing v2. No checkout or SDK requests while payments are disabled. */
(function () {
  'use strict';
  var C = window.SEA_CONFIG || {}, P = C.PADDLE || {}, clientPromise, paddlePromise, polling = false;
  function t(key) { return window.I18N.t(key, (window.SEA_APP || {}).lang || 'zh'); }
  function notify(key) {
    var host = document.getElementById('payments-message');
    if (host) host.textContent = t(key); else window.alert(t(key));
  }
  function script(src) {
    return new Promise(function (resolve, reject) {
      var el = document.createElement('script'); el.src = src; el.async = true;
      el.onload = resolve; el.onerror = function () { el.remove(); reject(new Error('SDK unavailable')); };
      document.head.appendChild(el);
    });
  }
  function client() {
    if (!C.PAYMENTS_ENABLED) return Promise.resolve(null);
    if (window.SEA_TRIPS_CLIENT) return Promise.resolve(window.SEA_TRIPS_CLIENT);
    if (!clientPromise) clientPromise = (window.supabase ? Promise.resolve() : script('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.js')).then(function () {
      return window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
    }).catch(function (err) { clientPromise = null; throw err; });
    return clientPromise;
  }
  async function entitlement() {
    var db = await client(); if (!db) return null;
    var auth = await db.auth.getSession();
    if (auth.error) throw auth.error;
    if (!auth.data.session) return null;
    var result = await db.rpc('my_entitlement');
    if (result.error) throw result.error;
    return result.data;
  }
  async function refresh() {
    var value = await entitlement();
    window.dispatchEvent(new CustomEvent('sea:entitlement', { detail: value }));
    return value;
  }
  async function poll() {
    if (polling) return;
    polling = true; notify('pricing.waiting');
    try {
      for (var i = 0; i < 10; i++) {
        await new Promise(function (resolve) { setTimeout(resolve, 2000); });
        try { var value = await refresh(); if (value && value.is_vip) { var host = document.getElementById('payments-message'); if (host) host.textContent = ''; return; } } catch (err) { /* Webhook may still be pending. */ }
      }
    } finally { polling = false; }
  }
  function paddle() {
    if (!paddlePromise) paddlePromise = script('https://cdn.paddle.com/paddle/v2/paddle.js').then(function () {
      window.Paddle.Environment.set(P.environment === 'sandbox' ? 'sandbox' : 'production');
      window.Paddle.Initialize({ token: P.clientToken, eventCallback: function (event) { if (event.name === 'checkout.completed') poll(); } });
      return window.Paddle;
    }).catch(function (err) { paddlePromise = null; throw err; });
    return paddlePromise;
  }
  async function login() {
    var db = await client(); if (!db) return;
    var redirect = new URL('pricing.html', location.href); redirect.searchParams.set('lang', (window.SEA_APP || {}).lang || 'zh');
    var result = await db.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirect.href } });
    if (result.error) throw result.error;
  }
  async function openCheckout(planKey) {
    if (!C.PAYMENTS_ENABLED) return;
    try {
      var plan = (P.prices || {})[planKey]; if (!plan) return;
      if (!P.clientToken || /REPLACE/.test(P.clientToken) || !plan.priceId || /REPLACE/.test(plan.priceId)) { notify('pricing.pending'); return; }
      var db = await client(), result = await db.auth.getSession();
      if (result.error) throw result.error;
      var session = result.data.session;
      if (!session) { notify('pricing.login'); await login(); return; }
      var sdk = await paddle(), lang = (window.SEA_APP || {}).lang || 'zh';
      // Paddle checkout supports these locales; Vietnamese/Thai/Indonesian fall back to English.
      var settings = { displayMode: 'overlay', locale: { zh: 'zh-Hans', en: 'en', vi: 'en', th: 'en', id: 'en' }[lang] || 'en' };
      if (P.successUrl) settings.successUrl = P.successUrl;
      sdk.Checkout.open({ items: [{ priceId: plan.priceId, quantity: 1 }], customer: { email: session.user.email },
        customData: { user_id: session.user.id, email: session.user.email, plan: planKey }, settings: settings });
    } catch (err) { notify('pricing.error'); }
  }
  window.SEA_PAYMENTS = { openCheckout: openCheckout, client: client, entitlement: entitlement, refresh: refresh, login: login };
})();
