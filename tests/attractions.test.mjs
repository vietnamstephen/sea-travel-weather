import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
const source=fs.readFileSync('js/app.js','utf8');
const fn=source.slice(source.indexOf('  function sanitiseAuthor('),source.indexOf('  function attractionToggle('));
const ctx={};vm.runInNewContext(fn,ctx);
const fixtures=[
 ["This Photo was taken by Supanut Arunoprayote.\n\nFeel free to use any of my images, but please mention me as the author and may send me a message.  (สามารถใช้ภาพได้อิสระ แต่กรุณาใส่เครดิตผู้ถ่ายและอาจส่งข้อความบอกกล่าวด้วย) \n\n\n\nPlease do not upload an updated image here without consultation with the Author. The author would like to make corrections only at his own source. This ensures that the changes are preserved.Please if you think that any changes should be required, please inform the author.Otherwise you can upload a new image with a new name. Please use one of the templates derivative or extract.",'Supanut Arunoprayote'],
 ['The original uploader was Chuoibk at English Wikipedia.','Chuoibk'],
 ['Nguyễn Thanh Quang 05:39, 20 April 2007 (UTC)','Nguyễn Thanh Quang'],
 ['Heinrich Damm (User:Hdamm, Hdamm at de.wikipedia.org)','Heinrich Damm'],
 ['Queen_suriyothai0609.jpg: Heinrich Damm (User:Hdamm)','Heinrich Damm'],
 ['Dmitrii Loktionov from Nizhny Novgorod, Russia','Dmitrii Loktionov'],
 ['Photographer: Mosbatho','Mosbatho'],
 ['Iceway12 at en.wikipedia','Iceway12'],
 ['<a href="example">Diego Delso</a>','Diego Delso']
];
test('Commons authors: builder and client strip markup, uploader wrappers, timestamps and permission prose',()=>{
 const py="import importlib.util,json,sys; s=importlib.util.spec_from_file_location('build','scripts/build_attractions.py'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(json.dumps([m.sanitise_author(x) for x in json.loads(sys.argv[1])]))";
 const result=JSON.parse(execFileSync('python3',['-B','-c',py,JSON.stringify(fixtures.map(x=>x[0]))],{encoding:'utf8'}));
 fixtures.forEach(([input,expected],i)=>{assert.equal(ctx.sanitiseAuthor(input),expected);assert.equal(result[i],expected);});
});
test('pilot records contain sourced intros, rank counts and bounded approved photo credits',()=>{
 const d=JSON.parse(fs.readFileSync('data/attractions.json'));
 for(const cities of Object.values(d.countries))for(const items of Object.values(cities)){
 assert(items.length<=8);
 for(const a of items){assert(Number.isInteger(a.sitelinks));assert.deepEqual(Object.keys(a.intro),['zh','en','vi','th','id']);
 if(a.photo){assert(a.photo.author.length<=40);assert.match(a.photo.license,/^CC(?:0(?: 1\.0)?| BY(?:-SA)?(?: \d+(?:\.\d+)?)?)$/);for(const thumb of [a.photo.thumb330,a.photo.thumb500]){
 const url=new URL(thumb);assert.equal(url.protocol,'https:');
 const scaled=url.pathname.match(/\/(\d+)px-/);
 if(scaled){assert([330,500,512,960].includes(Number(scaled[1])));assert.equal(Number(scaled[1]),thumb===a.photo.thumb330?a.photo.width330:a.photo.width500);}
 else {assert.equal(url.hostname,'upload.wikimedia.org');assert.match(url.pathname,/^\/wikipedia\/commons\/[a-f0-9]\/[a-f0-9]{2}\/[^/]+$/);}
 }}
 }
 }
});

test('Chinese source selection prefers Simplified variants and converts Traditional names and intros',()=>{
 const py="from scripts.build_attractions import source_text; assert source_text({'zh':{'value':'戰爭遺跡博物館'}},'zh') == '战争遗迹博物馆'; assert source_text({'zh':{'value':'西貢'}},'zh') == '西贡'; assert source_text({'zh-hans':{'value':'简体'},'zh-cn':{'value':'中国'},'zh':{'value':'傳統'}},'zh') == '简体'; assert source_text({'zh-cn':{'value':'西貢'},'zh':{'value':'傳統'}},'zh') == '西贡'; assert source_text({'en':{'value':'Museum'}},'en') == 'Museum'";
 execFileSync('python3',['-B','-c',py]);
});

test('pilot cleanup preserves inland gap, commercial exclusions and licensed source-only supplements',()=>{
 const d=JSON.parse(fs.readFileSync('data/attractions.json'));
 assert.equal(d.countries.vn.bacgiang.length,0);
 for(const [country,cities] of Object.entries(d.countries))for(const [city,items] of Object.entries(cities))for(const a of items){
 assert(!['Q123376181','Q4925552','Q806441','Q1740652','Q97230206'].includes(a.qid));
 assert(a.sitelinks>=0);
 if(a.qid.startsWith('osm:')){assert.equal(a.sitelinks,0);assert.match(a.source,/^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/);}
 else assert(a.sitelinks>=1);
 assert(Object.values(a.name).every(Boolean));
 }
});

test('pilot distances use reference origins, inland day-trip exceptions and nearest-city boundaries',()=>{
 const py=`import json
from scripts import build_attractions as b
d=json.load(open('data/attractions.json'))
for country in b.cities():
 if country['id'] not in ['vn','th']: continue
 neighbours=[b.attraction_origin(c) for c in country['cities']]+b.REGIONAL_NEIGHBOURS.get(country['id'],[])
 for city in country['cities']:
  origin=b.attraction_origin(city)
  for a in d['countries'][country['id']][city['id']]:
   assert a['qid'] not in b.EXCLUDE, (city['id'],a['qid'])
   km=b.distance(origin['lat'],origin['lon'],a['lat'],a['lng'])
   assert km<=30, (city['id'],a['qid'],km)
   if km>12 and not(city['coastal'] or city['island']): assert a['qid'] in b.DAY_TRIPS.get(city['id'],{})
   if km>8: assert all(n['id']==city['id'] or b.distance(n['lat'],n['lon'],a['lat'],a['lng'])>=km for n in neighbours), (city['id'],a['qid'])
`;
 execFileSync('python3',['-B','-c',py]);
});
