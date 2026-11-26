import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.xml': 'application/xml' };
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = resolve(root, '.' + normalize(path === '/' ? '/index.html' : path));
    if (!file.startsWith(root)) throw new Error('bad path');
    res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const browser = await chromium.launch({ headless: true });
const base = `http://127.0.0.1:${server.address().port}`;
const prodBase = 'https://vietnamstephen.github.io/sea-travel-weather';
const collectRequests = [];
const isCollect = url => /^https:\/\/(?:www\.|region1\.)?google-analytics\.com\/g\/collect(?:\?|$)/.test(url);
try {
  const prod = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await prod.route(`${prodBase}/**`, async route => {
    const pathname = new URL(route.request().url()).pathname.slice('/sea-travel-weather'.length) || '/';
    const file = resolve(root, '.' + normalize(pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root)) return route.fulfill({ status: 404, body: 'not found' });
    try { return await route.fulfill({ status: 200, contentType: mime[extname(file)] || 'application/octet-stream', body: await readFile(file) }); }
    catch { return route.fulfill({ status: 404, body: 'not found' }); }
  });
  prod.on('request', request => {
    if (isCollect(request.url())) collectRequests.push(request.url());
  });
  await prod.route('https://**/*', async route => {
    const url = route.request().url();
    if (isCollect(url)) return route.abort();
    return route.fallback();
  });
  await prod.goto(`${prodBase}/`, { waitUntil: 'networkidle' });
  assert.equal(collectRequests.length, 0, 'production must wait for consent before collecting');
  await Promise.all([
    prod.waitForRequest(request => isCollect(request.url())),
    prod.locator('[data-consent-accept]').click()
  ]);
  assert.ok(collectRequests.length >= 1, 'production must issue at least one GA collect request');
  assert.ok(collectRequests.some(url => new URL(url).searchParams.get('tid') === 'G-GX775Z6J31'), `missing expected GA measurement ID: ${collectRequests.join('\n')}`);
  await prod.close();

  const local = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const localRequests = [];
  local.on('request', request => localRequests.push(request.url()));
  await local.goto(`${base}/`, { waitUntil: 'networkidle' });
  await local.waitForTimeout(1000);
  assert.equal(localRequests.filter(url => /googletagmanager\.com\/gtag\/js/.test(url)).length, 0, 'localhost must not request gtag.js');
  assert.equal(localRequests.filter(isCollect).length, 0, 'localhost must not request GA collect');
  await local.close();

  for (const country of ['vn', 'th']) for (const lang of ['zh', 'en', 'vi', 'th', 'id']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${base}/${country}.html?lang=${lang}`, { waitUntil: 'networkidle' });
    await page.locator('#main .country-cities').waitFor();
    const brand = await page.locator('.brand-title').textContent();
    assert.equal(brand.trim(), lang === 'zh' ? '椰途' : '椰途 Yetu');
    assert.ok(!(await page.locator('body').innerText()).includes('东南亚出行天气与交通预警'));
    assert.ok(await page.locator('meta[name="description"]').getAttribute('content'));
    assert.ok((await page.locator('link[rel="canonical"]').getAttribute('href')).includes(`${country}.html`));
    await page.close();
  }
  const caps = { danang: 2776, hcm: 2732, samutsakhon: 2992, bangkok: 2627 };
  for (const [city, cap] of Object.entries(caps)) {
    const country = ['danang', 'hcm'].includes(city) ? 'vn' : 'th';
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${base}/${country}.html?lang=zh&city=${city}`, { waitUntil: 'networkidle' });
    await page.locator(`.city-row[data-city="${city}"]`).waitFor({ state: 'visible' });
    await page.locator(`.city-row[data-city="${city}"] .attractions`).waitFor({ timeout: 20000 });
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    assert.ok(height <= cap, `${city} page is ${height}px, over ${cap}px`);
    await page.close();
  }
  console.log(JSON.stringify({ productionGaCollects: collectRequests.length, expectedTid: 'G-GX775Z6J31', localhostGtag: 0, localhostCollect: 0, localizationAndSeo: 'passed', cityHeightCaps: 'passed' }, null, 2));
} finally {
  await browser.close();
  await new Promise(ok => server.close(ok));
}
