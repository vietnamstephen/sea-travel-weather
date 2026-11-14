/* SEA Travel Weather · Free CARTO/OSM basemap with weather overlays.
 * Live traffic opens Google Maps in a new tab; the embedded map needs no key.
 * An optional site-owned Google Maps JS key is read only from SEA_CONFIG.
 * RainViewer radar, GDACS events, GloFAS rivers and city risk overlays remain
 * available on the free basemap, with a static SVG fallback if Leaflet is down.
 */
(function (root) {
  'use strict';

  var LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  var LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  var RAIN_MANIFEST = 'https://api.rainviewer.com/public/weather-maps.json';
  var ACTIVE_TIMER = null;   // 语言切换 / 重建时清掉上一张地图的播放定时器
  var RISK_COLORS = ['#16a34a', '#ca8a04', '#ea580c', '#dc2626'];
  var EVENT_COLORS = { Red: '#dc2626', Orange: '#ea580c', Green: '#2563eb' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function loadScript(src, onload, onerror) {
    var s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = onload; s.onerror = onerror;
    document.head.appendChild(s);
  }

  /* ---------------------------------------------------------------------------
   * 主控制器
   * ------------------------------------------------------------------------ */
  function init(host, opts) {
    if (!host) return;
    if (ACTIVE_TIMER) { clearInterval(ACTIVE_TIMER); ACTIVE_TIMER = null; }
    var t = opts.t, lang = opts.lang || 'zh';
    var D = opts.data, W = opts.weather || {}, A = opts.advisories || {};
    var country = opts.country || null;
    var googleKey = String((root.SEA_CONFIG || {}).GOOGLE_MAPS_KEY || '').trim();
    var events = (A.events || []).slice();
    var rivers = (A.flood || []).filter(function (f) { return f.status === 'ok'; });
    var cities = [];
    D.countries.forEach(function (c) {
      if (country && c.id !== country.id) return;
      c.cities.forEach(function (ct) { cities.push({ c: c, ct: ct }); });
    });

    // 视图中心
    var center = { lat: 8, lon: 112, zoom: 4 };
    if (country) {
      var la = 0, lo = 0, n = 0;
      country.cities.forEach(function (ct) { la += ct.lat; lo += ct.lon; n++; });
      center = {
        lat: n ? la / n : 8, lon: n ? lo / n : 112,
        zoom: country.id === 'sg' ? 10 : (country.id === 'vn' || country.id === 'ph' ? 6 : 6)
      };
    }

    var state = {
      view: 'layers',              // 'google' | 'layers'
      radar: true, showEvents: true, showCities: true, showRiver: true,
      frames: [], frameIdx: 0, host: '', timer: null, radarLoaded: false,
      adapter: null, ready: false, degraded: false
    };

    /* ---------------- HTML 骨架 ---------------- */
    host.innerHTML =
      '<div class="map-wrap">' +
      '<div class="map-bar">' +
        '<div class="map-tabs">' +
          '<button type="button" class="map-tab on" data-view="layers">🛰 <span>' + esc(t('map.viewLayers')) + '</span></button>' +
          '<button type="button" class="map-tab" data-view="google">🗺 <span>' + esc(t('map.viewGoogle')) + '</span></button>' +
        '</div>' +
        '<div class="map-toggles">' +
          '<label class="map-tg"><input type="checkbox" id="mapRadar" checked> <span>' + esc(t('map.layerRadar')) + '</span></label>' +
          '<label class="map-tg"><input type="checkbox" id="mapEvents" checked> <span>' + esc(t('map.layerEvents')) + '</span></label>' +
          '<label class="map-tg"><input type="checkbox" id="mapCities" checked> <span>' + esc(t('map.layerCities')) + '</span></label>' +
          '<label class="map-tg"><input type="checkbox" id="mapRiver" checked> <span>' + esc(t('map.layerRiver')) + '</span></label>' +
        '</div>' +
      '</div>' +
      '<div class="map-subbar">' +
        '<span class="map-time-label">' + esc(t('map.radarTime')) + '</span>' +
        '<input type="range" id="mapTime" min="0" max="0" value="0" disabled>' +
        '<button type="button" class="map-mini" id="mapPlay">▶ ' + esc(t('map.play')) + '</button>' +
        '<a class="map-mini" id="mapTraffic" target="_blank" rel="noopener">🚗 ' + esc(t('map.traffic')) + '</a>' +
        '<a class="map-mini" id="mapStorms" href="https://zoom.earth/storms/" target="_blank" rel="noopener">🌀 ' + esc(t('map.storms')) + '</a>' +
      '</div>' +
      '<div class="map-stage">' +
        '<div class="map-canvas" id="mapCanvas"></div>' +
        '<iframe class="map-iframe" id="mapFrame" title="Google Maps" loading="lazy" referrerpolicy="no-referrer-when-downgrade" hidden></iframe>' +
        '<div class="map-fallback" id="mapFallback" hidden></div>' +
      '</div>' +
      '<div class="map-legend">' +
        '<div class="map-legend-col"><b>' + esc(t('map.legendRadar')) + '</b>' +
          '<div class="map-ramp"><i style="background:#9ad6f5"></i><i style="background:#4a90d9"></i><i style="background:#3fbf5f"></i><i style="background:#f2d24b"></i><i style="background:#ef8a3c"></i><i style="background:#d63b3b"></i><i style="background:#a02c8f"></i></div>' +
          '<span>' + esc(t('map.legendRadarHint')) + '</span></div>' +
        '<div class="map-legend-col"><b>' + esc(t('map.legendRisk')) + '</b><div class="map-legend-dots">' +
          ['green', 'yellow', 'orange', 'red'].map(function (k, i) {
            return '<span><span aria-hidden="true" style="color:' + RISK_COLORS[i] + '">' + ['✓', '!', '▲', '✕'][i] + '</span>' + esc(t('level.short.' + k)) + '</span>';
          }).join('') + '</div><span>' + esc(t('map.legendRiskHint')) + '</span></div>' +
        '<div class="map-legend-col"><b>' + esc(t('map.legendEvent')) + '</b><div class="map-legend-dots">' +
          '<span><i style="background:#dc2626">●</i>GDACS Red</span><span><i style="background:#ea580c">●</i>GDACS Orange</span>' +
          '<span><i style="background:#2563eb">●</i>GDACS Green</span></div>' +
          '<span>🌀 ' + esc(t('map.eventTC')) + ' · 🌊 ' + esc(t('map.eventFL')) + '</span></div>' +
      '</div>' +
      '<div class="map-status" id="mapStatus"></div>' +
      '<div class="map-credit">' + esc(t('map.credit')) +
        ' · <a href="https://www.rainviewer.com/api.html" target="_blank" rel="noopener">RainViewer</a>' +
        ' · <a href="https://www.gdacs.org/" target="_blank" rel="noopener">GDACS</a>' +
        ' · <a href="https://open-meteo.com/en/docs/flood-api" target="_blank" rel="noopener">GloFAS</a></div>' +
      '</div>';

    var $ = function (id) { return host.querySelector('#' + id); };
    var status = function (msg, kind) {
      var el = $('mapStatus');
      if (!el) return;
      el.textContent = msg || '';
      el.className = 'map-status' + (kind ? ' ' + kind : '');
      el.hidden = !msg;
    };

    /* ---------------- 雷达帧 ---------------- */
    function tileUrl(frame) {
      if (!frame) return '';
      return state.host + frame.path + '/256/{z}/{x}/{y}/2/1_1.png';
    }
    function loadRadar() {
      return fetch(RAIN_MANIFEST, { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (j) {
          state.radarLoaded = true;
          state.host = j.host || 'https://tilecache.rainviewer.com';
          var past = (j.radar && j.radar.past) || [];
          var now = (j.radar && j.radar.nowcast) || [];
          state.frames = past.concat(now);
          var sl = $('mapTime');
          if (sl) {
            sl.max = Math.max(0, state.frames.length - 1);
            sl.value = Math.max(0, state.frames.length - 1);
            sl.disabled = !state.frames.length;
          }
          state.frameIdx = state.frames.length - 1;
          updateTimeLabel();
          return state.frames.length > 0;
        })
        .catch(function () {
          state.radarLoaded = true;
          state.frames = [];
          status(t('map.radarFail'), 'warn');
          return false;
        });
    }
    function updateTimeLabel() {
      var f = state.frames[state.frameIdx];
      var label = host.querySelector('.map-time-label');
      if (!label) return;
      if (!f) { label.textContent = t('map.radarTime'); return; }
      var d = new Date(f.time * 1000);
      var hh = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
      label.textContent = t('map.radarTime') + ' · ' + hh;
    }

    /* ---------------- 叠加层数据（与底图库无关） ---------------- */
    function eventPoints() {
      return events.filter(function (e) {
        if (country) {
          var cc = { VNM: 'vn', THA: 'th', SGP: 'sg', MYS: 'my', IDN: 'id', PHL: 'ph' }[e.iso3];
          if (cc && cc !== country.id) return false;
          if (!cc && !e.inCoverage) return false;
        }
        return true;
      });
    }
    function cityPoints() {
      var R = root.SEA_RISK, out = [];
      cities.forEach(function (x) {
        var wc = W.countries && W.countries[x.c.id] && W.countries[x.c.id].cities[x.ct.id];
        var lv = 0;
        try {
          var stamp = opts.hourKey(x.c.tz);
          lv = R.cityRisk(wc, x.ct, stamp).level;
        } catch (e) { /* 数据缺失按绿色 */ }
        out.push({
          lat: x.ct.lat, lon: x.ct.lon, level: lv,
          name: (x.ct.name && (x.ct.name[lang] || x.ct.name.en)) || x.ct.id,
          country: (x.c.name && (x.c.name[lang] || x.c.name.en)) || x.c.id
        });
      });
      return out;
    }

    /* ---------------- 底图适配器：Leaflet ---------------- */
    function makeLeaflet(canvas, onReady) {
      var L = root.L;
      var map = L.map(canvas, { zoomControl: true, attributionControl: true, worldCopyJump: true })
        .setView([center.lat, center.lon], center.zoom);
      var osmAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
      var carto = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd', maxZoom: 20,
        attribution: osmAttribution + ' &copy; <a href="https://carto.com/attributions">CARTO</a>'
      });
      var basemapFallback = false;
      function fallbackBasemap() {
        if (basemapFallback) return;
        basemapFallback = true;
        map.removeLayer(carto);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19, attribution: osmAttribution
        }).addTo(map);
      }
      carto.on('tileerror', fallbackBasemap);
      // CARTO can return an HTTP-200 "API KEY REQUIRED" PNG. Recognize the
      // known denial image as well as its watermark ETag (when CORS exposes it).
      carto.once('tileload', function (e) {
        fetch(e.tile.src).then(function (response) {
          if (/^"?wm-/.test(response.headers.get('etag') || '')) {
            fallbackBasemap(); return;
          }
          return response.arrayBuffer().then(function (bytes) {
            if (bytes.byteLength !== 2049 || !root.crypto || !root.crypto.subtle) return;
            return root.crypto.subtle.digest('SHA-256', bytes).then(function (digest) {
              var hash = Array.from(new Uint8Array(digest)).map(function (b) {
                return ('0' + b.toString(16)).slice(-2);
              }).join('');
              if (hash === '69be4aecf9f814ba45d585801a5aa41e79b16fc88eafec5b1954a9f06a69e6be') fallbackBasemap();
            });
          });
        }).catch(function () { /* tileerror handles network failures */ });
      });
      carto.addTo(map);
      map.on('moveend zoomend', updateTrafficLink);
      var groups = { radar: null, events: L.layerGroup().addTo(map), cities: L.layerGroup().addTo(map), river: L.layerGroup().addTo(map) };

      function drawEvents() {
        groups.events.clearLayers();
        eventPoints().forEach(function (e) {
          var col = EVENT_COLORS[e.level] || '#2563eb';
          if (e.poly && e.poly.length > 2) {
            L.polygon(e.poly, { color: col, weight: 1.5, fillOpacity: .08, dashArray: '5,4' }).addTo(groups.events);
          }
          L.circle([e.lat, e.lon], {
            radius: (e.radiusKm || 120) * 1000, color: col, weight: 1,
            fillColor: col, fillOpacity: .07, dashArray: '4,5'
          }).addTo(groups.events);
          L.circleMarker([e.lat, e.lon], {
            radius: 8, color: '#fff', weight: 2, fillColor: col, fillOpacity: .95
          }).addTo(groups.events).bindPopup(eventPopup(e));
        });
      }
      function drawCities() {
        groups.cities.clearLayers();
        cityPoints().forEach(function (p) {
          L.circleMarker([p.lat, p.lon], {
            radius: 5 + p.level * 1.5, color: '#fff', weight: 1.5,
            fillColor: RISK_COLORS[p.level], fillOpacity: .92
          }).addTo(groups.cities).bindPopup(
            '<b>' + esc(p.name) + '</b><br>' + esc(p.country) + ' · ' + esc(t('level.' + ['green', 'yellow', 'orange', 'red'][p.level]))
          );
        });
      }
      function drawRiver() {
        groups.river.clearLayers();
        rivers.filter(function (f) { return !country || f.country === country.id; }).forEach(function (f) {
          L.marker([f.lat, f.lon], {
            icon: L.divIcon({ className: 'map-river-icon', html: '<span>≈</span>', iconSize: [18, 18] })
          }).addTo(groups.river).bindPopup(riverPopup(f));
        });
      }
      function setRadar(on, frame) {
        if (groups.radar) { map.removeLayer(groups.radar); groups.radar = null; }
        if (on && frame) {
          groups.radar = L.tileLayer(tileUrl(frame), {
            opacity: .62, zIndex: 350, maxZoom: 18,
            attribution: 'Radar © RainViewer'
          }).addTo(map);
        }
      }
      drawEvents(); drawCities(); drawRiver();
      return {
        type: 'leaflet',
        setRadar: setRadar,
        toggleEvents: function (on) { if (on) groups.events.addTo(map); else groups.events.remove(); },
        toggleCities: function (on) { if (on) groups.cities.addTo(map); else groups.cities.remove(); },
        toggleRiver: function (on) { if (on) groups.river.addTo(map); else groups.river.remove(); },
        setView: function (la, lo, z) { map.setView([la, lo], z); },
        getView: function () { var c = map.getCenter(); return { lat: c.lat, lon: c.lng, zoom: map.getZoom() }; },
        invalidate: function () { map.invalidateSize(); },
        destroy: function () { try { map.remove(); } catch (e) { /* already gone */ } }
      };
    }

    /* ---------------- 底图适配器：Google Maps JS API ---------------- */
    function makeGoogle(canvas, onReady) {
      var g = root.google.maps;
      var map = new g.Map(canvas, {
        center: { lat: center.lat, lng: center.lon }, zoom: center.zoom,
        mapTypeId: 'roadmap', streetViewControl: false, fullscreenControl: true
      });
      map.addListener('idle', updateTrafficLink);
      var overlays = { radar: null, events: [], cities: [], river: [], infos: [] };
      function clear(arr) { arr.forEach(function (o) { o.setMap(null); }); arr.length = 0; }
      function popup(e) {
        var info = new g.InfoWindow({ content: eventPopup(e) });
        overlays.infos.push(info);
        return info;
      }
      function drawEvents() {
        clear(overlays.events);
        eventPoints().forEach(function (e) {
          var col = EVENT_COLORS[e.level] || '#2563eb';
          overlays.events.push(new g.Circle({
            map: map, center: { lat: e.lat, lng: e.lon }, radius: (e.radiusKm || 120) * 1000,
            strokeColor: col, strokeOpacity: .7, strokeWeight: 1,
            fillColor: col, fillOpacity: .09
          }));
          if (e.poly && e.poly.length > 2) {
            overlays.events.push(new g.Polygon({
              map: map, paths: e.poly.map(function (p) { return { lat: p[0], lng: p[1] }; }),
              strokeColor: col, strokeOpacity: .7, strokeWeight: 1,
              fillColor: col, fillOpacity: .06
            }));
          }
          var mk = new g.Marker({
            map: map, position: { lat: e.lat, lng: e.lon },
            icon: { path: g.SymbolPath.CIRCLE, scale: 8, fillColor: col, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 }
          });
          var iw = popup(e);
          mk.addListener('click', function () { iw.open(map, mk); });
          overlays.events.push(mk);
        });
      }
      function drawCities() {
        clear(overlays.cities);
        cityPoints().forEach(function (p) {
          var mk = new g.Marker({
            map: map, position: { lat: p.lat, lng: p.lon },
            icon: { path: g.SymbolPath.CIRCLE, scale: 5 + p.level, fillColor: RISK_COLORS[p.level], fillOpacity: .95, strokeColor: '#fff', strokeWeight: 1.5 },
            title: p.name
          });
          var iw = new g.InfoWindow({
            content: '<b>' + esc(p.name) + '</b><br>' + esc(p.country) + ' · ' + esc(t('level.' + ['green', 'yellow', 'orange', 'red'][p.level]))
          });
          overlays.infos.push(iw);
          mk.addListener('click', function () { iw.open(map, mk); });
          overlays.cities.push(mk);
        });
      }
      function drawRiver() {
        clear(overlays.river);
        rivers.filter(function (f) { return !country || f.country === country.id; }).forEach(function (f) {
          var mk = new g.Marker({
            map: map, position: { lat: f.lat, lng: f.lon },
            label: { text: '≈', color: '#0e5aa7', fontSize: '16px' },
            title: t('map.layerRiver')
          });
          var iw = new g.InfoWindow({ content: riverPopup(f) });
          overlays.infos.push(iw);
          mk.addListener('click', function () { iw.open(map, mk); });
          overlays.river.push(mk);
        });
      }
      function setRadar(on, frame) {
        if (overlays.radar) { map.overlayMapTypes.pop(); overlays.radar = null; }
        if (on && frame) {
          var u = state.host + frame.path + '/256/';
          overlays.radar = new g.ImageMapType({
            getTileUrl: function (coord, zoom) { return u + zoom + '/' + coord.x + '/' + coord.y + '/2/1_1.png'; },
            tileSize: new g.Size(256, 256), opacity: .62, name: 'RainViewer'
          });
          map.overlayMapTypes.push(overlays.radar);
        }
      }
      drawEvents(); drawCities(); drawRiver();
      return {
        type: 'google',
        setRadar: setRadar,
        toggleEvents: function (on) { overlays.events.forEach(function (o) { o.setMap(on ? map : null); }); },
        toggleCities: function (on) { overlays.cities.forEach(function (o) { o.setMap(on ? map : null); }); },
        toggleRiver: function (on) { overlays.river.forEach(function (o) { o.setMap(on ? map : null); }); },
        setView: function (la, lo, z) { map.setCenter({ lat: la, lng: lo }); map.setZoom(z); },
        getView: function () { var c = map.getCenter(); return { lat: c.lat(), lon: c.lng(), zoom: map.getZoom() }; },
        invalidate: function () { g.event.trigger(map, 'resize'); },
        destroy: function () { /* Google Map 随容器清空自动释放引用 */ }
      };
    }

    function eventPopup(e) {
      var col = EVENT_COLORS[e.level] || '#2563eb';
      return '<div class="map-pop"><b>' + (e.type === 'TC' ? '🌀 ' : '🌊 ') + esc(e.name) + '</b>' +
        '<div style="color:' + col + ';font-weight:700">GDACS ' + esc(e.level) + '</div>' +
        '<div>' + esc(e.country || '—') + (e.severity ? ' · ' + esc(e.severity) : '') + '</div>' +
        '<div>' + esc(String(e.from).slice(0, 10)) + ' → ' + esc(String(e.to).slice(0, 10)) + '</div>' +
        '<div>' + esc(e.active ? t('map.eventActive') : t('map.eventEnded')) +
        (e.inCoverage ? '' : ' · ' + t('map.eventOutside')) + '</div>' +
        (e.url ? '<a href="' + esc(e.url) + '" target="_blank" rel="noopener">' + esc(t('map.eventReport')) + ' ↗</a>' : '') +
        '</div>';
    }
    function riverPopup(f) {
      return '<div class="map-pop"><b>≈ ' + esc(t('river.' + f.id)) + '</b>' +
        '<div>' + esc(t('map.riverPeak')) + ': ' + esc(f.peak) + ' m³/s</div>' +
        '<div>' + esc(t('map.riverChange')) + ': ' + (f.changePct === null ? '—' : (f.changePct > 0 ? '+' : '') + f.changePct + '%') + '</div>' +
        '<div style="font-size:11px;color:#64748b">GloFAS · ' + esc(t('map.modelNotWarning')) + '</div></div>';
    }

    /* ---------------- 静态 SVG 降级 ---------------- */
    function renderFallback() {
      var box = $('mapFallback');
      if (!box) return;
      box.hidden = false;
      $('mapCanvas').hidden = true;
      var W0 = 900, H0 = 460, x0 = 92, x1 = 142, y0 = -12, y1 = 26;
      var px = function (lo) { return ((lo - x0) / (x1 - x0)) * W0; };
      var py = function (la) { return ((y1 - la) / (y1 - y0)) * H0; };
      var svg = '<svg viewBox="0 0 ' + W0 + ' ' + H0 + '" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%">' +
        '<rect width="' + W0 + '" height="' + H0 + '" fill="#eaf3fb"/>';
      for (var lo = 95; lo <= 140; lo += 5) svg += '<line x1="' + px(lo) + '" y1="0" x2="' + px(lo) + '" y2="' + H0 + '" stroke="#cbdcec" stroke-width="1"/><text x="' + (px(lo) + 3) + '" y="14" fill="#7b93ab" font-size="10">' + lo + '°E</text>';
      for (var la = -10; la <= 25; la += 5) svg += '<line x1="0" y1="' + py(la) + '" x2="' + W0 + '" y2="' + py(la) + '" stroke="#cbdcec" stroke-width="1"/><text x="4" y="' + (py(la) - 4) + '" fill="#7b93ab" font-size="10">' + la + '°N</text>';
      cityPoints().forEach(function (p) {
        svg += '<circle cx="' + px(p.lon) + '" cy="' + py(p.lat) + '" r="4" fill="' + RISK_COLORS[p.level] + '" stroke="#fff" stroke-width="1.4"><title>' + esc(p.name) + '</title></circle>';
      });
      eventPoints().forEach(function (e) {
        var col = EVENT_COLORS[e.level] || '#2563eb';
        svg += '<circle cx="' + px(e.lon) + '" cy="' + py(e.lat) + '" r="9" fill="none" stroke="' + col + '" stroke-width="2"><title>' + esc(e.name) + '</title></circle>';
        svg += '<text x="' + (px(e.lon) + 8) + '" y="' + (py(e.lat) - 8) + '" fill="' + col + '" font-size="11">' + (e.type === 'TC' ? '🌀' : '🌊') + '</text>';
      });
      svg += '</svg><div class="map-fallback-note">' + esc(t('map.staticTitle')) + ' · ' + esc(t('map.staticHint')) + '</div>';
      box.innerHTML = svg;
      state.degraded = true;
      status(t('map.cdnFail'), 'warn');
    }

    /* ---------------- 视图切换 ---------------- */
    function googleFrameUrl(v) {
      return 'https://maps.google.com/maps?q=' + v.lat.toFixed(5) + ',' + v.lon.toFixed(5) +
        '&z=' + v.zoom + '&output=embed&hl=' + encodeURIComponent(lang);
    }
    function setView(view) {
      state.view = view;
      host.querySelectorAll('.map-tab').forEach(function (b) {
        b.classList.toggle('on', b.getAttribute('data-view') === view);
      });
      var frame = $('mapFrame'), canvas = $('mapCanvas'), fb = $('mapFallback');
      var v = (state.adapter && state.adapter.getView()) || center;
      if (view === 'google') {
        frame.hidden = false; canvas.hidden = true; fb.hidden = true;
        frame.src = googleFrameUrl(v);
      } else {
        frame.hidden = true;
        if (state.degraded) { fb.hidden = false; canvas.hidden = true; }
        else { canvas.hidden = false; fb.hidden = true; if (state.adapter) setTimeout(function () { state.adapter.invalidate(); }, 60); }
      }
    }
    function updateTrafficLink() {
      var v = (state.adapter && state.adapter.getView()) || center;
      $('mapTraffic').href = v && Number.isFinite(v.lat) && Number.isFinite(v.lon)
        ? 'https://www.google.com/maps/@' + v.lat.toFixed(5) + ',' + v.lon.toFixed(5) + ',' + v.zoom + 'z/data=!5m1!1e1'
        : 'https://www.google.com/maps/search/?api=1&query=Southeast+Asia';
    }

    /* ---------------- 事件绑定 ---------------- */
    host.querySelectorAll('.map-tab').forEach(function (b) {
      b.addEventListener('click', function () { setView(b.getAttribute('data-view')); });
    });
    $('mapRadar').addEventListener('change', function () {
      state.radar = this.checked;
      if (state.adapter) state.adapter.setRadar(state.radar, state.frames[state.frameIdx]);
    });
    $('mapEvents').addEventListener('change', function () {
      state.showEvents = this.checked;
      if (state.adapter) state.adapter.toggleEvents(state.showEvents);
    });
    $('mapCities').addEventListener('change', function () {
      state.showCities = this.checked;
      if (state.adapter) state.adapter.toggleCities(state.showCities);
    });
    $('mapRiver').addEventListener('change', function () {
      state.showRiver = this.checked;
      if (state.adapter) state.adapter.toggleRiver(state.showRiver);
    });
    $('mapTime').addEventListener('input', function () {
      state.frameIdx = Number(this.value) || 0;
      updateTimeLabel();
      if (state.adapter && state.radar) state.adapter.setRadar(true, state.frames[state.frameIdx]);
    });
    $('mapPlay').addEventListener('click', function () {
      if (state.timer) {
        clearInterval(state.timer); state.timer = null; ACTIVE_TIMER = null;
        this.textContent = '▶ ' + t('map.play');
        return;
      }
      if (!state.frames.length) { status(t('map.radarFail'), 'warn'); return; }
      this.textContent = '⏸ ' + t('map.pause');
      var self = this;
      state.timer = setInterval(function () {
        state.frameIdx = (state.frameIdx + 1) % state.frames.length;
        var sl = $('mapTime'); if (sl) sl.value = state.frameIdx;
        updateTimeLabel();
        if (state.adapter && state.radar) state.adapter.setRadar(true, state.frames[state.frameIdx]);
      }, 900);
      ACTIVE_TIMER = state.timer;
    });
    /* ---------------- 启动 ---------------- */
    function bootMap(force) {
      if (state.ready && !force) return;
      state.ready = false; state.degraded = false;
      if (state.timer) { clearInterval(state.timer); state.timer = null; ACTIVE_TIMER = null; }
      if (state.adapter && state.adapter.destroy) state.adapter.destroy();
      state.adapter = null;
      var canvas = $('mapCanvas');
      if (googleKey) {
        if (root.google && root.google.maps) {
          try { state.adapter = makeGoogle(canvas); afterReady(); }
          catch (e) { status(t('map.keyFail') + ' (' + e.message + ')', 'warn'); useLeaflet(); }
          return;
        }
        var settled = false;
        root.__seaGmapReady = function () {
          if (settled) return;
          settled = true;
          try { state.adapter = makeGoogle(canvas); afterReady(); }
          catch (e) { status(t('map.keyFail') + ' (' + e.message + ')', 'warn'); useLeaflet(); }
        };
        root.__seaGmapFail = function () {
          if (settled) return;
          settled = true;
          status(t('map.keyFail'), 'warn');
          useLeaflet();
        };
        loadScript('https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(googleKey) +
          '&callback=__seaGmapReady&v=weekly', function () { /* callback 触发 */ }, root.__seaGmapFail);
        setTimeout(function () {
          if (!settled && !state.ready) {
            settled = true;
            status(t('map.keyFail'), 'warn');
            useLeaflet();
          }
        }, 7000);
        return;
      }
      useLeaflet();
    }
    function useLeaflet() {
      if (root.L) {
        try { state.adapter = makeLeaflet($('mapCanvas')); afterReady(); }
        catch (e) { renderFallback(); }
        return;
      }
      var link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = LEAFLET_CSS;
      document.head.appendChild(link);
      loadScript(LEAFLET_JS, function () {
        try { state.adapter = makeLeaflet($('mapCanvas')); afterReady(); }
        catch (e) { renderFallback(); }
      }, renderFallback);
    }
    function afterReady() {
      state.ready = true;
      state.adapter.setRadar(state.radar, state.frames[state.frameIdx]);
      state.adapter.toggleEvents(state.showEvents);
      state.adapter.toggleCities(state.showCities);
      state.adapter.toggleRiver(state.showRiver);
      // 雷达清单可能比底图库先/后返回：只在「已确定失败」时告警，避免留下过期提示
      if (state.radarLoaded && !state.frames.length) status(t('map.radarFail'), 'warn');
      else status('');
      updateTrafficLink();
      setView(state.view);
      if (!eventPoints().length) {
        var note = host.querySelector('.map-legend');
        if (note) note.insertAdjacentHTML('beforeend',
          '<div class="map-noevents">' + esc(t('map.noEvents')) + '</div>');
      }
    }

    updateTrafficLink();
    setView('layers');
    var radarPromise = loadRadar();   // 雷达清单与底图库并行拉取，避免地图迟迟不出现
    bootMap();
    radarPromise.then(function (ok) {
      if (ok) status('');   // 清掉底图先就绪时可能写下的临时告警
      var tries = 0;
      var iv = setInterval(function () {
        tries++;
        if (state.adapter && state.ready) {
          state.adapter.setRadar(state.radar && ok, state.frames[state.frameIdx]);
          if (ok) status('');
          clearInterval(iv);
        } else if (tries > 40) {
          clearInterval(iv);
        }
      }, 300);
    });
  }

  root.SEA_MAP = { init: init };
})(window);
