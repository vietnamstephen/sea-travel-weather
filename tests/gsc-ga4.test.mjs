import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
test('index.html carries the static Search Console verification tag', () => {
  assert.ok(html.includes('<meta name="google-site-verification" content="oY_OEjgf2vxLNr432av0qf_ePJnYVgWMDlOcG9QbMMs" />'));
});
test('index.html loads GA4 gtag only on the production host', () => {
  assert.equal((html.match(/G-GX775Z6J31/g) || []).length, 1);
  assert.match(html, /location\.hostname !== 'vietnamstephen\.github\.io'\) return;/);
  assert.ok(!/GTM-/.test(html));
});
