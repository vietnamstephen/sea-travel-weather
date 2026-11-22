import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildGuides } from '../scripts/build_guides.mjs';
import { base, lists, parseGuide, readGuides, root, route } from '../scripts/guide_sources.mjs';

const read = (dir, name) => fs.readFileSync(path.join(dir, name), 'utf8');
const source = '---\ntitle: "Trip: A # B" # comment\ndescription: Packing\ndate: 2024-02-29\ncity: hanoi\nlang: en\nslug: winter\n---\n## Weather';
const parse = text => parseGuide(text, 'en', 'vn', 'winter.md');

test('validates required fields, quoted scalars, date, draft and route identity', () => {
  assert.equal(parse(source.replaceAll('\n', '\r\n')).title, 'Trip: A # B');
  assert.equal(parse(source).draft, false);
  for (const key of ['title', 'description', 'date', 'city', 'lang', 'slug']) {
    assert.throws(() => parse(source.replace(new RegExp('^' + key + ':.*\n', 'm'), '')), /missing/);
  }
  for (const [field, value] of [['Trip: A # B', 'Trip | Yetu'], ['lang: en', 'lang: zh'], ['2024-02-29', '2025-02-29'],
    ['slug: winter', 'slug: index'], ['slug: winter', 'slug: ../winter'], ['city: hanoi', 'city: hanoi\ncity: hcm'],
    ['city: hanoi', 'draft: yes\ncity: hanoi'], ['city: hanoi', 'cover: ../other.jpg\ncity: hanoi']]) {
    assert.throws(() => parse(source.replace(field, value)));
  }
  assert.throws(() => parseGuide(source, 'en', 'vn', 'other.md'), /filename/);
});

function alternateLinks(html) {
  return Object.fromEntries([...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)]
    .map(match => [match[1], match[2]]));
}

const expectedCovers = {
  'vietnam-december-weather-packing': ['cover-vn-december-weather-packing.jpg', '2026-11-16'],
  'danang-hoian-late-year-rain': ['cover-vn-central-late-year-rain.jpg', '2026-11-22'],
  'sapa-chiangmai-winter-cold': ['cover-vn-th-sapa-chiangmai-winter.jpg', '2026-11-22'],
  'thailand-december-weather-packing': ['cover-th-december-weather-packing-r2.jpg', '2026-11-22']
};

test('real bilingual previews render credited covers, fallback metadata, articles and resolving alternates', t => {
  const out = buildGuides(root, { preview: true });
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  const guides = readGuides();
  for (const slug of Object.keys(expectedCovers)) {
    assert.deepEqual(guides.filter(guide => guide.slug === slug).map(guide => guide.lang).sort(), ['en', 'zh']);
  }
  for (const guide of guides) {
    const html = read(out, route(guide));
    const { title, lang, description, date, slug } = guide;
    const schema = JSON.parse(html.match(/<script type="application\/ld\+json">(.+)<\/script>/)[1]);
    const expected = expectedCovers[slug];
    const cover = expected && 'guides/assets/' + expected[0];
    const image = base + (cover || 'guides/assets/yetu-default.png');
    assert.deepEqual(schema, { '@context': 'https://schema.org', '@type': 'Article', headline: title,
      description, datePublished: date, image, inLanguage: lang, author: { '@type': 'Organization', name: '椰途' },
      publisher: { '@type': 'Organization', name: '椰途' } });
    assert.ok(html.includes(`<meta property="og:image" content="${image}">`));
    assert.ok(html.includes(`<meta name="twitter:image" content="${image}">`));
    assert.ok(fs.existsSync(path.join(out, image.slice(base.length))));
    assert.equal((html.match(/<h1>/g) || []).length, 1);
    assert.ok(html.includes('noindex,nofollow'));
    assert.ok(html.includes(`<link rel="canonical" href="${base + route(guide)}">`));
    if (slug === 'sapa-chiangmai-winter-cold') assert.deepEqual([guide.country, guide.city], ['th', 'chiangmai']);
    if (slug === 'vietnam-december-weather-packing') {
      for (const tag of ['<table>', '<ol>', '<strong>', '<blockquote>']) assert.ok(html.includes(tag));
      assert.doesNotMatch(html, /<!-- (?:编辑备注|Editor note|付费引导位)/);
    }
    if (cover) {
      const figures = [...html.matchAll(/<figure><img src="([^"]+)" width="1200" height="630" alt="([^"]+)"><figcaption>([^<]+)<\/figcaption><\/figure>/g)];
      assert.equal(figures.length, 1, route(guide));
      const [, src, alt, caption] = figures[0];
      assert.equal(path.resolve(out, path.dirname(route(guide)), src), path.join(out, cover));
      assert.notEqual(alt, title);
      const credit = lang === 'zh' ? '封面插图：AI 生成（OpenAI image_gen），' : 'Cover illustration: AI-generated (OpenAI image_gen), ';
      assert.equal(caption, credit + expected[1]);
      assert.ok(read(root, 'guides/assets/SOURCES.md').split('\n').some(row =>
        row.includes(expected[0]) && row.includes('image_gen') && row.includes(' | ' + expected[1] + ' |')));
    } else {
      assert.doesNotMatch(html, /<img\b|<figure\b|<figcaption>/);
    }
    const peers = guides.filter(peer => peer.slug === slug);
    const tags = alternateLinks(html);
    if (peers.length === 1) assert.deepEqual(tags, {});
    else {
      for (const peer of peers) {
        assert.equal(tags[peer.lang], base + route(peer));
        assert.equal(alternateLinks(read(out, route(peer)))[lang], base + route(guide));
      }
      assert.equal(tags['x-default'], tags.zh);
    }
  }
});

test('production filters drafts, pairs by slug across countries, sorts lists and removes withdrawn pages', t => {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-publish-'));
  t.after(() => fs.rmSync(site, { recursive: true, force: true }));
  for (const { lang, country } of lists) fs.mkdirSync(path.join(site, 'guides/src', lang, country), { recursive: true });
  function add(lang, country, slug, date, draft = false) {
    const text = source.replace('lang: en', 'lang: ' + lang).replace('slug: winter', 'slug: ' + slug)
      .replace('2024-02-29', date).replace('city: hanoi', 'draft: ' + draft + '\ncity: hanoi');
    fs.writeFileSync(path.join(site, 'guides/src', lang, country, slug + '.md'), text);
    return route({ lang, country, slug });
  }
  const older = add('zh', 'vn', 'older', '2024-02-28');
  const recent = add('zh', 'vn', 'winter', '2024-12-01');
  const english = add('en', 'th', 'winter', '2024-12-01');
  const draft = add('en', 'th', 'older', '2024-02-28', true);
  fs.appendFileSync(path.join(site, 'guides/src/en/th/winter.md'), '\n\n[Withheld](older.html) and [Published](../../vn/winter.html).');
  buildGuides(site);
  assert.ok(read(site, english).includes('Withheld and <a href="../../vn/winter.html">Published</a>'));
  const index = read(site, 'guides/vn/index.html');
  assert.ok(index.indexOf('href="winter.html"') >= 0 && index.indexOf('href="winter.html"') < index.indexOf('href="older.html"'));
  assert.deepEqual(alternateLinks(read(site, recent)), { zh: base + recent, en: base + english, 'x-default': base + recent });
  assert.deepEqual(alternateLinks(read(site, english)), alternateLinks(read(site, recent)));
  assert.deepEqual(alternateLinks(read(site, older)), {});
  assert.ok(read(site, recent).includes('<title>Trip: A # B｜椰途</title>'));
  assert.ok(read(site, english).includes('<title>Trip: A # B | Yetu</title>'));
  assert.doesNotMatch(read(site, older), /<img\b/);
  assert.equal(fs.existsSync(path.join(site, draft)), false);
  assert.doesNotMatch(read(site, 'guides/en/th/index.html'), /older\.html/);
  const xml = read(site, 'sitemap.xml');
  for (const url of ['guides/vn/index.html', 'guides/en/th/index.html', older, recent, english]) assert.ok(xml.includes('<loc>' + base + url + '</loc>'), url);
  // Lists with published articles are indexable; empty lists are noindex and stay out of the sitemap.
  for (const list of ['guides/vn/index.html', 'guides/en/th/index.html']) assert.doesNotMatch(read(site, list), /name="robots"/, list);
  for (const list of ['guides/th/index.html', 'guides/en/vn/index.html']) {
    assert.match(read(site, list), /<meta name="robots" content="noindex">/, list);
    assert.ok(!xml.includes(base + list), list);
  }
  assert.ok(!xml.includes(base + draft));
  execFileSync('xmllint', ['--noout', path.join(site, 'sitemap.xml')]);
  add('zh', 'vn', 'winter', '2024-12-01', true);
  buildGuides(site);
  assert.equal(fs.existsSync(path.join(site, recent)), false);
  assert.deepEqual(alternateLinks(read(site, english)), {});
  assert.ok(!read(site, 'sitemap.xml').includes(base + recent));
  assert.doesNotMatch(read(site, 'guides/vn/index.html'), /winter\.html/);
});

test('checked-in production lists and sitemap contain only published guides', () => {
  const xml = read(root, 'sitemap.xml');
  execFileSync('xmllint', ['--noout', path.join(root, 'sitemap.xml')]);
  const published = readGuides().filter(article => !article.draft);
  for (const list of lists) {
    const filled = published.some(article => article.lang === list.lang && article.country === list.country);
    assert.equal(xml.includes(base + route(list)), filled, route(list));
    assert.equal(/<meta name="robots" content="noindex">/.test(read(root, route(list))), !filled, route(list));
  }
  for (const article of readGuides()) {
    const url = route(article);
    assert.equal(fs.existsSync(path.join(root, url)), !article.draft, url);
    assert.equal(xml.includes(base + url), !article.draft, url);
    const list = route({ lang: article.lang, country: article.country });
    assert.equal(read(root, list).includes('href="' + article.slug + '.html"'), !article.draft, list);
  }
});


test('guide branch adds no files under docs, including untracked files', () => {
  const git = (...args) => execFileSync('git', ['--no-optional-locks', ...args], { cwd: root, encoding: 'utf8' }).trim();
  const baseCommit = git('merge-base', 'HEAD', 'origin/main');
  assert.equal(git('diff', '--name-only', '--no-renames', '--diff-filter=A', baseCommit, '--', 'docs/'), '');
  assert.equal(git('ls-files', '--others', '--exclude-standard', '--', 'docs/'), '');
});

test('guide covers declare intrinsic size and tables carry a localized swipe hint', t => {
  const out = buildGuides(root, { preview: true });
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  for (const guide of readGuides()) {
    const html = read(out, route(guide));
    const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map(m => m[0]);
    assert.ok(imgs.length >= 1, guide.slug + ' should have a cover');
    for (const img of imgs) {
      assert.match(img, /\bwidth="1200"/);
      assert.match(img, /\bheight="630"/);
    }
    const tables = (html.match(/<div class="guide-table"/g) || []).length;
    const hints = (html.match(/<p class="guide-swipe">[^<]+<\/p><div class="guide-table"/g) || []).length;
    assert.equal(hints, tables, guide.slug + ' every table needs a swipe hint');
  }
  const css = fs.readFileSync(path.join(root, 'css/guides.css'), 'utf8');
  assert.match(css, /aspect-ratio:\s*1200\s*\/\s*630/);
  assert.match(css, /\.guide-main p, \.guide-main li, \.guide-main td, \.guide-main th \{ font-size: 1rem; \}/);
});
