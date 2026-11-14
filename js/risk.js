/* =============================================================================
 * SEA Travel Weather · 风险规则引擎 + 行程查询
 * -----------------------------------------------------------------------------
 * 严谨约定：
 *   - 「事实」= 预报 API 返回的数值，逐条带单位；
 *   - 「推断」= 固定阈值 + 静态城市属性推出的可能性，绝不称为官方预警；
 *   - 相关 ≠ 因果：天气恶劣只是「可能」影响交通，不代表已发生延误/停航。
 * =========================================================================== */
(function (root) {
  'use strict';
  var D = root.SEA_DATA, T = D.thresholds;

  var LEVEL_KEYS = ['green', 'yellow', 'orange', 'red'];
  var LEVEL_CLASS = ['green', 'yellow', 'orange', 'red'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- 基础工具 ---------- */
  function hav(lat1, lon1, lat2, lon2) {
    var R = 6371, r = Math.PI / 180;
    var dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function countryById(id) {
    for (var i = 0; i < D.countries.length; i++) if (D.countries[i].id === id) return D.countries[i];
    return null;
  }
  function cityById(country, id) {
    for (var i = 0; i < country.cities.length; i++) if (country.cities[i].id === id) return country.cities[i];
    return null;
  }

  // 把 Open-Meteo 的「按变量分列」结构转成「按小时分行」
  function hourlyRows(h) {
    if (!h || !h.time) return [];
    var keys = Object.keys(h).filter(function (k) { return k !== 'time'; });
    return h.time.map(function (t, i) {
      var row = { time: t };
      keys.forEach(function (k) { row[k] = h[k] ? h[k][i] : null; });
      return row;
    });
  }
  function dailyRows(d) {
    if (!d || !d.time) return [];
    var keys = Object.keys(d).filter(function (k) { return k !== 'time'; });
    return d.time.map(function (t, i) {
      var row = { time: t };
      keys.forEach(function (k) { row[k] = d[k] ? d[k][i] : null; });
      return row;
    });
  }
  function num(v) { return (v === null || v === undefined || isNaN(v)) ? null : Number(v); }

  function inRanges(hour, ranges) {
    for (var i = 0; i < ranges.length; i++) {
      if (hour >= ranges[i][0] && hour < ranges[i][1]) return true;
    }
    return false;
  }
  function hourOf(iso) {
    var m = /T(\d{2}):/.exec(iso || '');
    return m ? parseInt(m[1], 10) : 12;
  }

  /* ---------- 单小时风险分级 ---------- */
  // soft marks orange caused only by thunder/visibility; hourly level stays unchanged.
  // 返回 { level:0..3, hits:{rain,gust,thunder,vis,heat,rain24}, soft:boolean }
  function hourRisk(row, rows, idx, city) {
    var rain = num(row.precipitation) || 0;
    var gust = num(row.wind_gusts_10m) || num(row.wind_speed_10m) || 0;
    var vis = num(row.visibility);
    var temp = num(row.temperature_2m);
    var code = num(row.weather_code);
    var thunder = T.thunderCodes.indexOf(code) >= 0;
    var rain24 = 0;
    if (rows) {
      var from = Math.max(0, idx - 23);
      for (var i = from; i <= idx; i++) rain24 += num(rows[i].precipitation) || 0;
    }
    var hits = {
      rain: rain, gust: gust, vis: vis, temp: temp, code: code,
      thunder: thunder, rain24: rain24
    };
    var level = 0;
    // 红色：短时特大降水 / 强阵风 / 雷暴叠加大雨 / 24h 特大累计
    if (rain >= T.rain.critical || gust >= T.gust.critical ||
        (thunder && rain >= T.rain.alert) || rain24 >= T.rain24.critical || code === 99) level = 3;
    // 橙色：大雨 / 大风 / 雷暴 / 低能见度 / 24h 高累计
    else if (rain >= T.rain.alert || gust >= T.gust.alert || thunder ||
             (vis !== null && vis <= T.visibility.alert) || rain24 >= T.rain24.alert) level = 2;
    // 黄色：中等降水 / 阵风偏大 / 能见度下降 / 高温 / 24h 中等累计
    else if (rain >= T.rain.watch || gust >= T.gust.watch ||
             (vis !== null && vis <= T.visibility.watch) ||
             (temp !== null && temp >= T.heat) || rain24 >= T.rain24.watch) level = 1;
    // 夜间到达与高峰不升级「天气等级」，只在行程推断里单独提示
    return { level: level, hits: hits, soft: level === 2 && rain < T.rain.alert &&
      gust < T.gust.alert && rain24 < T.rain24.alert };
  }

  /* ---------- 城市 / 国家级别（未来 24 小时最高） ---------- */
  function uptimeIndex(rows, nowLocalIso) {
    if (!rows || !rows.length) return 0;
    var stamp = (nowLocalIso || '').slice(0, 13); // YYYY-MM-DDTHH
    for (var i = 0; i < rows.length; i++) if (rows[i].time.slice(0, 13) >= stamp) return i;
    return 0;
  }

  function cityRisk(wCity, cityMeta, nowLocalIso) {
    if (!wCity || !wCity.hourly) return { level: 0, current: null, peakRain: 0, softHours: 0, rows: [] };
    var rows = hourlyRows(wCity.hourly);
    var start = uptimeIndex(rows, nowLocalIso);
    var level = 0, peak = 0, peakRain = 0, softHours = 0;
    for (var i = start; i < Math.min(rows.length, start + 24); i++) {
      var r = hourRisk(rows[i], rows, i, cityMeta);
      if (r.soft) softHours++;
      level = Math.max(level, r.soft ? 1 : r.level);
      peakRain = Math.max(peakRain, num(rows[i].precipitation) || 0);
      peak = i;
    }
    if (softHours >= 2) level = Math.max(level, 2);
    return { level: level, softHours: softHours, current: wCity.current, rows: rows, start: start, peakIndex: peak, peakRain: peakRain };
  }

  function countryRisk(weather, countryId, nowLocalIso) {
    var c = countryById(countryId);
    var wc = weather && weather.countries && weather.countries[countryId];
    var max = 0, rainToday = 0, count = 0, softCities = 0;
    if (c && wc) {
      c.cities.forEach(function (city) {
        var cr = cityRisk(wc.cities[city.id], city, nowLocalIso);
        if (cr.softHours) softCities++;
        if (cr.level > max) max = cr.level;
        var d = dailyRows(wc.cities[city.id] && wc.cities[city.id].daily);
        if (d.length) rainToday += num(d[0].precipitation_sum) || 0;
        count++;
      });
      if (count) rainToday = rainToday / count;
    }
    if (softCities >= 2) max = Math.max(max, 2);
    return { level: max, rainToday: rainToday, softCities: softCities };
  }

  /* ---------- 航班影响推断（明确标注推断） ---------- */
  function flightImpact(row, rows, idx) {
    var r = hourRisk(row, rows, idx, null);
    var h = r.hits;
    if (r.level >= 3 || h.gust >= T.gust.alert && h.thunder) return 'high';
    if (r.level >= 2 || h.gust >= T.gust.watch || h.rain >= T.rain.watch ||
        (h.vis !== null && h.vis <= T.visibility.watch)) return 'medium';
    return 'low';
  }

  /* ---------- 行程综合评估 ---------- */
  function assess(row, rows, idx, city, arrivalIso, tzLabel) {
    var r = hourRisk(row, rows, idx, city);
    var h = r.hits, level = r.level;
    var hour = hourOf(row.time);
    var isNight = inRanges(hour, T.nightHours);
    var isPeak = inRanges(hour, T.peakHours);

    var facts = [
      { k: 'fact.rain', v: h.rain.toFixed(1), u: 'common.unitMm', hi: h.rain >= T.rain.watch },
      { k: 'fact.rain24', v: h.rain24.toFixed(1), u: 'common.unitMm', hi: h.rain24 >= T.rain24.watch },
      { k: 'fact.gust', v: h.gust.toFixed(1), u: 'common.unitKmh', hi: h.gust >= T.gust.watch },
      { k: 'fact.visibility', v: h.vis === null ? '—' : Math.round(h.vis).toLocaleString(), u: 'common.unitM', hi: h.vis !== null && h.vis <= T.visibility.watch },
      { k: 'fact.temp', v: h.temp === null ? '—' : h.temp.toFixed(1), u: 'common.unitC', hi: h.temp !== null && h.temp >= T.heat },
      { k: 'fact.wind', v: (num(row.wind_speed_10m) || 0).toFixed(1), u: 'common.unitKmh', hi: false }
    ];

    var infers = [], actions = [];
    if (h.rain >= T.rain.watch) {
      infers.push('infer.rainHeavy');
      actions.push('action.buffer', 'action.indoor');
    }
    if (h.gust >= T.gust.watch) {
      infers.push('infer.gust');
      actions.push('action.flight');
    }
    if (h.thunder) {
      infers.push('infer.thunder');
      actions.push('action.flight');
    }
    if (h.vis !== null && h.vis <= T.visibility.watch) {
      infers.push('infer.visibility');
      actions.push('action.flight');
    }
    if (h.rain24 >= T.rain24.watch) infers.push('infer.rain24');
    if (city && city.island && (h.gust >= T.gust.watch || h.rain >= T.rain.alert)) {
      infers.push('infer.ferry');
      actions.push('action.ferry');
    }
    if (city && city.mountain && h.rain24 >= T.rain24.watch) infers.push('infer.mountain');
    if (isNight) {
      infers.push('infer.night');
      actions.push('action.night');
      level = Math.max(level, 1);
    }
    if (isPeak) infers.push('infer.peak');
    if (h.temp !== null && h.temp >= T.heat) {
      infers.push('infer.heat');
      actions.push('action.hydrate');
    }
    if (!infers.length) level = 0;

    // 去重
    infers = infers.filter(function (v, i, a) { return a.indexOf(v) === i; });
    actions = actions.filter(function (v, i, a) { return a.indexOf(v) === i; });

    return {
      level: level,
      levelKey: LEVEL_KEYS[level],
      facts: facts,
      infers: infers,
      actions: actions,
      isNight: isNight,
      isPeak: isPeak,
      flight: flightImpact(row, rows, idx),
      time: row.time,
      tzLabel: tzLabel
    };
  }

  /* ---------- 地址 / Google Maps 链接解析 ---------- */
  function decodeText(text) {
    var s = String(text || '').replace(/\+/g, ' ');
    try { return decodeURIComponent(s); } catch (e) { return s; }
  }

  function parseCoords(text) {
    var s = decodeText(text).trim(), n = '([+-]?\\d+(?:\\.\\d+)?)';
    var patterns = [
      ['^' + n + '\\s*,\\s*' + n + '$', 'coords'],
      ['@' + n + '\\s*,\\s*' + n, 'maps-at'],
      ['!3d' + n + '!4d' + n, 'maps-3d4d'],
      ['[?&](?:q|center|ll|destination|query)=' + n + '[,\\s]+' + n + '(?=$|[&#\\s])', 'maps-query'],
      ['!2d' + n + '!3d' + n, 'maps-2d3d', true],
      ['(?:^|\\s)' + n + '\\s*,\\s*' + n + '(?=$|\\s)', 'coords']
    ];
    for (var i = 0; i < patterns.length; i++) {
      var p = patterns[i], m = new RegExp(p[0], 'i').exec(s);
      if (!m) continue;
      var lat = Number(m[p[2] ? 2 : 1]), lon = Number(m[p[2] ? 1 : 2]);
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat: lat, lon: lon, method: p[1] };
    }
    return null;
  }

  function mapsPlace(text) {
    // Split before decoding so encoded spaces remain part of a URL's place name.
    var urls = String(text || '').match(/(?:https?:\/\/)?(?:www\.)?(?:google\.com\/maps|maps\.google\.com)[^\s<>"']*/gi) || [];
    for (var i = 0; i < urls.length; i++) {
      var url = decodeText(urls[i]);
      var m = /\/(?:place|search)\/([^?#]+)/i.exec(url);
      var q = /[?&](?:q|query|destination)=([^&#]*)/i.exec(url);
      var candidates = [q ? q[1] : '', m ? m[1] : ''];
      for (var j = 0; j < candidates.length; j++) {
        var name = candidates[j].replace(/\/@.*$/, '').replace(/\/+$/, '').trim();
        if (name && !parseCoords(name) && !/^[+-]?[\d.]+[,\s]+[+-]?[\d.]+$/.test(name)) return name;
      }
    }
    return null;
  }

  function isShortLink(text) {
    return /(?:^|[^\w.-])(?:https?:\/\/)?(?:maps\.app\.goo\.gl|goo\.gl)(?:\/|(?=$|\s))/i.test(decodeText(text));
  }

  // Timeout covers both response headers and JSON body consumption.
  async function fetchJSON(url, options) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 8000);
    try {
      var response = await fetch(url, Object.assign({}, options, { signal: controller.signal }));
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    } finally { clearTimeout(timer); }
  }

  async function geocodeText(text, lang) {
    var q = decodeText(text).trim(), lg = lang || 'en', sawEmpty = false, sawError = false;
    if (!q) return { error: 'notfound' };
    var queries = [q], cleaned = q.split(',')[0].trim();
    if (cleaned && cleaned !== q) queries.push(cleaned);
    var langs = lg === 'en' ? ['en'] : [lg, 'en'];
    for (var i = 0; i < queries.length; i++) {
      for (var j = 0; j < langs.length; j++) {
        try {
          var data = await fetchJSON('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(queries[i]) + '&count=5&language=' + encodeURIComponent(langs[j]) + '&format=json', { cache: 'no-store' });
          if (data && data.results && data.results.length) {
            var best = data.results[0];
            return { lat: best.latitude, lon: best.longitude, label: [best.name, best.admin1, best.country].filter(Boolean).join(', '), method: 'geocoder', countryCode: best.country_code ? String(best.country_code).toUpperCase() : null };
          }
        } catch (e) { sawError = true; i = queries.length; break; /* Skip remaining Open-Meteo retries on service failure. */ }
      }
    }
    for (var p = 0; p < queries.length; p++) {
      try {
        var photon = await fetchJSON('https://photon.komoot.io/api/?q=' + encodeURIComponent(queries[p]) + '&limit=5', { cache: 'no-store' });
        if (photon && photon.features && photon.features.length) {
          var feature = photon.features[0], props = feature.properties || {}, coords = feature.geometry.coordinates;
          return { lat: coords[1], lon: coords[0], label: [props.name, props.street, props.city, props.country].filter(Boolean).join(', '), method: 'photon', countryCode: props.countrycode ? props.countrycode.toUpperCase() : null };
        }
        sawEmpty = true;
      } catch (e) { sawError = true; break; }
    }
    try {
      var osm = await fetchJSON('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(q) + '&format=jsonv2&limit=1&addressdetails=1&accept-language=' + encodeURIComponent(lg), { cache: 'no-store', headers: { 'Accept': 'application/json' } });
      if (osm && osm.length) {
        var place = osm[0];
        return { lat: parseFloat(place.lat), lon: parseFloat(place.lon), label: place.display_name, method: 'nominatim', countryCode: place.address && place.address.country_code ? place.address.country_code.toUpperCase() : null };
      }
      sawEmpty = true;
    } catch (e) { sawError = true; }
    return { error: sawEmpty ? 'notfound' : 'network' };
  }

  // 由坐标找最近的监测城市（同时确定国家与静态属性）
  function nearestCity(lat, lon, countryCode) {
    var best = null;
    if (countryCode) countryCode = String(countryCode).toUpperCase();
    D.countries.forEach(function (c) {
      if (countryCode && c.iso !== countryCode) return;
      c.cities.forEach(function (city) {
        var d = hav(lat, lon, city.lat, city.lon);
        if (!best || d < best.distance) best = { country: c, city: city, distance: d };
      });
    });
    if (!best && countryCode) {
      // 解析到的国家不在本站覆盖范围：仍取全域最近城市，但调用方会提示
      D.countries.forEach(function (c) {
        c.cities.forEach(function (city) {
          var d = hav(lat, lon, city.lat, city.lon);
          if (!best || d < best.distance) best = { country: c, city: city, distance: d, outOfScope: true };
        });
      });
    }
    return best;
  }

  function leftoverText(text) {
    var s = decodeText(text)
      .replace(/(?:https?:\/\/)?(?:maps\.app\.goo\.gl|goo\.gl)\/[^\s<>"']*/gi, ' ')
      .replace(/(?:https?:\/\/)?(?:www\.)?(?:google\.com\/maps|maps\.google\.com)[^\s<>"']*/gi, ' ');
    return s.replace(/[\s,;|/]+/g, ' ').trim();
  }

  async function resolveLocation(text, lang) {
    var coord = parseCoords(text);
    if (coord) return coord;
    var place = mapsPlace(text);
    var leftover = leftoverText(text);
    var raw = decodeText(text).trim();
    if (!place && leftover && leftover !== raw) place = leftover;
    if (place) return geocodeText(place, lang);
    if (isShortLink(text)) return { error: 'shortlink' };
    return geocodeText(text, lang);
  }

  /* ---------- 坐标级实时预报（浏览器直连 Open-Meteo，免 Key / CORS） ---------- */
  var HOURLY_VARS = 'temperature_2m,relative_humidity_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m,visibility';
  async function fetchPointWeather(lat, lon, tz) {
    var u = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat.toFixed(4) +
      '&longitude=' + lon.toFixed(4) +
      '&hourly=' + HOURLY_VARS +
      '&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,weather_code' +
      '&timezone=' + encodeURIComponent(tz) + '&forecast_days=7';
    var j = await fetchJSON(u, { cache: 'no-store' });
    if (!j || !j.hourly) throw new Error('bad payload');
    return { hourly: j.hourly, daily: j.daily, timezone: j.timezone, source: 'live' };
  }

  function findHour(rows, isoLocal) {
    // datetime-local: YYYY-MM-DDTHH:mm → 匹配该小时
    var key = isoLocal.slice(0, 13); // YYYY-MM-DDTHH
    for (var i = 0; i < rows.length; i++) if (rows[i].time.slice(0, 13) === key) return i;
    return -1;
  }

  root.SEA_RISK = {
    esc: esc, hav: hav, hourlyRows: hourlyRows, dailyRows: dailyRows,
    countryById: countryById, cityById: cityById,
    hourRisk: hourRisk, cityRisk: cityRisk, countryRisk: countryRisk,
    flightImpact: flightImpact, assess: assess,
    parseCoords: parseCoords, resolveLocation: resolveLocation, nearestCity: nearestCity,
    fetchPointWeather: fetchPointWeather, findHour: findHour,
    LEVEL_KEYS: LEVEL_KEYS, LEVEL_CLASS: LEVEL_CLASS
  };
})(window);
