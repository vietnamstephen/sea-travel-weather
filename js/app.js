/* =============================================================================
 * SEA Travel Weather · 页面渲染 / 多语言 / 行程查询交互
 * =========================================================================== */
(function () {
  'use strict';
  var D = window.SEA_DATA, I = window.I18N, R = window.SEA_RISK;
  var esc = R.esc, t = function (k) { return I.t(k, LANG); };
  var LANG = (function () {
    var q = null;
    try { q = new URLSearchParams(location.search).get('lang'); } catch (e) { /* file:// 或旧浏览器 */ }
    if (q && I.order.hasOwnProperty(q)) return q;
    return localStorage.getItem('sea_lang') || 'zh';
  })();
  if (!I.order.hasOwnProperty(LANG)) LANG = 'zh';
  document.documentElement.setAttribute('lang', LANG === 'zh' ? 'zh-CN' : LANG);

  var PAGE = document.body.getAttribute('data-page') || 'overview';
  var CID = document.body.getAttribute('data-country') || '';
  if (PAGE === 'country') {
    var sharedCountry = new URLSearchParams(location.search).get('c');
    if (['vn','th','my','sg','id','ph'].includes(sharedCountry) && sharedCountry !== CID) {
      location.replace(sharedCountry + '.html' + location.search + location.hash);
      return;
    }
  }
  var WEATHER = null;
  var FLIGHTS = null;
  var ADV = null;
  // Small read-only bridge; trips owns its page and subscribes to shell updates.
  var paymentEntitlement = null;
  window.addEventListener('sea:payments-visibility', function (event) { paymentEntitlement = event.detail; buildNav(); });
  window.SEA_APP = { lang: LANG, weather: WEATHER };
  function notifyTrips() {
    window.SEA_APP.lang = LANG; window.SEA_APP.weather = WEATHER;
    window.dispatchEvent(new Event('sea:updated'));
  }
  var LANGS = [
    ['zh', 'lang.zh', '中文'], ['en', 'lang.en', 'English'], ['vi', 'lang.vi', 'Tiếng Việt'],
    ['th', 'lang.th', 'ไทย'], ['id', 'lang.id', 'Bahasa Indonesia']
  ];

  /* WMO 天气码 → 图标 + 五语简述（0..4 = zh/en/vi/th/id，5 = 图标） */
  var WMO = {
    0: ['晴', 'Clear', 'Quang đãng', 'แจ่มใส', 'Cerah', '☀️'],
    1: ['大致晴朗', 'Mainly clear', 'Chủ yếu quang', 'แจ่มใสเป็นส่วนใหญ่', 'Sebagian besar cerah', '🌤️'],
    2: ['局部多云', 'Partly cloudy', 'Có mây', 'มีเมฆบางส่วน', 'Berawan sebagian', '⛅'],
    3: ['阴', 'Overcast', 'U ám', 'มีเมฆมาก', 'Mendung', '☁️'],
    45: ['雾', 'Fog', 'Sương mù', 'หมอก', 'Kabut', '🌫️'],
    48: ['雾凇', 'Rime fog', 'Sương mù đóng băng', 'หมอกน้ำค้างแข็ง', 'Kabut embun beku', '🌫️'],
    51: ['小毛毛雨', 'Light drizzle', 'Mưa bụi nhẹ', 'ฝนปรอยเล็กน้อย', 'Gerimis ringan', '🌦️'],
    53: ['毛毛雨', 'Drizzle', 'Mưa bụi', 'ฝนปรอย', 'Gerimis', '🌦️'],
    55: ['浓毛毛雨', 'Dense drizzle', 'Mưa bụi dày', 'ฝนปรอยหนา', 'Gerimis lebat', '🌧️'],
    61: ['小雨', 'Light rain', 'Mưa nhỏ', 'ฝนเล็กน้อย', 'Hujan ringan', '🌦️'],
    63: ['中雨', 'Rain', 'Mưa vừa', 'ฝนปานกลาง', 'Hujan', '🌧️'],
    65: ['大雨', 'Heavy rain', 'Mưa to', 'ฝนตกหนัก', 'Hujan lebat', '🌧️'],
    66: ['冻雨', 'Freezing rain', 'Mưa đóng băng', 'ฝนเยือกแข็ง', 'Hujan beku', '🌧️'],
    67: ['强冻雨', 'Heavy freezing rain', 'Mưa đóng băng lớn', 'ฝนเยือกแข็งหนัก', 'Hujan beku lebat', '🌧️'],
    71: ['小雪', 'Light snow', 'Tuyết nhẹ', 'หิมะเล็กน้อย', 'Salju ringan', '❄️'],
    73: ['中雪', 'Snow', 'Tuyết', 'หิมะ', 'Salju', '❄️'],
    75: ['大雪', 'Heavy snow', 'Tuyết lớn', 'หิมะตกหนัก', 'Salju lebat', '❄️'],
    77: ['米雪', 'Snow grains', 'Hạt tuyết', 'เม็ดหิมะ', 'Butiran salju', '❄️'],
    80: ['阵雨', 'Rain showers', 'Mưa rào', 'ฝนตกเป็นแห่งๆ', 'Hujan lokal', '🌦️'],
    81: ['强阵雨', 'Heavy showers', 'Mưa rào to', 'ฝนตกหนักเป็นแห่งๆ', 'Hujan lokal lebat', '🌧️'],
    82: ['暴雨', 'Violent showers', 'Mưa rào rất to', 'ฝนตกหนักมาก', 'Hujan sangat lebat', '⛈️'],
    85: ['阵雪', 'Snow showers', 'Mưa tuyết', 'หิมะตกเป็นแห่งๆ', 'Salju lokal', '❄️'],
    86: ['强阵雪', 'Heavy snow showers', 'Mưa tuyết lớn', 'หิมะตกหนัก', 'Salju lebat', '❄️'],
    95: ['雷暴', 'Thunderstorm', 'Giông sét', 'ฝนฟ้าคะนอง', 'Badai petir', '⛈️'],
    96: ['雷暴伴冰雹', 'Thunderstorm with hail', 'Giông có mưa đá', 'ฟ้าคะนองพร้อมลูกเห็บ', 'Badai petir + hujan es', '⛈️'],
    99: ['强雷暴伴冰雹', 'Severe thunderstorm with hail', 'Giông mạnh có mưa đá', 'พายุฝนฟ้าคะนองรุนแรง', 'Badai petir hebat + es', '⛈️']
  };
  function wmo(code) {
    var i = I.order[LANG];
    var a = WMO[code] || WMO[3];
    return { text: a[i] || a[1], icon: a[5] };
  }
  function loc(o) { return o ? (o[LANG] || o.en || o.zh || '') : ''; }
  function n(v, d) { return (v === null || v === undefined || isNaN(v)) ? '—' : Number(v).toFixed(d === undefined ? 1 : d); }
  function colon() { return LANG === 'zh' ? '：' : ': '; }

  /* ---------------- 时间 ---------------- */
  function localIso(tz, addHours) {
    try {
      var dt = new Date(Date.now() + (addHours || 0) * 3600000);
      var p = new Intl.DateTimeFormat('en-GB', {
        calendar: 'gregory', timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      }).formatToParts(dt);
      var o = {}; p.forEach(function (x) { o[x.type] = x.value; });
      return o.year + '-' + o.month + '-' + o.day + 'T' + o.hour + ':' + o.minute;
    } catch (e) { return new Date().toISOString().slice(0, 16); }
  }
  function hourKey(tz) { return localIso(tz).slice(0, 13); }

  /* ---------------- 通用片段 ---------------- */
  function badge(level) {
    var k = R.LEVEL_KEYS[level] || 'green';
    return '<span class="badge ' + k + '"><span aria-hidden="true">' + ['✓', '!', '▲', '✕'][level] + '</span>' + esc(t('level.' + k)) + '</span>';
  }
  function panelTitle(key, tag) {
    return '<div class="panel-title">' + esc(t(key)) +
      (tag ? ' <span class="tag">' + esc(tag) + '</span>' : '') + '</div>';
  }
  function sectionHead(k, hintKey) {
    return '<div class="section-head"><h2>' + esc(t(k)) + '</h2>' +
      (hintKey ? '<span class="hint">' + esc(t(hintKey)) + '</span>' : '') + '</div>';
  }
  function weatherCity(cid, cityId) {
    if (!WEATHER || !WEATHER.countries || !WEATHER.countries[cid]) return null;
    return WEATHER.countries[cid].cities[cityId] || null;
  }

  /* ---------------- 顶栏 / 语言按钮 ---------------- */
  function buildLangMenu() {
    var menu = document.getElementById('langMenu');
    var html = '<div class="menu-head">' + esc(t('lang.menuTitle')) + '</div>';
    LANGS.forEach(function (l) {
      html += '<button class="lang-opt' + (l[0] === LANG ? ' on' : '') + '" data-lang="' + l[0] + '" role="menuitem" type="button">' +
        '<span>' + esc(l[2]) + '</span>' + (l[0] === LANG ? '<span class="tick">✓</span>' : '') + '</button>';
    });
    menu.innerHTML = html;
    document.getElementById('langCurrent').textContent = (LANGS.filter(function (l) { return l[0] === LANG; })[0] || LANGS[0])[2];
    menu.querySelectorAll('.lang-opt').forEach(function (b) {
      b.addEventListener('click', function () { setLang(b.getAttribute('data-lang')); });
    });
  }
  function setLang(l) {
    LANG = l; localStorage.setItem('sea_lang', l);
    document.documentElement.setAttribute('lang', l === 'zh' ? 'zh-CN' : l);
    document.getElementById('langMenu').classList.remove('open');
    document.getElementById('langBtn').setAttribute('aria-expanded', 'false');
    applyI18n(); buildLangMenu(); render();
  }
  function applyI18n() {
    document.documentElement.lang = LANG === "zh" ? "zh-CN" : LANG;
    document.querySelector('meta[name="description"]').content = t('app.description');
    document.getElementById("langBtn").setAttribute("aria-label", t("lang.label"));
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      if (k) el.textContent = t(k);
    });
    document.title = t('app.title') + ' · ' + (PAGE === 'overview' ? t('nav.overview') : PAGE === 'trips' ? t('nav.trips') : PAGE === 'pricing' ? t('pricing.title') : PAGE === 'terms' || PAGE === 'privacy' ? t('legal.' + PAGE) : loc(R.countryById(CID).name));
  }

  /* ---------------- 导航 ---------------- */
  function buildNav() {
    var nav = document.getElementById('nav');
    var html = '<div class="nav-label">' + esc(t('nav.section')) + '</div>';
    html += '<a class="nav-link' + (PAGE === 'overview' ? ' on' : '') + '" href="index.html"><span>🧭</span>' + esc(t('nav.overview')) + '</a>';
    html += '<a class="nav-link' + (PAGE === 'trips' ? ' on' : '') + '" href="trips.html"><span>🧳</span>' + esc(t('nav.trips')) + '</a>';
    if ((PAGE === 'trips' || PAGE === 'pricing') && window.SEA_PAYMENTS && window.SEA_PAYMENTS.visible(paymentEntitlement)) html += '<a class="nav-link" href="pricing.html">' + esc(t('pricing.title')) + '</a>';
    D.countries.forEach(function (c) {
      var cr = R.countryRisk(WEATHER, c.id, hourKey(c.tz));
      var k = R.LEVEL_KEYS[cr.level];
      html += '<a class="nav-link' + (CID === c.id ? ' on' : '') + '" href="' + c.id + '.html">' +
        '<span class="flag">' + c.flag + '</span><span>' + esc(loc(c.name)) + '</span>' +
        '<span class="mini ' + k + '">' + '<span aria-hidden="true">' + ({green:'✓',yellow:'!',orange:'▲',red:'✕'})[k] + '</span> ' + esc(t('level.short.' + k)) + '</span></a>';
    });
    html += '<div class="nav-note">' + esc(t('footer.credit')) + '</div>';
    nav.innerHTML = html;
    var current = nav.querySelector(".nav-link.on");
    if (current && window.matchMedia("(max-width:960px)").matches) nav.scrollLeft = current.offsetLeft - nav.offsetLeft - 12;
  }

  /* ---------------- 更新时间戳 ---------------- */
  function updateStamp() {
    var el = document.getElementById('stamp');
    if (!WEATHER || !WEATHER.meta || !WEATHER.meta.generatedAt) {
      el.innerHTML = '<span>' + esc(t('app.updated')) + '</span> <b>—</b>';
      return;
    }
    var g = new Date(WEATHER.meta.generatedAt);
    var ageH = (Date.now() - g.getTime()) / 3600000;
    var stale = !isNaN(ageH) && ageH > 36;
    var label = isNaN(g.getTime()) ? WEATHER.meta.generatedAt : g.toLocaleString(LANG === 'zh' ? 'zh-CN' : LANG, { calendar: 'gregory', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    el.className = 'stamp' + (stale ? ' stale' : '');
    el.innerHTML = '<span>' + esc(t('app.updated')) + '</span> <b>' + esc(label) + '</b>';
    if (stale) el.title = t('app.stale');
  }

  /* =========================================================================
   * 行程查询（总览页与国家页共用）
   * ======================================================================= */
  function tripFormHtml(country) {
    var def = localIso(country ? country.tz : 'Asia/Bangkok', 2);
    return '<div class="section" id="trip">' + sectionHead('trip.title', null) +
      '<div class="panel">' +
      '<p class="hint" style="font-size:var(--body-size,14px);color:var(--sub);margin-bottom:14px">' + esc(t('trip.sub')) + '</p>' +
      '<div class="form-row">' +
      '<div class="field"><label for="tripAddr">' + esc(t('trip.addrLabel')) + '</label>' +
      '<input id="tripAddr" type="text" placeholder="' + esc(t('trip.addrPlaceholder')) + '" autocomplete="off">' +
      '<div class="hint">' + esc(t('trip.addrHint')) + '</div></div>' +
      '<div class="field"><label for="tripTime">' + esc(t('trip.timeLabel')) + '</label>' +
      '<input id="tripTime" type="datetime-local" value="' + esc(def) + '">' +
      '<div class="hint">' + esc(t('trip.timeHint')) + (country ? ' · ' + esc(loc(country.name)) + ' ' + esc(country.utc) : '') + '</div></div>' +
      '<div class="field"><button class="btn-primary" id="tripGo" type="button">' + esc(t('trip.submit')) + '</button></div>' +
      '</div>' +
      '<div class="trip-status" id="tripStatus" role="status" aria-live="polite"></div>' +
      '<div class="result" id="tripResult"></div>' +
      '<div class="limit"><b>' + esc(t('trip.limitTitle')) + colon() + '</b>' + esc(t('trip.limitText')) + '</div>' +
      '</div></div>';
  }

  function initTrip(country) {
    var btn = document.getElementById('tripGo');
    if (!btn) return;
    btn.addEventListener('click', function () { runTrip(country); });
    document.getElementById('tripAddr').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') runTrip(country);
    });
  }

  async function runTrip(defaultCountry) {
    var addr = document.getElementById('tripAddr').value.trim();
    var when = document.getElementById('tripTime').value;
    var status = document.getElementById('tripStatus');
    var box = document.getElementById('tripResult');
    var btn = document.getElementById('tripGo');
    if (btn.disabled) return;
    function showError(key) {
      status.textContent = t(key);
      status.classList.add('err');
    }
    function revealOutcome() {
      var target = box.classList.contains('show') ? box : status;
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    status.classList.remove('err');
    if (!addr || !when) {
      showError('trip.needInput'); box.classList.remove('show'); revealOutcome(); return;
    }

    var originalLabel = btn.textContent;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.textContent = t('trip.checking');
    status.classList.add('busy');
    status.textContent = t('trip.resolving');
    box.classList.remove('show');
    try {
      var resolved = await R.resolveLocation(addr, LANG);
      if (resolved && resolved.error === 'shortlink') {
        showError('trip.shortLink'); return;
      }
      if (resolved && resolved.error === 'network') { showError('trip.geoNetwork'); return; }
      if (!resolved || resolved.error) { showError('trip.geoFail'); return; }

      var near = R.nearestCity(resolved.lat, resolved.lon, resolved.countryCode);
      if (!near) { showError('trip.geoFail'); return; }
      var country = near.country, city = near.city;

      // 优先：按坐标实时向 Open-Meteo 取 7 天逐小时预报；失败降级到每日快照
      var rows, daily, sourceLabel, usedSnapshot = false;
      try {
        var live = await R.fetchPointWeather(resolved.lat, resolved.lon, country.tz);
        rows = R.hourlyRows(live.hourly);
        daily = R.dailyRows(live.daily);
        sourceLabel = 'Open-Meteo · ' + t('common.source') + ' (' + t('common.live') + ')';
      } catch (e) {
        var wc = weatherCity(country.id, city.id);
        if (!wc || !wc.hourly) { showError('app.error'); return; }
        rows = R.hourlyRows(wc.hourly);
        daily = R.dailyRows(wc.daily);
        usedSnapshot = true;
        sourceLabel = 'Open-Meteo · ' + t('common.source') + ' (' + t('common.snapshot') + ')';
      }

      var idx = R.findHour(rows, when);
      if (idx < 0) { showError('trip.noWeather'); return; }
      var a = R.assess(rows[idx], rows, idx, city, when, country.utc);

      status.textContent = '';
      box.innerHTML = renderTripResult(resolved, near, a, when, country, sourceLabel, usedSnapshot);
      box.classList.add('show');
    } catch (e) {
      showError('app.error');
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
      btn.setAttribute('aria-busy', 'false');
      status.classList.remove('busy');
      revealOutcome();
    }
  }

  function renderTripResult(resolved, near, a, when, country, sourceLabel, usedSnapshot) {
    var city = near.city, dist = Math.round(near.distance);
    var label = resolved.label || (resolved.lat.toFixed(4) + ', ' + resolved.lon.toFixed(4));
    var attrs = [];
    if (city.flood) attrs.push(t('fact.floodProne'));
    if (city.island) attrs.push(t('fact.island'));
    if (city.mountain) attrs.push(t('fact.mountain'));

    var html = '<div class="result-head">' + badge(a.level) +
      '<span class="place">' + esc(label) + '</span>' +
      '<span class="badge grey">' + esc(t('trip.parsed')) + ' · ' + esc(loc(country.name)) + '</span></div>';

    html += '<div class="notice info" style="margin-bottom:12px">' +
      '<b>' + esc(t('trip.riskBadge')) + colon() + '</b>' + esc(t('level.' + a.levelKey)) +
      ' · ' + esc(when.replace('T', ' ')) + ' ' + esc(country.utc) +
      '<br><b>' + esc(t('trip.nearest')) + colon() + '</b>' + esc(loc(city.name)) + ' · ' + dist + ' km ' + esc(t('trip.distance')) +
      ' · ' + esc(sourceLabel) +
      (usedSnapshot ? ' · ' + esc(t('trip.snapshotFallback')) : '') +
      (attrs.length ? '<br><b>' + esc(t('common.fact')) + colon() + '</b>' + esc(attrs.join(' / ')) : '') +
      (near.outOfScope ? '<br><b>!</b> ' + esc(t('trip.limitTitle')) : '') +
      '</div>';

    var evNear = eventsFor(country.id);
    if (evNear.length) html += '<div class="notice warn" style="margin-bottom:12px">' +
      esc(t('trip.eventNotice')) + '</div>';

    html += '<div class="result-grid">';
    // ① 事实
    html += '<div class="result-box facts"><h4>' + esc(t('trip.factTitle')) + '</h4><ul>';
    a.facts.forEach(function (f) {
      html += '<li' + (f.hi ? ' style="color:var(--red);font-weight:700"' : '') + '>' +
        esc(t(f.k)) + colon() + '<b>' + esc(f.v) + '</b> ' + esc(t(f.u)) + '</li>';
    });
    if (!a.facts.length) html += '<li>' + esc(t('trip.factNone')) + '</li>';
    html += '</ul></div>';
    // ② 推断
    html += '<div class="result-box infers"><h4>' + esc(t('trip.inferTitle')) + '</h4><ul>';
    if (a.infers.length) a.infers.forEach(function (k) { html += '<li>' + esc(t(k)) + '</li>'; });
    else html += '<li>' + esc(t('trip.inferNone')) + '</li>';
    html += '</ul></div>';
    // ③ 行动
    html += '<div class="result-box actions"><h4>' + esc(t('trip.actionTitle')) + '</h4><ul>';
    if (a.actions.length) a.actions.forEach(function (k) { html += '<li>' + esc(t(k)) + '</li>'; });
    else html += '<li>' + esc(t('trip.actionNone')) + '</li>';
    html += '</ul></div>';
    // ④ 核实
    var wx = country.sources.filter(function (s) { return s.kind === 'wx'; })[0] || country.sources[0];
    var ap = country.airports.filter(function (x) { return x.city === city.id; })[0] || country.airports[0];
    var maps = 'https://www.google.com/maps/search/?api=1&query=' + resolved.lat.toFixed(5) + ',' + resolved.lon.toFixed(5);
    html += '<div class="result-box verify"><h4>' + esc(t('trip.verifyTitle')) + '</h4><ul>' +
      '<li><a href="' + esc(wx.url) + '" target="_blank" rel="noopener">' + esc(loc(wx.label)) + ' ↗</a></li>' +
      '<li><a href="' + esc(ap.board.url) + '" target="_blank" rel="noopener">' + esc(ap.iata) + ' · ' + esc(t('flight.board')) + ' ↗</a></li>' +
      '<li><a href="' + esc(maps) + '" target="_blank" rel="noopener">' + esc(t('trip.openMaps')) + ' ↗</a></li>' +
      (function () {
        var ctl = country.controls.filter(function (x) { return x.kind === 'road'; })[0] || country.controls[0];
        return ctl ? '<li><a href="' + esc(ctl.url) + '" target="_blank" rel="noopener">' +
          esc(t('trip.ctrlVerify')) + ' ↗</a></li>' : '';
      })() +
      '</ul></div>';
    html += '</div>';
    return html;
  }

  /* =========================================================================
   * 台风 / 洪水 / 封路与官方管制 / 颜色等级定义
   * ======================================================================= */
  var ISO2CID = { VNM: 'vn', THA: 'th', SGP: 'sg', MYS: 'my', IDN: 'id', PHL: 'ph' };
  var CTRL_KEY = {
    road: 'adv.ctrlRoad', aviation: 'adv.ctrlAviation', gov: 'adv.ctrlGov',
    marine: 'adv.ctrlMarine', wx: 'adv.ctrlWx'
  };
  function allEvents() { return (ADV && ADV.events) ? ADV.events : []; }
  function eventsFor(cid) {
    return allEvents().filter(function (e) { return !cid || ISO2CID[e.iso3] === cid; });
  }
  function dayDiff(a, b) {
    var x = Date.parse(a + 'T00:00:00Z'), y = Date.parse(b + 'T00:00:00Z');
    return (isNaN(x) || isNaN(y)) ? 999 : Math.round((y - x) / 86400000);
  }
  // 活跃事件 = 当日落在事件窗口内；recent = 事件在该日之前 7 天内刚结束（半透明角标）
  function marksForDay(day, cid) {
    var hit = { tc: false, fl: false, rtc: false, rfl: false, names: [] };
    allEvents().forEach(function (e) {
      if (cid && ISO2CID[e.iso3] !== cid) return;
      var f = String(e.from || '').slice(0, 10), u = String(e.to || '').slice(0, 10);
      var active = (!f || f <= day) && (!u || u >= day);
      var recent = !active && u && u < day && dayDiff(u, day) <= 7;
      if (!active && !recent) return;
      var isTC = e.type === 'TC';
      if (active) { if (isTC) hit.tc = true; else hit.fl = true; }
      else { if (isTC) hit.rtc = true; else hit.rfl = true; }
      hit.names.push(e.name + (active ? '' : ' (' + t('adv.ended') + ')'));
    });
    return hit;
  }

  // 单格雨量 + 台风/洪水角标（总览表与国家页表共用）
  function rainCellHtml(v, day, cid) {
    var bg = '#f1f5fb', fg = '#475569';
    if (v !== null && !isNaN(v)) {
      if (v >= 50) { bg = '#f6b7ae'; fg = '#7f1d1d'; }
      else if (v >= 25) { bg = '#f9cf9a'; fg = '#8a4b00'; }
      else if (v >= 10) { bg = '#bcd6fb'; fg = '#1c4f9c'; }
      else if (v >= 2) { bg = '#dbeafe'; fg = '#1c4f9c'; }
    }
    var mk = marksForDay(day, cid), marks = '';
    if (mk.tc) marks += '<span class="cell-mark tc">🌀</span>';
    if (mk.fl) marks += '<span class="cell-mark fl">🌊</span>';
    if (mk.rtc) marks += '<span class="cell-mark tc recent">🌀</span>';
    if (mk.rfl) marks += '<span class="cell-mark fl recent">🌊</span>';
    return '<td class="rain-cell" style="text-align:center;background:' + bg + ';color:' + fg +
      ';border-radius:7px;padding:8px 4px;font-weight:700"' +
      (mk.names.length ? ' title="' + esc(mk.names.join(' / ')) + '"' : '') + '>' +
      marks + (v === null || isNaN(v) ? '—' : Number(v).toFixed(1)) + '</td>';
  }

  function rainLegendHtml() {
    return '<div class="chart-legend"><span><i style="background:#f1f5fb"></i>&lt; 2 mm</span>' +
      '<span><i style="background:#dbeafe"></i>2–10 mm</span><span><i style="background:#bcd6fb"></i>10–25 mm</span>' +
      '<span><i style="background:#f9cf9a"></i>25–50 mm</span><span><i style="background:#f6b7ae"></i>≥ 50 mm</span></div>' +
      '<details class="legend-fold"><summary>' + esc(t('home.legend')) + '</summary>' +
      '<div class="legend-extra"><span>' + esc(t('trend.eventLegend')) + '</span></div>' +
      '<div class="legend-extra"><span>' + esc(t('trend.levelLegend')) + '</span></div></details>';
  }

  // 事件横幅：按国家过滤；状态标签按是否存在进行中事件动态给出
  function eventBannerHtml(cid) {
    var evs = eventsFor(cid);
    if (!evs.length) return '';
    var activeN = evs.filter(function (e) { return e.active; }).length;
    return '<div class="notice info" style="margin-bottom:12px"><b>🌀 🌊 ' +
      esc(t('adv.eventTitle')) + ' · ' + esc(activeN ? t('adv.active') + ' ' + activeN : t('adv.ended')) +
      '</b><br>' + evs.slice(0, 5).map(function (e) {
        return (e.type === 'TC' ? '🌀 ' : '🌊 ') + esc(e.name) +
          ' <span class="ev-badge ' + esc(e.level) + '">' + esc(e.level) + '</span> ' +
          esc(String(e.from || '').slice(0, 10)) + ' → ' + esc(String(e.to || '').slice(0, 10)) +
          ' · ' + esc(e.active ? t('adv.active') : t('adv.ended'));
      }).join(' &nbsp;·&nbsp; ') + (evs.length > 5 ? ' …' : '') + '</div>';
  }

  // 国家页：逐城市 7 天雨量表（叠加该国 GDACS 事件角标）
  function countryTrendHtml(c) {
    var first = c.cities[0];
    var ref = first ? weatherCity(c.id, first.id) : null;
    var days = ref && ref.daily ? R.dailyRows(ref.daily) : [];
    var dayLabels = days.slice(0, 7).map(function (d) { return String(d.time).slice(0, 10); });
    if (!dayLabels.length) return '';
    var html = '<div class="section">' + sectionHead('country.trendTitle', 'country.trendHint') +
      '<div class="panel">' +
      '<div class="rain-table-scroll"><table style="width:100%;border-collapse:separate;border-spacing:4px;min-width:620px;font-size:var(--body-size,14px)">' +
      '<thead><tr><th style="text-align:left;min-width:130px">' + esc(t('country.trendCity')) + '</th>';
    days.slice(0, 7).forEach(function (d) {
      html += '<th style="font-weight:700;color:var(--sub);min-width:62px">' + esc(d.time.slice(5)) + '</th>';
    });
    html += '</tr></thead><tbody>';
    c.cities.forEach(function (city) {
      var wc = weatherCity(c.id, city.id);
      var dd = wc && wc.daily ? R.dailyRows(wc.daily) : [];
      html += '<tr><td style="font-weight:700">' + esc(loc(city.name)) + '</td>';
      for (var di = 0; di < 7; di++) {
        var v = (dd[di] && dd[di].precipitation_sum !== null && dd[di].precipitation_sum !== undefined)
          ? Number(dd[di].precipitation_sum) : null;
        html += rainCellHtml(v, dayLabels[di], c.id);
      }
      html += '</tr>';
    });
    html += '</tbody></table></div>' + rainLegendHtml() + '</div></div>';
    return html;
  }

  function eventItemHtml(e) {
    return '<div class="ev-item' + (e.active ? '' : ' ended') + '">' +
      '<div class="ev-icon">' + (e.type === 'TC' ? '🌀' : '🌊') + '</div>' +
      '<div class="ev-body"><div class="ev-title">' +
      '<span class="ev-badge ' + esc(e.level) + '">' + esc(t('gdacs.' + String(e.level).toLowerCase())) + '</span>' + esc(e.name) + '</div>' +
      '<div class="ev-meta">' + esc(e.type === 'TC' ? t('map.eventTC') : t('map.eventFL')) +
      ' · ' + esc(e.country || '—') + ' · ' + esc(String(e.from || '').slice(0, 10)) +
      ' → ' + esc(String(e.to || '').slice(0, 10)) +
      ' · ' + esc(e.active ? t('adv.active') : t('adv.ended')) + '</div>' +
      (e.severity ? '<div class="ev-sub">' + esc(e.severity) + '</div>' : '') +
      (!e.inCoverage ? '<div class="ev-sub">⚠ ' + esc(t('adv.outside')) + '</div>' : '') +
      (e.url ? '<div class="ev-sub"><a href="' + esc(e.url) + '" target="_blank" rel="noopener">' +
        esc(t('adv.report')) + ' ↗</a></div>' : '') +
      '</div></div>';
  }

  function controlsHtml(country) {
    if (country) {
      return country.controls.map(function (x) {
        return '<div class="ctrl-item"><span class="ctrl-kind ' + esc(x.kind) + '">' +
          esc(t(CTRL_KEY[x.kind] || 'adv.ctrlGov')) + '</span>' +
          '<div class="ctrl-body">' + esc(loc(x.label)) + '<br>' +
          '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(t('adv.viewOfficial')) + ' ↗</a>' +
          '</div></div>';
      }).join('');
    }
    return D.countries.map(function (c) {
      return '<div class="ctrl-item"><span class="ctrl-kind">' + c.flag + '</span>' +
        '<div class="ctrl-body">' + esc(loc(c.name)) + ' · ' +
        c.controls.map(function (x) {
          return '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">' +
            esc(t(CTRL_KEY[x.kind] || 'adv.ctrlGov')) + '</a>';
        }).join(' · ') + '</div></div>';
    }).join('');
  }

  function floodHtml(country) {
    var list = ((ADV && ADV.flood) ? ADV.flood : []).filter(function (f) {
      return f.status === 'ok' && (!country || f.country === country.id);
    });
    if (!list.length) return '<div class="ev-empty">' + esc(t('adv.floodHint')) + '</div>';
    return list.map(function (f) {
      var vals = (f.discharge || []).map(function (v) { return Number(v) || 0; });
      var mx = Math.max.apply(null, vals.concat([0.1]));
      var spark = vals.map(function (v) {
        var h = Math.max(2, Math.round(v / mx * 24));
        return '<i class="' + (v >= mx * .8 ? 'hi' : '') + '" style="height:' + h + 'px"></i>';
      }).join('');
      return '<div class="flood-row"><div class="nm">' + esc(t('river.' + f.id)) + '</div>' +
        '<div class="v">' + esc(f.peak) + ' m³/s</div>' +
        '<div class="v ' + (f.changePct > 20 ? 'up' : '') + '">' +
        (f.changePct === null ? '—' : (f.changePct > 0 ? '+' : '') + f.changePct + '%') + '</div>' +
        '<div class="flood-spark">' + spark + '</div></div>';
    }).join('');
  }

  function advSection(country) {
    var cid = country ? country.id : null;
    var evs = eventsFor(cid);
    var active = evs.filter(function (e) { return e.active; });
    var ended = evs.filter(function (e) { return !e.active; });
    var html = '<div class="section">' + sectionHead('map.title', 'map.hint') +
      '<div id="seaMapHost"></div></div>';

    html += '<div class="section">' + sectionHead('adv.title', 'adv.hint') + '<div class="adv-grid">';
    // 事件
    html += '<div class="adv-card"><h3>🌀 ' + esc(t('adv.eventTitle')) + '</h3>' +
      '<div class="sub">' + esc(t('adv.eventHint')) + '</div>';
    if (!evs.length) html += '<div class="ev-empty">' + esc(t('adv.noEvents')) + '</div>';
    else {
      html += '<div class="ev-list">';
      if (active.length) html += '<div class="sub"><b>' + esc(t('adv.active')) + '</b></div>' +
        active.map(eventItemHtml).join('');
      if (ended.length) html += '<div class="sub" style="margin-top:6px"><b>' + esc(t('adv.ended')) +
        '</b></div>' + ended.map(eventItemHtml).join('');
      if (!active.length) html += '<div class="ev-empty">' + esc(t('adv.noActive')) + '</div>';
      html += '</div>';
    }
    html += '</div>';
    // 管制
    html += '<div class="adv-card"><h3>🚧 ' + esc(t('adv.ctrlTitle')) + '</h3>' +
      '<div class="sub">' + esc(t('adv.ctrlHint')) + '</div>' +
      '<div class="ctrl-list">' + controlsHtml(country) + '</div>' +
      '<div class="def-note" style="margin-top:11px">' + esc(t('adv.ctrlNote')) + '</div></div>';
    html += '</div>';

    // 洪水趋势（全宽）
    html += '<div class="adv-card" style="margin-top:14px"><h3>🌊 ' + esc(t('adv.floodTitle')) + '</h3>' +
      '<div class="sub">' + esc(t('adv.floodHint')) + '</div>' + floodHtml(country) +
      '<div class="flood-note">' + esc(t('adv.floodNote')) + '</div></div>';

    if (active.some(function (e) { return e.level === 'Red' || e.level === 'Orange'; })) {
      html += '<div class="notice warn" style="margin-top:14px"><b>' + esc(t('adv.impactTitle')) +
        '</b><p>' + esc(t('adv.impactText')) + '</p></div>';
    }

    // 人工核实条目
    var closures = ((ADV && ADV.confirmedClosures) ? ADV.confirmedClosures : [])
      .filter(function (x) { return !country || x.country === country.id; });
    html += '<div class="adv-card" style="margin-top:14px"><h3>📋 ' + esc(t('adv.closureTitle')) + '</h3>';
    if (!closures.length) html += '<div class="closure-empty">' + esc(t('adv.closureEmpty')) + '</div>';
    else html += '<div class="ev-list">' + closures.map(function (x) {
      return '<div class="ev-item"><div class="ev-icon">⛔</div><div class="ev-body">' +
        '<div class="ev-title">' + esc(x.area || '—') + '</div><div class="ev-meta">' +
        esc(x.type || '') + ' · ' + esc(x.status || '') + ' · ' + esc(x.since || '') + ' → ' + esc(x.until || '') +
        '</div><div class="ev-sub">' + esc(x.sourceName || '') +
        (x.sourceUrl ? ' · <a href="' + esc(x.sourceUrl) + '" target="_blank" rel="noopener">' +
          esc(t('adv.report')) + ' ↗</a>' : '') + '</div></div></div>';
    }).join('') + '</div>';
    html += '</div>';

    if (ADV && ADV.meta) html += '<div class="hint" style="margin-top:10px;font-size:var(--body-size,14px);color:var(--sub)">' +
      esc(t('adv.dataTime')) + ': ' + esc(String(ADV.meta.generatedAt).slice(0, 16).replace('T', ' ')) + '</div>';
    return html + '</div>';
  }

  function defSection(open) {
    var cur = [
      ['red', 'def.cur.redTrigger', 'def.cur.redMeaning'],
      ['orange', 'def.cur.orangeTrigger', 'def.cur.orangeMeaning'],
      ['yellow', 'def.cur.yellowTrigger', 'def.cur.yellowMeaning'],
      ['green', 'def.cur.greenTrigger', 'def.cur.greenMeaning']
    ];
    var curRows = cur.map(function (x) {
      return '<tr><td><span class="def-pill ' + x[0] + '">' + '<span aria-hidden="true">' + ({green:'✓',yellow:'!',orange:'▲',red:'✕'})[x[0]] + '</span> ' + esc(t('level.' + x[0])) + '</span></td>' +
        '<td>' + esc(t(x[1])) + '</td><td>' + esc(t(x[2])) + '</td></tr>';
    }).join('');
    return '<div class="section"><details class="def-details"' + (open ? ' open' : '') + ' id="defs">' +
      '<summary>' + esc(t('def.title')) + ' <span class="hint">' + esc(t('def.hint')) + '</span></summary>' +
      '<div class="panel" style="margin-top:12px"><div class="def-two">' +
      '<div class="def-box"><h4>' + esc(t('def.currentTitle')) + '</h4>' +
      '<div class="desc">' + esc(t('def.currentDesc')) + '</div><div style="overflow-x:auto">' +
      '<table class="def-table"><thead><tr><th>' + esc(t('def.level')) + '</th><th>' +
      esc(t('def.trigger')) + '</th><th>' + esc(t('def.meaning')) + '</th></tr></thead><tbody>' +
      curRows + '</tbody></table></div></div>' +
      '</div></div></details></div>';
  }

  /* =========================================================================
   * 总览页
   * ======================================================================= */
  function renderOverview() {
    var html = '';

    // 六国卡片
    html += '<div class="section">' + sectionHead('home.riskTitle', 'home.riskHint') + '<div class="grid c3">';
    var ranked = D.countries.map(function (c) {
      var risk = R.countryRisk(WEATHER, c.id, hourKey(c.tz));
      var atMax = c.cities.filter(function (city) {
        var cr = R.cityRisk(weatherCity(c.id, city.id), city, hourKey(c.tz));
        return cr.level === risk.level || (risk.level === 2 && risk.softCities >= 2 && cr.softHours > 0);
      }).length;
      return { country: c, risk: risk, atMax: atMax };
    }).sort(function (a, b) {
      return b.risk.level - a.risk.level || b.atMax - a.atMax || b.risk.rainToday - a.risk.rainToday;
    });
    var warnings = ranked.filter(function (e) { return e.risk.level >= 2; });
    var watched = ranked.filter(function (e) { return e.risk.level > 0; });
    var normal = ranked.filter(function (e) { return e.risk.level === 0; }).length;
    var summaryKey = !WEATHER || !WEATHER.countries ? 'home.summaryMissing' : warnings.length ? 'home.summaryWarning' : watched.length ? 'home.summaryWatch' : 'home.summaryNormal';
    if (normal === 0 && (summaryKey === 'home.summaryWarning' || summaryKey === 'home.summaryWatch')) summaryKey += 'NoNormal';
    var values = { n: warnings.length, m: normal, countries: (warnings.length ? warnings : watched).slice(0, 3).map(function (e) { return loc(e.country.name); }).join(LANG === 'zh' ? '、' : ', ') };
    var summary = t(summaryKey).replace(/\{(n|m|countries)\}/g, function (_, key) { return values[key]; });
    html = '<div class="hero"><h1>' + esc(t('home.heroTitle')) + '</h1><p class="overview-summary">' + esc(summary) + '</p><p>' + esc(t('home.heroSub')) + '</p><a class="btn-primary hero-trips" href="trips.html">' + esc(t('home.myTrips')) + '</a></div>' + html;
    ranked.forEach(function (entry) {
      var c = entry.country;
      var cr = R.countryRisk(WEATHER, c.id, hourKey(c.tz));
      var maxTemp = null;
      c.cities.forEach(function (city) {
        var wc = weatherCity(c.id, city.id);
        if (wc && wc.current && wc.current.temperature_2m !== null && wc.current.temperature_2m !== undefined) {
          var v = Number(wc.current.temperature_2m);
          if (maxTemp === null || v > maxTemp) maxTemp = v;
        }
      });
      html += '<a class="country-card risk-' + R.LEVEL_KEYS[cr.level] + '" href="' + c.id + '.html">' +
        '<div class="cc-head"><span class="cc-flag">' + c.flag + '</span><div class="cc-identity">' +
        '<div class="cc-name">' + esc(loc(c.name)) + SEA_OUTFIT.badge(c.cities.map(function(city){ return weatherCity(c.id,city.id); }), hourKey(c.tz).slice(0,10)) + '</div>' +
        '<div class="cc-sub">' + esc(loc(c.capital)) + ' · ' + esc(c.utc) + '</div></div>' +
        '<div class="cc-risk">' + badge(cr.level) + '</div></div>' +
        '<div class="cc-metrics">' +
        '<div class="cc-metric"><div class="v">' + esc(n(cr.rainToday, 1)) + ' <span style="font-size:var(--body-size,14px);font-weight:600">mm</span></div><div class="l">' + esc(t('city.rain')) + '</div></div>' +
        '<div class="cc-metric"><div class="v">' + esc(n(maxTemp, 1)) + ' <span style="font-size:var(--body-size,14px);font-weight:600">°C</span></div><div class="l">' + esc(t('city.temp')) + '</div></div>' +
        '</div>' +
        '<div class="cc-foot"><span>' + c.cities.length + ' ' + esc(t('home.card.cities')) + ' · ' + c.airports.length + ' ' + esc(t('home.card.airports')) + '</span><span>' + esc(t('home.card.cta')) + ' →</span></div>' +
        '</a>';
    });
    html += '</div></div>';

    // 7 天雨量热力表（叠加 GDACS 台风 / 洪水事件角标）
    var ref = weatherCity('vn', 'hcm');
    var days = ref && ref.daily ? R.dailyRows(ref.daily) : [];
    var dayLabels = days.slice(0, 7).map(function (d) { return String(d.time).slice(0, 10); });
    html += '<div class="section">' + sectionHead('home.trendTitle', 'home.trendHint') +
      '<div class="panel">' +
      '<div class="rain-table-scroll"><table style="width:100%;border-collapse:separate;border-spacing:4px;min-width:620px;font-size:var(--body-size,14px)">' +
      '<thead><tr><th style="text-align:left;min-width:130px">' + esc(t('nav.section')) + '</th>';
    days.slice(0, 7).forEach(function (d) {
      html += '<th style="font-weight:700;color:var(--sub);min-width:62px">' + esc(d.time.slice(5)) + '</th>';
    });
    html += '</tr></thead><tbody>';
    D.countries.forEach(function (c) {
      html += '<tr><td style="font-weight:700">' + c.flag + ' ' + esc(loc(c.name)) + '</td>';
      var sums = [];
      for (var di = 0; di < 7; di++) {
        var arr = [];
        c.cities.forEach(function (city) {
          var wc = weatherCity(c.id, city.id);
          if (wc && wc.daily) {
            var dd = R.dailyRows(wc.daily);
            if (dd[di] && dd[di].precipitation_sum !== null) arr.push(Number(dd[di].precipitation_sum));
          }
        });
        sums.push(arr.length ? arr.reduce(function (x, y) { return x + y; }, 0) / arr.length : null);
      }
      sums.forEach(function (v, di) { html += rainCellHtml(v, dayLabels[di], c.id); });
      html += '</tr>';
    });
    html += '</tbody></table></div>' + rainLegendHtml() + '</div></div>';

    // 地图 / 灾害 / 管制 / 等级定义 / 行程查询
    html += advSection(null);
    html += tripFormHtml(null);
    return html;
  }

  /* =========================================================================
   * 国家页
   * ======================================================================= */

  // One shared request, started only by an expanded city.
  var attractionsRequest;
  function sanitiseAuthor(value) {
    return String(value || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
      .replace(/^.*?\.(?:jpg|jpeg|png|svg):\s*/i, '')
      .replace(/^Photographer:\s*/i, '')
      .replace(/\s+at\s+[a-z-]+\.wikipedia$/i, '')
      .replace(/^The original uploader was (.*?) at .*$/i, '$1')
      .replace(/^This Photo was taken by ([^.]+).*$/i, '$1')
      .split(/\s*\(|\s+from\s+|\s+\d{1,2}:\d{2},|[.;]\s*(?:Feel free|Please|Permission|This)/i)[0]
      .replace(/^[ .;,]+|[ .;,]+$/g, '').slice(0,40).trim();
  }
  function attractionToggle(row, city) {
    var old = row.querySelector('.attractions');
    if (!row.open) { if (old) { if (old.attrResizeObserver) old.attrResizeObserver.disconnect(); old.remove(); } return; }
    if (old) return;
    if (!city) return;
    if (!attractionsRequest) attractionsRequest = fetch('data/attractions.json').then(function(r) {
      if (!r.ok) throw new Error('Attractions unavailable'); return r.json();
    }).catch(function() { return {countries:{}}; });
    attractionsRequest.then(function(data) {
      if (!row.open || !row.isConnected || row.querySelector('.attractions')) return;
      var items = ((data.countries[CID] || {})[city.id] || []).slice().sort(function(a,b) { return b.sitelinks-a.sitelinks; }).slice(0,8);
      if (!items.length) return;
      var local = ({vn:'vi',th:'th',id:'id'}[CID] || 'en');
      function label(v) { return v && (v[LANG] || v.en || v[local]) || ''; }
      function pin() { return '<svg aria-hidden="true"><use href="#i-map-pin"></use></svg>'; }
      function placeholder() { return '<div class="attr-placeholder" aria-hidden="true">'+pin()+'</div>'; }
      var section = document.createElement('section'); section.className = 'attractions';
      section.innerHTML = '<div class="attr-heading"><h3>'+esc(t('attr.title'))+'</h3><span>'+items.length+'</span></div><div class="attr-scroll"><ul role="list" tabindex="0" aria-label="'+esc(t('attr.listAria').replace('{city}',loc(city.name)))+'">'+items.map(function(a,i) {
        var name=label(a.name), intro=a.intro && a.intro[LANG] || '', p=a.photo, credit='';
        if (p) {
          var author=sanitiseAuthor(p.author), publicDomain=/CC0|public domain/i.test(p.license);
          var full=publicDomain?t('attr.commons'):t('attr.credit').replace('{author}',author).replace('{license}',p.license);
          credit='<div class="attr-credit" title="'+esc(full)+'">'+(publicDomain?esc(full):'<span class="attr-author">📷 <a target="_blank" rel="noopener" href="'+esc(p.filePage)+'">'+esc(author)+'</a></span><span class="attr-sep" aria-hidden="true"> · </span><a class="attr-license" target="_blank" rel="noopener" href="'+esc(p.licenseUrl)+'">'+esc(p.license)+'</a>')+'</div>';
        }
        return '<li class="attr-card'+(i>=4?' attr-extra':'')+'"><div class="attr-media">'+(p?'<img loading="lazy" decoding="async" width="640" height="400" src="'+esc(p.thumb330)+'" srcset="'+esc(p.thumb330)+' '+p.width330+'w, '+esc(p.thumb500)+' '+p.width500+'w" sizes="(min-width: 640px) 220px, 156px" alt="'+esc(name)+'">':placeholder())+'</div><div class="attr-name">'+esc(name)+'</div>'+(intro?'<div class="attr-intro">'+esc(intro)+'</div>':'')+credit+'<a class="attr-map" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&amp;query='+encodeURIComponent(a.lat+','+a.lng)+'" aria-label="'+esc(t('attr.mapAria').replace('{name}',name))+'">'+pin()+esc(t('attr.map'))+'</a></li>';
      }).join('')+'</ul></div>'+(items.length>4?'<button class="attr-more" type="button" aria-expanded="false">'+esc(t('attr.more').replace('{n}',items.length-4))+'</button>':'');
      row.querySelector('.city-card').appendChild(section);
      section.querySelectorAll('img').forEach(function(img) { img.addEventListener('error',function() {
        var credit=img.closest('.attr-card'); img.parentNode.innerHTML=placeholder();
        if (credit) { var line=credit.querySelector('.attr-credit'); if(line)line.remove(); }
      },{once:true}); });
      var list=section.querySelector('ul'), wrap=section.querySelector('.attr-scroll');
      function fade() { wrap.classList.toggle('at-end',list.scrollLeft+list.clientWidth>=list.scrollWidth-2); }
      list.addEventListener('scroll',fade,{passive:true}); requestAnimationFrame(fade);
      section.attrResizeObserver = new ResizeObserver(fade); section.attrResizeObserver.observe(list);
      list.addEventListener('keydown',function(e) { if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();list.scrollBy({left:e.key==='ArrowRight'?166:-166,behavior:'smooth'});} });
      var more=section.querySelector('.attr-more'); if(more)more.addEventListener('click',function(){section.classList.add('attr-expanded');more.setAttribute('aria-expanded','true');more.hidden=true;});
    });
  }


  var hospitalsRequest, hospitalPosition, hospitalPending = false, hospitalError = "";
  // 医院展开上限：默认 3 家，展开最多 HOSP_EXPANDED_MAX 家（P4 页面超限时先降到 5）。
  var HOSP_EXPANDED_MAX = 6;
  try {
    hospitalPosition = JSON.parse(sessionStorage.getItem("hospitalPosition") || "null");
  } catch (e) {
  }

  /* hospitals-ui:pure:start — 自包含纯函数；tests/hospitals-ui.test.ts 按此注释边界提取后在 vm 中运行 */
  function hospitalDistance(a, b) {
    var rad = Math.PI / 180, x = (b.lat - a.lat) * rad, y = (b.lng - a.lng) * rad;
    return 6371 * 2 * Math.asin(Math.sqrt(Math.sin(x / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(y / 2) ** 2));
  }
  function formatHospitalDistance(km) {
    return km < 1 ? Math.round(km * 1e3) + " m" : km.toFixed(1) + " km";
  }
  function hospitalBadges(h) {
    var out = ["hosp.badge." + h.ownership];
    if (h.intl) out.push("hosp.badge.intl");
    if (h.pti === true) out.push("hosp.badge.pti");
    return out;
  }
  function hospitalVisible(items, more, max) {
    var cap = Math.min(items.length, max || 6);
    return items.slice(0, more ? cap : Math.min(cap, 3));
  }
  function hospitalShowMore(items, more, max) {
    return !more && Math.min(items.length, max || 6) > 3;
  }
  function hospitalMoreDelta(items, max) {
    return hospitalVisible(items, true, max).length - hospitalVisible(items, false, max).length;
  }
  function hospitalEmergency(meta, cid) {
    var e = meta && meta.emergency;
    return (e && e[cid]) || "";
  }
  function hospitalLocalPhone(phone, cid) {
    var cc = cid === "vn" ? "+84" : cid === "th" ? "+66" : null;
    return cc && phone.indexOf(cc) === 0 ? "0" + phone.slice(cc.length) : phone;
  }
  /* hospitals-ui:pure:end */

  function hospitalToggle(row, jump) {
    if (!["vn", "th"].includes(CID)) return;
    var old = row.querySelector(".hospitals");
    if (!row.open) {                 // 收起态：不保留医院列表 DOM
      if (old) old.remove();
      return;
    }
    if (old) {                      // 已渲染：仅按需滚动
      if (jump) old.scrollIntoView({ block: "start" });
      return;
    }
    if (!hospitalsRequest) hospitalsRequest = fetch("data/hospitals.json").then(function (r) {
      if (!r.ok) throw Error();
      return r.json();
    }).catch(function () { return { meta: { updatedAt: "—" }, countries: {} }; });
    hospitalsRequest.then(function (data) {
      if (!row.open || !row.isConnected) return;
      var section = row.querySelector(".hospitals");
      if (!section) {
        section = document.createElement("section");
        section.className = "hospitals";
        var card = row.querySelector(".city-card");
        // 穿搭行下、主要景点上：有景点时插到它前面，否则追加到 city-card 末尾
        card.insertBefore(section, card.querySelector(".attractions") || null);
        section.hospitalData = data;
        section.hospitalCity = row.dataset.city;
        renderHospitals(section);
      }
      if (jump) section.scrollIntoView({ block: "start" });
    });
  }

  function renderHospitals(section) {
    var data = section.hospitalData, city = section.hospitalCity, meta = data.meta || {};
    var items = (((data.countries || {})[CID] || {})[city] || []).slice();
    items.sort(function (a, b2) {
      return hospitalPosition ? hospitalDistance(hospitalPosition, a) - hospitalDistance(hospitalPosition, b2) : a.rank - b2.rank;
    });
    var more = section.dataset.more === "true";
    var num = hospitalEmergency(meta, CID);   // 急救号码按国家从 data/hospitals.json 的 meta 读取
    var supported = window.isSecureContext && navigator.geolocation;
    var far = hospitalPosition && meta.origins && meta.origins[city] &&
      hospitalDistance(hospitalPosition, { lat: meta.origins[city].lat, lng: meta.origins[city].lon }) > 50;
    var heading = '<div class="hosp-heading"><h3>' + esc(t("hosp.title")) + "</h3>" +
      (supported
        ? '<div class="hosp-controls">' +
          '<button class="hosp-locate" type="button" ' + (hospitalPending ? "disabled" : "") +
          ' aria-label="' + esc(t("hosp.locateAria")) + '">' +
          esc(t(hospitalPending ? "hosp.loading" : hospitalPosition ? "hosp.sorted" : "hosp.locate")) + "</button>" +
          (hospitalPosition
            ? '<button class="hosp-relocate" type="button" aria-label="' + esc(t("hosp.relocateAria")) + '">' + esc(t("hosp.relocate")) + "</button>"
            : "") +
          "</div>"
        : "") + "</div>";
    var status = '<div class="hosp-status" aria-live="polite">' +
      esc(hospitalError ? t(hospitalError) : far ? t("hosp.far") : hospitalPosition ? t("hosp.sorted") : "") + "</div>";
    var emergency = num
      ? '<a class="hosp-emergency" href="tel:' + esc(num) + '" aria-label="' +
        esc(t("hosp.emergencyAria").replace("{num}", num)) + '">' +
        esc(t("hosp.emergency")) + " " + esc(num) + "</a>"
      : "";
    var body;
    if (!items.length) {
      // 0 家城市：只显示一行提示，不渲染空列表块
      body = '<p class="hosp-empty">' + esc(t("hosp.empty")) + "</p>";
    } else {
      var visible = hospitalVisible(items, more, HOSP_EXPANDED_MAX);
      var list = '<ul role="list">' + visible.map(function (h) {
        var name = h.name[LANG] || h.name[CID === "vn" ? "vi" : "th"] || h.name.en;
        var d = hospitalPosition ? hospitalDistance(hospitalPosition, h) : null;
        var badges = hospitalBadges(h).map(function (k) {
          var cls = k === "hosp.badge.intl" ? ' class="intl"' : k === "hosp.badge.pti" ? ' class="pti"' : "";
          var tip = k === "hosp.badge.pti" ? ' title="' + esc(t("hosp.ptiTip")) + '"' : "";
          return "<span" + cls + tip + ">" + esc(t(k)) + "</span>";
        }).join("");
        return '<li>' +
          '<div class="hosp-name"><strong>' + esc(name) + "</strong>" +
          '<span class="hosp-badges">' + badges + "</span></div>" +
          '<div class="hosp-address" title="' + esc(h.address) + '">' + esc(h.address) + "</div>" +
          '<div class="hosp-actions">' +
            '<a class="hosp-call" href="tel:' + esc(h.phone) + '" aria-label="' +
              esc(t("hosp.callAria").replace("{name}", name).replace("{phone}", h.phone)) + '">📞 ' + esc(hospitalLocalPhone(h.phone, CID)) + "</a>" +
            '<a class="hosp-map" target="_blank" rel="noopener" aria-label="' +
              esc(t("hosp.mapAria").replace("{name}", name)) + '" href="https://www.google.com/maps/search/?api=1&amp;query=' +
              esc(h.lat) + "," + esc(h.lng) + '">📍 ' + esc(t("hosp.map")) + "</a>" +
            (d !== null ? '<span class="hosp-distance">' + esc(formatHospitalDistance(d)) + "</span>" : "") +
          "</div></li>";
      }).join("") + "</ul>";
      var delta = hospitalMoreDelta(items, HOSP_EXPANDED_MAX);
      var moreBtn = hospitalShowMore(items, more, HOSP_EXPANDED_MAX)
        ? '<button class="hosp-more" type="button" aria-expanded="false" aria-label="' +
          esc(t("hosp.moreAria").replace("{n}", delta)) + '">' +
          esc(t("hosp.more").replace("{n}", delta)) + "</button>"
        : "";
      body = list + moreBtn;
    }
    var note = '<div class="hosp-note">' + esc(t("hosp.note")) +
      ' <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OSM · ODbL</a> · ' +
      esc(meta.updatedAt || "") + "</div>";
    section.innerHTML = heading + status + emergency + body + note;
    var b = section.querySelector(".hosp-more");
    if (b) b.onclick = function () { section.dataset.more = "true"; renderHospitals(section); };
    section.querySelectorAll(".hosp-locate,.hosp-relocate").forEach(function (b2) { b2.onclick = locateHospitals; });
  }

  function locateHospitals() {
    if (hospitalPending) return;
    hospitalPending = true;
    hospitalError = "";
    function refresh() {
      document.querySelectorAll(".hospitals").forEach(renderHospitals);
    }
    refresh();
    navigator.geolocation.getCurrentPosition(function (p) {
      hospitalPending = false;
      hospitalPosition = { lat: p.coords.latitude, lng: p.coords.longitude };
      try {
        sessionStorage.setItem("hospitalPosition", JSON.stringify(hospitalPosition));
      } catch (e) {
      }
      refresh();
    }, function (e) {
      hospitalPending = false;
      hospitalPosition = null;
      try {
        sessionStorage.removeItem("hospitalPosition");
      } catch (ignore) {
      }
      hospitalError = e.code === 1 ? "hosp.denied" : "hosp.failed";
      refresh();
    }, { timeout: 1e4, maximumAge: 6e4 });
  }
  
  function cityCard(c, city) {
    var wc = weatherCity(c.id, city.id);
    var cr = R.cityRisk(wc, city, hourKey(c.tz));
    var cur = wc && wc.current ? wc.current : {};
    var w = wmo(cur.weather_code);
    var rows = cr.rows || [];
    var start = cr.start || 0;
    // 未来 24 小时降水小柱
    var spark = '', maxRain = 0.1;
    for (var i = start; i < Math.min(rows.length, start + 24); i++) maxRain = Math.max(maxRain, Number(rows[i].precipitation) || 0);
    for (var j = start; j < Math.min(rows.length, start + 24); j++) {
      var v = Number(rows[j].precipitation) || 0;
      var h = Math.max(2, Math.round(v / maxRain * 42));
      var cls = v >= 8 ? 'ext' : (v >= 2 ? 'hi' : '');
      spark += '<i class="' + cls + '" style="height:' + h + 'px" title="' + esc(rows[j].time) + ' · ' + v.toFixed(1) + ' mm"></i>';
    }
    // 7 天日雨量
    var daily = wc && wc.daily ? R.dailyRows(wc.daily) : [];
    var spark7 = '', max7 = 0.1;
    daily.slice(0, 7).forEach(function (d) { max7 = Math.max(max7, Number(d.precipitation_sum) || 0); });
    daily.slice(0, 7).forEach(function (d) {
      var v = Number(d.precipitation_sum) || 0;
      var hh = Math.max(2, Math.round(v / max7 * 42));
      var cls = v >= 25 ? 'ext' : (v >= 8 ? 'hi' : '');
      spark7 += '<i class="' + cls + '" style="height:' + hh + 'px" title="' + esc(d.time) + ' · ' + v.toFixed(1) + ' mm"></i>';
    });

    return '<div class="city-card risk-' + R.LEVEL_KEYS[cr.level] + '">' +
      '<div class="city-head"><div class="city-name">' + esc(loc(city.name)) + '</div>' +
      '<div class="cc-risk">' + badge(cr.level) + '</div></div>' +
      '<div class="city-temp">' + esc(n(cur.temperature_2m, 1)) + ' °C</div>' +
      '<div class="city-desc">' + w.icon + ' ' + esc(w.text) + ' · ' + esc(t('city.feels')) + ' ' + esc(n(cur.apparent_temperature, 1)) + ' °C</div>' +
      '<div class="kv">' +
      '<div><span class="k">' + esc(t('city.rain')) + '</span><span class="v">' + esc(n(cur.precipitation, 1)) + ' mm</span></div>' +
      '<div><span class="k">' + esc(t('city.wind')) + '</span><span class="v">' + esc(n(cur.wind_speed_10m, 1)) + ' km/h</span></div>' +
      '<div><span class="k">' + esc(t('city.gust')) + '</span><span class="v">' + esc(n(cur.wind_gusts_10m, 1)) + ' km/h</span></div>' +
      '<div><span class="k">' + esc(t('city.humidity')) + '</span><span class="v">' + esc(n(cur.relative_humidity_2m, 0)) + ' %</span></div>' +
      '</div>' +
      '<div style="font-size:var(--body-size,14px);color:var(--sub);margin-top:12px">' + esc(t('city.hourly')) + ' · mm</div>' +
      '<div class="spark">' + (spark || '<i style="height:2px"></i>') + '</div>' +
      '<div class="spark-labels"><span>' + esc(t('city.current')) + '</span><span>' + esc(t('city.plus24h')) + '</span></div>' +
      '<div style="font-size:var(--body-size,14px);color:var(--sub);margin-top:10px">' + esc(t('city.forecast7')) + ' · ' + esc(t('city.rainUnit')) + '</div>' +
      '<div class="spark">' + (spark7 || '<i style="height:2px"></i>') + '</div>' +
      '<div class="spark-labels"><span>' + (daily[0] ? esc(daily[0].time.slice(5)) : '') + '</span><span>' + (daily[6] ? esc(daily[6].time.slice(5)) : '') + '</span></div>' +
      SEA_OUTFIT.row(R.outfitDay(wc, hourKey(c.tz).slice(0,10))) + '</div>';
  }

  // 配置了 API Key 后，在这里展示第三方返回的航班状态（明确标注需以航司公告为准）
  function flightProviderLine(iata) {
    if (!FLIGHTS || !FLIGHTS.airports || !FLIGHTS.airports[iata]) return '';
    var rec = FLIGHTS.airports[iata];
    if (rec.status === 'error') return '<div class="impact-line">' + esc(t('flight.providerLabel')) + colon() + esc(rec.error || t('common.error')) + '</div>';
    var arr = rec.flights || [];
    if (!arr.length) return '<div class="impact-line">' + esc(t('flight.noFlights')) + '</div>';
    return '<div class="impact-line">' + arr.slice(0, 3).map(function (f) {
      return esc(f.flight || '—') + ' ' + esc(f.dep_iata || '') + ' → ' + esc(iata) + ' · ' + esc(f.status || '—');
    }).join('<br>') + '</div>';
  }

  function cityMetrics(c, city) {
    var wc = weatherCity(c.id, city.id) || {}, daily = wc.daily ? R.dailyRows(wc.daily) : [];
    var today = daily.find(function (d) { return d.time.slice(0, 10) === hourKey(c.tz).slice(0, 10); });
    var rain = today && today.precipitation_sum, temp = wc.current && wc.current.temperature_2m;
    if (temp == null) temp = today && today.temperature_2m_max;
    return t('country.cityMetrics').replace('{rain}', rain == null ? '—' : Number(rain).toFixed(1)).replace('{temp}', temp == null ? '—' : Number(temp).toFixed(1));
  }

  function countryConclusion(c, risk) {
    if (!WEATHER || !WEATHER.countries) return t('home.summaryMissing');
    var cities = c.cities.filter(function (city) {
      var r = R.cityRisk(weatherCity(c.id, city.id), city, hourKey(c.tz));
      return r.level === risk.level || (risk.level === 2 && risk.softCities >= 2 && r.softHours > 0);
    });
    return t(risk.level >= 2 ? 'country.summaryWarning' : risk.level > 0 ? 'country.summaryWatch' : 'country.summaryNormal')
      .replace('{n}', cities.length).replace('{cities}', cities.map(function (city) { return loc(city.name); }).join(LANG === 'zh' ? '、' : ', '));
  }

  function renderCountry() {
    var c = R.countryById(CID);
    if (!c) return '<div class="notice warn">' + esc(t('app.error')) + '</div>';
    var cr = R.countryRisk(WEATHER, c.id, hourKey(c.tz));

    var html = '<div class="hero country-hero"><h1>' + c.flag + ' ' + esc(loc(c.name)) + ' ' + badge(cr.level) + '</h1><p>' + esc(countryConclusion(c, cr)) + '</p><div class="emergency-chips">';
    ['police', 'ambulance', 'fire'].forEach(function (kind) {
      var number = c.emergency[kind];
      html += '<a class="pill" href="tel:' + esc(number) + '">' + esc(t('country.' + kind)) + ' ' + esc(number) + '</a>';
    });
    html += '</div></div><section class="section country-cities">' + sectionHead('country.citiesTitle', 'country.citiesHint').replace('</h2>', '</h2>' + SEA_OUTFIT.switcher());
    c.cities.slice().sort(function (a, b) { return R.cityRisk(weatherCity(c.id, b.id), b, hourKey(c.tz)).level - R.cityRisk(weatherCity(c.id, a.id), a, hourKey(c.tz)).level; }).forEach(function (city, i) {
      var risk = R.cityRisk(weatherCity(c.id, city.id), city, hourKey(c.tz));
      html += '<details data-city="' + esc(city.id) + '" class="city-row' + (i >= 5 ? ' city-extra' : '') + '"><summary>' + '<span class="city-name">' + esc(loc(city.name)) + '</span> ' + badge(risk.level) + (['vn','th'].includes(CID) ? '<button type="button" class="hosp-jump" aria-label="'+esc(t('hosp.jumpAria'))+'">🏥 '+esc(t('hosp.short'))+'</button>' : '') + '<span class="city-metrics">' + esc(cityMetrics(c, city)) + '</span></summary>' + cityCard(c, city) + '</details>';
    });
    html += '<button type="button" class="pill city-more" aria-expanded="false">' + esc(t('country.showAll')) + '</button></section>';

    // 逐城市 7 天雨量 + 台风/洪水角标
    html += countryTrendHtml(c);

    // 机场与航班
    var flightOn = FLIGHTS && FLIGHTS.mode && FLIGHTS.mode !== 'off';
    var flightNotice = flightOn
      ? '<div class="notice info" style="margin-bottom:12px"><b>' + esc(t('flight.providerOnTitle')) + '</b>' +
        '<p>' + esc(t('flight.providerLabel')) + colon() + esc(FLIGHTS.provider || '—') + ' · ' +
        esc(t('flight.dataTime')) + colon() + esc(String(FLIGHTS.generatedAt || '').slice(0, 16).replace('T', ' ')) + '</p>' +
        '<p>' + esc(t('flight.thirdPartyNote')) + '</p></div>'
      : '<div class="notice warn" style="margin-bottom:12px"><b>' + esc(t('flight.providerOffTitle')) + '</b><p>' +
        esc(t('flight.providerOffText')) + '</p><p>' + esc(t('flight.keyHint')) + '</p></div>';
    html += '<div class="section">' + sectionHead('country.airportTitle', 'country.airportHint') +
      flightNotice + '<div class="panel"><div class="list">';
    c.airports.forEach(function (ap) {
      var wc = weatherCity(c.id, ap.city);
      var rows = wc ? R.hourlyRows(wc.hourly) : [];
      var idx = 0;
      for (var i = 0; i < rows.length; i++) if (rows[i].time.slice(0, 13) <= hourKey(c.tz)) idx = i;
      var impact = rows.length ? R.flightImpact(rows[idx], rows, idx) : 'low';
      var cityMeta = R.cityById(c, ap.city);
      html += '<div class="list-item"><span class="iata">' + esc(ap.iata) + '</span><div class="body">' +
        '<div class="t">' + esc(loc(ap.name)) + ' <span class="badge grey">' + esc(ap.board.kind === 'official' ? t('flight.official') : t('flight.public')) + '</span></div>' +
        '<div class="d">' + esc(cityMeta ? loc(cityMeta.name) : '') + ' · ' + esc(ap.lat.toFixed(3)) + ', ' + esc(ap.lon.toFixed(3)) + '</div>' +
        '<div class="links">' +
        '<a class="pill" href="' + esc(ap.board.url) + '" target="_blank" rel="noopener">' + esc(t('flight.board')) + ' ↗</a>' +
        '<a class="pill grey" href="' + esc(ap.live) + '" target="_blank" rel="noopener">' + esc(t('flight.live')) + ' ↗</a>' +
        '</div>' +
        '<div class="impact-line ' + impact + '">' + esc(t('flight.impactTitle')) + ' (' + esc(t('common.infer')) + ')' + colon() +
        esc(t('flight.' + impact)) + '</div>' +
        (flightOn ? flightProviderLine(ap.iata) : '') +
        '</div></div>';
    });
    html += '</div></div></div>';

    // 航司
    html += '<div class="section">' + sectionHead('country.airlineTitle', 'country.airlineHint') + '<div class="panel"><div class="list">';
    c.airlines.forEach(function (al) {
      html += '<div class="list-item"><span class="iata">' + esc(al.code) + '</span><div class="body">' +
        '<div class="t">' + esc(loc(al.name)) + '</div>' +
        '<div class="links"><a class="pill" href="' + esc(al.url) + '" target="_blank" rel="noopener">' + esc(t('common.view')) + ' ↗</a></div>' +
        '</div></div>';
    });
    html += '</div></div></div>';

    // 官方源
    html += '<div class="section">' + sectionHead('country.sourceTitle', 'country.sourceHint') + '<div class="panel"><div class="list">';
    c.sources.forEach(function (s) {
      html += '<div class="list-item"><span class="iata" style="background:var(--panel2);color:var(--sub);border:1px solid var(--line)">' + esc(t('source.' + s.kind)) + '</span>' +
        '<div class="body"><div class="t">' + esc(loc(s.label)) + '</div>' +
        '<div class="links"><a class="pill" href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(t('common.view')) + ' ↗</a></div></div></div>';
    });
    html += '</div></div></div>';

    // 常识提醒
    html += '<div class="section">' + sectionHead('country.tipsTitle', 'country.tipsHint') + '<div class="panel"><p>' + esc(loc(c.intro)) + '</p><ul style="padding-left:18px;font-size:var(--body-size,14px);line-height:1.8">';
    c.tips.forEach(function (tip) { html += '<li>' + esc(loc(tip)) + '</li>'; });
    html += '</ul></div></div>';

    // 地图 / 灾害 / 管制 / 等级定义 / 行程查询
    html += advSection(c);
    html += defSection(false);
    html += tripFormHtml(c);
    return html;
  }

  /* ---------------- 主流程 ---------------- */
  function render() {
    buildNav(); updateStamp();
    if (['trips', 'pricing', 'terms', 'privacy'].includes(PAGE)) { notifyTrips(); return; }
    var main = document.getElementById('main');
    var stale = false;
    if (WEATHER && WEATHER.meta && WEATHER.meta.generatedAt) {
      var age = (Date.now() - new Date(WEATHER.meta.generatedAt).getTime()) / 3600000;
      stale = !isNaN(age) && age > 36;
    }
    var warn = !WEATHER ? '<div class="notice warn" style="margin-bottom:12px">' + esc(t('app.error')) + '</div>' :
      (stale ? '<div class="notice warn" style="margin-bottom:12px">' + esc(t('app.stale')) + '</div>' : '');
    main.innerHTML = warn + (PAGE === 'country' ? renderCountry() : renderOverview());
    if (PAGE === 'overview') initOverviewDetails();
    if (PAGE === 'country') initCountryDetails();
    applyI18nDynamic();
    initTrip(PAGE === 'country' ? R.countryById(CID) : null);
    if (PAGE !== 'country') initMap();
    notifyTrips();
  }

  // Reuse the advisory content so overview and country data stay in sync.
  var detailedMedia = window.matchMedia('(min-width:640px)');
  var detailedCleanup = null;
  function initOverviewDetails() {
    if (detailedCleanup) detailedCleanup();
    var main = document.getElementById('main');
    var advisory = main.querySelector('.adv-grid').parentElement;
    var cards = Array.from(advisory.querySelectorAll('.adv-card'));
    var section = document.createElement('section');
    section.className = 'section home-details';
    section.innerHTML = sectionHead('home.details') + '<div class="detail-tabs" role="tablist" aria-label="' + esc(t('home.details')) + '"></div>';
    advisory.before(section);
    var tabs = section.querySelector('.detail-tabs');
    var panels = [], buttons = [];
    function add(key, nodes, count) {
      var i = panels.length, label = t(key) + (count === undefined ? '' : ' (' + count + ')');
      var button = document.createElement('button');
      button.type = 'button'; button.id = 'detail-tab-' + i;
      button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', 'detail-panel-' + i);
      button.textContent = label; tabs.appendChild(button); buttons.push(button);
      var panel = document.createElement('details'); panel.className = 'detail-panel';
      var summary = document.createElement('summary'); summary.textContent = label; panel.appendChild(summary);
      var content = document.createElement('div'); content.className = 'detail-content'; content.id = 'detail-panel-' + i;
      nodes.forEach(function (node) { content.appendChild(node); });
      panel.appendChild(content); section.appendChild(panel); panels.push(panel);
      button.addEventListener('click', function () { select(i); });
      button.addEventListener('keydown', function (event) {
        var next = event.key === 'ArrowRight' ? (i + 1) % buttons.length : event.key === 'ArrowLeft' ? (i + buttons.length - 1) % buttons.length : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : null;
        if (next !== null) { event.preventDefault(); select(next); buttons[next].focus(); }
      });
    }
    var eventCard = cards[0], controlCards = [cards[1], cards[3]], floodCard = cards[2];
    var controlCount = D.countries.reduce(function (n, c) { return n + c.controls.length; }, 0) + ((ADV && ADV.confirmedClosures) || []).length;
    var floodCount = ((ADV && ADV.flood) || []).filter(function (f) { return f.status === 'ok'; }).length;
    advisory.querySelector('.adv-grid').remove();
    var leftover = Array.from(advisory.children);
    add('adv.eventTitle', [eventCard], eventsFor(null).length);
    add('adv.ctrlTitle', controlCards.concat(leftover), controlCount);
    add('adv.floodTitle', [floodCard], floodCount);
    add('trip.title', [document.getElementById('trip')]);
    advisory.remove();
    var selected = 3;
    function select(i) { selected = i; sync(); }
    function sync() {
      var desktop = detailedMedia.matches;
      tabs.hidden = !desktop;
      panels.forEach(function (panel, i) {
        panel.hidden = desktop && i !== selected;
        panel.open = desktop && i === selected;
        var content = panel.querySelector('.detail-content');
        if (desktop) { content.setAttribute('role', 'tabpanel'); content.setAttribute('aria-labelledby', buttons[i].id); content.tabIndex = 0; }
        else { content.removeAttribute('role'); content.removeAttribute('aria-labelledby'); content.removeAttribute('tabindex'); }
        buttons[i].setAttribute('aria-selected', String(i === selected)); buttons[i].tabIndex = i === selected ? 0 : -1;
      });
    }
    sync(); detailedMedia.addEventListener('change', sync);
    detailedCleanup = function () { detailedMedia.removeEventListener('change', sync); };
    var method = document.querySelector('.footer-method');
    var old = method.querySelector('.section'); if (old) old.remove();
    method.insertAdjacentHTML('beforeend', defSection(true));
  }

  function initCountryDetails() {
    var main = document.getElementById('main');
    var sections = Array.from(main.children).filter(function (node) { return node.classList.contains('section') && !node.classList.contains('country-cities'); });
    // Renderer order: trend, airports, airlines, sources, tips, map, hazards, definitions, trip.
    var group = document.createElement('section'); group.className = 'country-details section';
    var strip = document.createElement('div'); strip.className = 'detail-tabs'; strip.setAttribute('role', 'tablist'); strip.setAttribute('aria-label', t('home.details')); group.appendChild(strip);
    main.appendChild(group);
    var keys = ['trend','airports','map','trip','tips'];
    var labels = ['country.tabTrend','country.tabAirports','country.tabMap','country.tabTrip','country.tabTips'];
    var nodes = [[sections[0]], [sections[1],sections[2]], [sections[5],sections[6]], [sections[8]], [sections[4],sections[3]]];
    sections[5].insertAdjacentHTML('afterbegin', eventBannerHtml(CID));
    nodes.flat().forEach(function (node) { node.querySelectorAll('.section-head').forEach(function (head) { head.remove(); }); });
    sections[0].insertAdjacentHTML('afterbegin', '<p class="hint">' + esc(t('country.trendNote')) + '</p>');
    var buttons = [], panels = [], mapped = false, selected = 'trend';
    try { selected = sessionStorage.getItem('sea-country-tab') || selected; } catch (e) {}
    function hashTab() { return new URLSearchParams(location.hash.slice(1)).get('tab'); }
    selected = hashTab() || (location.hash === '#trip' ? 'trip' : selected);
    if (!keys.includes(selected)) selected = 'trend';
    keys.forEach(function (key, i) {
      var button = document.createElement('button'); button.type = 'button'; button.id = 'country-tab-' + key; button.textContent = t(labels[i]); button.setAttribute('role','tab'); button.setAttribute('aria-controls','country-panel-' + key); strip.appendChild(button); buttons.push(button);
      var panel = document.createElement('div'); panel.id = 'country-panel-' + key; panel.setAttribute('role','tabpanel'); panel.setAttribute('aria-labelledby',button.id); panel.tabIndex = 0; nodes[i].forEach(function (node) { panel.appendChild(node); }); group.appendChild(panel); panels.push(panel);
      button.addEventListener('click',function () { select(key, true); });
      button.addEventListener('keydown',function (event) {
        var next = event.key === 'ArrowRight' ? (i+1)%5 : event.key === 'ArrowLeft' ? (i+4)%5 : event.key === 'Home' ? 0 : event.key === 'End' ? 4 : null;
        if (next !== null) { event.preventDefault(); select(keys[next],true); buttons[next].focus(); }
      });
    });
    function select(key, update) {
      selected = key;
      buttons.forEach(function (button,i) { var active = keys[i] === key; button.setAttribute('aria-selected',String(active)); button.tabIndex = active ? 0 : -1; panels[i].hidden = !active; });
      try { sessionStorage.setItem('sea-country-tab',key); } catch (e) {}
      if (update) history.replaceState(null,'','#tab=' + key);
      if (key === 'map') { if (!mapped) { mapped = true; initMap(); } else if (window.SEA_MAP) window.SEA_MAP.refresh(); }
    }
    window.onhashchange = function () {
      var key = hashTab();
      if (keys.includes(key)) select(key,false);
      else if (location.hash === '#trip') select('trip',false);
      else { var target = document.getElementById(location.hash.slice(1)); if (target) { var parentPanel = target.closest('[role=tabpanel]'); if (parentPanel) select(parentPanel.id.replace('country-panel-',''),false); if (target.tagName === 'DETAILS') target.open = true; target.scrollIntoView(); } }
    };
    // Combine controls and confirmed closures, deduping official source + location.
    var hazard = sections[6], cards = Array.from(hazard.querySelectorAll('.adv-card'));
    var controls = cards[1], closures = cards[3], list = controls.querySelector('.ctrl-list'), seen = new Set();
    Array.from(list.children).concat(Array.from(closures.querySelectorAll('.ev-item'))).forEach(function (item) {
      var link = item.querySelector('a'); var area = item.querySelector('.ev-title, .ctrl-body');
      var identity = (link ? link.href.replace(/\/$/,'') : '') + '|' + (area ? area.firstChild.textContent : item.textContent).trim().toLowerCase();
      if (seen.has(identity)) item.remove(); else { seen.add(identity); list.appendChild(item); }
    });
    if (!closures.querySelector('.ev-item')) { var empty = closures.querySelector('.closure-empty'); if (empty) list.appendChild(empty); }
    controls.querySelector('h3').textContent = t('country.controlsClosures') + ' (' + seen.size + ')'; closures.remove();
    sections[1].querySelectorAll('.list-item').forEach(function (row) {
      var body = row.querySelector('.body'), title = body.querySelector('.t');
      var detail = document.createElement('details'), summary = document.createElement('summary');
      summary.appendChild(title); detail.appendChild(summary);
      Array.from(body.children).forEach(function (child) { detail.appendChild(child); }); body.appendChild(detail);
    });
    sections[4].querySelector('.panel').insertAdjacentHTML('afterbegin', '<p class="hint">' + esc(loc(R.countryById(CID).capital)) + ' · ' + esc(R.countryById(CID).utc) + ' · ' + esc(R.countryById(CID).dial) + '</p>');
    var airlines = sections[2].querySelector('.list'); airlines.className = 'airline-chips';
    Array.from(airlines.children).forEach(function (row) {
      var link = row.querySelector('a'); link.textContent = row.querySelector('.iata').textContent + ' · ' + row.querySelector('.t').textContent + ' ↗'; airlines.appendChild(link); row.remove();
    });
    var footer = document.querySelector('.footer > .panel');
    var old = footer.querySelector('#defs'); if (old) old.closest('.section').remove();
    footer.prepend(sections[7]);
    document.querySelectorAll('.city-row').forEach(function (row) { row.addEventListener('toggle',function () { hospitalToggle(row); attractionToggle(row, R.countryById(CID).cities.find(function(city) { return city.id === row.dataset.city; })); if (row.open) document.querySelectorAll('.city-row').forEach(function (other) { if (other !== row) other.open = false; }); }); });
    main.querySelectorAll('.hosp-jump').forEach(function(b){b.addEventListener('click',function(e){e.preventDefault();var row=b.closest('details');row.open=true;hospitalToggle(row,true);});});
    var more = main.querySelector('.city-more'); more.addEventListener('click',function () { var open = more.getAttribute('aria-expanded') !== 'true'; more.setAttribute('aria-expanded',String(open)); main.querySelector('.country-cities').classList.toggle('show-all',open); more.textContent = t(open ? 'country.showLess' : 'country.showAll'); });
    select(selected,false);
    if (location.hash && !hashTab()) window.onhashchange();
  }

  function initMap() {
    var host = document.getElementById('seaMapHost');
    if (!host || !window.SEA_MAP) return;
    try {
      window.SEA_MAP.init(host, {
        t: t, lang: LANG, data: D, weather: WEATHER || {}, advisories: ADV || {},
        country: PAGE === 'country' ? R.countryById(CID) : null,
        hourKey: hourKey
      });
    } catch (e) {
      host.innerHTML = '<div class="notice warn">' + esc(t('map.cdnFail')) + '</div>';
      console.warn('map init failed', e);
    }
  }

  // render 后主内容里若有 data-i18n 也需要补一次（当前模板均已在 render 时直接 t()）
  function applyI18nDynamic() {
    document.querySelectorAll('#main [data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      if (k) el.textContent = t(k);
    });
  }

  // Six-hour GMT+7 buckets anchored at 02:00 (02/08/14/20): the daily data job
  // runs ~01:00-01:20 GMT+7, so a fresh key starts after it has deployed; manual
  // updates show up within six hours. Avoids re-downloading ~350KB on every visit.
  function dataVersion() {
    var shifted = new Date(Date.now() + 5 * 3600000);
    return shifted.toISOString().slice(0, 10).replace(/-/g, '') +
      '-' + Math.floor(shifted.getUTCHours() / 6);
  }

  async function boot() {
    applyI18n(); buildLangMenu();
    document.getElementById('langBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      var m = document.getElementById('langMenu');
      m.classList.toggle('open');
      this.setAttribute('aria-expanded', m.classList.contains('open') ? 'true' : 'false');
    });
    document.addEventListener('click', function () {
      document.getElementById('langMenu').classList.remove('open');
      document.getElementById('langBtn').setAttribute('aria-expanded', 'false');
    });
    var version = dataVersion();
    try {
      var vr = await fetch('data/version.json', { cache: 'no-store' });
      if (vr.ok) {
        var vd = await vr.json();
        if (vd && typeof vd.generatedAt === 'string' && vd.generatedAt.trim() && !isNaN(Date.parse(vd.generatedAt))) {
          version = encodeURIComponent(vd.generatedAt);
        }
      }
    } catch (e) { /* Keep the six-hour fallback when version metadata is unavailable. */ }
    try {
      var r = await fetch('data/weather.json?v=' + version);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      WEATHER = await r.json();
    } catch (e) {
      WEATHER = null;
      console.warn('weather.json unavailable', e);
    }
    try {
      var f = await fetch('data/flights.json?v=' + version);
      if (f.ok) FLIGHTS = await f.json();
    } catch (e) {
      FLIGHTS = null;   // 缺文件时按「未接入」呈现，不影响天气功能
    }
    try {
      var a = await fetch('data/advisories.json?v=' + version);
      if (a.ok) ADV = await a.json();
    } catch (e) {
      ADV = null;       // 缺文件时管制/灾害板块按「无数据」呈现
    }
    render();
  }

  boot();
})();
