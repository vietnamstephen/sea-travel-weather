import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// js/app.js 是浏览器 IIFE，无法直接 import。按注释边界把自包含纯函数块
// 提取到 vm 里运行（与 tests/attractions.test.mjs 相同的约定）。
const source = fs.readFileSync('js/app.js', 'utf8');
const START = '/* hospitals-ui:pure:start';
const END = '/* hospitals-ui:pure:end */';
const from = source.indexOf(START);
const to = source.indexOf(END) + END.length;
assert.ok(from >= 0 && to > from, 'pure-function block markers must exist in js/app.js');
const block = source.slice(from, to);
const ctx: Record<string, any> = {};
vm.runInNewContext(block, ctx);

type Fns = {
  hospitalDistance: (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => number;
  formatHospitalDistance: (km: number) => string;
  hospitalBadges: (h: { ownership: string; intl: boolean; pti: boolean }) => string[];
  hospitalVisible: (items: unknown[], more: boolean, max: number) => unknown[];
  hospitalShowMore: (items: unknown[], more: boolean, max: number) => boolean;
  hospitalMoreDelta: (items: unknown[], max: number) => number;
  hospitalEmergency: (meta: { emergency?: Record<string, string> } | null, cid: string) => string;
  hospitalLocalPhone: (phone: string, cid: string) => string;
};
const F = ctx as Fns;
for (const name of Object.keys({
  hospitalDistance: 1, formatHospitalDistance: 1, hospitalBadges: 1, hospitalVisible: 1,
  hospitalShowMore: 1, hospitalMoreDelta: 1, hospitalEmergency: 1, hospitalLocalPhone: 1,
})) {
  assert.equal(typeof (F as any)[name], 'function', `${name} must be an extractable pure function`);
}

// vm 里构造的数组是跨 realm 的，deepStrictEqual 会比较原型；先归一到宿主 realm
const plain = (v: ArrayLike<unknown>): unknown[] => Array.from(v);
const items = (n: number): unknown[] => Array.from({ length: n }, (_, i) => ({ i }));
const data = JSON.parse(fs.readFileSync('data/hospitals.json', 'utf8'));
const badges = (h: { ownership: string; intl: boolean; pti: boolean }): string[] =>
  plain(F.hospitalBadges(h)) as string[];

test('haversine distance: known geodesics, symmetry, zero', () => {
  assert.ok(Math.abs(F.hospitalDistance({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })) < 1e-9);
  // 1° 纬度 ≈ 111.19 km
  const oneDeg = F.hospitalDistance({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
  assert.ok(Math.abs(oneDeg - 111.195) < 0.1, `expected ~111.195 km, got ${oneDeg}`);
  const a = { lat: 10.77, lng: 106.7 }, b = { lat: 16.07, lng: 108.22 };
  assert.equal(F.hospitalDistance(a, b), F.hospitalDistance(b, a));
  assert.ok(F.hospitalDistance(a, b) > 500, 'HCM→Da Nang should be several hundred km');
});

test('distance formatting: <1 km in m, >=1 km in one-decimal km', () => {
  assert.equal(F.formatHospitalDistance(0.85), '850 m');
  assert.equal(F.formatHospitalDistance(0.4), '400 m');
  assert.equal(F.formatHospitalDistance(0), '0 m');
  assert.equal(F.formatHospitalDistance(0.999), '999 m');
  assert.equal(F.formatHospitalDistance(1), '1.0 km');
  assert.equal(F.formatHospitalDistance(2.34), '2.3 km');
  assert.equal(F.formatHospitalDistance(12.36), '12.4 km');
  // 边界：低于 1 km 绝不带 "km"
  assert.ok(!F.formatHospitalDistance(0.9999).includes('km'));
});

test('badge order: ownership → intl → pti; pti only when data pti === true, no logo', () => {
  assert.deepEqual(badges({ ownership: 'public', intl: false, pti: false }), ['hosp.badge.public']);
  assert.deepEqual(badges({ ownership: 'private', intl: false, pti: false }), ['hosp.badge.private']);
  assert.deepEqual(badges({ ownership: 'public', intl: true, pti: false }),
    ['hosp.badge.public', 'hosp.badge.intl']);
  assert.deepEqual(badges({ ownership: 'private', intl: true, pti: true }),
    ['hosp.badge.private', 'hosp.badge.intl', 'hosp.badge.pti']);
  assert.deepEqual(badges({ ownership: 'public', intl: false, pti: true }),
    ['hosp.badge.public', 'hosp.badge.pti']);
  // 顺序恒定：公立/私立 永远在首位
  for (const h of [
    { ownership: 'private', intl: true, pti: true },
    { ownership: 'public', intl: false, pti: true },
  ]) assert.equal(badges(h)[0], `hosp.badge.${h.ownership}`);
  // pti 只认布尔 true：其它 truthy 值（数字 1、字符串）不得出现 PTI 标签
  const truthyButNotTrue: any = { ownership: 'public', intl: false, pti: 1 };
  assert.ok(!badges(truthyButNotTrue).includes('hosp.badge.pti'));
  truthyButNotTrue.pti = 'yes';
  assert.ok(!badges(truthyButNotTrue).includes('hosp.badge.pti'));
});

test('default 3 / more up to 6; 0-family empty; 1-family no more; reduced cap 5', () => {
  // 默认显示 3 家（不足 3 则全部）
  assert.equal(F.hospitalVisible(items(0), false, 6).length, 0);
  assert.equal(F.hospitalVisible(items(1), false, 6).length, 1);
  assert.equal(F.hospitalVisible(items(2), false, 6).length, 2);
  assert.equal(F.hospitalVisible(items(3), false, 6).length, 3);
  assert.equal(F.hospitalVisible(items(6), false, 6).length, 3);
  assert.equal(F.hospitalVisible(items(9), false, 6).length, 3);
  // 展开最多 6 家
  assert.equal(F.hospitalVisible(items(6), true, 6).length, 6);
  assert.equal(F.hospitalVisible(items(9), true, 6).length, 6);
  // 超限时把展开上限降到 5
  assert.equal(F.hospitalVisible(items(6), true, 5).length, 5);
  assert.equal(F.hospitalVisible(items(9), true, 5).length, 5);
  assert.equal(F.hospitalVisible(items(6), false, 5).length, 3, 'default stays 3 even when cap is 5');
  // 「更多」按钮：仅 item 数 > 3 且未展开时显示
  assert.equal(F.hospitalShowMore(items(0), false, 6), false);
  assert.equal(F.hospitalShowMore(items(1), false, 6), false, '1 家的城市不显示「更多」');
  assert.equal(F.hospitalShowMore(items(3), false, 6), false);
  assert.equal(F.hospitalShowMore(items(4), false, 6), true);
  assert.equal(F.hospitalShowMore(items(6), true, 6), false, '已展开不再显示');
  // +N 计数 = 展开后条数 - 默认条数
  assert.equal(F.hospitalMoreDelta(items(6), 6), 3);
  assert.equal(F.hospitalMoreDelta(items(6), 5), 2);
  assert.equal(F.hospitalMoreDelta(items(4), 6), 1);
  assert.equal(F.hospitalMoreDelta(items(1), 6), 0);
  // 真实数据对上号
  const danang = data.countries.vn.danang.length;
  const phuquoc = data.countries.vn.phuquoc.length;
  const bangkok = data.countries.th.bangkok.length;
  assert.equal(danang, 5, 'exclude non-hospital district health center');
  assert.equal(phuquoc, 0);
  assert.equal(bangkok, 1);
  assert.equal(F.hospitalVisible(data.countries.vn.danang, false, 6).length, 3);
  assert.equal(F.hospitalVisible(data.countries.vn.danang, true, 6).length, 5);
  assert.equal(F.hospitalShowMore(data.countries.vn.phuquoc, false, 6), false);
  assert.equal(F.hospitalShowMore(data.countries.th.bangkok, false, 6), false);
});

test('emergency number read by country from data meta (not hardcoded in UI)', () => {
  const meta = data.meta;
  assert.equal(meta.emergency.vn, '115');
  assert.equal(meta.emergency.th, '1669');
  assert.equal(F.hospitalEmergency(meta, 'vn'), '115');
  assert.equal(F.hospitalEmergency(meta, 'th'), '1669');
  assert.equal(F.hospitalEmergency(meta, 'id'), '119');
  assert.equal(F.hospitalEmergency(meta, 'sg'), '995');
  // 缺数据/未知国家 → 空串，绝不回退到写死的号码
  assert.equal(F.hospitalEmergency(meta, 'xx'), '');
  assert.equal(F.hospitalEmergency({}, 'vn'), '');
  assert.equal(F.hospitalEmergency(null, 'vn'), '');
  // 渲染代码用 hospitalEmergency(meta, CID) 取号，且急救条源码里没有写死 115/1669
  const render = source.slice(source.indexOf('function renderHospitals'), source.indexOf('function locateHospitals'));
  assert.match(render, /num = hospitalEmergency\(meta, CID\)/);
  assert.match(render, /hosp-emergency"\s+href="tel:' \+ esc\(num\)/);
  assert.ok(!/\b(115|1669|119)\b/.test(render), 'no literal emergency number in renderHospitals');
});

test('district health centers are excluded and verified Vietnamese hospital spelling is restored', () => {
  const vn = Object.values(data.countries.vn).flat() as any[];
  assert.ok(!vn.some((h) => h.id === 'osm:way/1226646134'), 'district health center is primary care, not a hospital');
  const binhDan = vn.find((h) => h.id === 'osm:node/729405667');
  assert.ok(binhDan);
  assert.equal(binhDan.name.vi, 'Bệnh viện Đa khoa Bình Dân');
  assert.match(binhDan.reviewNote, /binhdanhospital\.vn/);
});

test('local phone format beside E.164 tel:', () => {
  assert.equal(F.hospitalLocalPhone('+84919965125', 'vn'), '0919965125');
  assert.equal(F.hospitalLocalPhone('+6653936150', 'th'), '053936150');
  assert.equal(F.hospitalLocalPhone('+84919965125', 'sg'), '+84919965125', 'unknown cid leaves E.164 untouched');
  assert.equal(F.hospitalLocalPhone('02838222848', 'vn'), '02838222848', 'already-local number unchanged');
});
