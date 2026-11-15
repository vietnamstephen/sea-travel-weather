/** Hospital-5 acceptance. Run on the Mac wrapper only:
 * NODE_PATH=~/WorkBuddy/pw/node_modules node scripts/hospital-5-playwright.mjs
 * Starts its own localhost server and writes the requested screenshots.
 */
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {extname, join, normalize, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const out=join(homedir(),'WorkBuddy/cards/shots'); await mkdir(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=resolve(root,'.'+normalize(path));if(!file.startsWith(root))throw Error('bad path');const body=await readFile(file);res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream'});res.end(body);}catch{res.writeHead(404);res.end('not found');}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const port=server.address().port,browser=await chromium.launch({headless:true}),failures=[],heights=[];
const record=(ok,msg)=>{if(!ok)failures.push(msg);};
try{
 for(const [country,city] of [['vn','danang'],['vn','hcm'],['th','samutsakhon'],['th','bangkok']]) for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'no-preference'});
  await page.goto(`http://127.0.0.1:${port}/${country}.html?lang=zh&city=${city}`,{waitUntil:'networkidle'});
  await page.locator(`.city-row[data-city="${city}"]`).waitFor({state:'visible'});
  await page.locator(`.city-row[data-city="${city}"] .attractions`).waitFor({timeout:20000});
  await page.locator(`.city-row[data-city="${city}"] .hospitals`).waitFor({timeout:20000});
  await page.locator(`.city-row[data-city="${city}"] .attractions img`).evaluateAll(xs=>xs.forEach(x=>x.loading='eager'));
  await page.evaluate(()=>Promise.all([...document.querySelectorAll('.attractions img')].map(x=>x.decode().catch(()=>{}))));
  await page.waitForTimeout(350);
  const measured=await page.evaluate(()=>({height:document.documentElement.scrollHeight,hospital:Math.ceil(document.querySelector('.hospitals')?.getBoundingClientRect().height||0),count:document.querySelectorAll('.hospitals li').length,phoneMin:Math.min(...[...document.querySelectorAll('.hosp-call')].map(x=>Math.round(x.getBoundingClientRect().height))),attractionCount:document.querySelectorAll('.attr-card').length,viewport:innerWidth}));
  heights.push({country,city,width,...measured});
  if(city==='danang'&&width===390){record(measured.hospital<=700,`Danang mobile hospitals ${measured.hospital}px > 700`);await page.evaluate(()=>{const h=document.querySelector('header');if(h)h.style.position='static';});await page.screenshot({path:join(out,'hospital-5-danang-390.png'),fullPage:true});}
  if(city==='danang'&&width===1280){
   const rail=page.locator('.attr-scroll'); await rail.waitFor();
   const railState=await rail.evaluate(el=>({overflow:el.classList.contains('has-overflow'),start:el.classList.contains('is-start'),prev:getComputedStyle(el.querySelector('.attr-prev')).display,next:getComputedStyle(el.querySelector('.attr-next')).display,mask:getComputedStyle(el.querySelector('ul')).maskImage}));
   record(railState.overflow,'Da Nang desktop rail should overflow');record(railState.start,'Da Nang desktop rail should start at beginning');record(railState.next!=='none'&&await page.locator('.attr-next').isVisible(),'next arrow should be visible at start');record(railState.prev==='none','previous arrow should hide at start');record(railState.mask!=='none','desktop rail mask should be active');
   await rail.screenshot({path:join(out,'hospital-5-danang-rail.png')});
   await page.evaluate(()=>{const h=document.querySelector('header');if(h)h.style.position='static';});await page.screenshot({path:join(out,'hospital-5-danang-1280.png'),fullPage:true});
  }
  {
   const page=await browser.newPage({viewport:{width:390,height:900}});
   await page.goto(`http://127.0.0.1:${port}/vn.html?lang=zh`,{waitUntil:'networkidle'});
   const phu=page.locator('.city-row[data-city="phuquoc"]'); await phu.waitFor({state:'attached'});
   await phu.screenshot({path:join(out,'hospital-5-phuquoc-collapsed.png')});
   record(await phu.locator('.hosp-jump').count()===0,'Phu Quoc collapsed row must not show the hospital marker when hospital count is zero');
   const danang=page.locator('.city-row[data-city="danang"]');
   await danang.screenshot({path:join(out,'hospital-5-danang-collapsed.png')});
   // Expand the 7 collapsed .city-extra rows first: hidden rows have zero-size rects, so measuring them reported gap 0 (hospital-5f root cause).
   await page.locator('.city-more').click(); await page.locator('.city-row[data-city="dongnai"] summary').waitFor({state:'visible'});
   const layouts=await page.locator('.city-row summary').evaluateAll(rows=>rows.map(el=>{
    const name=el.querySelector('.city-name'),badge=el.querySelector('.badge'),mark=el.querySelector('.hosp-jump');
    if(!name||!badge)return {city:el.closest('.city-row').dataset.city,missing:true};
    const a=name.getBoundingClientRect(),b=badge.getBoundingClientRect(),c=mark?.getBoundingClientRect();
    return {city:el.closest('.city-row').dataset.city,nowrap:getComputedStyle(name).whiteSpace==='nowrap',overlap:a.right>b.left||(c&&b.right>c.left),gap:c?c.left-b.right:null};
   }));
   record(layouts.every(x=>!x.missing&&x.nowrap&&!x.overlap&&(x.gap===null||x.gap>=8)),`390px city name/marker layout failed: ${JSON.stringify(layouts.filter(x=>x.missing||!x.nowrap||x.overlap||(x.gap!==null&&x.gap<8)))}`);
   await phu.locator('summary').click(); await page.locator('.city-row[data-city="phuquoc"] .hospitals').waitFor({state:'visible'});
   const empty=page.locator('.city-row[data-city="phuquoc"] .hospitals');
   record(await empty.locator('li').count()===0,'Phu Quoc expanded hospital list should contain zero hospitals');
   record(await empty.locator('.hosp-emergency').count()===1,'Phu Quoc expanded row must retain the emergency call strip');
   record((await empty.locator('.hosp-empty').textContent()||'').includes('暂无核实的医院信息'),'Phu Quoc expanded row must show the unverified hospital notice');
   await page.close();
  }
  if(width===1280)record(measured.height<=3000,`${city} desktop height ${measured.height}>3000`);else record(measured.height<=5000,`${city} mobile height ${measured.height}>5000`);
  if(city==='danang')record(measured.phoneMin>=44,`Danang call target minimum ${measured.phoneMin}px`);
  if(city==='danang')record(await page.locator('.hosp-call').evaluateAll(xs=>xs.every(x=>x.getAttribute('href').startsWith('tel:'))),'hospital phone actions must remain tel links');
  if(city==='danang'&&width===1280){
   const next=page.locator('.attr-scroll.has-overflow.is-start .attr-next');
   await next.waitFor({state:'visible',timeout:5000});
   await next.click();await page.waitForTimeout(450);
   const moved=await page.locator('.attr-scroll ul').evaluate(el=>el.scrollLeft>0)/* the ul is the overflow:auto scroller; .attr-scroll is overflow:visible so its scrollLeft is always 0 (hospital-5f root cause) */;record(moved,'desktop next arrow should scroll the attraction rail');
  }
  await page.close();
 }
 {
  const d=JSON.parse(await readFile(join(root,'data/hospitals.json'),'utf8'));
  const first=d.countries.vn.danang[0],context=await browser.newContext({viewport:{width:390,height:900},permissions:['geolocation'],geolocation:{latitude:first.lat,longitude:first.lng}});
  const page=await context.newPage(); await page.goto(`http://127.0.0.1:${port}/vn.html?lang=zh&city=danang`,{waitUntil:'networkidle'});
  await page.locator('.hosp-locate').click(); await page.waitForFunction(()=>sessionStorage.getItem('hospitalPosition')!==null,null,{timeout:10000});
  const names=await page.locator('.hospitals li strong').allTextContents();record(names[0]===first.name.zh,`geolocation should sort nearest hospital first; got ${names[0]}`);await context.close();
 }
 const heightTable=['country/city | 390px | 1280px','---|---:|---:',...['vn/danang','vn/hcm','th/samutsakhon','th/bangkok'].map(key=>{const [country,city]=key.split('/'),m=width=>heights.find(x=>x.country===country&&x.city===city&&x.width===width)?.height??'—';return `${country}/${city} | ${m(390)} | ${m(1280)}`;})].join('\n');
 console.log(JSON.stringify({heightTable,heights,failures},null,2));
} catch(e){console.error(e);failures.push(String(e));}
finally{await browser.close();await new Promise(ok=>server.close(ok));}
if(failures.length)process.exitCode=1;
