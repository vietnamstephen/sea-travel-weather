#!/usr/bin/env python3
"""Build the VN/TH hospital pilot from auditable OSM snapshots and manual reviews.

Run: python3 scripts/build_hospitals.py
No network, weather updater, credentials, geolocation or insurer-name inference.
Refresh snapshots separately from the recorded OSM API URLs; review new records
in hospitals_reviewed.json before inclusion. Unreviewed records are excluded.
"""
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HERE = Path(__file__).parent
LANGS = ('zh', 'en', 'vi', 'th', 'id')
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
    countries = json.loads(subprocess.check_output([
        'node', '-e', "global.window=global;require('./js/data.js');console.log(JSON.stringify(SEA_DATA.countries.filter(c=>['vn','th'].includes(c.id))))"
    ], cwd=ROOT))
    output = {'meta': {
        'updatedAt': '2026-11-16', 'osmCheckedAt': snapshot['checkedAt'],
        'sources': ['https://www.openstreetmap.org/copyright', 'https://www.wikidata.org/',
                    'https://spd.moph.go.th/wp-content/uploads/2025/07/Report-Health-Resource-2024.pdf'],
        'pti': {'sourceUrl': PTI_URL, 'listUrls': PTI_FILES, 'checkedAt': '2026-11-15',
                'method': 'Manual facility AND address matching; never inferred from hospital names. Unchecked = false.',
                'caveat': 'Product, policy, service and department restrictions apply; listing is not a guarantee of emergency direct billing.'},
        'scope': 'Reviewed pilot; OSM API bounding boxes recorded per city. Not an exhaustive hospital directory. No-phone, duplicate and unverified records excluded.',
        'origins': {}, 'coverage': {},
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
    (ROOT / 'data/hospitals.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
    print(f"Built {sum(len(v) for c in output['countries'].values() for v in c.values())} reviewed hospitals")


if __name__ == '__main__':
    build()
