/**
 * e2e-images.mjs — headless browser check for the 🖼 Images tab.
 *
 * The Images panel (<omp-images>) is now laid out like the music/movies player:
 * a Favourites column (left), a three-column Library→Topic→Collection browser
 * (top-right), and the display-only <sol-gallery> masonry grid (bottom-right,
 * a NESTED shadow root). Selectors live in omp-images.shadowRoot; the grid +
 * lightbox in omp-images.shadowRoot → sol-gallery.shadowRoot.
 *
 * Flow: switch to Images, drill Art → Tarot Decks → Tarot 1JJ, confirm live
 * Commons thumbnails + lightbox, favourite a collection and confirm it pins to
 * the Favourites column, and confirm the owner-only +Topic/+Collection render.
 *
 * Needs the dev server up:  http://localhost:3000/solid/open_media_player/
 * Run from project root:     node claude/smoke-tests/e2e-images.mjs
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = resolve(HERE, '../validation/images-e2e');
mkdirSync(SHOTS, { recursive: true });
const URL = 'http://localhost:3000/solid/open_media_player/';
const CHROME = '/usr/bin/google-chrome';

const errors = [];
let fails = 0;
const check = (ok, msg) => { if (!ok) { fails++; console.log(`✗ ${msg}`); } else console.log(`✓ ${msg}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 820 });
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });

  // Click a row in omp-images' shadow by class + text. cls e.g. 'lib','topic','coll','fav-link'.
  const clickRow = (cls, re) => page.evaluate((cls, reSrc) => {
    const root = document.getElementById('panel-images').shadowRoot;
    const rx = new RegExp(reSrc, 'i');
    const b = [...root.querySelectorAll('.row.' + cls)].find(x => rx.test(x.textContent));
    if (b) { b.click(); return b.textContent.trim(); }
    return null;
  }, cls, re);
  const countSel = (sel) => page.evaluate((sel) =>
    document.getElementById('panel-images').shadowRoot.querySelectorAll(sel).length, sel);
  const galleryThumbs = () => page.evaluate(() => {
    const g = document.getElementById('panel-images').shadowRoot.querySelector('sol-gallery');
    return g?.shadowRoot ? g.shadowRoot.querySelectorAll('.gallery-grid img').length : -1;
  });

  // Switch to Images; wait for the Library column (Art / Life).
  await page.click('#omp-tabs > .sol-tabs-bar > button[data-tab-id="Images"]');
  await page.waitForFunction(() => {
    const g = document.getElementById('panel-images');
    return g && !g.hidden && g.shadowRoot && g.shadowRoot.querySelectorAll('.row.lib').length >= 2;
  }, { timeout: 15000 });
  check((await countSel('.row.lib')) >= 2, `Library column shows ${await countSel('.row.lib')} libraries (Art / Life)`);

  // owner-only add controls present (dev runs as SolidKitchen owner).
  const owner = await page.evaluate(() => {
    const host = document.getElementById('panel-images');
    return { owner: host.classList.contains('owner'),
             labels: [...host.shadowRoot.querySelectorAll('.add-btn')].map(b => b.textContent) };
  });
  check(owner.owner && owner.labels.length === 2, `owner +controls render: ${owner.labels.join(' / ')}`);

  // Drill: Art → Tarot Decks → Tarot 1JJ.
  check(!!(await clickRow('lib', '^Art$')), 'selected Art library');
  await page.waitForFunction(() => document.getElementById('panel-images').shadowRoot.querySelectorAll('.row.topic').length > 0, { timeout: 8000 });
  check(!!(await clickRow('topic', 'Tarot Decks')), 'selected Tarot Decks topic');
  await page.waitForFunction(() => document.getElementById('panel-images').shadowRoot.querySelectorAll('.row.coll').length > 0, { timeout: 8000 });
  const clicked = await clickRow('coll', '1JJ');
  check(!!clicked, `opened collection ${clicked}`);
  await page.screenshot({ path: `${SHOTS}/1-layout.png` });

  // Thumbnails populate the nested gallery grid (live Commons fetch).
  await page.waitForFunction(() => {
    const g = document.getElementById('panel-images').shadowRoot.querySelector('sol-gallery');
    return g?.shadowRoot?.querySelectorAll('.gallery-grid img').length > 0;
  }, { timeout: 20000 });
  await sleep(1000);
  check((await galleryThumbs()) > 0, `grid loaded ${await galleryThumbs()} thumbnails`);
  await page.screenshot({ path: `${SHOTS}/2-grid.png` });

  // Favourite the open collection via its ★, fill the name/label prompt, then
  // confirm it pins to the Favourites column. (Mutates favourites/ — cleaned
  // up at the end of the run.)
  await page.evaluate(() => {
    const root = document.getElementById('panel-images').shadowRoot;
    const li = [...root.querySelectorAll('li.has-star')].find(l => /1JJ/i.test(l.textContent));
    li?.querySelector('.star')?.click();
  });
  await page.waitForSelector('.omp-fav-overlay .omp-fav-title', { timeout: 5000 });
  await page.evaluate(() => { const t = document.querySelector('.omp-fav-overlay .omp-fav-title'); if (t) t.value = ''; });
  await page.type('.omp-fav-overlay .omp-fav-title', 'e2e images pick');
  await page.click('.omp-fav-overlay .omp-fav-add');
  await sleep(900);
  const favCount = await page.evaluate(() =>
    document.getElementById('panel-images').shadowRoot.querySelectorAll('.fav-col .row.fav-link').length);
  check(favCount >= 1, `favouriting pins the collection to the Favourites column (${favCount})`);

  // Lightbox: open first thumb + page it.
  await page.evaluate(() =>
    document.getElementById('panel-images').shadowRoot.querySelector('sol-gallery')
      .shadowRoot.querySelector('.gallery-thumb').click());
  await page.waitForFunction(() => {
    const lb = document.getElementById('panel-images').shadowRoot.querySelector('sol-gallery')
      .shadowRoot.querySelector('.gallery-lightbox');
    return lb && !lb.hidden && lb.querySelector('img')?.getAttribute('src');
  }, { timeout: 10000 });
  check(true, 'lightbox opened with a full image');
  await page.screenshot({ path: `${SHOTS}/3-lightbox.png` });

  // Clean up the favourite we added so the shared folder isn't polluted.
  // (The standalone ★ Favourites tab was retired — delete the wall file directly.)
  await page.evaluate(async () => {
    const base = new URL('favourites/', document.baseURI).href;
    const ttl = await (await fetch(base, { headers: { Accept: 'text/turtle' }, cache: 'no-store' })).text();
    const m = ttl.match(/ldp:contains\s+([^.]+)\./s);
    const ids = m ? [...m[1].matchAll(/<([^>]+)>/g)].map(x => x[1]) : [];
    for (const id of ids) {
      const u = new URL(id, base).href;
      const c = await (await fetch(u, { cache: 'no-store' })).text();
      if (/e2e images pick/.test(c)) await fetch(u, { method: 'DELETE' });
    }
  });
  await sleep(300);

  check(errors.length === 0, `no console / page errors${errors.length ? ' — ' + errors.length + ' seen' : ''}`);
  for (const e of errors) console.log(`    ! ${e}`);

  console.log(`\nScreenshots: ${SHOTS}`);
  console.log(fails ? `\n${fails} failure(s)` : '\nAll e2e checks passed.');
  process.exitCode = fails ? 1 : 0;
} finally {
  await browser.close();
}
