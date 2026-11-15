/**
 * Hospital-3 layout + geolocation acceptance.
 * Run from the repo root:
 *   NODE_PATH=~/WorkBuddy/pw/node_modules node scripts/hospital-3-playwright.mjs
 *
 * Optional env:
 *   HOSPITAL3_ROOT         serve this tree instead of the script's parent
 *   HOSPITAL3_SHOTS_DIR    screenshot directory
 *   HOSPITAL3_SHOT_PREFIX  filename prefix (default hospital-3)
 *   HOSPITAL3_ASSERT=0     measure only; do not fail the process on limits
 *   HOSPITAL3_SHOTS=0      skip screenshots
 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = (process.env.HOSPITAL3_ROOT
  ? resolve(process.env.HOSPITAL3_ROOT)
  : fileURLToPath(new URL('../', import.meta.url))).replace(/\/?$/, '/');

const hospitals = JSON.parse(await readFile(join(root, 'data/hospitals.json'), 'utf8'));
const assertMode = process.env.HOSPITAL3_ASSERT !== '0';
const takeShots = process.env.HOSPITAL3_SHOTS !== '0';
const shotPrefix = process.env.HOSPITAL3_SHOT_PREFIX || 'hospital-3';
const shotDir = process.env.HOSPITAL3_SHOTS_DIR || join(homedir(), 'WorkBuddy/cards/shots');

const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

const server = createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://localhost').pathname)).replace(/^[/\\]+/, '') || 'vn.html';
    const file = join(root, path);
    if (!file.startsWith(root)) throw new Error('bad path');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const results = [];
const failures = [];

function record(ok, message, extra) {
  if (!ok) {
    failures.push(message);
    console.error('FAIL:', message);
  }
  return { ok, message, ...extra };
}

async function clickIfVisible(page, selector) {
  const loc = page.locator(selector).first();
  if ((await loc.count()) && (await loc.isVisible())) {
    await loc.click();
    return true;
  }
  return false;
}

async function openCity(page, city) {
  await page.locator('.country-cities, .city-row').first().waitFor({ timeout: 15000 });
  const summary = page.locator(`.city-row[data-city="${city}"] summary`);
  if (!(await summary.isVisible())) {
    const clicked = await clickIfVisible(page, '.city-more');
    if (!clicked) throw new Error(`city ${city} is hidden and .city-more is not visible`);
    await summary.waitFor({ state: 'visible', timeout: 5000 });
  }
  await summary.click();
}

async function waitForImages(page) {
  await page.evaluate(() => Promise.all([...document.images].map((img) => {
    if (img.complete) return null;
    return new Promise((resolveImg) => {
      img.onload = img.onerror = resolveImg;
      setTimeout(resolveImg, 4000);
    });
  })));
}

try {
  const cityCases = [['vn', 'danang'], ['vn', 'hcm'], ['th', 'samutsakhon'], ['th', 'bangkok']];
  for (const width of [390, 1280]) {
    for (const [country, city] of cityCases) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      await page.goto(`${origin}/${country}.html`, { waitUntil: 'domcontentloaded' });
      await openCity(page, city);
      await page.locator('.hospitals').waitFor();
      await clickIfVisible(page, '.hosp-more');
      await clickIfVisible(page, '.attr-more');
      await waitForImages(page);
      await page.waitForTimeout(200);

      const measures = await page.evaluate(() => {
        const hospitalsEl = document.querySelector('.hospitals');
        const calls = [...document.querySelectorAll('.hosp-call')].map((a) => {
          const r = a.getBoundingClientRect();
          return { href: a.getAttribute('href'), height: Math.round(r.height * 100) / 100, width: Math.round(r.width * 100) / 100 };
        });
        return {
          height: document.documentElement.scrollHeight,
          hospitalHeight: hospitalsEl ? Math.ceil(hospitalsEl.getBoundingClientRect().height) : null,
          hospitalCount: document.querySelectorAll('.hospitals li').length,
          emergencyHref: document.querySelector('.hosp-emergency')?.getAttribute('href') || null,
          callTargets: calls.map((c) => c.href),
          callHeights: calls.map((c) => c.height),
          callMinHeight: calls.length ? Math.min(...calls.map((c) => c.height)) : null,
          attractions: !!document.querySelector('.attractions'),
          attractionsExpanded: !!document.querySelector('.attractions.attr-expanded'),
        };
      });

      if (takeShots) {
        await mkdir(shotDir, { recursive: true });
        await page.screenshot({
          path: join(shotDir, `${shotPrefix}-${country}-${city}-${width}.png`),
          fullPage: true,
        });
      }

      const limit = width === 390 ? 5000 : 3000;
      const heightOk = measures.height <= limit;
      record(heightOk, `${country}/${city} ${width}px height ${measures.height} exceeds limit ${limit}`);
      if (!heightOk && assertMode) {
        // keep measuring; fail the process at the end
      }

      if (width === 390 && country === 'vn' && city === 'danang') {
        const expectedCount = Math.min(6, hospitals.countries.vn.danang.length);
        record(measures.hospitalCount === expectedCount, `Da Nang must render all expanded hospitals (max 6); got ${measures.hospitalCount}, expected ${expectedCount}`);
        record(measures.hospitalHeight !== null && measures.hospitalHeight <= 700, `Da Nang 390 hospital block height ${measures.hospitalHeight} exceeds 700`);
        record(measures.callMinHeight !== null && measures.callMinHeight >= 44, `Da Nang 390 call button tap height ${measures.callMinHeight} is below 44px`);
      }
      if (country === 'vn' && city === 'danang') {
        record(measures.emergencyHref === 'tel:115', `Da Nang ${width} emergency href is ${measures.emergencyHref}, expected tel:115`);
      }

      results.push({ width, country, city, ...measures, heightLimit: limit, heightOk });
      await context.close();
    }
  }

  for (const [country, city, coords] of [
    ['vn', 'danang', { latitude: 16.0715, longitude: 108.2155 }],
    ['th', 'bangkok', { latitude: 13.7563, longitude: 100.5018 }],
  ]) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      geolocation: coords,
      permissions: ['geolocation'],
    });
    const page = await context.newPage();
    await page.goto(`${origin}/${country}.html`, { waitUntil: 'domcontentloaded' });
    await openCity(page, city);
    await page.locator('.hospitals').waitFor();
    await page.locator('.hosp-locate').click();
    await page.waitForFunction(() => sessionStorage.getItem('hospitalPosition') !== null, null, { timeout: 15000 });
    const pos = await page.evaluate(() => JSON.parse(sessionStorage.getItem('hospitalPosition')));
    const expected = hospitals.countries[country][city].slice().sort((a, b) => {
      const dist = (h) => {
        const r = Math.PI / 180;
        const x = (h.lat - pos.lat) * r;
        const y = (h.lng - pos.lng) * r;
        return 6371 * 2 * Math.asin(Math.sqrt(Math.sin(x / 2) ** 2 + Math.cos(pos.lat * r) * Math.cos(h.lat * r) * Math.sin(y / 2) ** 2));
      };
      return dist(a) - dist(b);
    })[0];
    const outcome = ((await page.locator('.hospitals li strong').first().textContent()) || '').trim();
    const expectedNames = Object.values(expected.name || {});
    const nameOk = expectedNames.includes(outcome);
    record(nameOk, `${country}/${city}: expected nearest ${expected.name.en}, got ${outcome}`);
    const nearestCity = await page.evaluate(({ latitude, longitude }) => {
      const n = window.SEA_RISK.nearestCity(latitude, longitude);
      return { country: n.country.id, city: n.city.id };
    }, coords);
    record(
      nearestCity.country === country && nearestCity.city === city,
      `${country}/${city}: geolocation resolved to ${nearestCity.country}/${nearestCity.city}`,
    );
    const locationStatus = await page.locator('.hosp-status').textContent();
    results.push({
      e2e: country,
      city,
      nearestCity,
      firstHospital: outcome,
      expected: expected.name.en,
      nameOk,
      locationStatus,
      pos,
    });
    await context.close();
  }

  const summary = { root, assertMode, results, failures };
  console.log(JSON.stringify(summary, null, 2));
  if (assertMode && failures.length) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  server.close();
}
