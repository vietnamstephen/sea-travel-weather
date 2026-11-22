import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { base, countries, lists, readGuides, root, route } from './guide_sources.mjs';

export function writeSitemap(site = root) {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(new URL('../js/data.js', import.meta.url), 'utf8'), context);
  const paths = [''];
  for (const country of context.window.SEA_DATA.countries.filter(country => countries.includes(country.id))) {
    paths.push(`${country.id}.html`, ...country.cities.map(city => `${country.id}.html?city=${encodeURIComponent(city.id)}`));
  }
  const published = readGuides(site).filter(article => !article.draft);
  // A list page with no published article is noindex, so it stays out of the sitemap until launch.
  const filled = lists.filter(list => published.some(article => article.lang === list.lang && article.country === list.country));
  paths.push(...filled.map(route), ...published.map(route));
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    paths.map(url => `  <url><loc>${base}${url.replaceAll('&', '&amp;')}</loc></url>`).join('\n') +
    '\n</urlset>\n';
  fs.writeFileSync(path.join(site, 'sitemap.xml'), xml);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) writeSitemap();
