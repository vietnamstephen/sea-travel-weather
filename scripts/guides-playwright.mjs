import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { buildGuides } from './build_guides.mjs';
import { lists, readGuides, root, route } from './guide_sources.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const output = buildGuides(root, { preview: true });
let browser;
try {
  browser = await chromium.launch();
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => errors.push(request.url()));
    const articles = readGuides();
    for (const guide of [...lists, ...articles]) {
      const file = path.join(output, route(guide));
      await page.goto(pathToFileURL(file).href);
      const label = width + 'px ' + route(guide);
      assert.equal(await page.locator('h1').innerText(), guide.title, label);
      assert.ok(await page.locator('main h1').isVisible(), label);
      assert.ok(await page.locator('.footer summary').first().isVisible(), label);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), label);
      if (guide.slug) {
        assert.ok(await page.locator('article p').first().isVisible(), label);
        const image = page.locator('figure img');
        if (await image.count()) {
          assert.ok(await image.evaluate(img => img.complete && img.naturalWidth > 0), label);
          assert.ok(await page.locator('figcaption').isVisible(), label);
        }
      } else {
        const expected = articles.filter(article => article.lang === guide.lang && article.country === guide.country);
        assert.deepEqual(await page.locator('.guide-list h2 a').allTextContents(), expected.map(article => article.title), label);
      }
    }
    assert.deepEqual(errors, []);
    console.log(`${width}px: ${lists.length} lists and ${articles.length} articles passed`);
    await page.close();
  }
} finally {
  await browser?.close();
  fs.rmSync(output, { recursive: true, force: true });
}
