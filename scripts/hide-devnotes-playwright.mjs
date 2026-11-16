import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const banned = /API_KEY|API Key|环境变量|environment variable|MCP|VARIFLIGHT|AVIATIONSTACK|\bTODO\b|sandbox/i;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let pathname; try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end('Not found'); return; }
  res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true });
  const base = `http://127.0.0.1:${server.address().port}`;
  const pages = ['index.html', 'vn.html', 'th.html', 'my.html', 'sg.html', 'id.html', 'ph.html', 'pricing.html', 'trips.html'];
  for (const lang of ['zh', 'en', 'vi', 'th', 'id']) for (const file of pages) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${base}/${file}?lang=${lang}${file === 'vn.html' || file === 'th.html' || file === 'my.html' || file === 'sg.html' || file === 'id.html' || file === 'ph.html' ? '#tab=airports' : ''}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.body && document.body.innerText.length > 0);
    const body = await page.locator('body').innerText();
    if (banned.test(body)) throw new Error(`${file} ${lang} contains developer text: ${body.match(banned)?.[0]}`);
    await page.close();
  }
  const caps = [
    ['vn.html', 'danang', 3288, 2776], ['vn.html', 'hcm', 3152, 2732],
    ['th.html', 'samutsakhon', 3475, 2992], ['th.html', 'bangkok', 2899, 2627]
  ];
  for (const [file, city, mobileCap, desktopCap] of caps) for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(`${base}/${file}?lang=zh&city=${city}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.body && document.body.innerText.length > 0);
    const height = await page.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
    const cap = width === 390 ? mobileCap : desktopCap;
    if (height > cap) throw new Error(`${file} ${city} at ${width}px is ${height}px (cap ${cap}px)`);
    await page.close();
  }
  console.log('hide-devnotes Playwright checks passed');
} catch (error) { console.error(error); process.exitCode = 1; }
finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
