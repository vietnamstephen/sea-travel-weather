import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const ctx={window:{}};
for(const file of ['js/data.js','js/risk.js'])vm.runInNewContext(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),ctx);
const R=ctx.window.SEA_RISK;
const ids=(d,g)=>Array.from(R.outfit(d,g).items,x=>x.id);
const base={precipitation_probability_max:0,precipitation_sum:0};
test('five temperature bands, coherent sets for both genders',()=>{
 const sets={male:[['tshirt','pants','sandal'],['tshirt','pants','sneaker'],['shirt','pants','sneaker'],['long-sleeve','hoodie','pants','sneaker'],['long-sleeve','jacket','pants','boot']],female:[['tank','skirt','sandal'],['tshirt','dress','sandal'],['long-sleeve','pants','sneaker'],['long-sleeve','hoodie','pants','sneaker'],['long-sleeve','jacket','pants','boot']]};
 for(const g of ['male','female'])[32,26,20,14,13].forEach((temp,i)=>{const r=R.outfit({...base,apparent_temperature_max:temp},g);assert.equal(r.band,['hot','warm','mild','cool','cold'][i]);assert.deepEqual(Array.from(r.items.filter(x=>x.category==='clothes'),x=>x.id),sets[g][i].map(x=>'i-'+x));});
});
test('optional jacket uses morning/evening then air range, no cold duplicate',()=>{
 for(const d of [{temperature_morning:15,temperature_evening:23},{temperature_2m_min:12}])assert.equal(R.outfit({temperature_2m_max:22,...d}).items.filter(x=>x.category==='optional').length,1);
 assert(!ids({temperature_2m_max:22,temperature_morning:21,temperature_evening:22,temperature_2m_min:0}).includes('i-jacket'));
 assert.equal(ids({temperature_2m_max:10,temperature_2m_min:0}).filter(x=>x==='i-jacket').length,1);
});
test('rain branches and strict bounds; storm overrides umbrellas and deduplicates boots',()=>{
 for(const [p,r,id] of [[29,.9,null],[30,0,'i-umbrella-simple'],[0,1,'i-umbrella-simple'],[59,0,'i-umbrella-simple'],[60,10,'i-umbrella'],[100,24.9,'i-umbrella'],[60,0,null],[0,10,null]])assert.deepEqual(ids({precipitation_probability_max:p,precipitation_sum:r}),id?[id]:[]);
 for(const trigger of [{precipitation_sum:25},{wind_gusts_10m_daytime_max:40},{wind_gusts_10m_max:40},{weather_code:95},{weather_code:99}]){const r=ids({precipitation_probability_max:80,precipitation_sum:15,...trigger});assert(r.includes('i-raincoat'));assert(r.includes('i-boot'));assert(!r.some(x=>x.includes('umbrella')));}
 assert.equal(ids({temperature_2m_max:10,precipitation_sum:30}).filter(x=>x==='i-boot').length,1);
 assert(!ids({wind_speed_10m_max:70,wind_gusts_10m_max:null}).includes('i-raincoat'));
});
test('UV thresholds and hot hat deduplication',()=>{
 for(const uv of [6,7])assert.deepEqual(ids({uv_index_max:uv}),['i-sunscreen']);
 assert.equal(ids({uv_index_max:5}).length,0);
 const r=ids({temperature_2m_max:33,uv_index_max:8});for(const id of ['i-sunscreen','i-sunglasses','i-cap'])assert(r.includes(id));assert.equal(r.filter(x=>x==='i-cap').length,1);
});
test('missing values skip independently; daytime preference and real daily fixture',()=>{
 assert.deepEqual(ids({}),[]);assert.equal(R.outfit({temperature_2m:22}).band,'mild');assert.equal(R.outfit({apparent_temperature_max:null,temperature_2m_max:28}).band,'warm');assert(ids({precipitation_sum:2}).includes('i-umbrella-simple'));
 assert(!ids({precipitation_probability_daytime_max:0,precipitation_probability_max:80,precipitation_sum:0}).length);
 const W=JSON.parse(fs.readFileSync(new URL('../data/weather.json',import.meta.url)));const wc=W.countries.vn.cities.hcm;const date=wc.daily.time[0],day=R.outfitDay(wc,date);assert.equal(day.time,date);assert.equal(day.precipitation_sum,wc.daily.precipitation_sum[0]);assert(R.outfit(day,'female').items.length>=3);assert.equal(R.outfitDay(wc,'1900-01-01'),null);
});
test('outfit is pure and hourly gust fallback never uses ordinary wind when gust series exists',()=>{
 const day={temperature_2m_max:30,precipitation_sum:15,precipitation_probability_max:80,uv_index_max:9};const before=JSON.stringify(day);R.outfit(day,'female');assert.equal(JSON.stringify(day),before);
 const wc={daily:{time:['2026-11-15'],temperature_2m_max:[30],wind_speed_10m_max:[80]},hourly:{time:['2026-11-15T09:00','2026-11-15T10:00'],wind_gusts_10m:[20,42]}};assert(ids(R.outfitDay(wc,'2026-11-15')).includes('i-raincoat'));wc.hourly.wind_gusts_10m=[null,null];assert(!ids(R.outfitDay(wc,'2026-11-15')).includes('i-raincoat'));
});
