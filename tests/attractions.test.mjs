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

test('must-see Singapore Zoo survives missing class discovery and nearer-city assignment',()=>{
 const py=`from scripts import build_attractions as b
from unittest.mock import patch
assert b.sanitise_author('No machine-readable author provided. <a>Terence</a> assumed (based on copyright claims).') == 'Terence'
qid='Q2709506'
def claim(value): return {'mainsnak':{'datavalue':{'value':value}}}
entity={'labels':{'en':{'value':'Singapore Zoo'}},'descriptions':{},'sitelinks':{'enwiki':{}},'claims':{'P625':[claim({'latitude':1.4043,'longitude':103.793,'globe':'http://www.wikidata.org/entity/Q2'})],'P17':[claim({'id':'Q334'})]}}
def fetch(url, params):
 if 'sparql' in url: return {'results':{'bindings':[]}}
 return {'entities':{qid:entity}}
city={'id':'singapore','country':'sg','lat':1.3,'lon':103.8,'coastal':True,'island':True}
with patch.object(b,'fetch',side_effect=fetch):
 result=b.build_city(city,[{'id':'jurong','lat':1.4043,'lon':103.793}])
 assert [a['qid'] for a in result]==[qid]
 entity['claims']['P17']=[claim({'id':'Q881'})]
 try: b.build_city(city,[])
 except RuntimeError: pass
 else: raise AssertionError('whitelist must retain country validation')
`;
 execFileSync('python3',['-B','-c',py]);
 const d=JSON.parse(fs.readFileSync('data/attractions.json'));
 assert(d.countries.sg.singapore.some(a=>a.qid==='Q2709506'&&a.type==='zoo'));
});

test('Phuket Seashell Museum survives private-operator OSM gate while ordinary commercial venues do not',()=>{
 const py=`from scripts import build_attractions as b
from unittest.mock import patch
assert 'Q16678462' not in b.EXCLUDE
city={'id':'phuket','lat':7.8,'lon':98.3,'coastal':True,'island':True}
def fetch(url,params,**kwargs):
 if 'overpass' in url: return {'elements':[
  {'type':'node','id':1,'lat':7.8,'lon':98.3,'tags':{'name':'Phuket Seashell Museum','tourism':'museum','operator:type':'private','wikidata':'Q16678462'}},
  {'type':'node','id':2,'lat':7.81,'lon':98.31,'tags':{'name':'Commercial Museum','tourism':'museum','operator:type':'private','wikidata':'Q999'}}]}
 return {'entities':{'Q16678462':{'labels':{'en':{'value':'Phuket Seashell Museum'}},'descriptions':{},'claims':{},'sitelinks':{'enwiki':{}}}}}
with patch.object(b,'fetch',side_effect=fetch),patch.object(b,'CACHE',b.ROOT/'not-a-cache'):
 result=b.add_osm(city,[],[])
 assert [a['qid'] for a in result]==['Q16678462']
`;
 execFileSync('python3',['-B','-c',py]);
 const d=JSON.parse(fs.readFileSync('data/attractions.json'));
 assert(d.countries.th.phuket.some(a=>a.qid==='Q16678462'));
});

test('hospital-5 Chinese attraction overrides and Da Nang park photo have sourced fallback data',()=>{
 const overrides=JSON.parse(fs.readFileSync('data/attractions_overrides.json','utf8'));
 assert.equal(overrides.Q18164670.zh,'第五军区博物馆');
 assert.equal(overrides.Q60853845.zh,'山茶半岛灵应寺观音像');
 const park=JSON.parse(fs.readFileSync('data/attractions.json','utf8')).countries.vn.danang.find(a=>a.qid==='Q32176308');
 assert.equal(park.name.vi,'Công viên 29 tháng 3');
 assert.equal(park.photo.author,'Martin Lewison');
 assert.equal(park.photo.license,'CC BY 2.0');
 assert.match(park.photo.filePage,/commons\.wikimedia\.org/);
 assert.match(source,/manual\.zh \|\| \(v\[local\] &&/);
 assert.doesNotMatch(source,/LANG==='zh' \? \(manual\.zh \|\| v\.en/);
});
