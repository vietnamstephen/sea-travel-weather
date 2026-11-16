import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const banned = /API_KEY|API Key|环境变量|environment variable|MCP|VARIFLIGHT|AVIATIONSTACK|\bTODO\b/i;

test('non-admin i18n and static HTML contain no developer-facing flight setup copy', () => {
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'js/i18n.js'), 'utf8'), { window });
  const dict = window.I18N.dict;
  for (const [key, values] of Object.entries(dict)) {
    if (/^(flight\.providerOff|flight\.keyHint)/.test(key)) continue;
    for (const value of Array.isArray(values) ? values : [values]) assert.doesNotMatch(String(value), banned, `${key}: ${value}`);
  }
  for (const name of fs.readdirSync(root).filter(name => name.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(root, name), 'utf8');
    assert.doesNotMatch(html.replace(/<script[\s\S]*?<\/script>/gi, ''), banned, name);
  }
});

test('legal pages carry no draft labels', async () => {
  const fs = await import('node:fs');
  const pp = fs.readFileSync(new URL('../js/payment-pages.js', import.meta.url), 'utf8');
  const i18n = fs.readFileSync(new URL('../js/i18n.js', import.meta.url), 'utf8');
  for (const bad of ['草稿', 'Draft privacy', 'Draft service', 'DRAFT', "t('legal.draft')"]) {
    if (pp.includes(bad)) throw new Error('payment-pages.js still has ' + bad);
  }
  const refund = i18n.split('\n').find((l) => l.includes('"legal.refund"'));
  if (/草稿|draft|draf\)|dự thảo|ฉบับร่าง/i.test(refund)) throw new Error('legal.refund still says draft');
});
