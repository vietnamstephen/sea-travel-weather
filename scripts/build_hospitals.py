#!/usr/bin/env python3
"""Build the VN/TH hospital pilot from auditable OSM snapshots and manual reviews.

Run: python3 scripts/build_hospitals.py
No network, weather updater, credentials, geolocation or insurer-name inference.
Refresh snapshots separately from the recorded OSM API URLs; review new records
in hospitals_reviewed.json before inclusion. Unreviewed records are excluded.
build() is pure (returns the data) so a test can reproduce the committed file.
"""
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HERE = Path(__file__).parent
LANGS = ('zh', 'en', 'vi', 'th', 'id')
MIN_PER_CITY = 2
PTI_URL = 'https://www.pti.com.vn/tra-cuu-co-so-y-te'
PTI_FILES = [
    'https://new.pti.com.vn/wp-content/uploads/2026/10/Danh-sach-CSYT-bao-lanh-qua-INSMART.pdf',
    'https://new.pti.com.vn/wp-content/uploads/2026/10/Danh-sach-CSYT-bao-lanh-qua-FHVI.pdf',
]


def read(name):
    return json.loads((HERE / name).read_text())


def build():
    snapshot = read('hospitals_osm_snapshot.json')
    reviews = read('hospitals_reviewed.json')
    wikidata = read('hospitals_wikidata.json')
    origins = read('attractions_origins.json')
    all_countries = json.loads(subprocess.check_output([
        'node', '-e', "global.window=global;require('./js/data.js');console.log(JSON.stringify(SEA_DATA.countries))"
    ], cwd=ROOT))
    countries = [c for c in all_countries if c['id'] in ('vn', 'th')]
    # 各国救护/急救号码，单一数据源为 js/data.js 的 emergency.ambulance。
    # 前端急救电话条按 CID 从 data/hospitals.json 的 meta.emergency 读取，不在 UI 写死。
    emergency = {c['id']: c['emergency']['ambulance']
                 for c in all_countries if c.get('emergency', {}).get('ambulance')}
    output = {'meta': {
        'emergency': emergency,
        'updatedAt': '2026-11-16', 'osmCheckedAt': snapshot['checkedAt'],
        'sources': ['https://www.openstreetmap.org/copyright', 'https://www.wikidata.org/',
                    'https://spd.moph.go.th/wp-content/uploads/2025/07/Report-Health-Resource-2024.pdf'],
        'pti': {'sourceUrl': PTI_URL, 'listUrls': PTI_FILES, 'checkedAt': '2026-11-15',
                'rosterSource': 'Committed pilot manual-review records in scripts/hospitals_reviewed.json (facility + address matched to INSMART/FHVI rows).',
                'method': 'Manual facility AND address matching against the official PTI lists; never inferred from hospital names. Unchecked = false. Only the committed roster keeps pti=true; no coverage was added without verification.',
                'recheckAttemptedAt': '2026-11-16',
                'recheckNote': 'Live re-verification of the official PTI PDFs was not possible in this build environment (outbound page fetch unavailable). The committed roster and its 2026-11-15 check date were preserved; every newly added record has pti=false per the unverified=false rule. Re-confirm against the insurer latest list before relying on coverage.',
                'caveat': 'Product, policy, service and department restrictions apply; listing is not a guarantee of emergency direct billing.'},
        'scope': 'Reviewed pilot; OSM API bounding boxes recorded per city. Not an exhaustive hospital directory. No-phone, duplicate and unverified records excluded.',
        'thresholds': {'minHospitalsPerCity': MIN_PER_CITY},
        'insufficientCities': {}, 'origins': {}, 'coverage': {},
    }, 'countries': {}}
    for country in countries:
        cid = country['id']
        local = 'vi' if cid == 'vn' else 'th'
        output['countries'][cid] = {}
        for city in country['cities']:
            city_id = city['id']
            raw = snapshot['cities'][city_id]
            items = []
            for element in raw['elements']:
                tags = element['tags']
                assert tags['amenity'] == 'hospital'
                osm_id = f"{element['type']}/{element['id']}"
                review = reviews.get(osm_id)
                if not review or review['city'] != city_id:
                    continue
                assert review['ownership'] in ('public', 'private')
                assert re.fullmatch(r'\+(84|66)[1-9][0-9]{7,10}', review['phone']), osm_id
                assert review['checkedAt'] and review['source'] and review['address']
                assert not review['pti'] or review['ptiSource'] in PTI_FILES
                qid = tags.get('wikidata')
                wd = wikidata.get(qid, {})
                local_name = tags.get('name:' + local, tags.get('name'))
                assert local_name
                names = {lang: tags.get('name:' + lang) or wd.get('labels', {}).get(lang) or local_name for lang in LANGS}
                names.update(review.get('name', {}))
                point = element.get('center', element)
                item = {'id': 'osm:' + osm_id, 'city': city_id, 'name': names,
                        **{key: review[key] for key in ('ownership', 'intl', 'pti', 'er24', 'address', 'phone')},
                        'lat': point['lat'], 'lng': point['lon'], 'rank': 0,
                        'sources': ['https://www.openstreetmap.org/' + osm_id, review['source']] + ([wd['source']] if wd else []),
                        'checkedAt': review['checkedAt'], 'ptiCheckedAt': review['checkedAt'] if review['pti'] else None,
                        'ptiSource': review['ptiSource'], 'reviewNote': review.get('reviewNote', '')}
                items.append(item)
            items.sort(key=lambda h: (not h['er24'], not h['intl'], not h['pti'], h['id']))
            for rank, item in enumerate(items, 1):
                item['rank'] = rank
            output['countries'][cid][city_id] = items
            output['meta']['origins'][city_id] = {key: origins[city_id][key] for key in ('lat', 'lon')}
            count = len(raw['elements'])
            osm_phone = sum(bool(e['tags'].get('phone') or e['tags'].get('contact:phone')) for e in raw['elements'])
            output['meta']['coverage'][city_id] = {'osmCandidates': count, 'osmWithPhone': osm_phone,
                'published': len(items), 'publishedWithPhone': len(items),
                'publishedPhonePercent': 100 if items else None,
                'verifiedPhoneCandidatePercent': round(100 * len(items) / count, 1) if count else None,
                'osmSourceUrl': raw['source'], 'bboxDelta': raw.get('bboxDelta')}
    for cid, cities in output['countries'].items():
        for city_id, items in cities.items():
            if len(items) >= MIN_PER_CITY:
                continue
            cov = output['meta']['coverage'][city_id]
            if cov['osmCandidates'] == 0:
                reason = 'The recorded OSM bounding box contains no hospital candidates for this city.'
            else:
                reason = (f"Only {cov['osmWithPhone']} of {cov['osmCandidates']} OSM hospital candidates "
                          f"carry a phone tag; no further verifiable-phone records were reviewed for this city.")
            output['meta']['insufficientCities'][city_id] = {
                'country': cid, 'published': len(items), 'reason': reason}
    output['meta']['insufficientCities'] = dict(sorted(output['meta']['insufficientCities'].items()))
    return output


if __name__ == '__main__':
    result = build()
    (ROOT / 'data/hospitals.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    total = sum(len(v) for c in result['countries'].values() for v in c.values())
    print(f"Built {total} reviewed hospitals; "
          f"{len(result['meta']['insufficientCities'])} cities below {MIN_PER_CITY} (documented in meta.insufficientCities)")
