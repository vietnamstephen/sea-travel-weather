#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SEA Travel Weather · 每日数据更新脚本（本机运行，无需任何第三方库 / 无需 API Key）

做什么
  1) 逐城市向 Open-Meteo 公开预报 API 拉取 7 天逐日 + 逐小时天气（免注册、非商用、CC BY 4.0）；
  2) 写出 data/weather.json（前端只读这个文件，页面本身不接触任何密钥）；
  3) 写出 data/flights.json（默认 mode=off；配置 Key 后才尝试真实航班状态）；
  4) 写出 data/advisories.json：GDACS 台风/洪水事件（官方 Red/Orange/Green 等级）、
     Open-Meteo GloFAS 河流流量模型预报、官方交通管制核实入口说明。

用法
  python3 scripts/update_data.py                # 正常更新
  python3 scripts/update_data.py --check        # 只校验坐标配置与 js/data.js 是否一致
  python3 scripts/update_data.py --dry-run      # 拉取但不写文件

退出码
  0 = 至少一个国家成功写入；3 = 全部城市失败（供定时任务判定失败，不写半截文件）

关于「每天晚上 1 点」
  由 WorkBuddy 定时任务在 01:00（本机 GMT+7）调用本脚本 + sync_and_push.sh。

航班数据接入（可选，默认关闭）
  - AVIATIONSTACK_API_KEY + AVIATIONSTACK_AIRPORTS=SIN,BKK,...  → REST 实时航班状态
    （免费层 100 次/月，建议只填 1–2 个机场，否则会超额）
  - VARIFLIGHT_API_KEY（飞常准 MCP / ai.variflight.com）
    飞常准提供的是 Streamable MCP（JSON-RPC 会话），不是普通 REST；需要 MCP 客户端初始化会话后
    调用 getAirportFlightBoard / getAirportOperationOverview。此处保留占位与状态标记，
    接入时把 fetch_variflight_mcp() 换成实际 MCP 客户端调用即可，其余流水线不用改。
  - 航旅纵横目前没有面向个人开发者的公开通用 API，只能走官方 App / 网页查询，
    因此不设 provider，页面统一给出官方核实入口。

数据安全
  本脚本只读公开天气数据，不读取任何供应商、采购订单、工厂或 Home Depot 相关数据。
"""
import argparse
import datetime as dt
import json
import random
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OUT_WEATHER = ROOT / 'data' / 'weather.json'
OUT_FLIGHTS = ROOT / 'data' / 'flights.json'
OUT_ADVISORIES = ROOT / 'data' / 'advisories.json'
DATA_JS = ROOT / 'js' / 'data.js'

API = 'https://api.open-meteo.com/v1/forecast'
FLOOD_API = 'https://flood-api.open-meteo.com/v1/flood'
GDACS_FEEDS = {
    'TC': 'https://www.gdacs.org/xml/gdacsTC.geojson',
    'FL': 'https://www.gdacs.org/xml/gdacsFL.geojson',
}
# 东南亚空间框（含南海、安达曼海、菲律宾海）；GDACS 全球事件按此框筛出与出行相关的部分
SEA_BBOX = (-12.0, 92.0, 26.0, 142.0)   # lat_min, lon_min, lat_max, lon_max
SEA_ISO3 = {'VNM', 'THA', 'SGP', 'MYS', 'IDN', 'PHL', 'KHM', 'LAO', 'MMR', 'BRN', 'TLS'}
# GloFAS 5 km 河道网格取样点：坐标经实测落在主河道上（小流域/城市内涝不适用）
# id 同时对应前端 i18n 词条 river.<id>
RIVER_POINTS = [
    ('mekong-cantho', 'vn', 10.0333, 105.7833),   # 湄公河 · 芹苴
    ('red-river', 'vn', 20.4200, 106.1700),       # 红河 · 南定下游
    ('saigon-river', 'vn', 10.7600, 106.6800),    # 西贡河 · 胡志明市
    ('chao-phraya', 'th', 13.7600, 100.4950),     # 昭披耶河 · 曼谷
    ('bang-pakong', 'th', 13.6900, 101.0833),     # 邦巴功河 · 北柳
    ('pahang', 'my', 3.5000, 103.4000),           # 彭亨河 · 北根
    ('kapuas', 'id', -0.0300, 109.3300),          # 卡普阿斯河 · 坤甸
    ('cagayan', 'ph', 17.6200, 121.7200),         # 卡加延河 · 土格加劳
]
CURRENT_VARS = 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_gusts_10m'
HOURLY_VARS = 'temperature_2m,relative_humidity_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m,visibility'
DAILY_VARS = 'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,weather_code'

# 与 js/data.js 中的 cities 保持一致；--check 会做一致性校验。
LOCATIONS = [
    ('vn', 'Asia/Ho_Chi_Minh', [
        ('hcm', 10.8231, 106.6297), ('hanoi', 21.0278, 105.8342),
        ('danang', 16.0544, 108.2022), ('phuquoc', 10.2270, 103.9570),
        ('nhatrang', 12.2388, 109.1967), ('quynhon', 13.7563, 109.2295),
        ('dalat', 11.9404, 108.4583), ('bacninh', 21.1861, 106.0763),
        ('bacgiang', 21.2739, 106.1954), ('haiphong', 20.8449, 106.6881),
        ('binhduong', 10.9804, 106.6519), ('dongnai', 10.9447, 106.8233)]),
    ('th', 'Asia/Bangkok', [
        ('bangkok', 13.7563, 100.5018), ('chiangmai', 18.7883, 98.9853),
        ('phuket', 7.8804, 98.3923), ('pattaya', 12.9236, 100.8825),
        ('chonburi', 13.3611, 100.9847), ('rayong', 12.6833, 101.2833),
        ('chachoengsao', 13.6900, 101.0833), ('ayutthaya', 14.3532, 100.5765),
        ('samutprakan', 13.5990, 100.5968), ('samutsakhon', 13.5479, 100.2748)]),
    ('sg', 'Asia/Singapore', [
        ('singapore', 1.3521, 103.8198), ('jurong', 1.3329, 103.7436),
        ('changi', 1.3644, 103.9915)]),
    ('my', 'Asia/Kuala_Lumpur', [
        ('kl', 3.1390, 101.6869), ('penang', 5.4141, 100.3288),
        ('kotakinabalu', 5.9804, 116.0735), ('johor', 1.4927, 103.7414)]),
    ('id', 'Asia/Jakarta', [
        ('jakarta', -6.2088, 106.8456), ('bali', -8.6705, 115.2126),
        ('surabaya', -7.2575, 112.7521), ('yogyakarta', -7.7956, 110.3695)]),
    ('ph', 'Asia/Manila', [
        ('manila', 14.5995, 120.9842), ('cebu', 10.3157, 123.8854),
        ('davao', 7.1907, 125.4553), ('boracay', 11.9674, 121.9248)]),
]

UA = 'SEA-Travel-Weather/1.0 (personal static site; contact: local updater)'


def log(msg):
    print('[%s] %s' % (dt.datetime.now().strftime('%H:%M:%S'), msg), flush=True)


def http_json(url, tries=4, timeout=25, headers=None):
    last = None
    base = {'User-Agent': UA, 'Accept': 'application/json'}
    if headers:
        base.update(headers)
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=base)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception as e:                       # noqa: BLE001 - 网络层统一降级
            last = e
            if i < tries - 1:
                # 指数退避 + 抖动：应对 SSL EOF / 连接重置等瞬时网络错误
                time.sleep(min(2 ** (i + 1), 15) + random.uniform(0, 1))
    raise last


def build_url(lat, lon, tz, hourly_vars):
    q = {
        'latitude': '%.4f' % lat, 'longitude': '%.4f' % lon,
        'current': CURRENT_VARS, 'hourly': hourly_vars, 'daily': DAILY_VARS,
        'timezone': tz, 'forecast_days': '7',
    }
    return API + '?' + urllib.parse.urlencode(q)


def pull_city(lat, lon, tz):
    """先带 visibility 请求；个别模型不支持该变量时自动降级重试。"""
    degraded = False
    try:
        data = http_json(build_url(lat, lon, tz, HOURLY_VARS))
    except urllib.error.HTTPError as e:
        if e.code != 400:
            raise
        log('visibility 不受支持，自动降级（该城市能见度记为缺失）')
        data = http_json(build_url(lat, lon, tz, HOURLY_VARS.replace(',visibility', '')))
        degraded = True
    if 'hourly' not in data or 'time' not in data['hourly']:
        raise ValueError('Open-Meteo 返回缺少 hourly.time')
    return {
        'lat': lat, 'lon': lon,
        'current': data.get('current', {}),
        'hourly': data.get('hourly', {}),
        'daily': data.get('daily', {}),
        'timezone': data.get('timezone', tz),
        'visibilityAvailable': not degraded,
    }


def consistency_check():
    """确认 LOCATIONS 里的每个坐标都出现在 js/data.js 中，避免两份配置漂移。"""
    text = DATA_JS.read_text(encoding='utf-8')
    pairs = set()
    for a, b in re.findall(r'lat:\s*(-?\d+(?:\.\d+)?),\s*lon:\s*(-?\d+(?:\.\d+)?)', text):
        pairs.add((round(float(a), 4), round(float(b), 4)))
    missing = []
    for cid, tz, cities in LOCATIONS:
        for name, lat, lon in cities:
            if (round(lat, 4), round(lon, 4)) not in pairs:
                missing.append('%s/%s (%.4f, %.4f)' % (cid, name, lat, lon))
    if missing:
        log('警告：以下坐标未见于 js/data.js，请同步两份配置 → ' + '; '.join(missing))
    else:
        log('坐标一致性校验通过：%d 个城市' % sum(len(c) for _, _, c in LOCATIONS))
    return missing


def fetch_aviationstack(iata_list, key):
    """Aviationstack REST（免费层 100 次/月，请只填少量机场）。"""
    out = {}
    for iata in iata_list[:3]:                     # 每天最多 3 次，避免超额
        url = 'https://api.aviationstack.com/v1/flights?' + urllib.parse.urlencode({
            'access_key': key, 'arr_iata': iata, 'limit': '5',
        })
        try:
            j = http_json(url, tries=2)
            out[iata] = {
                'status': 'ok',
                'flights': [{
                    'flight': (f.get('flight') or {}).get('iata'),
                    'airline': (f.get('airline') or {}).get('name'),
                    'dep_iata': (f.get('departure') or {}).get('iata'),
                    'status': f.get('flight_status'),
                    'dep_scheduled': (f.get('departure') or {}).get('scheduled'),
                    'arr_scheduled': (f.get('arrival') or {}).get('scheduled'),
                } for f in (j.get('data') or [])],
            }
        except Exception as e:                     # noqa: BLE001
            out[iata] = {'status': 'error', 'error': str(e)[:160]}
        time.sleep(1.2)                            # 免费层限流 1 req/min 更稳妥
    return out


def fetch_variflight_mcp(_key, _iata_list):
    """占位：飞常准 MCP 需要 JSON-RPC 会话初始化，接入时替换此处。

    参考工具（https://app.variflight.com/public/html/mcp/tools/）：
      getAirportFlightBoard        {local:"SGN", out:"1"}  机场实时航班大屏
      getAirportOperationOverview  {local:"BKK", out:"2"}  机场运行概况
      getAirlineInfo               {code:"VN"}              航司信息
    """
    return {'status': 'pending-mcp-client',
            'note': 'VariFlight exposes a Streamable MCP server; wire an MCP client to enable.'}


def build_flights(now_iso):
    av_key = os.environ.get('AVIATIONSTACK_API_KEY', '').strip()
    vf_key = os.environ.get('VARIFLIGHT_API_KEY', '').strip()
    payload = {
        'mode': 'off', 'provider': None, 'generatedAt': now_iso,
        'airports': {},
        'note': 'No key configured. Official flight boards + weather inference only.',
    }
    if av_key:
        iatas = [x.strip().upper() for x in os.environ.get('AVIATIONSTACK_AIRPORTS', '').split(',') if x.strip()]
        if not iatas:
            payload['note'] = 'AVIATIONSTACK_API_KEY present but AVIATIONSTACK_AIRPORTS empty — set airport IATA codes to fetch.'
        else:
            payload.update(mode='on', provider='aviationstack',
                           airports=fetch_aviationstack(iatas, av_key),
                           note='Live data from Aviationstack. Verify with the operating airline before travelling.')
    elif vf_key:
        iatas = [x.strip().upper() for x in os.environ.get('VARIFLIGHT_AIRPORTS', 'SIN,BKK').split(',') if x.strip()]
        payload.update(mode='partial', provider='variflight-mcp',
                       airports={i: fetch_variflight_mcp(vf_key, [i]) for i in iatas},
                       note='VariFlight MCP client not wired yet — see scripts/update_data.py.')
    return payload


# ---------------------------------------------------------------------------
# 台风 / 洪水事件（GDACS：欧盟 JRC 与联合国联合，免 Key）
# ---------------------------------------------------------------------------
def _flatten_pairs(node, out):
    """递归把 GeoJSON 坐标树拆成 (lon, lat) 列表。"""
    if isinstance(node, (list, tuple)):
        if len(node) >= 2 and all(isinstance(v, (int, float)) for v in node[:2]):
            out.append((float(node[0]), float(node[1])))
        else:
            for child in node:
                _flatten_pairs(child, out)


def _geometry_center(geom):
    pairs = []
    _flatten_pairs((geom or {}).get('coordinates'), pairs)
    if not pairs:
        return None, None, []
    lons = [p[0] for p in pairs]
    lats = [p[1] for p in pairs]
    return ((min(lons) + max(lons)) / 2.0, (min(lats) + max(lats)) / 2.0, pairs)


def _feature_extent(f):
    """返回 (minLon, minLat, maxLon, maxLat)，优先用 GeoJSON bbox。"""
    b = f.get('bbox')
    if isinstance(b, (list, tuple)) and len(b) >= 4:
        try:
            return float(b[0]), float(b[1]), float(b[2]), float(b[3])
        except (TypeError, ValueError):
            pass
    pairs = []
    _flatten_pairs((f.get('geometry') or {}).get('coordinates'), pairs)
    if not pairs:
        return None
    lons = [p[0] for p in pairs]
    lats = [p[1] for p in pairs]
    return min(lons), min(lats), max(lons), max(lats)


def fetch_gdacs():
    """返回 (精简事件列表, 状态字典)。

    判定：影响范围与东南亚空间框相交，且事件在近 30 天内仍有效。
    active=true 表示 GDACS 标注的结束日期尚未过去；否则归入「近期已结束」。
    """
    status, seen = {}, {}
    today = dt.date.today().isoformat()
    cutoff = (dt.date.today() - dt.timedelta(days=30)).isoformat()
    rank = {'Green': 1, 'Orange': 2, 'Red': 3}
    la_min, lo_min, la_max, lo_max = SEA_BBOX
    for typ, url in GDACS_FEEDS.items():
        try:
            # GDACS 对 Accept: application/json 返回 406；而浏览器 UA 会触发反爬 HTML 页，
            # 因此保持自定义 UA，仅把 Accept 改为通配。
            j = http_json(url, tries=2, timeout=45, headers={'Accept': '*/*'})
            raw = j.get('features') or []
        except Exception as e:                     # noqa: BLE001
            status[typ] = 'failed: %s' % str(e)[:120]
            log('GDACS %s 拉取失败 → %s' % (typ, str(e)[:100]))
            continue
        kept = 0
        for f in raw:
            p = f.get('properties') or {}
            if str(p.get('iscurrent', 'true')).lower() == 'false':
                continue
            ended = (p.get('todate') or '')[:10]
            if ended and ended < cutoff:
                continue
            ext = _feature_extent(f)
            if not ext:
                continue
            x0, y0, x1, y1 = ext
            # 影响范围与东南亚框相交（而非仅中心点落在框内）
            if x1 < lo_min or x0 > lo_max or y1 < la_min or y0 > la_max:
                continue
            raw_cx, raw_cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
            cx = min(max(raw_cx, lo_min), lo_max)
            cy = min(max(raw_cy, la_min), la_max)
            key = (typ, str(p.get('eventid')))
            lv = p.get('alertlevel') or 'Green'
            episode = p.get('episodeid') or 0
            u = p.get('url') if isinstance(p.get('url'), dict) else {}
            poly = []
            if typ == 'TC' and (f.get('geometry') or {}).get('type') == 'Polygon':
                pairs = []
                _flatten_pairs((f.get('geometry') or {}).get('coordinates'), pairs)
                if len(pairs) > 3:
                    step = max(1, len(pairs) // 70)
                    poly = [[round(b, 3), round(a, 3)] for a, b in pairs[::step]][:80]
            prev = seen.get(key)
            score_new = (rank.get(lv, 0), episode)
            if prev:
                score_old = (rank.get(prev['level'], 0), prev['_ep'])
                if score_new > score_old:
                    if not poly:
                        poly = prev['poly']
                elif poly and not prev['poly']:
                    prev['poly'] = poly
                    continue
                else:
                    continue
            seen[key] = {
                'id': '%s-%s' % (typ, p.get('eventid')),
                'type': typ,
                'name': p.get('name') or p.get('description') or '',
                'level': lv,
                'score': p.get('alertscore'),
                'country': p.get('country') or '',
                'iso3': p.get('iso3') or '',
                'from': p.get('fromdate') or '',
                'to': p.get('todate') or '',
                'lat': round(cy, 4), 'lon': round(cx, 4),
                'bbox': [round(x0, 3), round(y0, 3), round(x1, 3), round(y1, 3)],
                'inCoverage': bool(la_min <= raw_cy <= la_max and lo_min <= raw_cx <= lo_max),
                'radiusKm': 350 if typ == 'TC' else 120,
                'severity': ((p.get('severitydata') or {}).get('severitytext') or ''),
                'url': u.get('report') or '',
                'poly': poly,
                'active': bool(not ended or ended >= today),
                'source': 'GDACS',
                '_ep': episode,
            }
            kept += 1
        status[typ] = 'ok (%d raw / %d kept)' % (len(raw), kept)
        log('GDACS %s：%d 条原始事件，保留 %d 条' % (typ, len(raw), kept))
    for ev in seen.values():
        ev.pop('_ep', None)
    events = sorted(seen.values(),
                    key=lambda x: (not x['active'], -rank.get(x['level'], 0), x['type'], x['name']))
    return events, status


def fetch_flood():
    """Open-Meteo Flood API（Copernicus GloFAS v4），7 天逐日河流流量 m³/s。"""
    out, failed = [], 0
    for rid, cid, lat, lon in RIVER_POINTS:
        q = {
            'latitude': '%.4f' % lat, 'longitude': '%.4f' % lon,
            'daily': 'river_discharge', 'forecast_days': '7', 'timezone': 'GMT',
        }
        try:
            j = http_json(FLOOD_API + '?' + urllib.parse.urlencode(q), tries=2, timeout=25)
            d = j.get('daily') or {}
            times = d.get('time') or []
            vals = [round(v, 1) if isinstance(v, (int, float)) else None
                    for v in (d.get('river_discharge') or [])]
            valid = [v for v in vals if v is not None]
            first = valid[0] if valid else None
            peak = max(valid) if valid else None
            change = round((peak - first) / first * 100.0, 1) \
                if first and peak and first >= 10 else None
            status = 'ok' if (valid and peak and peak >= 10) else \
                ('low-flow' if valid else 'no-river-cell')
            out.append({
                'id': rid, 'country': cid, 'lat': lat, 'lon': lon,
                'unit': 'm³/s', 'time': times, 'discharge': vals,
                'peak': peak, 'changePct': change, 'status': status,
                'latUsed': j.get('latitude'), 'lonUsed': j.get('longitude'),
            })
            log('GloFAS %s：peak %s m³/s，变化 %s%%' % (rid, peak, change))
        except Exception as e:                     # noqa: BLE001
            failed += 1
            out.append({'id': rid, 'country': cid, 'lat': lat, 'lon': lon,
                        'unit': 'm³/s', 'time': [], 'discharge': [],
                        'peak': None, 'changePct': None, 'status': 'failed',
                        'error': str(e)[:120]})
            log('GloFAS %s 失败 → %s' % (rid, str(e)[:100]))
        time.sleep(0.3)
    return out, ('failed' if failed == len(RIVER_POINTS) else 'ok')


def build_advisories(now_iso):
    events, gdacs_status = fetch_gdacs()
    flood, flood_status = fetch_flood()
    all_failed = all(str(v).startswith('failed') for v in gdacs_status.values()) \
        and flood_status == 'failed'
    return {
        'meta': {
            'generatedAt': now_iso,
            'gdacsStatus': gdacs_status,
            'floodStatus': flood_status,
            'eventCount': len(events),
            'floodPointCount': len(flood),
            'allSourcesFailed': all_failed,
            'bbox': SEA_BBOX,
            'sources': [
                {'id': 'GDACS', 'url': 'https://www.gdacs.org/',
                 'note': 'Global Disaster Alert and Coordination System (EC JRC / UN). Red/Orange/Green are GDACS alert levels.'},
                {'id': 'GloFAS', 'url': 'https://open-meteo.com/en/docs/flood-api',
                 'note': 'Open-Meteo Flood API, Copernicus GloFAS v4 river discharge model. Model output, NOT an official flood warning.'},
            ],
            'note': '台风/洪水事件为 GDACS 官方警报等级；河流流量为 GloFAS 模型预报。本站不提供实时官方封路数据库。',
            'closureSchema': ('confirmedClosures 可人工维护：'
                              '{id, country, area, type(road|bridge|ferry|port|airspace), status, '
                              'since, until, sourceName, sourceUrl, verifiedAt}'),
        },
        'controlsMode': {
            'mode': 'official-links',
            'hasLiveApi': False,
            'note': ('东南亚各国没有统一、免费、结构化的官方封路/交通管制 API。'
                     '本板块提供各国官方公告直达入口 + 自动灾害事件 + 人工核实条目；'
                     '「可能影响交通」是规则推断，不代表已发布管制。'),
        },
        'events': events,
        'flood': flood,
        # 人工核实过的封路/管制条目；日常为空，格式见 meta.closureSchema
        'confirmedClosures': [],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true', help='只做坐标一致性校验')
    ap.add_argument('--dry-run', action='store_true', help='拉取但不写文件')
    ap.add_argument('--advisories-only', action='store_true',
                    help='只刷新台风/洪水/管制数据，不重拉天气（调试或临时刷新用）')
    args = ap.parse_args()

    consistency_check()
    if args.check:
        return 0

    now = dt.datetime.now().astimezone()
    now_iso = now.isoformat(timespec='seconds')

    if args.advisories_only:
        adv = build_advisories(now_iso)
        if adv['meta']['allSourcesFailed'] and OUT_ADVISORIES.exists():
            log('全部灾害源失败，保留原有 advisories.json')
            return 3
        tmp = OUT_ADVISORIES.with_suffix('.json.tmp')
        tmp.write_text(json.dumps(adv, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        tmp.replace(OUT_ADVISORIES)
        log('写入 %s（事件 %d / 河流点 %d）' %
            (OUT_ADVISORIES.relative_to(ROOT), len(adv['events']), len(adv['flood'])))
        return 0

    countries, failed, degraded = {}, [], []
    pending = []                                     # (cid, tz, name, lat, lon, err)

    def try_city(cid, tz, name, lat, lon):
        bucket = countries[cid]['cities']
        bucket[name] = pull_city(lat, lon, tz)
        if not bucket[name]['visibilityAvailable']:
            degraded.append('%s/%s' % (cid, name))
        log('OK  %s/%s' % (cid, name))

    for cid, tz, cities in LOCATIONS:
        countries[cid] = {'timezone': tz, 'cities': {}}
        for name, lat, lon in cities:
            try:
                try_city(cid, tz, name, lat, lon)
            except Exception as e:                  # noqa: BLE001 - 单城失败不影响全局
                pending.append((cid, tz, name, lat, lon, str(e)[:120]))
                log('FAIL %s/%s → %s（稍后重试）' % (cid, name, str(e)[:120]))
            time.sleep(0.35)                         # 对公开 API 保持礼貌

    # 失败城市补拉：最多 2 轮，每轮前冷却，避免半夜瞬时网络抖动导致丢数据
    for rnd, wait in enumerate((20, 60), start=1):
        if not pending:
            break
        log('补拉第 %d 轮：%d 个城市，先等待 %ds' % (rnd, len(pending), wait))
        time.sleep(wait)
        still = []
        for cid, tz, name, lat, lon, _ in pending:
            try:
                try_city(cid, tz, name, lat, lon)
            except Exception as e:                  # noqa: BLE001
                still.append((cid, tz, name, lat, lon, str(e)[:120]))
                log('FAIL %s/%s → %s' % (cid, name, str(e)[:120]))
            time.sleep(1.0)
        pending = still
    failed = ['%s/%s: %s' % (c, n, err) for c, _, n, _, _, err in pending]

    ok_countries = sum(1 for c in countries.values() if c['cities'])
    if ok_countries == 0:
        log('全部城市拉取失败，不覆盖已有数据（退出码 3）')
        return 3

    payload = {
        'meta': {
            'generatedAt': now_iso,
            'source': 'Open-Meteo Forecast API (https://open-meteo.com/)',
            'license': 'CC BY 4.0 · free non-commercial tier',
            'forecastDays': 7,
            'cityCount': sum(len(c['cities']) for c in countries.values()),
            'cityExpected': sum(len(c) for _, _, c in LOCATIONS),
            'failed': failed,
            'visibilityDegraded': degraded,
            'note': '数值预报，不是官方气象预警；风险等级由前端固定阈值推算。',
        },
        'countries': countries,
    }

    if args.dry_run:
        log('dry-run：%d 国 / %d 城市，未写文件' % (ok_countries, payload['meta']['cityCount']))
        return 0

    OUT_WEATHER.parent.mkdir(parents=True, exist_ok=True)
    # 先写临时文件再原子替换，避免定时任务中断留下半截 JSON
    tmp = OUT_WEATHER.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    tmp.replace(OUT_WEATHER)
    OUT_FLIGHTS.write_text(json.dumps(build_flights(now_iso), ensure_ascii=False, indent=2), encoding='utf-8')

    log('写入 %s（%d 国 / %d 城市，失败 %d）' %
        (OUT_WEATHER.relative_to(ROOT), ok_countries, payload['meta']['cityCount'], len(failed)))
    log('写入 %s' % OUT_FLIGHTS.relative_to(ROOT))

    # 台风 / 洪水 / 管制信息：独立失败不影响天气主流程
    try:
        adv = build_advisories(now_iso)
        if adv['meta']['allSourcesFailed'] and OUT_ADVISORIES.exists():
            log('GDACS 与 GloFAS 均失败，保留原有 advisories.json（不推送半截数据）')
        else:
            atmp = OUT_ADVISORIES.with_suffix('.json.tmp')
            atmp.write_text(json.dumps(adv, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
            atmp.replace(OUT_ADVISORIES)
            log('写入 %s（事件 %d 条 / 河流点 %d 个）' %
                (OUT_ADVISORIES.relative_to(ROOT), len(adv['events']), len(adv['flood'])))
    except Exception as e:                        # noqa: BLE001
        log('警告：advisories.json 生成异常（不影响天气数据）→ %s' % str(e)[:150])
    # Publish the cache key last, including when existing advisories were retained.
    version = OUT_WEATHER.parent / 'version.json'
    vtmp = version.with_suffix('.json.tmp')
    vtmp.write_text(json.dumps({'generatedAt': now_iso}), encoding='utf-8')
    vtmp.replace(version)
    return 0


if __name__ == '__main__':
    sys.exit(main())
