/* My Trips · static frontend, Supabase v2 loaded only after configuration. */
(function () {
  'use strict';
  if (document.body.getAttribute('data-page') !== 'trips') return;
  var C = window.SEA_CONFIG || {}, R = window.SEA_RISK, D = window.SEA_DATA;
  var main = document.getElementById('main'), client = null, session = null;
  var trips = [], editing = null, busy = false, message = '', ready = false, revision = 0;
  var fields = ['origin', 'destination', 'trip_date', 'flight_no', 'note'];
  var draft = {};
  function t(k) { return window.I18N.t(k, window.SEA_APP.lang); }
  function e(v) { return R.esc(v); }
  function loc(v) { return v[window.SEA_APP.lang] || v.en; }
  function known(value) {
    var key = value.trim().toLowerCase(), found = null;
    // Airport records disambiguate airports shared by several monitored cities.
    D.countries.forEach(function (c) {
      c.airports.forEach(function (a) {
        if (a.iata.toLowerCase() === key) found = { country: c, city: R.cityById(c, a.city), airport: a.iata };
      });
    });
    if (found) return found;
    D.countries.forEach(function (c) {
      c.cities.forEach(function (city) {
        if (city.id.toLowerCase() === key || Object.keys(city.name).some(function (l) { return city.name[l].toLowerCase() === key; })) {
          found = { country: c, city: city, airport: city.airport };
        }
      });
    });
    return found;
  }
  function errorKey(err, auth) {
    var code = err && err.code, text = String(err && err.message || '').replace(/_/g, ' ');
    if (code === 'PGRST205' || code === '42P01' || code === '42501' || /permission denied|relation .* does not exist|could not find.*table/i.test(text)) return 'trips.databaseSetup';
    if (auth && /unsupported provider|provider.*(not enabled|disabled)|login.*not enabled/i.test(text)) return 'trips.googleDisabled';
    return auth ? 'trips.loginError' : 'trips.error';
  }
  function readAuthError() {
    try {
      var url = new URL(location.href), hash = new URLSearchParams(url.hash.replace(/^#/, ''));
      var hasError = url.searchParams.has('error') || url.searchParams.has('error_description') || hash.has('error') || hash.has('error_description');
      if (!hasError) return;
      var description = url.searchParams.get('error_description') || hash.get('error_description') || url.searchParams.get('error') || hash.get('error') || '';
      message = errorKey({ message: description }, true);
      ['error', 'error_description', 'error_code'].forEach(function (key) { url.searchParams.delete(key); hash.delete(key); });
      url.hash = hash.toString();
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    } catch (err) { message = 'trips.loginError'; }
  }
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') return false;
    var date = new Date(value + 'T00:00:00Z');
    return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function validPlace(v) { return v.length <= 120 && (/^[a-z]{3}$/i.test(v) || !!known(v)); }
  function remember() {
    fields.forEach(function (f) { var el = document.getElementById('trips-' + f); if (el) draft[f] = el.value; });
  }
  function button(key, action, disabled) {
    return '<button type="button" class="pill" data-action="' + action + '"' + (disabled ? ' disabled' : '') + '>' + e(t(key)) + '</button>';
  }
  function weather(value, date) {
    var place = known(value), W = window.SEA_APP.weather;
    if (!place || !place.city) return '<p>' + e(value) + ': ' + e(t('trips.outside')) + '</p>';
    var wc = W && W.countries && W.countries[place.country.id];
    wc = wc && wc.cities && wc.cities[place.city.id];
    var rows = R.hourlyRows(wc && wc.hourly), selected = [], level = 0;
    rows.forEach(function (row, i) { if (row.time.slice(0, 10) === date) selected.push(i); });
    var exact = selected.length > 0;
    if (!exact && rows.length) {
      var parts = new Intl.DateTimeFormat('en-GB', { timeZone: place.country.tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
      var local = {}; parts.forEach(function (part) { local[part.type] = part.value; });
      var today = local.year + '-' + local.month + '-' + local.day;
      var day = rows.filter(function (r) { return r.time.slice(0, 10) >= today; })[0] || rows[rows.length - 1];
      rows.forEach(function (row, i) { if (row.time.slice(0, 10) === day.time.slice(0, 10)) selected.push(i); });
    }
    if (!selected.length) return '<p>' + e(loc(place.city.name)) + ': ' + e(t('trips.noWeather')) + '</p>';
    var temps = [], rain = 0;
    selected.forEach(function (i) {
      level = Math.max(level, R.hourRisk(rows[i], rows, i, place.city).level);
      if (rows[i].temperature_2m != null) temps.push(Number(rows[i].temperature_2m));
      rain += Number(rows[i].precipitation) || 0;
    });
    var k = R.LEVEL_KEYS[level];
    return '<div class="trips-weather"><b>' + e(loc(place.city.name)) + '</b> · ' + e(rows[selected[0]].time.slice(0, 10)) +
      ' <span class="badge ' + k + '">' + e(t('level.' + k)) + '</span><p>' + e(t(exact ? 'trips.forecast' : 'trips.forecastFallback')) + '</p><p>' +
      e(t('fact.temp')) + ': ' + (temps.length ? e(Math.min.apply(null, temps).toFixed(1) + '–' + Math.max.apply(null, temps).toFixed(1)) : '—') + ' °C · ' +
      e(t('fact.rain')) + ': ' + e(rain.toFixed(1)) + ' mm</p><p class="hint">' + e(t('trips.riskNote')) + '</p></div>';
  }
  function render() {
    var html = '<div class="section-head"><h1>' + e(t('nav.trips')) + '</h1></div>';
    if (!C.SUPABASE_URL || !C.SUPABASE_ANON_KEY) {
      main.innerHTML = html + '<div class="panel"><h2>' + e(t('trips.unconfigured')) + '</h2><p>' + e(t('trips.coming')) + '</p></div>'; return;
    }
    html += '<div class="panel trips-panel"><div id="trips-message" role="status" aria-live="polite">' + e(message ? t(message) : '') + '</div>';
    if (!ready) html += '<p>' + e(t('trips.loading')) + '</p>';
    else if (!session) {
      if ((C.AUTH_PROVIDERS || {}).google) html += button('trips.google', 'google', busy || !client);
      html += button('trips.zalo', 'zalo', true);
    } else {
      html += '<div class="trips-actions"><span>' + e(session.user.email || '') + '</span>' + button('trips.signOut', 'signout', busy) + '</div>';
      html += '<h2>' + e(t(editing ? 'trips.edit' : 'trips.add')) + '</h2><form id="trips-form"><div class="form-row">';
      fields.forEach(function (f) {
        html += '<div class="field"><label for="trips-' + f + '">' + e(t('trips.' + f)) + '</label>';
        if (f === 'note') html += '<textarea id="trips-note" maxlength="2000">' + e(draft[f] || '') + '</textarea>';
        else html += '<input id="trips-' + f + '" type="' + (f === 'trip_date' ? 'date' : 'text') + '" value="' + e(draft[f] || '') + '"' +
          (f === 'origin' || f === 'destination' ? ' list="trips-cities" maxlength="120" required' : f === 'trip_date' ? ' required' : ' maxlength="7"') + '>';
        html += '</div>';
      });
      html += '</div><p class="hint">' + e(t('trips.placeHint')) + '</p><div class="trips-actions"><button class="btn-primary" type="submit"' + (busy ? ' disabled' : '') + '>' + e(t('trips.save')) + '</button>' + button('trips.cancel', 'cancel', busy) + '</div></form><datalist id="trips-cities">';
      D.countries.forEach(function (c) {
        c.cities.forEach(function (city) { html += '<option value="' + e(city.id) + '">' + e(loc(city.name) + ' · ' + city.airport) + '</option>'; });
        c.airports.forEach(function (a) { html += '<option value="' + e(a.iata) + '">' + e(loc(a.name)) + '</option>'; });
      });
      html += '</datalist></div><div class="trips-actions">' + button('trips.refresh', 'refresh', busy) + '</div><div class="trips-list">';
      if (!trips.length) html += '<div class="panel">' + e(t('trips.empty')) + '</div>';
      trips.forEach(function (trip, i) {
        html += '<article class="panel trips-panel" data-trip="' + i + '"><h2>' + e(trip.origin) + ' → ' + e(trip.destination) + '</h2><p>' + e(trip.trip_date) + ' · ' + e(trip.flight_no || '') + '</p><p class="trips-note">' + e(trip.note || '') + '</p><div class="result-grid">' + weather(trip.origin, trip.trip_date) + weather(trip.destination, trip.trip_date) + '</div><div class="trips-actions">' + button('trips.edit', 'edit', busy) + button('trips.delete', 'delete', busy) + (trip.flight_no ? button('trips.flightStatus', 'status', busy || !C.FLIGHT_PROXY_URL) : '') + button('trips.routeFlights', 'route', busy || !C.FLIGHT_PROXY_URL) + '</div>' + (!C.FLIGHT_PROXY_URL ? '<p class="hint">' + e(t('trips.flightUnconfigured')) + '</p>' : '') + '<div class="trips-flight" aria-live="polite"></div></article>';
      });
    }
    main.innerHTML = html + '</div>';
    var form = document.getElementById('trips-form');
    if (form) form.addEventListener('submit', save);
  }
  function reset() { editing = null; draft = {}; fields.forEach(function (f) { var el = document.getElementById('trips-' + f); if (el) el.value = ''; }); }
  async function load() {
    if (!session) return;
    var version = ++revision, uid = session.user.id;
    var result = await client.from('trips').select('*').eq('user_id', uid).order('trip_date', { ascending: true }).order('created_at', { ascending: true });
    if (version !== revision || !session || session.user.id !== uid) return;
    if (result.error) throw result.error;
    trips = result.data || [];
  }
  async function save(event) {
    event.preventDefault(); if (busy || !session) return;
    remember(); var row = {};
    fields.forEach(function (f) { row[f] = (draft[f] || '').trim(); });
    row.flight_no = row.flight_no.toUpperCase();
    ['origin', 'destination'].forEach(function (f) {
      // Store bare IATA codes upper-case unless the value is one of our city IDs.
      var cityId = D.countries.some(function (c) { return c.cities.some(function (city) { return city.id.toLowerCase() === row[f].toLowerCase(); }); });
      if (/^[a-z]{3}$/i.test(row[f]) && !cityId) row[f] = row[f].toUpperCase();
    });
    if (!validPlace(row.origin) || !validPlace(row.destination) || !validDate(row.trip_date) || row.note.length > 2000 || (row.flight_no && !/^[A-Z0-9]{2}\d{1,4}[A-Z]?$/.test(row.flight_no))) {
      message = 'trips.invalid'; render(); return;
    }
    busy = true; message = ''; render();
    try {
      var result = editing ? await client.from('trips').update(row).eq('id', editing).eq('user_id', session.user.id) : await client.from('trips').insert(row);
      if (result.error) throw result.error;
      reset(); await load(); message = 'trips.saved';
    } catch (err) { message = errorKey(err); }
    busy = false; render();
  }
  // Registry hook: Zalo requires custom OAuth via Supabase Edge Function /
  // custom OIDC, to be implemented. Keep disabled even if config is toggled.
  var AUTH_PROVIDERS = {
    google: async function () {
      // OAuth normally navigates before Supabase can report a disabled provider.
      // Check public provider settings first so the error stays on this page.
      var settingsResponse = await fetch(C.SUPABASE_URL.replace(/\/$/, '') + '/auth/v1/settings', { headers: { apikey: C.SUPABASE_ANON_KEY } });
      if (settingsResponse.ok) {
        var settings = await settingsResponse.json();
        if (settings.external && settings.external.google === false) throw new Error('Google provider is not enabled');
      }
      var url = new URL(location.href); url.hash = ''; url.search = '';
      url.searchParams.set('lang', window.SEA_APP.lang);
      var result = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: url.href } });
      if (result.error) { message = errorKey(result.error, true); throw result.error; }
    },
    zalo: null
  };
  function flightHtml(result) {
    var data = result;
    if (data && data.content && data.content[0] && typeof data.content[0].text === 'string') {
      try { data = JSON.parse(data.content[0].text); } catch (err) { data = data.content[0].text; }
    }
    var rows = Array.isArray(data) ? data : data && (data.flights || data.data || data.list);
    if (rows && !Array.isArray(rows)) rows = rows.flights || rows.list;
    if (!Array.isArray(rows) || !rows.length || !rows.every(function (r) { return r && typeof r === 'object' && !Array.isArray(r); })) return '<pre>' + e(typeof data === 'string' ? data : JSON.stringify(data, null, 2)) + '</pre>';
    var keys = [];
    rows.slice(0, 30).forEach(function (r) { Object.keys(r).forEach(function (k) { if (keys.indexOf(k) < 0 && keys.length < 10 && (r[k] === null || typeof r[k] !== 'object')) keys.push(k); }); });
    if (!keys.length) return '<pre>' + e(JSON.stringify(data, null, 2)) + '</pre>';
    return '<table><thead><tr>' + keys.map(function (k) { return '<th>' + e(k) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.slice(0, 30).map(function (r) { return '<tr>' + keys.map(function (k) { return '<td>' + e(typeof r[k] === 'object' ? JSON.stringify(r[k]) : r[k]) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
  }
  async function flight(trip, action, host, btn) {
    if (!C.FLIGHT_PROXY_URL) { host.textContent = t('trips.flightUnconfigured'); return; }
    btn.disabled = true; host.textContent = t('trips.loading');
    try {
      var auth = await client.auth.getSession();
      if (auth.error || !auth.data.session) throw new Error('auth');
      var args = { date: trip.trip_date }, dep = known(trip.origin), arr = known(trip.destination);
      if (action === 'status') args.fnum = trip.flight_no;
      if (dep && dep.airport) args.dep = dep.airport;
      else if (/^[A-Z]{3}$/i.test(trip.origin)) args.dep = trip.origin.toUpperCase();
      else args.depcity = trip.origin;
      if (arr && arr.airport) args.arr = arr.airport;
      else if (/^[A-Z]{3}$/i.test(trip.destination)) args.arr = trip.destination.toUpperCase();
      else args.arrcity = trip.destination;
      if (action === 'status') { delete args.depcity; delete args.arrcity; }
      else { args.limit = 20; args.detail = 'summary'; }
      var response = await fetch(C.FLIGHT_PROXY_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.data.session.access_token, apikey: C.SUPABASE_ANON_KEY }, body: JSON.stringify({ tool: action === 'status' ? 'searchFlightsByNumber' : 'searchFlightsByDepArr', args: args }) });
      var json = await response.json();
      if (!response.ok || !json.ok) throw new Error('proxy');
      host.innerHTML = flightHtml(json.data);
    } catch (err) { host.textContent = t('trips.flightError'); }
    btn.disabled = false;
  }
  main.addEventListener('input', remember);
  main.addEventListener('click', async function (event) {
    var btn = event.target.closest('[data-action]'); if (!btn || btn.disabled || busy) return;
    var action = btn.getAttribute('data-action'), card = btn.closest('[data-trip]'), trip = card && trips[Number(card.getAttribute('data-trip'))];
    if (action === 'route' || action === 'status') { flight(trip, action, card.querySelector('.trips-flight'), btn); return; }
    if (action === 'cancel') { reset(); message = ''; render(); return; }
    if (action === 'edit') { reset(); editing = trip.id; fields.forEach(function (f) { draft[f] = trip[f] || ''; }); render(); document.getElementById('trips-origin').focus(); return; }
    if (action === 'delete' && !window.confirm(t('trips.confirmDelete'))) return;
    busy = true; message = ''; render();
    try {
      if (action === 'google' && (C.AUTH_PROVIDERS || {}).google) await AUTH_PROVIDERS.google();
      if (action === 'signout') { var out = await client.auth.signOut(); if (out.error) throw out.error; }
      if (action === 'delete') { var result = await client.from('trips').delete().eq('id', trip.id).eq('user_id', session.user.id); if (result.error) throw result.error; if (editing === trip.id) reset(); await load(); }
      if (action === 'refresh') await load();
    } catch (err) { message = errorKey(err, action === 'google'); }
    busy = false; render();
  });
  window.addEventListener('sea:updated', render);
  readAuthError();
  render();
  if (!C.SUPABASE_URL || !C.SUPABASE_ANON_KEY) return;
  var script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.js'; script.async = true;
  script.onerror = function () { ready = true; message = 'trips.error'; render(); };
  script.onload = async function () {
    try {
      client = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
      client.auth.onAuthStateChange(function (event, next) {
        var changed = (!session && next) || (session && (!next || session.user.id !== next.user.id));
        session = next; ready = true;
        if (changed) { revision++; trips = []; reset(); }
        render();
        // Run queries outside the synchronous auth callback to avoid auth lock deadlocks.
        if (next) setTimeout(function () { load().then(render).catch(function (err) { message = errorKey(err); render(); }); }, 0);
      });
      var result = await client.auth.getSession(); if (result.error) throw result.error;
      session = result.data.session; ready = true; await load(); render();
    } catch (err) { ready = true; message = errorKey(err); render(); }
  };
  document.head.appendChild(script);
})();
