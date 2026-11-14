/* Shared account presentation; anonymous public pages never initialize auth. */
(function () {
  'use strict';
  var C = window.SEA_CONFIG || {}, session = null, value = null, subscription = null;
  var promise, host, button, menu, generation = 0;
  var callback = /[?&]code=|#.*access_token=/.test(location.href);
  function t(key) { return window.I18N.t(key, (window.SEA_APP || {}).lang || 'zh'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function date(s) {
    if (!s) return '';
    var d = new Date(s); if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function vip(e) { return e && /^(admin|vip)$/.test(e.effective_role || e.role); }
  function visible(e) { return C.PAYMENTS_ENABLED === true && e && e.payments_visible === true; }
  function statusText(e, s) {
    e = e || {};
    if ((e.effective_role || e.role) === 'admin') return t('account.admin');
    if (!vip(e)) return t('account.free');
    if (s && /^(active|trialing)$/.test(s.status) && !s.cancel_at && date(s.current_period_end)) return t('account.renew') + ' ' + date(s.current_period_end);
    return e.vip_until && date(e.vip_until) ? t('account.until') + ' ' + date(e.vip_until) : t('account.forever');
  }
  function statusHtml(e, s) {
    return esc(statusText(e,s)) + (visible(e) ? ' <a href="pricing.html">' + esc(t(vip(e) ? 'pricing.title' : 'pricing.upgrade')) + '</a>' : '') + (e && e.payments_beta ? ' <small class="account-beta">' + esc(t('account.beta')) + '</small>' : '');
  }
  function client() {
    if (window.SEA_TRIPS_CLIENT) return Promise.resolve(window.SEA_TRIPS_CLIENT);
    if (!promise) promise = (C.PAYMENTS_ENABLED && window.SEA_PAYMENTS ? window.SEA_PAYMENTS.client() : (window.supabase ? Promise.resolve() : new Promise(function (resolve,reject) {
      var script = document.createElement('script'); script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.js'; script.onload = resolve; script.onerror = reject; document.head.appendChild(script);
    })).then(function () { return window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_ANON_KEY); })).then(function (db) { window.SEA_TRIPS_CLIENT = db; return db; }).catch(function (err) { promise = null; throw err; });
    return promise;
  }
  function close(focus) { if (!menu) return; menu.hidden = true; button.setAttribute('aria-expanded','false'); if (focus) button.focus(); }
  function render() {
    if (!host) return;
    var user = session && session.user, label = t(user ? 'account.in' : 'account.out') + (user && user.email ? ' · ' + user.email : '');
    button.title = label; button.setAttribute('aria-label',label);
    var avatar = user && (user.user_metadata || {}), url = avatar && (avatar.avatar_url || avatar.picture);
    button.innerHTML = '<span class="account-avatar">' + (user ? esc((user.email || '?').charAt(0).toUpperCase()) : '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/></svg>') + '</span><span class="account-dot' + (user ? ' online' : '') + '"></span>' + (user ? '<span class="account-tag">' + esc(vip(value) ? 'VIP' : t('account.freeTag')) + '</span>' : '');
    if (url && /^https?:\/\//i.test(url)) {
      var img = document.createElement('img'); img.alt = ''; img.referrerPolicy = 'no-referrer'; img.onerror = function () { img.remove(); }; img.src = url; button.querySelector('.account-avatar').appendChild(img);
    }
    menu.innerHTML = user ? '<div class="account-email">' + esc(user.email) + '</div><p class="account-status">' + statusHtml(value,subscription) + '</p><a href="trips.html">' + esc(t('nav.trips')) + '</a><button type="button" class="account-signout">' + esc(t('trips.signOut')) + '</button>' : '';
    if (!user) close(false);
  }
  async function refresh(db) {
    var version = ++generation, auth = await db.auth.getSession(), next = auth.data.session;
    var e = null, s = null;
    if (next) {
      try {
        if (C.PAYMENTS_ENABLED) { var result = await db.rpc('my_entitlement'); if (!result.error) e = result.data; }
        if (!e) { var profile = await db.from('profiles').select('role').eq('id',next.user.id).maybeSingle(); e = {effective_role: (profile.data || {}).role || 'normal'}; }
        if (C.PAYMENTS_ENABLED && vip(e)) { var rows = await db.from('subscriptions').select('plan,status,current_period_end,cancel_at').order('last_event_at',{ascending:false,nullsFirst:false}).limit(1); if (!rows.error) s = (rows.data || [])[0] || null; }
      } catch (err) { /* Account details are optional. */ }
    }
    if (version !== generation) return;
    session = next; value = e; subscription = s; render();
    window.dispatchEvent(new CustomEvent('sea:account',{detail:{entitlement:e,subscription:s}}));
    window.dispatchEvent(new CustomEvent('sea:payments-visibility',{detail:e}));
    if (next && /\/trips\.html$/.test(location.pathname)) {
      var url = new URL(location.href), target = url.searchParams.get('next'), pending = false;
      try { pending = sessionStorage.getItem('sea-account-oauth') === target; } catch (err) {}
      if ((callback || pending) && target && /^[a-z]+\.html(\?[^#]*)?$/.test(target) && !/\/\/|:/.test(target) && !url.searchParams.has('error') && !/error=/.test(url.hash)) {
        try { sessionStorage.removeItem('sea-account-oauth'); } catch (err) {} location.replace(target);
      }
    }
  }
  async function login() {
    var db = await client(), lang = (window.SEA_APP || {}).lang || 'zh', target = location.pathname.split('/').pop() || 'index.html'; target += location.search;
    var redirect = new URL('trips.html',location.href); redirect.searchParams.set('lang',lang); redirect.searchParams.set('next',target);
    try { sessionStorage.setItem('sea-account-oauth',target); } catch (err) {}
    var result = await db.auth.signInWithOAuth({provider:'google',options:{redirectTo:redirect.href}}); if (result.error) throw result.error;
  }
  var watching = false;
  async function start() {
    var db = await client();
    if (!watching) { watching = true; db.auth.onAuthStateChange(function () { setTimeout(function () { refresh(db).catch(function () {}); },0); }); }
    await refresh(db);
  }
  window.SEA_ACCOUNT = {statusText:statusText,statusHtml:statusHtml,client:client,login:login};
  document.addEventListener('DOMContentLoaded',function () {
    var right = document.querySelector('.topbar-right'); if (!right) return;
    host = document.createElement('div'); host.className = 'account-wrap'; host.innerHTML = '<button type="button" class="account-button" aria-haspopup="true" aria-expanded="false" aria-controls="account-menu"></button><div id="account-menu" class="account-menu" hidden></div>'; right.appendChild(host); button = host.firstChild; menu = host.lastChild; render();
    button.addEventListener('click',async function () { if (session) { menu.hidden = !menu.hidden; button.setAttribute('aria-expanded',String(!menu.hidden)); } else { try { await start(); if (session) { menu.hidden = false; button.setAttribute('aria-expanded','true'); } else await login(); } catch (err) { window.alert(t('trips.loginError')); } } });
    menu.addEventListener('click',async function (event) { if (!event.target.closest('.account-signout')) return; try { var db = await client(), result = await db.auth.signOut(); if (result.error) throw result.error; generation++; session = null; value = null; subscription = null; render(); window.dispatchEvent(new CustomEvent('sea:payments-visibility',{detail:null})); if (/\/trips\.html$/.test(location.pathname)) location.reload(); } catch (err) { window.alert(t('trips.error')); } });
    document.addEventListener('click',function (event) { if (!host.contains(event.target)) close(false); });
    document.addEventListener('keydown',function (event) { if (event.key === 'Escape' && !menu.hidden) { event.preventDefault(); close(true); } });
    var token = false; try { token = !!localStorage.getItem('sb-nhrapkbdveuitczbjkee-auth-token'); } catch (err) {}
    if (token || /^(trips|pricing)$/.test(document.body.dataset.page)) start().catch(function () {});
  });
  window.addEventListener('sea:updated',render);
  window.addEventListener('sea:entitlement',function (event) { value = event.detail; render(); if (watching) client().then(refresh).catch(function () {}); });
})();
