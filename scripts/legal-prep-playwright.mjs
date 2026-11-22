import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prod = 'https://vietnamstephen.github.io/sea-travel-weather';
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
const gaHost = /(^|\.)(google-analytics|googletagmanager)\.com$/;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const gaRequests = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (gaHost.test(url.hostname)) gaRequests.push(url);
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.href.startsWith(prod + '/')) {
      const file = path.resolve(root, '.' + url.pathname.slice('/sea-travel-weather'.length));
      if (file.startsWith(root + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        return route.fulfill({ path: file, contentType: mime[path.extname(file)] });
      }
      return route.fulfill({ status: 404 });
    }
    if (url.hostname === 'www.googletagmanager.com' && url.pathname === '/gtag/js') {
      return route.fulfill({ contentType: 'application/javascript', body: "fetch('https://www.google-analytics.com/g/collect').catch(() => {});" });
    }
    return route.abort();
  });
  const visit = async (file, lang) => {
    const response = await page.goto(prod + '/' + file + '?lang=' + lang, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
  };
  await visit('index.html', 'zh');
  await page.getByRole('button', { name: '拒绝' }).click();
  await page.waitForFunction(() => localStorage.getItem('sea_analytics_consent') === 'rejected');
  assert.equal(gaRequests.length, 0, 'reject must make zero GA or Tag Manager requests');
  await visit('index.html', 'zh');
  assert.equal(await page.locator('.consent-banner').isHidden(), true);
  assert.equal(gaRequests.length, 0, 'rejection and the next visit must make zero GA or Tag Manager requests');
  assert.equal((await page.context().cookies()).some(c => c.name.startsWith('_ga')), false);
  await page.locator('[data-cookie-settings]').click();
  await Promise.all([
    page.waitForRequest(req => new URL(req.url()).hostname === 'www.google-analytics.com' && new URL(req.url()).pathname === '/g/collect'),
    page.getByRole('button', { name: '接受' }).click()
  ]);
  assert.equal(gaRequests.filter(url => url.hostname === 'www.googletagmanager.com' && url.pathname === '/gtag/js').length, 1);

  for (const [lang, days] of Object.entries({ zh: '14 天', en: '14 days', vi: '14 ngày', th: '14 วัน', id: '14 hari' })) {
    await visit('terms.html', lang);
    const summary = await page.evaluate(lang => window.I18N.t('legal.refundSummary', lang), lang);
    const terms = await page.locator('#refund + p').innerText();
    assert.ok(summary.includes(days) && terms.startsWith(summary), lang);
    await visit('refund.html', lang);
    assert.equal(await page.locator('#refund + p').innerText(), terms);
    await visit('pricing.html', lang);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('sea:entitlement', { detail: { payments_visible: true, effective_role: 'user', is_vip: false } })));
    const agreements = page.locator('.payment-buy + .payment-agreement');
    assert.equal(await agreements.count(), 3);
    for (const agreement of await agreements.all()) {
      assert.ok((await agreement.textContent()).includes(summary), lang);
      for (const link of ['terms.html', 'refund.html']) assert.equal(await agreement.locator('a[href="' + link + '"]').count(), 1);
    }
    const misplaced = await page.evaluate(() => Object.entries(window.I18N.dict).filter(([key, row]) =>
      key !== 'pricing.segPass7' && row.some(value => value.includes('Trip Pack access (7 days)'))).map(([key]) => key));
    assert.deepEqual(misplaced, []);
  }
  console.log('legal-prep Playwright checks passed');
} finally {
  await browser.close();
}
