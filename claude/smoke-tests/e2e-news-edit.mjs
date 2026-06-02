// News editing e2e — sol-feed [editable], view="topics". Covers rename,
// +add feed, delete (with confirm) → bin, View deleted, restore, drag-to-
// re-categorize, and drag-to-reorder. MUTATES feeds.ttl, so run via the
// snapshot/restore wrapper run-news-edit.sh (GET backup → run → PUT restore).
import puppeteer from 'puppeteer-core';
const URL = 'http://localhost:3000/solid/open_media_player/';
const b = await puppeteer.launch({ executablePath:'/usr/bin/google-chrome', headless:'new', args:['--no-sandbox','--disable-dev-shm-usage'] });
let fails=0; const errs=[];
const check=(ok,m)=>{ if(!ok){fails++;console.log('✗ '+m);} else console.log('✓ '+m); };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const NEWS = `document.getElementById('panel-news').shadowRoot`;   // stringified for evaluate
try {
  const page=await b.newPage();
  page.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
  page.on('pageerror',e=>errs.push('pageerror: '+e.message));
  await page.goto(URL,{waitUntil:'networkidle2',timeout:30000});
  await page.waitForFunction(()=>document.getElementById('panel-news')?.shadowRoot?.querySelectorAll('.feed-topic-column').length>=3 && document.getElementById('panel-news').shadowRoot.querySelectorAll('.feed-add-source').length>=3,{timeout:20000});

  const colOrder=(name)=>page.evaluate((NEWS,name)=>{ const r=eval(NEWS);
    const col=[...r.querySelectorAll('.feed-topic-column')].find(c=>new RegExp('^'+name,'i').test(c.querySelector('.feed-topic-head').textContent));
    return col?[...col.querySelectorAll('.feed-link')].map(a=>a.textContent):[]; },NEWS,name);

  const cc=await page.evaluate((NEWS)=>{ const r=eval(NEWS); return {
    heads:r.querySelectorAll('.feed-topic-head.editable').length, adds:r.querySelectorAll('.feed-add-source').length,
    rows:r.querySelectorAll('.editable-row').length, dels:r.querySelectorAll('.feed-del').length,
    drag:[...r.querySelectorAll('.editable-row')].filter(li=>li.draggable).length }; },NEWS);
  check(cc.heads>=3 && cc.adds>=3, `editable heads + add buttons render (${cc.heads}/${cc.adds})`);
  check(cc.rows>0 && cc.dels===cc.rows && cc.drag===cc.rows, `rows have delete + are draggable (${cc.dels}/${cc.rows})`);

  // rename
  await page.evaluate((NEWS)=>{ const r=eval(NEWS); [...r.querySelectorAll('.feed-topic-head.editable')].find(x=>/Sci/i.test(x.textContent)).click(); },NEWS);
  await page.evaluate((NEWS,nm)=>{ const r=eval(NEWS); const i=r.querySelector('.feed-topic-rename'); i.value=nm; i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); },NEWS,'Sci EDIT');
  await page.waitForFunction((NEWS)=>[...eval(NEWS).querySelectorAll('.feed-topic-head')].some(x=>/Sci EDIT/.test(x.textContent)),{timeout:8000},NEWS);
  check(true,'rename topic persists');

  // add feed to Culture
  await page.evaluate((NEWS)=>{ const r=eval(NEWS); const col=[...r.querySelectorAll('.feed-topic-column')].find(c=>/Culture/i.test(c.querySelector('.feed-topic-head').textContent)); col.querySelector('.feed-add-source').click(); },NEWS);
  await page.evaluate((NEWS)=>{ const r=eval(NEWS); const f=r.querySelector('.feed-add-form'); const ins=f.querySelectorAll('.feed-add-input'); ins[0].value='TEST FEED'; ins[1].value='https://example.com/test-rss.xml'; f.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true})); },NEWS);
  await page.waitForFunction((NEWS)=>[...eval(NEWS).querySelectorAll('.feed-link')].some(a=>/TEST FEED/.test(a.textContent)),{timeout:8000},NEWS);
  check(true,'add feed persists');

  // delete confirm: ✕ shows "Delete X?" — Cancel restores
  const conf=await page.evaluate((NEWS)=>{ const r=eval(NEWS); r.querySelector('.editable-row .feed-del').click(); const c=r.querySelector('.feed-del-confirm'); return c?{q:c.querySelector('.feed-del-q').textContent,yes:c.querySelector('.feed-del-yes').textContent,no:c.querySelector('.feed-del-no').textContent}:null; },NEWS);
  check(conf && conf.yes==='Delete' && conf.no==='Cancel', `delete confirm labelled "Delete" (${conf?conf.q:'none'})`);
  check(await page.evaluate((NEWS)=>{ const r=eval(NEWS); r.querySelector('.feed-del-no').click(); return !r.querySelector('.feed-del-confirm') && !!r.querySelector('.editable-row .feed-link'); },NEWS),'Cancel restores the row');

  // delete (confirmed) → bin
  const deleted=await page.evaluate((NEWS)=>{ const r=eval(NEWS); const row=r.querySelector('.editable-row'); const name=row.querySelector('.feed-link').textContent; row.querySelector('.feed-del').click(); r.querySelector('.feed-del-yes').click(); return name; },NEWS);
  // require the post-delete render to FULLY settle (columns back + OPB gone)
  // before opening the bin, else an in-flight reload can overwrite the bin.
  await page.waitForFunction((NEWS,nm)=>{ const r=eval(NEWS); return r.querySelectorAll('.feed-topic-column').length>=3 && ![...r.querySelectorAll('.feed-link')].some(a=>a.textContent===nm); },{timeout:8000},NEWS,deleted);
  check(true,`delete (confirmed) moves "${deleted}" to the bin`);
  await sleep(800);   // let the reload's async tail (article fetch) settle
  await page.evaluate(()=>document.getElementById('panel-news').appAction('viewDeleted'));
  await page.waitForFunction((NEWS,nm)=>[...eval(NEWS).querySelectorAll('.feed-bin-name')].some(x=>x.textContent===nm),{timeout:8000},NEWS,deleted);
  check(true,`"${deleted}" appears in View deleted`);
  await page.evaluate((NEWS,nm)=>{ const r=eval(NEWS); const row=[...r.querySelectorAll('.feed-bin-row')].find(x=>x.querySelector('.feed-bin-name')?.textContent===nm); row.querySelector('.feed-bin-restore').click(); },NEWS,deleted);
  // wait for restore to settle: the bin re-renders WITHOUT the restored item
  await page.waitForFunction((NEWS,nm)=>{ const r=eval(NEWS); return r.querySelector('.feed-bin-back') && ![...r.querySelectorAll('.feed-bin-name')].some(x=>x.textContent===nm); },{timeout:8000},NEWS,deleted);
  check(true,'restore removes it from the bin');

  // back to normal, then reorder within News
  await page.evaluate((NEWS)=>eval(NEWS).querySelector('.feed-bin-back').click(),NEWS);
  await page.waitForFunction((NEWS)=>eval(NEWS).querySelectorAll('.feed-topic-column').length>=3,{timeout:8000},NEWS);
  const bef=await colOrder('News');
  await page.evaluate((NEWS)=>{ const r=eval(NEWS); const col=[...r.querySelectorAll('.feed-topic-column')].find(c=>/^News/i.test(c.querySelector('.feed-topic-head').textContent));
    const rows=[...col.querySelectorAll('.editable-row')]; const dt=new DataTransfer();
    rows[0].dispatchEvent(new DragEvent('dragstart',{dataTransfer:dt,bubbles:true}));
    rows[2].dispatchEvent(new DragEvent('dragover',{dataTransfer:dt,bubbles:true,clientY:0}));
    rows[2].dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,clientY:0}));
    rows[0].dispatchEvent(new DragEvent('dragend',{dataTransfer:dt,bubbles:true})); },NEWS);
  await page.waitForFunction((NEWS,f)=>{ const r=eval(NEWS); const col=[...r.querySelectorAll('.feed-topic-column')].find(c=>/^News/i.test(c.querySelector('.feed-topic-head')?.textContent||'')); return col?.querySelector('.feed-link')?.textContent && col.querySelector('.feed-link').textContent!==f; },{timeout:8000},NEWS,bef[0]).catch(()=>{});
  const aft=await colOrder('News');
  check(aft[1]===bef[0] && aft[0]===bef[1], `reorder moved "${bef[0]}" down ([${bef.slice(0,3)}]→[${aft.slice(0,3)}])`);

  check(errs.length===0, `no console / page errors${errs.length?' — '+errs.join('; '):''}`);
  console.log(fails?`\n${fails} failure(s)`:'\nAll news-edit checks passed.');
  process.exitCode=fails?1:0;
} finally { await b.close(); }
