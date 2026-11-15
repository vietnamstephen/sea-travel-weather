#!/usr/bin/env python3
"""Manual attractions build; never part of the daily weather pipeline.

Output: meta + countries[country][city] arrays. Names use five site languages,
falling back to English/local labels. Photos are Commons extmetadata-verified.
Run: python3 scripts/build_attractions.py --country vn,th
Or rebuild one city: python3 scripts/build_attractions.py --country sg --city singapore
Use --country all (also the default) for all official cities.
"""
import argparse
import hashlib
import html
import json
import math
import re
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
import requests
from opencc import OpenCC

SIMPLIFY = OpenCC("t2s")

def source_text(values, lang, fallback=""):
    keys = ["zh-hans", "zh-cn", "zh"] if lang == "zh" else [lang]
    value = next((values[k]["value"] for k in keys if values.get(k, {}).get("value")), fallback)
    return SIMPLIFY.convert(value) if lang == "zh" else value

# Explicit city-level must-sees supplement discovery and take ranking priority.
WHITELIST = json.loads((Path(__file__).parent / 'attractions_whitelist.json').read_text())
# Reviewed museum: private operation alone must not remove this cultural venue.
COMMERCIAL_EXCEPTIONS = {'Q16678462'}

# Reviewed P625 snapshots / explicit centre overrides, separate from weather.
ORIGINS = json.loads((Path(__file__).parent / "attractions_origins.json").read_text())

def attraction_origin(city):
    ref = ORIGINS[city["id"]]
    return dict(city, lat=ref["lat"], lon=ref["lon"])

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.cache/attractions'
UA = 'SEA-travel-weather-attractions/1.0 (https://github.com/vietnamstephen/sea-travel-weather)'
LANGS = ['zh', 'en', 'vi', 'th', 'id']
# Conservative visitor-interest classes, resolved through Wikidata subclasses.
TYPES = {'Q33506': 'museum', 'Q16970': 'church', 'Q2977': 'cathedral',
         'Q23413': 'castle', 'Q22698': 'park', 'Q4989906': 'monument',
         'Q179700': 'statue', 'Q839954': 'historic site', 'Q57821': 'fort',
         'Q16560': 'palace', 'Q108325': 'chapel', 'Q32815': 'mosque',
         'Q199451': 'pagoda', 'Q570116': 'tourist attraction', 'Q44539': 'temple'}
# Reviewed source errors / scope exclusions. Keep reasons beside QIDs so later
# occasional builds preserve the pilot review without inventing attraction data.
EXCLUDE = {
    'Q1491497': 'RMS Empress of Asia: historic ocean liner, not a visitor landmark',
    'osm:node/7005393785': 'Generic snorkeling activity marker; no distinct named landmark',
    'osm:node/7025957985': 'Generic aircraft viewing activity marker; no distinct named landmark',
    'osm:node/8273857617': 'Generic public beach access marker; not a distinct named attraction',
    'osm:node/8273857817': 'Generic bay-view activity marker; no distinct named landmark',
    'osm:node/8278125037': 'Generic pier-view activity marker; no distinct named landmark',
    'Q136334443': 'Laem Chabang Industrial Estate: industrial park, not a visitor attraction',
    'Q25894317': 'Ramayana Water Park: commercial ticketed water/amusement park',
    'Q4923810': 'Sriracha Tiger Zoo: private commercial animal-show zoo',
    'Q48797664': 'Samphran Elephant Ground & Zoo: private commercial elephant/crocodile shows',
    'Q2444945': 'Nong Nooch: private commercial leisure garden with shows and amusement displays',
    'Q7709123': 'Thai Human Imagery Museum: private commercial wax-figure attraction',
    'osm:way/670451940': 'Bach Dang victory museum is in Quang Yen, Quang Ninh; not a Hai Phong city venue',
    'osm:node/5269460121': 'Rocky Husband mountain belongs to the Ha Long / Quang Ninh area, not Hai Phong',
    'osm:node/4242300895': 'Electricity payment point mis-tagged as viewpoint; not a visitor site',
    'osm:node/6375200024': 'Former mosque minaret: OSM access=no',
    'osm:node/6968353589': 'Duplicate Bai Truong / Long Beach polygon osm:way/32003769',
    'osm:node/1166204872': 'Duc Ninh Pepper Farm: commercial farm attraction',
    'osm:node/1954274168': 'Khai Hoan Fish Sauce: commercial factory visit',
    'osm:node/1954274170': 'Ngoc Ha Pepper Farm: commercial farm attraction',
    'osm:node/2590497234': 'Pepper Farm: commercial farm attraction',
    'osm:node/3482735049': 'Ridgeback Terrain Raceway: commercial dog racing venue',
    'osm:node/5227336425': 'Phu Quoc Countryside: commercial farm / restaurant',
    'osm:node/5227515822': 'Phu Quoc Bee Farm: commercial farm visit',
    'osm:node/5263056621': 'Le Ho Pepper: commercial pepper venue',
    'osm:node/6187500387': 'Hoang Mau: commercial wine factory',
    'osm:node/6359615985': 'False Starfish Beach: source warns of misleading commercial boat stop',
    'osm:node/10720281801': 'Multi Animal Show: commercial animal entertainment',
    'osm:node/13648647562': 'The Peak: private commercial attraction',
    'osm:way/1270360767': 'Teddy Bear Museum: Grand World commercial entertainment',
    'osm:way/1270360775': 'Bamboo Legend: Grand World commercial entertainment',
    'Q123376181': 'Grand World: commercial leisure complex',
    'Q4925552': 'Samutprakarn Crocodile Farm and Zoo: commercial farm-zoo',
    'Q806441': 'Bang Khun Thian Museum: Bangkok district, not Samut Sakhon',
    'Q1740652': 'Khok Phanom Di: distant archaeological site without usual Chachoengsao departure evidence',
    'Q97230206': 'Saint Philip and James Church: distant site without usual Chachoengsao departure evidence',
    'Q14489975': 'Da Nang industrial high-tech park, not a visitor park',
    'Q6420770': 'Saigon industrial high-tech park, not a visitor park',
    'Q1337006': 'HMS Stoic: misplaced ship record, not a Phuket visitor landmark',
}
CITY_EXCLUDE = {
    'dongnai': {'Q2930683', 'Q4914339', 'Q32608093'},  # HCMC venues, not Bien Hoa
    'samutprakan': {'Q1795947', 'Q28671266'},  # Bangkok administrative area
}
# Assignment-only neighbour: Ha Long is not a site city, but must still
# prevent Hai Phong from borrowing its landmarks. Q36077 P625 checked.
REGIONAL_NEIGHBOURS = {
    'vn': [{'id':'halong', 'lat':20.951623, 'lon':107.08521}],
    # Johor–Singapore is a short-water border; include the other side so
    # nearest-city and P17 checks do not assign a neighbour country's landmarks.
    'sg': [{'id':'johor', 'lat':1.4555555555556, 'lon':103.76111111111, 'country':'my'}],
    'my': [
        {'id':'singapore', 'lat':1.3, 'lon':103.8, 'country':'sg'},
        {'id':'jurong', 'lat':1.3166722222222, 'lon':103.71689444444, 'country':'sg'},
        {'id':'changi', 'lat':1.353888888888889, 'lon':103.97472222222223, 'country':'sg'},
    ],
}
COUNTRY_Q = {'vn':'Q881','th':'Q869','sg':'Q334','my':'Q833','id':'Q252','ph':'Q928'}

# More useful visitor labels than overly broad Wikidata parent classes.
TYPE_OVERRIDES = {'Q3162430':'zoo', 'Q3034913':'zoo', 'Q3576017':'zoo',
                  'Q1132057':'aquarium', 'Q262459':'monument', 'Q110354503':'museum'}
# Explicit usual-departure exceptions to the inland 12 km rule.
DAY_TRIPS = {
    'chiangmai': {'Q15708582': 'Op Khan: established Chiang Mai half/day excursion (KKday tour 166269; local route guides)'},
    'ayutthaya': {'Q2522114': 'Bang Pa-In: classic Ayutthaya palace excursion'},
    'bacninh': {'Q1091048': 'But Thap: standard Kinh Bac province temple circuit',
                'Q180566': 'Ly Bat De: standard Bac Ninh province shrine visit',
                'Q2857598': 'Dau: standard Kinh Bac province temple circuit'},
}
# Named civic/cultural OSM records reviewed in the pilot. No invented labels.
OSM_INCLUDE = {
    'osm:node/2797512242': 'Bao Dai Villa: historic royal residence',
    'osm:node/14086666270': 'Military Region 3 museum: public military museum',
    'osm:way/240479613': 'Vietnam Navy museum: public military museum',
    'osm:way/962922519': 'Vietnam Cement Museum: industrial heritage museum',
    'osm:way/1049831208': 'Hai Phong Museum: civic city museum',
    'osm:node/5158463023': 'Hung Quoc Convent: religious landmark',
}
# Commercial classes are excluded even when also classified as museums/parks.
COMMERCIAL_CLASSES = {'Q194195', 'Q11315'}  # amusement park, shopping centre
REVIEW = []
CACHE_ONLY = False
WARNINGS = []
FAILURES = []
_last = 0

def fetch(url, params, attempts=3):
    global _last
    CACHE.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha256((url + json.dumps(params, sort_keys=True)).encode()).hexdigest()
    path = CACHE / (key + '.json')
    if path.exists():
        return json.loads(path.read_text())
    if CACHE_ONLY:
        raise RuntimeError(f'{url}: response not cached (cache-only build)')
    for attempt in range(attempts):
        time.sleep(max(0, 1.2 - (time.monotonic() - _last)))
        try:
            _last = time.monotonic()
            r = requests.get(url, params=params, headers={'User-Agent': UA}, timeout=(10, 70) if 'overpass' in url else (15, 100))
            r.raise_for_status()
            data = r.json()
            if 'error' in data:
                raise ValueError(str(data['error']))
            path.write_text(json.dumps(data, ensure_ascii=False))
            return data
        except (requests.RequestException, ValueError) as exc:
            if attempt == attempts - 1:
                raise RuntimeError(f'{url}: {exc}') from exc
            time.sleep(3 * (attempt + 1))

def cities():
    # Evaluate the existing static dictionary rather than duplicate its coordinates.
    code = "const fs=require('fs'),vm=require('vm');let c={window:{}};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),c); console.log(JSON.stringify(c.window.SEA_DATA.countries));"
    return json.loads(subprocess.check_output(['node', '-e', code, str(ROOT/'js/data.js')]))

def distance(a, b, c, d):
    p, q = math.radians(a), math.radians(c)
    v = math.sin((q-p)/2)**2 + math.cos(p)*math.cos(q)*math.sin(math.radians(d-b)/2)**2
    return 6371 * 2 * math.asin(min(1, math.sqrt(v)))

def clean(value):
    return html.unescape(re.sub('<[^>]+>', '', value or '')).strip()

def sanitise_author(value):
    value = clean(value)
    value = re.sub(r'\s+', ' ', value).strip()
    value = re.sub(r'^.*?\.(?:jpg|jpeg|png|svg):\s*', '', value, flags=re.I)
    value = re.sub(r'^No machine-readable author provided\.\s*', '', value, flags=re.I)
    value = re.sub(r'\s+assumed\s*\(based on copyright claims\)\.?$', '', value, flags=re.I)
    value = re.sub(r'^Photographer:\s*', '', value, flags=re.I)
    value = re.sub(r'\s+at\s+[a-z-]+\.wikipedia$', '', value, flags=re.I)
    value = re.sub(r'^The original uploader was (.*?) at .*$', r'\1', value, flags=re.I)
    value = re.sub(r'^This Photo was taken by ([^.]+).*$', r'\1', value, flags=re.I)
    value = re.split(r'\s*\(|\s+from\s+|\s+\d{1,2}:\d{2},|[.;]\s*(?:Feel free|Please|Permission|This)', value, flags=re.I)[0]
    return value.strip(' .;,')[:40].rstrip()


def photo(filename):
    try:
        def thumbnail(width):
            return fetch('https://commons.wikimedia.org/w/api.php', {
                'action':'query', 'format':'json', 'prop':'imageinfo', 'iiprop':'url|extmetadata',
                'iiurlwidth':width, 'titles':'File:' + filename})
        data = thumbnail(330)
        large = thumbnail(500)
        for page in data['query']['pages'].values():
            for info in page.get('imageinfo', []):
                meta = info.get('extmetadata', {})
                val = lambda k: clean(meta.get(k, {}).get('value', ''))
                license = val('LicenseShortName')
                if not re.fullmatch(r'CC(?:0(?: 1\.0)?| BY(?:-SA)?(?: \d+(?:\.\d+)?)?)', license):
                    return None
                author, license_url = sanitise_author(val('Artist')), val('LicenseUrl')
                if not author or not license_url or not (info.get('thumburl') or info.get('url')):
                    return None
                if license_url.startswith('//'):
                    license_url = 'https:' + license_url
                # Ask Commons for both sizes; it may round 500 to a supported
                # bucket (currently 500). Always describe the actual pixel width,
                # never manufacture a /500px- URL. Small originals are allowed.
                big = next((i for p in large['query']['pages'].values()
                            for i in p.get('imageinfo', [])), info)
                def size(i):
                    return i.get('thumbwidth', i.get('width'))
                return {'author':author, 'license':license, 'licenseUrl':license_url,
                        'filePage':info['descriptionurl'],
                        'thumb330':info.get('thumburl', info['url']), 'width330':size(info),
                        'thumb500':big.get('thumburl', big['url']), 'width500':size(big)}
    except RuntimeError as exc:
        FAILURES.append(str(exc))
    return None

def build_city(city, neighbours, relaxed=False):
    if city['id'] == 'bacgiang':
        return []  # Known inland coverage gap; never pad with Bac Ninh venues.
    required = WHITELIST.get(city['id'], {})
    radius, minimum = (30, 1) if relaxed else (18, 2)
    values = ' '.join('wd:'+q for q in TYPES)
    query = f'''SELECT DISTINCT ?item ?coord ?distance ?links ?kind WHERE {{
      SERVICE wikibase:around {{ ?item wdt:P625 ?coord .
        bd:serviceParam wikibase:center "Point({city['lon']} {city['lat']})"^^geo:wktLiteral;
        wikibase:radius "{radius}"; wikibase:distance ?distance. }}
      VALUES ?kind {{ {values} }}
      ?item wdt:P31/wdt:P279* ?kind; wikibase:sitelinks ?links.
      FILTER(?links >= {minimum})
    }}'''
    try:
        rows = fetch('https://query.wikidata.org/sparql', {'query':query,'format':'json'})['results']['bindings']
    except RuntimeError:
        # WDQS occasionally expands the subclass graph before the spatial
        # service. Disable reordering on retry so geography bounds work first.
        bounded = query.replace('WHERE {', 'WHERE { hint:Query hint:optimizer "None" .', 1)
        rows = fetch('https://query.wikidata.org/sparql', {'query':bounded,'format':'json'})['results']['bindings']
    candidates = {}
    for row in rows:
        qid = row['item']['value'].split('/')[-1]
        kind = TYPES[row['kind']['value'].split('/')[-1]]
        # Bound the ranking pool geographically before taking the top 32.
        # Otherwise Bangkok's popular venues crowd out nearby Samut Prakan
        # records even though those Bangkok venues are rejected later.
        point = re.fullmatch(r'Point\(([-+\d.eE]+) ([-+\d.eE]+)\)', row['coord']['value'])
        if point:
            lng, lat = map(float, point.groups())
            km = distance(city['lat'],city['lon'],lat,lng)
            reason = None
            if any(n['id']!=city['id'] and distance(n['lat'],n['lon'],lat,lng)<km for n in neighbours):
                reason = 'Nearer to another city attractions origin (before ranking)'
            elif km>12 and not(city['coastal'] or city['island'] or qid in DAY_TRIPS.get(city['id'],{})):
                reason = 'Inland >12 km without usual-departure evidence (before ranking)'
            if reason and qid not in required:
                REVIEW.append({'city':city['id'],'id':qid,'km':round(km,2),'action':'remove','reason':reason})
                continue
        if qid not in candidates:
            candidates[qid] = {'links':int(row['links']['value']), 'type':kind}
        elif list(TYPES.values()).index(kind) < list(TYPES.values()).index(candidates[qid]['type']):
            candidates[qid]['type'] = kind
    ranked = sorted(candidates, key=lambda q:(-candidates[q]['links'],q))[:32]
    if not ranked and not required:
        return []
    entities = fetch('https://www.wikidata.org/w/api.php', {'action':'wbgetentities','format':'json',
        'ids':'|'.join(ranked), 'props':'labels|claims|descriptions','languages':'|'.join(['zh-hans','zh-cn'] + LANGS)})['entities'] if ranked else {}
    if required:
        explicit = fetch('https://www.wikidata.org/w/api.php', {'action':'wbgetentities','format':'json',
            'ids':'|'.join(required), 'props':'labels|claims|descriptions|sitelinks',
            'languages':'|'.join(['zh-hans','zh-cn'] + LANGS)})['entities']
        entities.update(explicit)
        for qid, entry in required.items():
            candidates[qid] = {'links':len(explicit[qid].get('sitelinks',{})), 'type':entry['type']}
        ranked = list(required) + [qid for qid in ranked if qid not in required]
    result = []
    for qid in ranked:
        if qid in EXCLUDE or qid in CITY_EXCLUDE.get(city['id'], set()):
            REVIEW.append({'city':city['id'], 'id':qid, 'action':'remove', 'reason':EXCLUDE.get(qid, 'Neighbouring city venue')})
            continue
        entity = entities[qid]
        claims = entity.get('claims', {})
        classes = {x['mainsnak'].get('datavalue',{}).get('value',{}).get('id') for x in claims.get('P31',[])}
        countries = {x['mainsnak'].get('datavalue',{}).get('value',{}).get('id') for x in claims.get('P17',[])}
        expected = COUNTRY_Q.get(city.get('country'))
        if expected and countries and expected not in countries:
            REVIEW.append({'city':city['id'],'id':qid,'action':'remove','reason':'Wikidata P17 is a different country'})
            continue
        description = ' '.join(x['value'] for x in entity.get('descriptions',{}).values()).lower()
        if qid not in required and qid not in COMMERCIAL_EXCEPTIONS and (classes & COMMERCIAL_CLASSES or re.search(r'theme park|amusement park|water park|shopping mall|shopping cent(?:er|re)|crocodile farm|animal show|night safari', description)):
            REVIEW.append({'city':city['id'], 'id':qid, 'action':'remove', 'reason':'Commercial amusement / shopping venue'})
            continue
        # Demolished/dissolved sites are unsuitable current visitor suggestions.
        if claims.get('P576'):
            continue
        points = [x['mainsnak'].get('datavalue',{}).get('value') for x in claims.get('P625',[])
                  if x.get('rank') != 'deprecated']
        points = [p for p in points if isinstance(p,dict) and p.get('globe','').endswith('Q2')]
        if not points:
            continue
        p = points[0]; lat, lng = p['latitude'], p['longitude']
        km = distance(city['lat'],city['lon'],lat,lng)
        if km>radius and qid not in required:
            REVIEW.append({'city':city['id'],'id':qid,'km':round(km,2),'action':'remove','reason':'Outside query radius after entity coordinate check'})
            continue
        if km > 12:
            reason = DAY_TRIPS.get(city['id'], {}).get(qid)
            keep = bool(qid in required or city['coastal'] or city['island'] or reason)
            if not keep:
                REVIEW.append({'city':city['id'], 'id':qid, 'km':round(km,2),
                               'action':'remove', 'reason':'Inland >12 km without usual-departure evidence'})
                continue
        # Avoid borrowing a neighbouring pilot city's landmarks. The 8 km
        # core remains eligible; outside it require this to be the nearest
        # attractions reference point in the country (conservative regional selection).
        if qid not in required and any(n['id']!=city['id'] and
                distance(n['lat'],n['lon'],lat,lng)<km for n in neighbours):
            REVIEW.append({'city':city['id'],'id':qid,'km':round(km,2),'action':'remove','reason':'Nearer to another official city attractions origin'})
            continue
        labels = {k:v['value'] for k,v in entity.get('labels',{}).items()}
        fallback = labels.get('en') or labels.get('vi') or labels.get('th') or next(iter(labels.values()),None)
        if not fallback:
            continue
        # Distinct QIDs can describe the same physical site; avoid near-identical names.
        if any(a['name']['en'].casefold()==fallback.casefold() or
               (distance(lat,lng,a['lat'],a['lng'])<0.08 and a['type']==candidates[qid]['type']) for a in result):
            continue
        images = claims.get('P18',[])
        filename = next((x['mainsnak'].get('datavalue',{}).get('value') for x in images if x.get('rank')!='deprecated'), None)
        result.append({'qid':qid, 'name':{k:source_text(entity.get('labels',{}),k,fallback) for k in LANGS},
            'type':TYPE_OVERRIDES.get(qid,candidates[qid]['type']), 'lat':lat, 'lng':lng,
            'sitelinks':candidates[qid]['links'],
            'intro':{k:source_text(entity.get('descriptions',{}),k) for k in LANGS},
            'maps':f'https://www.google.com/maps/search/?api=1&query={lat},{lng}',
            'photo':photo(filename) if filename else None})
        if qid in required:
            REVIEW.append({'city':city['id'],'id':qid,'km':round(km,2),'action':'keep',
                           'reason':required[qid]['reason']})
        elif km>12:
            REVIEW.append({'city':city['id'],'id':qid,'km':round(km,2),'action':'keep',
                           'reason':DAY_TRIPS.get(city['id'],{}).get(qid,'Coastal/island regional attraction within query radius')})
        if len(result)==8:
            break
    missing = set(required) - {a['qid'] for a in result}
    if missing:
        raise RuntimeError(f"{city['id']}: required attractions failed source validation: {sorted(missing)}")
    return result

def add_osm(city, neighbours, items):
    query = f'[out:json][timeout:60];nwr(around:30000,{city["lat"]},{city["lon"]})[tourism~"^(attraction|museum|viewpoint)$"];out center tags;'
    endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']
    # Check both mirror caches first, avoiding repeated calls to a failed host.
    data = None
    for endpoint in endpoints:
        key = hashlib.sha256((endpoint + json.dumps({'data':query}, sort_keys=True)).encode()).hexdigest()
        cached = CACHE / (key + '.json')
        if cached.exists():
            data = json.loads(cached.read_text())
            break
    if data is None:
        for endpoint in endpoints:
            try:
                data = fetch(endpoint, {'data':query}, attempts=1)
                break
            except RuntimeError:
                if endpoint == endpoints[-1]:
                    # A nearby cached spatial query remains valid source data,
                    # though it may not cover the entire new radius edge.
                    # Never change distance origins to fit a cached query.
                    if city['id']=='haiphong':
                        old_query='[out:json][timeout:60];nwr(around:30000,20.8,106.66666666667)[tourism~"^(attraction|museum|viewpoint)$"];out center tags;'
                        key=hashlib.sha256((endpoints[0]+json.dumps({'data':old_query},sort_keys=True)).encode()).hexdigest()
                        cached=CACHE/(key+'.json')
                        if cached.exists():
                            data=json.loads(cached.read_text())
                            WARNINGS.append('haiphong: live OSM endpoints unavailable; reused cached 30 km Q72818 P625 area (20.8,106.666667), re-filtered against central attractions origin; radius-edge coverage may be incomplete')
                            break
                    raise
    elements=sorted(data.get('elements', []), key=lambda e:(
        0 if e.get('tags',{}).get('tourism')=='museum' else
        1 if e.get('tags',{}).get('amenity')=='place_of_worship' else
        2 if e.get('tags',{}).get('natural') else 3, e['id']))
    for el in elements:
        if len(items)>=8:
            break
        tags=el.get('tags', {}); oid=f"osm:{el['type']}/{el['id']}"
        name=tags.get('name:en') or tags.get('name')
        p=el.get('center',el); lat,lng=p.get('lat'),p.get('lon')
        if not name or lat is None or lng is None or tags.get('access') in {'no','private'}:
            continue
        qid=tags.get('wikidata')
        if oid in EXCLUDE or qid in EXCLUDE or qid in CITY_EXCLUDE.get(city['id'],set()):
            REVIEW.append({'city':city['id'],'id':oid,'action':'remove','reason':EXCLUDE.get(oid,EXCLUDE.get(qid,'Neighbour city venue'))})
            continue
        # Conservative OSM commercial gate: identified private attractions,
        # amusement/retail facilities and animal farms are never supplements.
        if qid not in COMMERCIAL_EXCEPTIONS and (tags.get('leisure') in {'water_park','amusement_arcade'} or tags.get('shop') or
            tags.get('attraction') in {'theme_park','amusement_ride','animal'} or
            tags.get('operator:type') in {'private','commercial'} or
            re.search(r'vinwonders|vinpearl|grand world|safari|theme park|amusement|crocodile|shopping|mall|farm|raceway|fish sauce|animal show',name,re.I)):
            REVIEW.append({'city':city['id'],'id':oid,'action':'remove','reason':'Commercial leisure / retail OSM venue'})
            continue
        # Only identifiable civic, religious or natural OSM supplements.
        # Generic trail starts, ferry stops and unreviewed private POIs are not filler.
        if not (tags.get('natural') or tags.get('historic') or tags.get('amenity')=='place_of_worship' or
                tags['tourism']=='viewpoint' or qid or oid in OSM_INCLUDE):
            continue
        km=distance(city['lat'],city['lon'],lat,lng)
        if km>30 or (km>8 and any(n['id']!=city['id'] and distance(n['lat'],n['lon'],lat,lng)<km for n in neighbours)):
            REVIEW.append({'city':city['id'],'id':oid,'km':round(km,2),'action':'remove','reason':'Outside 30 km or nearer to another city attractions origin'})
            continue
        if any(a['qid']==qid or a['name']['en'].casefold()==name.casefold() or distance(lat,lng,a['lat'],a['lng'])<0.15 for a in items):
            continue
        filename=tags.get('wikimedia_commons','')
        pic=photo(filename[5:]) if filename.startswith('File:') else None
        names={k:tags.get('name:'+k,name) for k in LANGS}
        names['zh']=SIMPLIFY.convert(tags.get('name:zh-Hans') or tags.get('name:zh-CN') or names['zh'])
        intros={k:'' for k in LANGS}; links=0
        if qid:
            entity=fetch('https://www.wikidata.org/w/api.php',{'action':'wbgetentities','format':'json',
                'ids':qid,'props':'labels|descriptions|claims|sitelinks','languages':'|'.join(['zh-hans','zh-cn']+LANGS)})['entities'][qid]
            descriptions=entity.get('descriptions',{})
            if qid not in COMMERCIAL_EXCEPTIONS and re.search(r'theme park|amusement park|water park|shopping mall|shopping cent(?:er|re)|crocodile farm|animal show|night safari',source_text(descriptions,'en'),re.I):
                REVIEW.append({'city':city['id'],'id':qid,'action':'remove','reason':'Commercial Wikidata-linked OSM venue'})
                continue
            names={k:source_text(entity.get('labels',{}),k,names[k]) for k in LANGS}
            intros={k:source_text(descriptions,k) for k in LANGS};links=len(entity.get('sitelinks',{}))
            image=next((x['mainsnak'].get('datavalue',{}).get('value') for x in entity.get('claims',{}).get('P18',[]) if x.get('rank')!='deprecated'),None)
            if image: pic=photo(image)
        items.append({'qid':qid or oid,'name':names,'type':tags['tourism'],'lat':lat,'lng':lng,
                      'sitelinks':links,'intro':intros,
                      'maps':f'https://www.google.com/maps/search/?api=1&query={lat},{lng}',
                      'photo':pic,'source':f"https://www.openstreetmap.org/{el['type']}/{el['id']}"})
        if km>12:
            REVIEW.append({'city':city['id'],'id':oid,'km':round(km,2),'action':'keep','reason':'Sparse coastal/island OSM supplement within 30 km'})
    return items

def main():
    global CACHE_ONLY
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--country',default='all',help='comma-separated country ids, or all')
    parser.add_argument('--city', help='comma-separated city ids; preserve all other cities')
    parser.add_argument('--cache-only',action='store_true',help='Rebuild from verified HTTP cache without network requests')
    args=parser.parse_args()
    CACHE_ONLY=args.cache_only
    official=cities()
    selected=[c for c in official if args.country=='all' or c['id'] in args.country.split(',')]
    if args.country!='all' and set(args.country.split(',')) - {c['id'] for c in official}:
        parser.error('Unknown country id')
    selected_cities = set(args.city.split(',')) if args.city else None
    if selected_cities and selected_cities - {c['id'] for country in selected for c in country['cities']}:
        parser.error('Unknown city id for selected countries')
    output={'meta':{'generatedAt':datetime.now(timezone.utc).isoformat(),
        'source':'Wikidata SPARQL + entity API; OpenStreetMap Overpass; Wikimedia Commons extmetadata',
        'countries':[c['id'] for c in selected], 'cityCount':sum(len(c['cities']) for c in selected),
        'radiusKm':18, 'ranking':'Wikidata sitelinks descending; minimum 2; maximum 8',
        'nameFallback':'English, then Vietnamese/Thai, then available label',
        'locationFilter':'18 km maximum; beyond 8 km must be nearest official city point in country',
        'reviewedExclusions':EXCLUDE,
        'reviewedTypes':TYPE_OVERRIDES,
        'mustSeeWhitelist':WHITELIST,
        'commercialExceptions':sorted(COMMERCIAL_EXCEPTIONS),
        'cityExclusions':{k:sorted(v) for k,v in CITY_EXCLUDE.items()},
        'failures':FAILURES},'countries':{}}
    for country in selected:
        output['countries'][country['id']]={}
        neighbours = [attraction_origin(c) for c in country['cities']] + REGIONAL_NEIGHBOURS.get(country['id'], [])
        for weather_city in country['cities']:
            if selected_cities and weather_city['id'] not in selected_cities:
                continue
            city = attraction_origin(weather_city)
            city['country']=country['id']
            print(f"Building {country['id']}/{city['id']}",flush=True)
            try:
                items=build_city(city, neighbours)
                if len(items)<4 and (city['coastal'] or city['island']):
                    items=build_city(city, neighbours, relaxed=True)
                    try:
                        items=add_osm(city, neighbours, items)
                    except RuntimeError as exc:
                        # A supplemental-source outage must never erase the
                        # valid Wikidata result. Surface the coverage limit.
                        WARNINGS.append(f"{city['id']}: OSM supplement unavailable; retained {len(items)} verified Wikidata attractions: {exc}")
            except RuntimeError as exc:
                print(str(exc), flush=True)
                FAILURES.append(f"{city['id']}: {exc}")
                items=[]
            output['countries'][country['id']][city['id']]=items
            print(f'  {len(items)} attractions',flush=True)
    reviewed={}
    for row in REVIEW:
        reviewed[(row['city'],row['id'],row['action'],row['reason'])]=row
    output['meta'].update(attractionsOrigins=ORIGINS, review=list(reviewed.values()),
        radiusKm=18, sparseCoastalRadiusKm=30,
        locationFilter='Reference origins; inland >12 km only reviewed usual-departure exceptions; nearest-city beyond 8 km',
        ranking='City must-sees first; otherwise Wikidata sitelinks descending; minimum 2 (sparse coastal 1); max 8; OSM supplements',
        chinese='zh-hans, zh-cn, zh; OpenCC t2s for names and intros', warnings=WARNINGS,
        regionalNeighbours=REGIONAL_NEIGHBOURS)
    if FAILURES:
        raise RuntimeError('Build incomplete; retaining previous output: ' + '; '.join(FAILURES))
    target=ROOT/'data/attractions.json'
    if target.exists():
        previous=json.loads(target.read_text())
        rebuilt = {city for cities in output['countries'].values() for city in cities}
        output['meta']['warnings'] = [w for w in previous['meta'].get('warnings', [])
                                      if w.split(':', 1)[0] not in rebuilt] + WARNINGS
        fresh_review = output['meta']['review']
        merged_review, inserted = [], set()
        for row in previous['meta'].get('review', []):
            city_id = row['city']
            if city_id not in rebuilt:
                merged_review.append(row)
            elif city_id not in inserted:
                merged_review.extend(r for r in fresh_review if r['city'] == city_id)
                inserted.add(city_id)
        merged_review.extend(r for r in fresh_review if r['city'] not in inserted)
        output['meta']['review'] = merged_review
        for cid, data in previous['countries'].items():
            if cid not in output['countries']:
                output['countries'][cid]=data
            else:
                for city_id, items in data.items():
                    output['countries'][cid].setdefault(city_id, items)
        output['countries'] = {cid:output['countries'][cid] for cid in dict.fromkeys(list(previous['countries']) + list(output['countries']))}
    output['meta'].update(countries=list(output['countries']),
        cityCount=sum(len(cities) for cities in output['countries'].values()),
        buildScope={'country':args.country, 'city':args.city})
    target.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
    print(f'{target}: {target.stat().st_size} bytes')

if __name__=='__main__':
    main()
