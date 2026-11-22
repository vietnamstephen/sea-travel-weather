import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const pages = fs.readFileSync(new URL('../js/payment-pages.js', import.meta.url), 'utf8');
const i18n = fs.readFileSync(new URL('../js/i18n.js', import.meta.url), 'utf8');

test('consent defaults to denied and only loads GA after acceptance', () => {
  assert.match(app, /var consentEnabled = GA_MEASUREMENT_ID && location\.hostname === 'vietnamstephen\.github\.io'/);
  assert.match(app, /gtag\('consent', 'default', \{ ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' \}\)/);
  assert.match(app, /if \(value === 'accepted'\)[\s\S]*?gtag\('consent', 'update', \{ ad_storage: 'granted', analytics_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' \}\)[\s\S]*?loadAnalytics\(\)/);
  assert.match(app, /else if \(stored !== 'rejected'\) window\.SEA_CONSENT\.open\(\)/);
  assert.match(app, /localStorage\.setItem\(key, value\)/);
  assert.match(app, /value === 'accepted'[\s\S]*?\} else \{[\s\S]*?analytics_storage: 'denied'[\s\S]*?_ga/);
  assert.match(app, /data-cookie-settings/);
});

test('consent requests the analytics script only after the visitor accepts', () => {
  const requests = [];
  const clicks = {};
  const elements = new Map();
  const banner = {
    setAttribute() {},
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, {
        addEventListener(event, handler) { clicks[selector] = handler; }
      });
      return elements.get(selector);
    }
  };
  const document = {
    createElement: tag => tag === 'script' ? { dataset: {} } : banner,
    head: { appendChild: script => requests.push(new URL(script.src)) },
    body: { appendChild() {} }, querySelector: () => null,
    cookie: '', addEventListener() {}
  };
  const context = {
    document, window: {}, LANG: 'en', I: { t: key => key },
    location: { hostname: 'vietnamstephen.github.io', pathname: '/' },
    localStorage: { getItem: () => null, setItem() {} },
    GA_MEASUREMENT_ID: 'test'
  };
  const init = app.slice(app.indexOf('  function initConsent()'), app.indexOf('  var esc ='));
  vm.runInNewContext(init + '\ninitConsent();', context);
  clicks['[data-consent-reject]']();
  assert.equal(requests.filter(url => /(^|\.)(google-analytics|googletagmanager)\.com$/.test(url.hostname)).length, 0);
  clicks['[data-consent-accept]']();
  assert.deepEqual(requests.map(url => url.origin + url.pathname), ['https://www.googletagmanager.com/gtag/js']);
});

const window = {};
vm.runInNewContext(i18n, { window });
const { dict } = window.I18N;

test('all five refund translations cover the three plans, full refunds and renewals', () => {
  const expected = [
    ['7 天', '1 个月', '1 年', '14 天', '全额退款', '续费'],
    ['7-day', '1-month', '1-year', '14 days', 'full refund', 'renewal'],
    ['7 ngày', '1 tháng', '1 năm', '14 ngày', 'hoàn tiền toàn bộ', 'gia hạn'],
    ['7 วัน', '1 เดือน', '1 ปี', '14 วัน', 'คืนเต็มจำนวน', 'ต่ออายุ'],
    ['7 hari', '1 bulan', '1 tahun', '14 hari', 'pengembalian dana penuh', 'perpanjangan']
  ];
  expected.forEach((parts, i) => {
    for (const part of parts) assert.ok(dict['legal.refundSummary'][i].includes(part), part);
    assert.ok(dict['legal.refundInstructions'][i].includes('vietnamstephen@gmail.com'));
  });
});

test('seven-day plan labels stay in pricing keys in every language', () => {
  assert.equal(dict['pricing.segPass7'][1], '7 days');
  const labels = ['Trip Pack access (7 days)', ...dict['pricing.pass7']];
  for (const [key, row] of Object.entries(dict)) {
    if (key === 'pricing.pass7') continue;
    for (const value of row) assert.ok(!labels.some(label => value.includes(label)), key);
  }
});

test('refund page and terms share identical 14-day policy text', () => {
  const html = fs.readFileSync(new URL('../refund.html', import.meta.url), 'utf8');
  const terms = fs.readFileSync(new URL('../terms.html', import.meta.url), 'utf8');
  assert.match(html, /data-page="refund"/);
  assert.match(html, /canonical.*refund\.html/);
  assert.match(pages, /id="refund"[^\n]+legal\.refundSummary[^\n]+legal\.refundInstructions/);
  assert.match(pages, /page === 'terms' \|\| page === 'refund'/);
  assert.match(pages, /class="payment-agreement"[^\n]+legal\.refundSummary/);
  assert.ok(terms.includes('data-page="terms"'));
});

test('sitemap includes refund page', () => {
  const generator = fs.readFileSync(new URL('../scripts/gen_sitemap.mjs', import.meta.url), 'utf8');
  const sitemap = fs.readFileSync(new URL('../sitemap.xml', import.meta.url), 'utf8');
  assert.match(generator, /\$\{base\}refund\.html/);
  assert.match(sitemap, /https:\/\/vietnamstephen\.github\.io\/sea-travel-weather\/refund\.html/);
});

test('localized user copy uses Trip Pack access wording and purchase links exist', () => {
  const localized = i18n.match(/"(?:account\.|pricing\.|trips\.)[^\n]*\[[^\n]+/g) || [];
  const ban = /\bVIP\b|订阅|通行证|通行卡|\bpass\b|\bsubscription\b/i;
  for (const line of localized) assert.doesNotMatch(line, ban, `old product wording in ${line.slice(0, 100)}`);
  assert.match(i18n, /Trip Pack access \(7 days \/ 1 month \/ 1 year\)/);
  assert.match(pages, /href="terms\.html"/);
  assert.match(pages, /href="refund\.html"/);
  assert.match(pages, /payment-agreement/);
  assert.match(i18n, /"consent\.accept": \["接受", "Accept", "Chấp nhận", "ยอมรับ", "Terima"\]/);
  assert.match(i18n, /"consent\.reject": \["拒绝", "Reject", "Từ chối", "ปฏิเสธ", "Tolak"\]/);
});
