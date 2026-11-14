/* My Trips · static frontend, Supabase v2 loaded only after configuration. */
(function () {
  'use strict';
  var C = window.SEA_CONFIG || {}, R = window.SEA_RISK, D = window.SEA_DATA;
  var main = document.getElementById('main'), client = null, session = null;
  var trips = [], editing = null, busy = false, message = '', ready = false, revision = 0;
  var fields = ['origin', 'destination', 'trip_date', 'flight_no', 'note'];
  var draft = {}, role = 'normal', users = [], account = null, roleRevision = 0;
  var flightResults = {}, suggestionCache = {}, suggestTimer = null, suggestRevision = 0;
  function premium() { return role === 'vip' || role === 'admin'; }
  function stored(prefix) {
    try { var value = JSON.parse(sessionStorage.getItem(prefix + account) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch (err) { return {}; }
  }
  function persist(prefix, value) { if (account) try { sessionStorage.setItem(prefix + account, JSON.stringify(value)); } catch (err) { /* Storage is optional. */ } }
  function switchAccount() {
    var uid = session && session.user.id;
    if (uid === account) return;
    account = uid; role = 'normal'; users = []; roleRevision++; closeSuggestions();
    flightResults = uid ? stored('sea-trips-flights:') : {};
    suggestionCache = uid ? stored('sea-trips-suggest:') : {};
  }
  async function loadRole() {
    if (!session) return;
    var uid = session.user.id, version = ++roleRevision, nextRole = 'normal';
    try {
      var result = await client.from('profiles').select('role').eq('id', uid).maybeSingle();
      if (!result.error && result.data && /^(normal|vip|admin)$/.test(result.data.role)) nextRole = result.data.role;
    } catch (err) { /* Profiles may not be installed yet. */ }
    if (account !== uid || version !== roleRevision) return;
    role = nextRole; users = [];
    if (role === 'admin') await loadUsers();
  }
  async function loadUsers() {
    var uid = account;
    try {
      var result = await client.from('profiles').select('id,email,role,created_at').order('created_at', { ascending: true });
      if (uid !== account || role !== 'admin') return;
      if (result.error) throw result.error;
      users = result.data || [];
    } catch (err) { if (uid === account) message = 'trips.adminError'; }
  }
  function adminHtml() {
    if (role !== 'admin') return '';
    return '<section class="panel trips-admin"><h2>' + e(ft('adminPanel')) + '</h2><p class="hint">' + e(ft('paymentHint')) + '</p>' + users.map(function (u, i) {
      return '<div class="trips-admin-row"><span><b>' + e(u.email || '') + '</b><small>' + e(ft('created')) + ': ' + e(timeLabel(u.created_at)) + '</small></span><label>' + e(ft('role')) + '<select data-user-role="' + e(i) + '">' + ['normal', 'vip', 'admin'].map(function (r) { return '<option value="' + e(r) + '"' + (r === u.role ? ' selected' : '') + '>' + e(ft('role_' + r)) + '</option>'; }).join('') + '</select></label><button class="pill" data-action="set-role" data-user="' + e(i) + '" type="button">' + e(ft('saveRole')) + '</button></div>';
    }).join('') + '</section>';
  }
  function restoreFlights() {
    if (!premium()) return;
    main.querySelectorAll('[data-trip]').forEach(function (card) {
      var trip = trips[Number(card.getAttribute('data-trip'))], saved = flightResults[trip.id];
      if (!saved) return;
      card.querySelector('.trips-flight').innerHTML = ['status', 'route'].map(function (action) {
        var item = saved[action]; return item && item.action === action && item.json && item.json.ok === true ? flightHtml(item.json, { route: action === 'route' }) : '';
      }).join('');
    });
  }
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
    var locked = (action === 'status' || action === 'route') && !premium();
    return '<button type="button" class="pill' + (locked ? ' trips-locked' : '') + '" data-action="' + e(action) + '"' + (disabled && !locked ? ' disabled' : '') + '>' + e(t(key)) + (locked ? ' <span class="trips-vip">&#128274; ' + e(ft('vipBadge')) + '</span>' : '') + '</button>';
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
      ' <span class="badge ' + k + '">' + '<span aria-hidden="true">' + ({green:'✓',yellow:'!',orange:'▲',red:'✕'})[k] + '</span> ' + e(t('level.' + k)) + '</span><p>' + e(t(exact ? 'trips.forecast' : 'trips.forecastFallback')) + '</p><p>' +
      e(t('fact.temp')) + ': ' + (temps.length ? e(Math.min.apply(null, temps).toFixed(1) + '–' + Math.max.apply(null, temps).toFixed(1)) : '—') + ' °C · ' +
      e(t('fact.rain')) + ': ' + e(rain.toFixed(1)) + ' mm</p><p class="hint">' + e(t('trips.riskNote')) + '</p></div>';
  }
  function render() {
    closeSuggestions();
    var html = '<div class="section-head"><h1>' + e(t('nav.trips')) + '</h1></div>';
    if (!C.SUPABASE_URL || !C.SUPABASE_ANON_KEY) {
      main.innerHTML = html + '<div class="panel"><h2>' + e(t('trips.unconfigured')) + '</h2><p>' + e(t('trips.coming')) + '</p></div>'; return;
    }
    html += '<div class="panel trips-panel"><div id="trips-message" role="status" aria-live="polite">' + e(message ? t(message) : '') + '</div>';
    if (!ready) html += '<p>' + e(t('trips.loading')) + '</p>';
    else if (!session) {
      html += '<div class="trips-welcome"><h2>' + e(t('trips.welcome')) + '</h2><ul class="trips-benefits">';
      ['Save', 'Weather', 'Flight'].forEach(function (key, i) {
        html += '<li><span aria-hidden="true">' + ['📍', '🌦️', '✈️'][i] + '</span><span>' + e(t('trips.benefit' + key)) +
          (i === 2 ? ' <span class="trips-vip">' + e(t('trips.vipBadge')) + '</span>' : '') + '</span></li>';
      });
      var origin = R.countryById('vn').cities[0], destination = R.countryById('th').cities[0];
      html += '</ul><article class="trips-example"><strong>' + e(t('trips.example')) + '</strong><h3>' +
        e(loc(origin.name)) + ' (SGN) → ' + e(loc(destination.name)) + ' (BKK)</h3><p>2026-12-01 · 28 °C</p>' +
        '<span class="badge yellow"><span aria-hidden="true">!</span>' + e(t('level.yellow')) + '</span></article>';
      if ((C.AUTH_PROVIDERS || {}).google) html += '<button type="button" class="btn-primary trips-google" data-action="google"' +
        (busy || !client ? ' disabled' : '') + '>' + e(t('trips.google')) + '</button>';
      html += '</div>';
    } else {
      html += '<div class="trips-actions"><span>' + e(session.user.email || '') + '</span>' + button('trips.signOut', 'signout', busy) + '</div>';
      html += '<h2>' + e(t(editing ? 'trips.edit' : 'trips.add')) + '</h2><form id="trips-form"><div class="form-row">';
      fields.forEach(function (f) {
        html += '<div class="field"><label for="trips-' + f + '">' + e(t('trips.' + f)) + '</label>';
        if (f === 'note') html += '<textarea id="trips-note" maxlength="2000">' + e(draft[f] || '') + '</textarea>';
        else html += '<input id="trips-' + f + '" type="' + (f === 'trip_date' ? 'date' : 'text') + '" value="' + e(draft[f] || '') + '"' +
          (f === 'origin' || f === 'destination' ? ' list="trips-cities" maxlength="120" required' : f === 'trip_date' ? ' required' : ' maxlength="7"') + '>';
        if (f === 'flight_no') html += '<p id="trips-suggest-hint" class="hint">' + e(ft(premium() ? 'suggestHint' : 'suggestVip')) + '</p><div id="trips-suggestions" class="trips-suggestions" role="listbox" aria-label="' + e(ft('suggestions')) + '" hidden></div>';
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
    main.innerHTML = html + '</div>' + (session ? adminHtml() : '');
    restoreFlights();
    attachSuggestions();
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
    Object.keys(flightResults).forEach(function (id) { if (!trips.some(function (trip) { return trip.id === id; })) delete flightResults[id]; });
    persist('sea-trips-flights:', flightResults);
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
      var savedId = editing;
      var result = editing ? await client.from('trips').update(row).eq('id', editing).eq('user_id', session.user.id) : await client.from('trips').insert(row);
      if (result.error) throw result.error;
      if (savedId) { delete flightResults[savedId]; persist('sea-trips-flights:', flightResults); }
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
  // Recursive literal tokenizer: accepts data only, never executable expressions.
  function parseFlightPayload(value) {
    if (value && typeof value === 'object' && value.content) value = value.content[0] && value.content[0].text;
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch (err) { /* Python literal below. */ }
    var at = 0, depth = 0;
    function fail() { throw new SyntaxError('Invalid flight payload'); }
    function ws() { while (/\s/.test(value.charAt(at)) && at < value.length) at++; }
    function string() {
      var quote = value.charAt(at++), out = '';
      while (at < value.length) {
        var ch = value.charAt(at++);
        if (ch === quote) return out;
        if (ch !== '\\') { out += ch; continue; }
        ch = value.charAt(at++);
        var escapes = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', a: '\x07', '\\': '\\', "'": "'", '"': '"' };
        if (Object.prototype.hasOwnProperty.call(escapes, ch)) out += escapes[ch];
        else if (ch === 'u' || ch === 'x' || ch === 'U') {
          var count = ch === 'x' ? 2 : ch === 'U' ? 8 : 4, hex = value.substr(at, count);
          if (!new RegExp('^[0-9a-fA-F]{' + count + '}$').test(hex) || parseInt(hex, 16) > 1114111) fail();
          out += String.fromCodePoint(parseInt(hex, 16)); at += count;
        } else if (ch === '\n') { /* Python line continuation. */ }
        else if (ch) out += '\\' + ch;
        else fail();
      }
      fail();
    }
    function read() {
      ws(); if (++depth > 100) fail();
      var ch = value.charAt(at), result, end;
      if (ch === "'" || ch === '"') result = string();
      else if (ch === '{' || ch === '[') {
        end = ch === '{' ? '}' : ']'; result = ch === '{' ? Object.create(null) : []; at++; ws();
        while (value.charAt(at) !== end) {
          if (ch === '{') {
            ws(); if (value.charAt(at) !== "'" && value.charAt(at) !== '"') fail();
            var key = string(); ws(); if (value.charAt(at++) !== ':') fail(); result[key] = read();
          } else result.push(read());
          ws(); if (value.charAt(at) === end) break;
          if (value.charAt(at++) !== ',') fail(); ws();
        }
        at++;
      } else {
        var token = /^(None|True|False|null|true|false|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/.exec(value.slice(at));
        if (!token) fail(); at += token[0].length;
        result = { None: null, True: true, False: false, null: null, true: true, false: false };
        result = Object.prototype.hasOwnProperty.call(result, token[0]) ? result[token[0]] : Number(token[0]);
        if (typeof result === 'number' && !isFinite(result)) fail();
      }
      depth--; return result;
    }
    var parsed = read(); ws(); if (at !== value.length) fail(); return parsed;
  }
  function present(v) { return v != null && String(v).trim() !== '' && !/^\|+$/.test(String(v)); }
  function ft(k) { return t('trips.' + k); }
  function timeLabel(v) { return String(v || '').replace('T', ' ').replace(/(\d{2}:\d{2}):\d{2}(?:\.\d+)?/, '$1'); }
  // Compare wall times only within the same endpoint; no guessed timezone conversion.
  function minute(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(v || ''));
    if (!m || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31 || +m[4] > 23 || +m[5] > 59 || +(m[6] || 0) > 59) return null;
    var stamp = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    if (new Date(stamp).getUTCDate() !== +m[3]) return null;
    return stamp / 60000;
  }
  function rate(v) {
    if (!present(v) || !/^\d+(?:\.\d+)?%?$/.test(String(v).trim())) return null;
    var n = parseFloat(v); return n >= 0 && n <= 100 ? n : null;
  }
  function status(f) {
    var raw = String(f.FlightState || '').trim(), states = [
      ['arrived', 'green', /^(到达|arrived|landed)$/i], ['onTime', 'green', /^(准点|on[ -]?time)$/i],
      ['early', 'green', /^(提前|early)$/i], ['departed', 'blue', /^(起飞|departed|airborne|en route)$/i],
      ['boarding', 'blue', /^(正在登机|登机|boarding)$/i], ['soon', 'blue', /^(即将起飞|即将登机|departing soon)$/i],
      ['closed', 'blue', /^(登机结束|boarding closed|gate closed)$/i], ['planned', 'grey', /^(计划|scheduled|planned)$/i],
      ['delayed', 'orange', /^(延误|delayed)$/i], ['cancelled', 'red', /^(取消|cancelled|canceled)$/i],
      ['diverted', 'red', /^(备降|diverted)$/i], ['returned', 'red', /^(返航|returned)$/i]
    ], found = states.filter(function (s) { return s[2].test(raw); })[0];
    return '<span class="badge ' + e(found ? found[1] : 'grey') + '"><span class="dot"></span>' + e(found ? ft(found[0]) : raw || ft('unknown')) + '</span>';
  }
  function metrics(f) {
    var axes = [], dep = rate(f.OntimeRate), arr = rate(f.ArrOntimeRate);
    if (dep !== null) axes.push(['depRate', dep]); if (arr !== null) axes.push(['arrRate', arr]);
    function score(actual) {
      var values = [];
      ['Dep', 'Arr'].forEach(function (side) {
        var plan = minute(f['Flight' + side + 'timePlanDate']);
        var actualTime = f['Flight' + side + 'timeDate'];
        var comparison = minute(actual && present(actualTime) ? actualTime : f['VeryZhunReady' + side + 'timeDate']);
        if (plan !== null && comparison !== null) values.push(Math.max(0, 100 - Math.max(0, comparison - plan) * 100 / 60));
      });
      return values.length ? values.reduce(function (a, b) { return a + b; }, 0) / values.length : null;
    }
    var prediction = score(false), punctual = score(true);
    if (prediction !== null) axes.push(['prediction', prediction]); if (punctual !== null) axes.push(['punctuality', punctual]);
    return axes;
  }
  function svgText(x, y, text, extra) { return '<text x="' + e(x) + '" y="' + e(y) + '"' + (extra || '') + '>' + e(text) + '</text>'; }
  function radar(f) {
    var axes = metrics(f); if (!axes.length) return '';
    var svg = '', n = axes.length, cx = 160, cy = 120, radius = 82;
    function point(i, scale) { var angle = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + Math.cos(angle) * radius * scale, cy + Math.sin(angle) * radius * scale]; }
    if (n >= 3) {
      [0.25, 0.5, 0.75, 1].forEach(function (r) { svg += '<polygon class="flight-grid" points="' + e(axes.map(function (_, i) { return point(i, r).join(','); }).join(' ')) + '"/>'; });
      axes.forEach(function (_, i) { var p = point(i, 1); svg += '<path class="flight-grid" d="M160 120 L' + e(p.join(' ')) + '"/>'; });
      svg += '<polygon class="flight-polygon" points="' + e(axes.map(function (a, i) { return point(i, a[1] / 100).join(','); }).join(' ')) + '"/>';
      axes.forEach(function (a, i) { var p = point(i, 1.22); svg += svgText(p[0], p[1], String(i + 1), ' text-anchor="middle" dominant-baseline="middle"'); });
      svg += svgText(166, 116, '0') + svgText(166, 42, '100');
    }
    return '<section class="flight-chart"><h4>' + e(ft('radar')) + '</h4>' + (n >= 3 ? '<svg viewBox="0 0 320 240" role="img" aria-label="' + e(ft('radar')) + '">' + svg + '</svg>' : '') + '<ol class="flight-metrics">' + axes.map(function (a) { return '<li><span>' + e(ft(a[0])) + '</span><b>' + e(a[1].toFixed(1)) + '/100</b></li>'; }).join('') + '</ol><p class="hint">' + e(ft('scoreNote')) + '</p></section>';
  }
  function timeBars(f) {
    var rows = [];
    [['planned', 'Flight', 'timePlanDate'], ['estimated', 'VeryZhunReady', 'timeDate'], ['actual', 'Flight', 'timeDate']].forEach(function (spec) {
      ['Dep', 'Arr'].forEach(function (side) {
        var raw = f[spec[1] + side + spec[2]], value = minute(raw);
        if (value !== null) rows.push({ label: ft(side === 'Dep' ? 'departure' : 'arrival') + ' · ' + ft(spec[0]), value: value, raw: raw, side: side });
      });
    });
    // A shared absolute axis requires explicit offsets for both endpoints.
    var offsets = [Number(f.org_timezone), Number(f.dst_timezone)];
    var reliable = present(f.org_timezone) && present(f.dst_timezone) && offsets.every(function (v) { return isFinite(v) && Math.abs(v) <= 50400; });
    var svg = '', height;
    if (rows.length >= 2 && reliable) {
      rows.forEach(function (r) { r.value -= offsets[r.side === 'Dep' ? 0 : 1] / 60; });
      var min = Math.min.apply(null, rows.map(function (r) { return r.value; })) - 10;
      var max = Math.max.apply(null, rows.map(function (r) { return r.value; })) + 10;
      height = rows.length * 53 + 28;
      rows.forEach(function (r, i) {
        var y = i * 53 + 16, x = 16 + (r.value - min) / (max - min) * 288;
        svg += svgText(16, y, r.label) + svgText(304, y, timeLabel(r.raw).slice(5), ' text-anchor="end"');
        svg += '<rect class="flight-track" x="16" y="' + e(y + 9) + '" width="288" height="8" rx="4"/><rect class="flight-bar" x="16" y="' + e(y + 9) + '" width="' + e(x - 16) + '" height="8" rx="4"/>';
      });
      svg += svgText(16, height - 3, ft('sharedAxis'));
    } else if (present(f.FlightDuration) && /^\d+(\.\d+)?$/.test(String(f.FlightDuration))) {
      height = 66;
      svg = svgText(16, 19, ft('duration') + ' · ' + f.FlightDuration + ' ' + ft('minutes')) + '<rect class="flight-bar" x="16" y="34" width="288" height="10" rx="5"/>';
    } else return '';
    return '<section class="flight-chart"><h4>' + e(ft('timeChart')) + '</h4><svg viewBox="0 0 320 ' + e(height) + '" role="img" aria-label="' + e(ft('timeChart')) + '">' + svg + '</svg></section>';
  }
  function flightCard(f, compact) {
    var html = '<article class="flight-card' + (compact ? ' flight-compact' : '') + '"><header><div><h3>' + e(f.FlightNo || ft('unknown')) + '</h3><div class="hint">' + e(f.FlightCompany || '') + '</div></div>' + status(f) + '</header>';
    if (present(f.ftype) || present(f.generic)) html += '<p class="hint">' + e(ft('aircraft')) + ' · ' + e([f.ftype, f.generic].filter(present).join(' / ')) + '</p>';
    html += '<div class="flight-timeline">';
    ['Dep', 'Arr'].forEach(function (side) {
      html += '<section><div class="flight-eyebrow">' + e(ft(side === 'Dep' ? 'departure' : 'arrival')) + '</div><h4>' + e(f['Flight' + side] || f['Flight' + side + 'code'] || '—') + '</h4><p class="hint">' + e([f['Flight' + side + 'Airport'], f['Flight' + side + 'code']].filter(present).join(' · ')) + '</p>';
      var terminal = f[side === 'Dep' ? 'FlightHTerminal' : 'FlightTerminal'];
      if (present(terminal)) html += '<p class="hint">' + e(ft('terminal') + ' ' + terminal) + '</p>';
      html += '<dl>';
      [['planned', 'Flight' + side + 'timePlanDate'], ['estimated', 'VeryZhunReady' + side + 'timeDate'], ['ready', 'Flight' + side + 'timeReadyDate'], ['actual', 'Flight' + side + 'timeDate']].forEach(function (row) {
        if (present(f[row[1]])) html += '<div><dt>' + e(ft(row[0])) + '</dt><dd>' + e(timeLabel(f[row[1]])) + '</dd></div>';
      });
      html += '</dl></section>';
    });
    html += '</div><div class="flight-chips">';
    [['duration', 'FlightDuration', 'minutes'], ['distance', 'distance', 'km'], ['checkin', 'CheckinTable'], ['gate', 'BoardGate'], ['checkDoor', 'CheckDoor'], ['baggage', 'BaggageID'], ['meal', 'Food'], ['delayReason', 'DelayReason'], ['share', 'ShareFlightNo'], ['stop', 'StopCity']].forEach(function (chip) {
      if (present(f[chip[1]])) html += '<span><span class="hint">' + e(ft(chip[0])) + '</span> ' + e(f[chip[1]]) + (chip[2] ? ' ' + e(ft(chip[2])) : '') + '</span>';
    });
    html += '</div>';
    if (!compact) html += '<div class="flight-charts">' + radar(f) + timeBars(f) + '</div>';
    return html + '</article>';
  }
  function routeBars(rows) {
    var values = rows.map(function (f) { var dep = rate(f.OntimeRate); return { f: f, value: dep === null ? rate(f.ArrOntimeRate) : dep, key: dep === null ? 'arrRate' : 'depRate' }; }).filter(function (r) { return r.value !== null; });
    if (!values.length) return '';
    var svg = svgText(16, 16, '0%') + svgText(304, 16, '100%', ' text-anchor="end"');
    values.forEach(function (r, i) {
      var y = 42 + i * 64;
      svg += svgText(16, y, (r.f.FlightNo || '—') + ' · ' + ft(r.key)) + svgText(304, y, r.value + '%', ' text-anchor="end"');
      svg += '<rect class="flight-track" x="16" y="' + e(y + 10) + '" width="288" height="12" rx="6"/><rect class="flight-bar" x="16" y="' + e(y + 10) + '" width="' + e(288 * r.value / 100) + '" height="12" rx="6"/>';
    });
    return '<section class="flight-chart flight-route-chart"><h4>' + e(ft('routeChart')) + '</h4><svg viewBox="0 0 320 ' + e(values.length * 64 + 28) + '" role="img" aria-label="' + e(ft('routeChart')) + '">' + svg + '</svg></section>';
  }
  function flightHtml(result, options) {
    options = options || {};
    var payload = result && Object.prototype.hasOwnProperty.call(result, 'ok') && Object.prototype.hasOwnProperty.call(result, 'data') ? result.data : result;
    var data, rows = [], error = '', cached = result && result.cached === true;
    try {
      data = parseFlightPayload(payload);
      var node = data;
      for (var i = 0; i < 6 && node; i++) {
        if (node.code != null && String(node.code) !== '200') { error = ft('flightError') + (present(node.message) ? ' ' + String(node.message) : ''); break; }
        if (Array.isArray(node)) { rows = node; break; }
        if (typeof node !== 'object') break;
        if (present(node.FlightNo) || present(node.FlightDepcode) || present(node.FlightDeptimePlanDate)) { rows = [node]; break; }
        node = node.data || node.flights || node.list;
      }
    } catch (err) { error = ft('flightError'); }
    rows = rows.filter(function (f) { return f && typeof f === 'object' && !Array.isArray(f); });
    var compact = options.route === true || rows.length > 1;
    if (compact) rows.sort(function (a, b) { var x = minute(a.FlightDeptimePlanDate), y = minute(b.FlightDeptimePlanDate); return (x === null ? Infinity : x) - (y === null ? Infinity : y); });
    var html = '<div class="flight-results">' + (cached ? '<p class="hint">' + e(ft('cached')) + '</p>' : '');
    if (error || !rows.length) html += '<p class="flight-empty" role="status">' + e(error || ft('noFlights')) + '</p>';
    else html += (compact ? routeBars(rows) : '') + rows.map(function (f) { return flightCard(f, compact); }).join('');
    var raw;
    try { raw = typeof data === 'undefined' ? (typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)) : JSON.stringify(data, null, 2); } catch (err) { raw = String(payload); }
    return html + '<details class="def-details flight-raw"><summary>' + e(ft('raw')) + '</summary><pre>' + e(raw) + '</pre></details></div>';
  }
  function extractFlights(json) {
    var node = parseFlightPayload(json && json.ok === true ? json.data : json);
    for (var i = 0; i < 6 && node; i++) {
      if (node.code != null && String(node.code) !== '200') throw new Error('provider');
      if (Array.isArray(node)) return node.filter(function (f) { return f && typeof f === 'object' && !Array.isArray(f); });
      if (typeof node !== 'object') break;
      if (present(node.FlightNo) || present(node.FlightDepcode) || present(node.FlightDeptimePlanDate)) return [node];
      node = node.data || node.flights || node.list;
    }
    throw new Error('payload');
  }
  function compactTime(value) { var m = /(?:^|[ T])(\d{2}:\d{2})/.exec(String(value || '')); return m ? m[1] : '—'; }
  function suggestionOptions(rows, active) {
    return rows.map(function (f, i) {
      return '<div class="trips-suggestion' + (i === active ? ' is-active' : '') + '" id="trips-option-' + e(i) + '" role="option" aria-selected="' + e(i === active) + '" data-suggestion="' + e(i) + '"><div><b>' + e(f.FlightNo || '') + '</b><small>' + e(f.FlightCompany || '') + '</small></div><span>' + e(compactTime(f.FlightDeptimePlanDate)) + ' → ' + e(compactTime(f.FlightArrtimePlanDate)) + '</span></div>';
    }).join('');
  }
  function closeSuggestions() {
    clearTimeout(suggestTimer); suggestRevision++;
    var box = document.getElementById('trips-suggestions'), input = document.getElementById('trips-flight_no');
    if (box) box.hidden = true;
    if (input) { input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); }
  }
  function attachSuggestions() {
    var input = document.getElementById('trips-flight_no'), box = document.getElementById('trips-suggestions');
    if (!input || !box) return;
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-controls', box.id); input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-describedby', 'trips-suggest-hint'); input.autocomplete = 'off';
    var rows = [], filtered = [], active = -1, combo = '', state = '';
    function route() {
      remember();
      var dep = (draft.origin || '').trim(), arr = (draft.destination || '').trim(), date = draft.trip_date;
      if (!dep || !arr || !validPlace(dep) || !validPlace(arr) || !validDate(date)) return null;
      var a = known(dep), b = known(arr);
      dep = /^[a-z]{3}$/i.test(dep) ? dep.toUpperCase() : a && a.airport;
      arr = /^[a-z]{3}$/i.test(arr) ? arr.toUpperCase() : b && b.airport;
      if (!/^[A-Z]{3}$/.test(dep || '') || !/^[A-Z]{3}$/.test(arr || '')) return null;
      return { dep: dep, arr: arr, date: date, limit: 20, detail: 'summary' };
    }
    function draw() {
      var needle = input.value.trim().toLowerCase();
      filtered = rows.filter(function (f) { return String(f.FlightNo || '').toLowerCase().indexOf(needle) !== -1 || String(f.FlightCompany || '').toLowerCase().indexOf(needle) !== -1; });
      if (active >= filtered.length) active = -1;
      box.innerHTML = state ? '<p role="status">' + e(ft(state)) + '</p>' : filtered.length ? suggestionOptions(filtered, active) : '<p role="status">' + e(ft('suggestEmpty')) + '</p>';
      box.hidden = false; input.setAttribute('aria-expanded', 'true');
      if (active >= 0) input.setAttribute('aria-activedescendant', 'trips-option-' + active); else input.removeAttribute('aria-activedescendant');
    }
    function open() {
      if (!premium()) return;
      var args = route();
      if (!args) { closeSuggestions(); return; }
      var key = args.dep + ':' + args.arr + ':' + args.date;
      if (combo === key && !state) { draw(); return; }
      closeSuggestions(); combo = key; rows = []; active = -1;
      if (suggestionCache[key]) {
        try { rows = extractFlights(suggestionCache[key]); state = ''; draw(); return; } catch (err) { delete suggestionCache[key]; }
      }
      state = 'suggestLoading'; draw();
      var version = suggestRevision, uid = account;
      suggestTimer = setTimeout(async function () {
        try {
          if (!C.FLIGHT_PROXY_URL) throw new Error('config');
          var auth = await client.auth.getSession();
          if (uid !== account || version !== suggestRevision || !premium()) return;
          if (auth.error || !auth.data.session) throw new Error('auth');
          var response = await fetch(C.FLIGHT_PROXY_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.data.session.access_token, apikey: C.SUPABASE_ANON_KEY }, body: JSON.stringify({ tool: 'searchFlightsByDepArr', args: args }) });
          var json = await response.json();
          if (uid !== account || version !== suggestRevision || !premium()) return;
          if (response.status === 403 && /vip|premium|paid/i.test(json.error || '')) { closeSuggestions(); document.getElementById('trips-suggest-hint').textContent = ft('suggestVip'); return; }
          if (!response.ok || !json.ok) throw new Error('proxy');
          rows = extractFlights(json).filter(function (f) { return present(f.FlightNo); });
          rows.sort(function (a, b) { var x = minute(a.FlightDeptimePlanDate), y = minute(b.FlightDeptimePlanDate); return (x === null ? Infinity : x) - (y === null ? Infinity : y); });
          suggestionCache[key] = { ok: true, cached: json.cached, data: rows }; persist('sea-trips-suggest:', suggestionCache);
          state = ''; draw();
        } catch (err) { if (uid === account && version === suggestRevision) { state = 'suggestError'; draw(); } }
      }, 350);
    }
    function pick(index) {
      var f = filtered[index]; if (!f) return;
      input.value = String(f.FlightNo).toUpperCase();
      var note = document.getElementById('trips-note');
      if (!note.value.trim()) note.value = input.value + ' ' + compactTime(f.FlightDeptimePlanDate) + ' → ' + compactTime(f.FlightArrtimePlanDate);
      remember(); closeSuggestions(); input.focus();
    }
    input.addEventListener('focus', open); input.addEventListener('input', open);
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { closeSuggestions(); return; }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); if (box.hidden) { open(); return; }
        if (!filtered.length) return;
        active = (active + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length; draw();
        var option = document.getElementById('trips-option-' + active); if (option) option.scrollIntoView({ block: 'nearest' });
      } else if (event.key === 'Enter' && !box.hidden && active >= 0) { event.preventDefault(); pick(active); }
    });
    box.addEventListener('mousedown', function (event) { event.preventDefault(); var item = event.target.closest('[data-suggestion]'); if (item) pick(Number(item.getAttribute('data-suggestion'))); });
    input.addEventListener('blur', closeSuggestions);
    ['origin', 'destination', 'trip_date'].forEach(function (f) { document.getElementById('trips-' + f).addEventListener('input', function () { combo = ''; closeSuggestions(); }); });
  }
  window.SEA_TRIPS = { parseFlightPayload: parseFlightPayload, flightHtml: flightHtml, suggestionOptions: suggestionOptions, extractFlights: extractFlights };
  async function flight(trip, action, host, btn) {
    if (!premium()) { host.textContent = ft('flightVip'); return; }
    if (!C.FLIGHT_PROXY_URL) { host.textContent = t('trips.flightUnconfigured'); return; }
    var uid = account;
    btn.disabled = true; host.textContent = t('trips.loading');
    try {
      var auth = await client.auth.getSession();
      if (uid !== account || !premium()) return;
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
      if (uid !== account || !premium()) return;
      if (response.status === 403 && /vip|premium|paid/i.test(json.error || '')) { host.textContent = ft('flightVip'); return; }
      if (!response.ok || !json.ok) throw new Error('proxy');
      extractFlights(json); // Reject malformed/provider-error payloads before persisting.
      if (!trips.some(function (item) { return item.id === trip.id; })) return;
      if (!flightResults[trip.id]) flightResults[trip.id] = {};
      flightResults[trip.id][action] = { action: action, json: json };
      persist('sea-trips-flights:', flightResults);
      restoreFlights();
    } catch (err) { if (uid === account) host.textContent = t('trips.flightError'); }
    finally { btn.disabled = false; }
  }
  if (document.body.getAttribute('data-page') !== 'trips' || !main) return;
  document.addEventListener('click', function (event) { if (!event.target.closest('#trips-flight_no, #trips-suggestions')) closeSuggestions(); });
  main.addEventListener('input', remember);
  main.addEventListener('click', async function (event) {
    var btn = event.target.closest('[data-action]'); if (!btn || btn.disabled || busy) return;
    var action = btn.getAttribute('data-action'), card = btn.closest('[data-trip]'), trip = card && trips[Number(card.getAttribute('data-trip'))];
    if (action === 'set-role' && role === 'admin') {
      var index = Number(btn.getAttribute('data-user')), user = users[index], uid = account;
      var selected = main.querySelector('[data-user-role="' + index + '"]').value;
      if (!user || !/^(normal|vip|admin)$/.test(selected)) return;
      btn.disabled = true;
      try {
        var updated = await client.from('profiles').update({ role: selected }).eq('id', user.id).select('id');
        if (account !== uid) return;
        if (updated.error || !updated.data || !updated.data.length) throw new Error('role');
        if (user.id === uid) role = selected;
        if (role === 'admin') await loadUsers(); else users = [];
      } catch (err) { if (account === uid) message = 'trips.adminError'; }
      render(); return;
    }
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
        session = next; switchAccount(); ready = true;
        if (changed) { revision++; trips = []; reset(); }
        render();
        // Run queries outside the synchronous auth callback to avoid auth lock deadlocks.
        if (next) setTimeout(function () { Promise.all([loadRole(), load()]).then(render).catch(function (err) { message = errorKey(err); render(); }); }, 0);
      });
      var result = await client.auth.getSession(); if (result.error) throw result.error;
      session = result.data.session; switchAccount(); ready = true; await Promise.all([loadRole(), load()]); render();
    } catch (err) { ready = true; message = errorKey(err); render(); }
  };
  document.head.appendChild(script);
})();
