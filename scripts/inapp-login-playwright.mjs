import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = normalize(join(root, pathname === '/' ? 'index.html' : pathname));
    if (!file.startsWith(root)) throw new Error('Invalid path');
    const body = await readFile(file); res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }); res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
});
const failures = [];
function check(ok, message) { if (!ok) failures.push(message); console.log(`${ok ? 'PASS' : 'FAIL'} ${message}`); }
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const appUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) MicroMessenger/8.0.40';
  const app = await browser.newPage({ userAgent: appUA });
  await app.route('**/auth/v1/otp**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) }));
  await app.route('**/auth/v1/verify**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'mock-access', token_type: 'bearer', expires_in: 3600, refresh_token: 'mock-refresh', user: { id: 'mock-user', email: 'test@example.com', app_metadata: { provider: 'email' }, user_metadata: {} } }) }));
  await app.goto(`${base}/trips.html?lang=en`, { waitUntil: 'domcontentloaded' });
  await app.locator('.trips-google').waitFor({ state: 'visible', timeout: 20000 });
  const before = app.url(); await app.locator('.trips-google').click();
  await app.locator('.sea-login').waitFor({ state: 'visible' });
  await app.waitForTimeout(500);
  check(await app.locator('.sea-login').isVisible(), 'MicroMessenger shows the shared login dialog');
  check(!/accounts\.google\.com|supabase\.co\/auth/i.test(app.url()) && app.url() === before, 'in-app login does not navigate to OAuth');
  check(await app.locator('.sea-login-actions button').first().innerText().then(x => /email|邮箱|email|อีเมล/i.test(x)), 'in-app layout prioritizes email sign-in');
  await app.locator('.sea-login-actions button').first().click();
  await app.locator('.sea-login input[type=email]').fill('test@example.com');
  await app.locator('.sea-login-actions button').first().click();
  await app.locator('input[autocomplete="one-time-code"]').waitFor();
  check(await app.locator('.sea-login-actions button').nth(2).isDisabled(), 'resend is disabled during the 60-second cooldown');
  await app.locator('input[autocomplete="one-time-code"]').fill('123456');
  await app.locator('.sea-login-actions button').first().click();
  await app.waitForTimeout(500);
  check(await app.locator('.sea-login').count() === 0, 'successful email verification closes the dialog');

  const normal = await browser.newPage({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36' });
  await normal.route('**/auth/v1/otp**', route => route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ code: 'over_email_send_rate_limit', message: 'Too many requests' }) }));
  await normal.route('**/auth/v1/verify**', route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'otp_expired', message: 'Token has expired or is invalid' }) }));
  await normal.goto(`${base}/trips.html?lang=en`, { waitUntil: 'domcontentloaded' });
  await normal.locator('.trips-google').waitFor({ state: 'visible', timeout: 20000 });
  await normal.locator('.trips-google').click();
  await normal.locator('.sea-login').waitFor({ state: 'visible' });
  check(/google/i.test(await normal.locator('.sea-login-actions button').first().innerText()), 'regular layout prioritizes Google sign-in');
  await normal.locator('.sea-login-actions button').nth(1).click();
  await normal.locator('.sea-login input[type=email]').fill('test@example.com');
  await normal.locator('.sea-login-actions button').first().click();
  const rateOk = await normal.waitForFunction(re => { const el = document.querySelector('.sea-login-message'); return el && new RegExp(re, 'i').test(el.innerText); }, /too many|频繁|quá nhiều|ถี่เกิน|terlalu banyak/i.source, { timeout: 8000 }).then(() => true, () => false);
  if (!rateOk) console.log('rate message:', await normal.locator('.sea-login-message').innerText().catch(() => '(none)'));
  check(rateOk, 'rate-limit errors are shown clearly');
  check(await normal.locator('.sea-login').count() === 1, 'normal browser shows shared login dialog');

  for (const lang of ['zh', 'en', 'vi', 'th', 'id']) {
    for (const [label, ua] of [['in-app', appUA], ['desktop', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36']]) {
      const page = await browser.newPage({ userAgent: ua });
      await page.goto(`${base}/trips.html?lang=${lang}`, { waitUntil: 'domcontentloaded' });
      await page.locator('.trips-google').waitFor({ state: 'visible', timeout: 20000 });
      await page.locator('.trips-google').click(); await page.locator('.sea-login').waitFor();
      const content = await page.locator('.sea-login').innerText();
      check(!/Supabase|OTP|API|developer|debug/i.test(content), `${lang} ${label} copy contains no developer wording`);
      await page.close();
    }
  }

  const cases = [
    ['vn', 'danang', 3288, 2776], ['vn', 'hcm', 3152, 2732],
    ['th', 'samutsakhon', 3475, 2992], ['th', 'bangkok', 2899, 2627]
  ];
  for (const [country, city, mobileCap, desktopCap] of cases) {
    for (const [width, cap] of [[390, mobileCap], [1280, desktopCap]]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(`${base}/${country}.html?lang=zh&city=${city}`, { waitUntil: 'networkidle' });
      const height = await page.locator('body').evaluate(el => Math.max(el.scrollHeight, document.documentElement.scrollHeight));
      check(height <= cap, `${city} at ${width}px height ${height}px <= ${cap}px`);
      await page.close();
    }
  }
} catch (error) {
  failures.push(error.stack || String(error)); console.error(error);
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
if (failures.length) { console.error(`\n${failures.length} acceptance check(s) failed.`); process.exitCode = 1; }
else console.log('\nAll in-app login browser checks passed.');
