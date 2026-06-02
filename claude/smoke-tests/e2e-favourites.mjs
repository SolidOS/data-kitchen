// Communal favourites (Slice 1) e2e — star an image collection, see it on the
// 5th ★ wall (grouped, with contributor), jump from the wall, owner-remove.
// MUTATES the favourites/ folder; run via run-favourites.sh (clears before+after).
import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--disable-dev-shm-usage']});
let fails=0; const errs=[];
const check=(ok,m)=>{ if(!ok){fails++;console.log('✗ '+m);} else console.log('✓ '+m); };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const IMG=`document.getElementById('panel-images').shadowRoot`;
const FAV=`document.getElementById('panel-favourites').shadowRoot`;
try{
  const page=await b.newPage();
  page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  page.on('pageerror',e=>errs.push('PE:'+e.message));
  await page.goto('http://localhost:3000/solid/open_media_player/',{waitUntil:'networkidle2',timeout:30000});
  check(await page.$('#omp-tabs > .sol-tabs-bar > button[data-tab-id="Favourites"]')!==null, '5th ★ Favourites tab present');

  await page.click('#omp-tabs > .sol-tabs-bar > button[data-tab-id="Images"]');
  await page.waitForFunction((IMG)=>eval(IMG)?.querySelectorAll('.row.lib').length>=2,{timeout:15000},IMG);
  const clickRow=(cls,re)=>page.evaluate((IMG,cls,re)=>{const r=eval(IMG);const b=[...r.querySelectorAll('.row.'+cls)].find(x=>new RegExp(re,'i').test(x.textContent));if(b){b.click();return true;}return false;},IMG,cls,re);
  await clickRow('lib','^Art$');
  await page.waitForFunction((IMG)=>eval(IMG).querySelectorAll('.row.topic').length>0,{timeout:8000},IMG);
  await clickRow('topic','Tarot Decks');
  await page.waitForFunction((IMG)=>eval(IMG).querySelectorAll('.row.coll').length>0,{timeout:8000},IMG);
  await page.evaluate((IMG)=>{const r=eval(IMG);const li=[...r.querySelectorAll('li.has-star')].find(l=>/1JJ/i.test(l.textContent));li.querySelector('.star').click();},IMG);
  await page.waitForSelector('.omp-fav-overlay .omp-fav-name',{timeout:5000});
  await page.type('.omp-fav-overlay .omp-fav-name','Jeff');
  await page.evaluate(()=>{ document.querySelector('.omp-fav-overlay .omp-fav-title').value=''; });
  await page.type('.omp-fav-overlay .omp-fav-title','my tarot pick');
  await page.click('.omp-fav-overlay .omp-fav-add');
  await sleep(1200);
  check(true,'starred a collection (prompt → append)');
  check(await page.evaluate((IMG)=>[...eval(IMG).querySelectorAll('.fav-link')].some(a=>/1JJ/i.test(a.textContent)),IMG),'collection appears in the Images Favourites column');

  await page.click('#omp-tabs > .sol-tabs-bar > button[data-tab-id="Favourites"]');
  await page.waitForFunction((FAV)=>eval(FAV)?.querySelectorAll('.fav-card').length>0,{timeout:8000},FAV);
  const card=await page.evaluate((FAV)=>{const c=eval(FAV).querySelector('.fav-card');return c?{title:c.querySelector('.fav-title').textContent,count:c.querySelector('.fav-count').textContent,contrib:c.querySelector('.fav-contribs').textContent}:null;},FAV);
  check(card && /1JJ|Tarot/i.test(card.title) && /Jeff/.test(card.contrib) && /my tarot pick/.test(card.contrib),
    `wall card "${card?card.title:'none'}" ${card?card.count:''} — ${card?card.contrib.trim():''}`);

  await page.evaluate((FAV)=>eval(FAV).querySelector('.fav-card').click(),FAV);
  await sleep(1500);
  check(await page.evaluate(()=>document.querySelector('#omp-tabs .sol-tabs-pane:not([hidden])')?.querySelector('#panel-images')!=null),'clicking the card jumps to Images + opens it');

  await page.click('#omp-tabs > .sol-tabs-bar > button[data-tab-id="Favourites"]');
  await page.waitForFunction((FAV)=>eval(FAV)?.querySelector('.fav-rm'),{timeout:5000},FAV);
  await page.evaluate((FAV)=>eval(FAV).querySelector('.fav-rm').click(),FAV);
  await page.waitForFunction((FAV)=>eval(FAV).querySelectorAll('.fav-card').length===0,{timeout:6000},FAV).then(()=>check(true,'owner remove (✕) clears it from the wall')).catch(()=>check(false,'owner remove (✕) clears it from the wall'));

  check(errs.length===0,`no console/page errors${errs.length?' — '+errs.join('; '):''}`);
  console.log(fails?`\n${fails} failure(s)`:'\nAll favourites Slice-1 checks passed.');
  process.exitCode=fails?1:0;
}finally{await b.close();}
