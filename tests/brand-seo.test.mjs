import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');

test('GA4 remains gated to production and waits for consent', () => {
  const app = read('js/app.js');
  assert.match(app, /var GA_MEASUREMENT_ID = 'G-GX775Z6J31'/);
  assert.match(app, /var consentEnabled = GA_MEASUREMENT_ID && location\.hostname === 'vietnamstephen\.github\.io'/);
  assert.match(app, /if \(consentEnabled\) initConsent\(\)/);
  assert.match(app, /gtag\('consent', 'default', \{ ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' \}\)/);
  assert.match(app, /function loadAnalytics\(\)[\s\S]*?googletagmanager\.com\/gtag\/js[\s\S]*?gtag\('config', GA_MEASUREMENT_ID\)/);
  assert.match(app, /if \(value === 'accepted'\)[\s\S]*?loadAnalytics\(\)/);
  assert.doesNotMatch(app, /googletagmanager\.com\/gtm\.js|GTM-MWQ554GB/);
});

test('all five localized brand strings follow the approved spelling', () => {
  const i18n = read('js/i18n.js');
  assert.match(i18n, /'app\.title': \['椰途', '椰途 Yetu', '椰途 Yetu', '椰途 Yetu', '椰途 Yetu'\]/);
  for (const file of ['index.html', 'vn.html', 'th.html']) {
    assert.match(read(file), /google-site-verification/);
    if (file === "index.html") assert.ok(read(file).includes('<meta name="google-site-verification" content="MmMrQ4WDsXaVg9U3XOjLqo5lxE4pIyLBxzjMxAqQT-M" />'));
    if (file === "index.html") assert.ok(read(file).includes('<meta name="google-site-verification" content="oY_OEjgf2vxLNr432av0qf_ePJnYVgWMDlOcG9QbMMs" />'));
    else assert.match(read(file), /<meta name="google-site-verification" content="">/);
    assert.match(read(file), /rel="canonical"/);
  }
});

test('sitemap is well-formed XML and includes Vietnam and Thailand city URLs', () => {
  const xml = read('sitemap.xml');
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">[\s\S]*<\/urlset>\n$/);
  for (const url of ['vn.html', 'th.html', 'vn.html?city=hcm', 'th.html?city=bangkok']) assert.ok(xml.includes(url), `missing ${url}`);
  assert.match(read('robots.txt'), /Sitemap: https:\/\/vietnamstephen\.github\.io\/sea-travel-weather\/sitemap\.xml/);
});
