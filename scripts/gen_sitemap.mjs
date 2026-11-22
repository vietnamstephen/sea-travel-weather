import fs from 'node:fs';
import vm from 'node:vm';

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(new URL('../js/data.js', import.meta.url), 'utf8'), context);
const countries = context.window.SEA_DATA.countries.filter(country => ['vn', 'th'].includes(country.id));
const base = 'https://vietnamstephen.github.io/sea-travel-weather/';
const urls = [base, `${base}refund.html`, ...countries.flatMap(country => [
  `${base}${country.id}.html`,
  ...country.cities.map(city => `${base}${country.id}.html?city=${encodeURIComponent(city.id)}`)
])];
const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map(url => `  <url><loc>${url.replaceAll('&', '&amp;')}</loc></url>`).join('\n') +
  '\n</urlset>\n';
fs.writeFileSync(new URL('../sitemap.xml', import.meta.url), xml);
