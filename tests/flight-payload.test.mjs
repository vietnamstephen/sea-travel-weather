import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/flight-9g824.json'), 'utf8'));

function load() {
  const window = { SEA_CONFIG: {}, SEA_APP: { lang: 'zh' } };
  const document = { body: { getAttribute: () => '' }, getElementById: () => null, addEventListener() {}, createElement() { return {}; } };
  const ctx = { window, document };
  for (const file of ['js/data.js', 'js/risk.js', 'js/i18n.js', 'js/trips.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx);
  }
  return window.SEA_TRIPS;
}

test('parses the cached 9G824 MCP Python-repr payload after a Flight details label', () => {
  const api = load();
  const text = fixture.data.content[0].text;
  assert.match(text, /^Flight details: \{/);
  assert.equal(text.includes("'FlightNo': '9G824'"), true);
  assert.equal(text.includes('None'), true);
  assert.equal(text.includes('D1、D2号门'), true);
  const rows = api.extractFlights(fixture);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].FlightNo, '9G824');
  assert.equal(rows[0].FlightDepcode, 'SGN');
  assert.equal(rows[0].FlightArrcode, 'HAN');
  assert.equal(rows[0].FlightState, '计划');
  assert.equal(rows[0].FlightYear, null);
  assert.equal(rows[0].FlightDeptimePlanDate, '2026-11-16 09:25:00');
  assert.equal(rows[0].CheckDoor, 'D1、D2号门');
  const parsed = api.parseFlightPayload(fixture.data);
  assert.equal(parsed.code, 200);
  assert.equal(parsed.message, 'Success');
});

test('rejects a provider error payload and accepts a bare labelled dict', () => {
  const api = load();
  assert.throws(() => api.extractFlights({ ok: true, data: { content: [{ text: "Flight details: {'code': 500, 'message': 'busy', 'data': []}" }] } }), /provider/);
  const rows = api.extractFlights("Flight details: {'code': 200, 'data': [{'FlightNo': 'VN123', 'FlightDepcode': 'SGN'}]}");
  assert.equal(rows[0].FlightNo, 'VN123');
});

test('maps city shorthands and aliases to IATA codes instead of inventing a 3-letter airport', () => {
  const api = load();
  const sgn = ['hcm', 'HCM', 'saigon', 'Sai Gon', 'ho chi minh', 'Ho Chi Minh City', 'tphcm', 'HCMC', '胡志明市'];
  for (const value of sgn) assert.equal(api.airportCode(value), 'SGN', value);
  const han = ['hanoi', 'Ha Noi', 'Hà Nội', '河内', 'HAN'];
  for (const value of han) assert.equal(api.airportCode(value), 'HAN', value);
  assert.equal(api.airportCode('danang'), 'DAD');
  assert.equal(api.airportCode('Da Nang'), 'DAD');
  assert.equal(api.airportCode('kl'), 'KUL');
  assert.equal(api.airportCode('Kuala Lumpur'), 'KUL');
  assert.equal(api.airportCode('denpasar'), 'DPS');
  assert.equal(api.airportCode('bali'), 'DPS');
  assert.equal(api.airportCode('BKK'), 'BKK');
  assert.equal(api.airportCode('not-a-place'), '');
  // Unknown 3-letter values may still be used as IATA, but known city ids win.
  assert.equal(api.airportCode('XYZ'), 'XYZ');
  assert.notEqual(api.airportCode('hcm'), 'HCM');
});
