import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const base = 'https://vietnamstephen.github.io/sea-travel-weather/';
export const countries = ['vn', 'th'];
export const locales = {
  zh: { name: '中文', lists: { vn: '越南旅行攻略', th: '泰国旅行攻略' }, empty: '攻略准备中。', credit: '封面插图：AI 生成（OpenAI image_gen），', swipe: '← 滑动查看完整表格 →' },
  en: { name: 'English', lists: { vn: 'Vietnam travel guides', th: 'Thailand travel guides' }, empty: 'Guides are coming soon.', credit: 'Cover illustration: AI-generated (OpenAI image_gen), ', swipe: '← Swipe to see the full table →' }
};

export function route({ lang, country, slug = 'index' }) {
  return `guides/${lang === 'zh' ? '' : lang + '/'}${country}/${slug}.html`;
}

export const lists = Object.keys(locales).flatMap(lang => countries.map(country => ({
  lang, country, title: locales[lang].lists[country]
})));

export function parseGuide(text, lang, country, filename) {
  const fail = message => { throw new Error(`${lang}/${country}/${filename}: ${message}`); };
  text = text.replaceAll('\r\n', '\n');
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text);
  if (!match) fail('expected front-matter between --- lines');
  const fields = Object.create(null);
  for (const line of match[1].split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const field = /^(title|description|slug|date|city|lang|cover|draft):[ \t]*(.*)$/.exec(line);
    if (!field) fail(`unknown or malformed field: ${line}`);
    const [, key, raw] = field;
    if (key in fields) fail(`duplicate field: ${key}`);
    let value = raw.trim();
    if (/^["']/.test(value)) {
      const quoted = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*')(?:\s+#.*)?$/.exec(value);
      if (!quoted) fail(`invalid quoted ${key}`);
      value = quoted[1][0] === '"' ? JSON.parse(quoted[1]) : quoted[1].slice(1, -1).replaceAll("''", "'");
    } else {
      value = value.replace(/(?:^|\s+)#.*$/, '').trim();
    }
    fields[key] = value;
  }
  for (const key of ['title', 'description', 'slug', 'date', 'city', 'lang']) {
    if (!fields[key]?.trim()) fail(`missing ${key}`);
  }
  if (!Object.hasOwn(locales, lang) || fields.lang !== lang || !countries.includes(country)) fail('invalid language or country');
  if (/(?:｜椰途|\|\s*Yetu)\s*$/i.test(fields.title)) fail('omit the brand suffix from title');
  const { slug, date, draft, cover } = fields;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug === 'index' || filename !== slug + '.md') fail('invalid slug or filename');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date).toJSON()?.slice(0, 10) !== date) fail('invalid date');
  if (draft !== undefined && !['true', 'false'].includes(draft)) fail('draft must be true or false');
  if (cover && !/^(?:guides\/assets\/)?[\w-]+\.(?:jpe?g|png|webp)$/i.test(cover)) fail('expected cover filename under guides/assets');
  return { ...fields, draft: draft === 'true', country, body: text.slice(match[0].length) };
}

export function readGuides(site = root) {
  const guides = [];
  const seen = new Set();
  for (const { lang, country } of lists) {
    const dir = path.join(site, 'guides/src', lang, country);
    for (const filename of fs.readdirSync(dir).filter(name => name.endsWith('.md')).sort()) {
      const guide = parseGuide(fs.readFileSync(path.join(dir, filename), 'utf8'), lang, country, filename);
      const key = lang + '/' + guide.slug;
      if (seen.has(key)) throw new Error(`Duplicate translated slug: ${key}`);
      seen.add(key);
      guides.push(guide);
    }
  }
  return guides.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}
