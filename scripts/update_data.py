#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SEA Travel Weather · 每日数据更新脚本（本机运行，无需任何第三方库 / 无需 API Key）

做什么
  1) 逐城市向 Open-Meteo 公开预报 API 拉取 7 天逐日 + 逐小时天气（免注册、非商用、CC BY 4.0）；
  2) 写出 data/weather.json（前端只读这个文件，页面本身不接触任何密钥）；
  3) 写出 data/flights.json（默认 mode=off；配置 Key 后才尝试真实航班状态）。

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
DATA_JS = ROOT / 'js' / 'data.js'

API = 'https://api.open-meteo.com/v1/forecast'
CURRENT_VARS = 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_gusts_10m'
HOURLY_VARS = 'temperature_2m,relative_humidity_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m,visibility'
DAILY_VARS = 'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,weather_code'

# 与 js/data.js 中的 cities 保持一致；--check 会做一致性校验。
LOCATIONS = [
    ('vn', 'Asia/Ho_Chi_Minh', [
        ('hcm', 10.8231, 106.6297), ('hanoi', 21.0278, 105.8342),
        ('danang', 16.0544, 108.2022), ('phuquoc', 10.2270, 103.9570)]),
    ('th', 'Asia/Bangkok', [
        ('bangkok', 13.7563, 100.5018), ('chiangmai', 18.7883, 98.9853),
        ('phuket', 7.8804, 98.3923), ('pattaya', 12.9236, 100.8825)]),
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


def http_json(url, tries=3, timeout=25):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception as e:                       # noqa: BLE001 - 网络层统一降级
            last = e
            if i < tries - 1:
                time.sleep(1.5 * (i + 1))
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true', help='只做坐标一致性校验')
    ap.add_argument('--dry-run', action='store_true', help='拉取但不写文件')
    args = ap.parse_args()

    consistency_check()
    if args.check:
        return 0

    now = dt.datetime.now().astimezone()
    now_iso = now.isoformat(timespec='seconds')
    countries, failed, degraded = {}, [], []

    for cid, tz, cities in LOCATIONS:
        bucket = {}
        for name, lat, lon in cities:
            try:
                bucket[name] = pull_city(lat, lon, tz)
                if not bucket[name]['visibilityAvailable']:
                    degraded.append('%s/%s' % (cid, name))
                log('OK  %s/%s' % (cid, name))
            except Exception as e:                  # noqa: BLE001 - 单城失败不影响全局
                failed.append('%s/%s: %s' % (cid, name, str(e)[:120]))
                log('FAIL %s/%s → %s' % (cid, name, str(e)[:120]))
            time.sleep(0.35)                         # 对公开 API 保持礼貌
        countries[cid] = {'timezone': tz, 'cities': bucket}

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
    return 0


if __name__ == '__main__':
    sys.exit(main())
