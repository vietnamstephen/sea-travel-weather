import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

type Hospital = {
  id: string;
  city: string;
  name: Record<string, string>;
  ownership: 'public' | 'private';
  intl: boolean;
  pti: boolean;
  er24: boolean;
  address: string;
  phone: string;
  lat: number;
  lng: number;
  rank: number;
  sources: string[];
  checkedAt: string;
  ptiCheckedAt: string | null;
  ptiSource: string | null;
  reviewNote: string;
};

const data: any = JSON.parse(fs.readFileSync('data/hospitals.json', 'utf8'));
const LANGS = ['zh', 'en', 'vi', 'th', 'id'];
const MIN_PER_CITY = 2;

// The only official PTI sources that may back a pti=true flag (P-hospital spec + task card).
const PTI_SOURCE_URL = 'https://www.pti.com.vn/tra-cuu-co-so-y-te';
const PTI_LIST_URLS = [
  'https://new.pti.com.vn/wp-content/uploads/2026/10/Danh-sach-CSYT-bao-lanh-qua-INSMART.pdf',
  'https://new.pti.com.vn/wp-content/uploads/2026/10/Danh-sach-CSYT-bao-lanh-qua-FHVI.pdf',
];
// Facilities confirmed against the official INSMART/FHVI lists in the committed
// pilot review (checkedAt 2026-11-15). Extend only after re-verifying the official source.
const PTI_ROSTER = new Set([
  'osm:way/187949834',
  'osm:way/240457738',
  'osm:way/372433638',
  'osm:node/729405662',
  'osm:node/729405667',
  'osm:node/7541325568',
]);

function allHospitals(): Array<[string, string, Hospital]> {
  const out: Array<[string, string, Hospital]> = [];
  for (const [cid, cities] of Object.entries(data.countries)) {
    for (const [city, items] of Object.entries(cities as Record<string, Hospital[]>)) {
      for (const h of items) out.push([cid, city, h]);
    }
  }
  return out;
}

test('schema: every hospital has complete, typed fields and contiguous ranks', () => {
  assert.equal(data.meta.thresholds.minHospitalsPerCity, MIN_PER_CITY);
  assert.ok(data.meta.updatedAt && data.meta.osmCheckedAt);
  assert.ok(data.meta.pti.checkedAt);
  for (const [cid, city, h] of allHospitals()) {
    assert.match(h.id, /^osm:(node|way|relation)\/\d+$/);
    assert.equal(h.city, city);
    assert.deepEqual(Object.keys(h.name).sort(), [...LANGS].sort());
    assert.ok(Object.values(h.name).every((v) => typeof v === 'string' && v.length > 0));
    assert.ok(h.ownership === 'public' || h.ownership === 'private');
    assert.equal(typeof h.intl, 'boolean');
    assert.equal(typeof h.pti, 'boolean');
    assert.equal(typeof h.er24, 'boolean');
    assert.equal(typeof h.address, 'string');
    assert.ok(h.address.length > 0);
    assert.equal(typeof h.phone, 'string');
    assert.equal(typeof h.lat, 'number');
    assert.equal(typeof h.lng, 'number');
    assert.ok(Number.isInteger(h.rank) && h.rank >= 1);
    assert.ok(Array.isArray(h.sources) && h.sources.length >= 1);
    assert.ok(h.checkedAt);
  }
  for (const cities of Object.values(data.countries)) {
    for (const items of Object.values(cities as Record<string, Hospital[]>)) {
      assert.deepEqual(
        items.map((x) => x.rank).sort((a, b) => a - b),
        items.map((_, i) => i + 1),
      );
    }
  }
});

test('per-city count: >= MIN (all with phone) or explicitly documented as insufficient', () => {
  const insufficient = data.meta.insufficientCities as Record<
    string,
    { country: string; published: number; reason: string }
  >;
  const below: Record<string, number> = {};
  for (const [cid, cities] of Object.entries(data.countries)) {
    for (const [city, items] of Object.entries(cities as Record<string, Hospital[]>)) {
      assert.ok(city in data.meta.coverage, `${city} missing from meta.coverage`);
      if (items.length < MIN_PER_CITY) below[city] = items.length;
      for (const h of items) {
        assert.ok(h.phone && typeof h.phone === 'string', `${h.id} has no usable phone`);
      }
      if (insufficient[city]) {
        assert.ok(items.length < MIN_PER_CITY, `${city} documented insufficient but has >= ${MIN_PER_CITY}`);
        assert.equal(insufficient[city].published, items.length, `${city} documented count mismatch`);
        assert.equal(insufficient[city].country, cid, `${city} documented country mismatch`);
        assert.ok(insufficient[city].reason.length > 10, `${city} missing reason`);
      } else {
        assert.ok(items.length >= MIN_PER_CITY, `${city} has only ${items.length} hospitals and is not documented as insufficient`);
      }
    }
  }
  // Documentation must exactly match reality: no stale entries, no undocumented gaps.
  assert.deepEqual(Object.keys(insufficient).sort(), Object.keys(below).sort());
});

test('phone format: E.164 per country, no duplicates', () => {
  const rx: Record<string, RegExp> = {
    vn: /^\+84[1-9][0-9]{7,10}$/,
    th: /^\+66[1-9][0-9]{7,10}$/,
  };
  const seen = new Set<string>();
  for (const [cid, , h] of allHospitals()) {
    assert.match(h.phone, rx[cid], `${h.id}: ${h.phone}`);
    const key = `${cid}:${h.phone}`;
    assert.ok(!seen.has(key), `duplicate phone ${h.phone} in ${cid}`);
    seen.add(key);
  }
});

test('pti only within the official roster and official list sources', () => {
  assert.equal(data.meta.pti.sourceUrl, PTI_SOURCE_URL);
  assert.deepEqual([...data.meta.pti.listUrls].sort(), [...PTI_LIST_URLS].sort());
  for (const [, , h] of allHospitals()) {
    assert.equal(h.pti, PTI_ROSTER.has(h.id), `${h.id}: pti flag must match the verified roster`);
    if (h.pti) {
      assert.ok(PTI_LIST_URLS.includes(h.ptiSource as string), `${h.id}: ptiSource must be an official PTI list`);
      assert.ok(h.ptiCheckedAt, `${h.id}: pti must carry a check date`);
    } else {
      assert.equal(h.ptiSource, null, `${h.id}: unverified record must have ptiSource=null`);
      assert.equal(h.ptiCheckedAt, null, `${h.id}: unverified record must have ptiCheckedAt=null`);
    }
  }
  const published = new Set(allHospitals().map(([, , h]) => h.id));
  for (const id of PTI_ROSTER) assert.ok(published.has(id), `roster id ${id} is not published`);
});

test('build is reproducible: regenerated output equals committed data/hospitals.json', () => {
  const py = 'import json; from scripts.build_hospitals import build; print(json.dumps(build(), ensure_ascii=False, indent=2))';
  const generated = execFileSync('python3', ['-B', '-c', py], {
    encoding: 'utf8',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  });
  assert.equal(generated, fs.readFileSync('data/hospitals.json', 'utf8'));
});
