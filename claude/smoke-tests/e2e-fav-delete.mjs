/**
 * e2e-fav-delete.mjs — verify the owner (logged-in OR kitchen) can delete a
 * favourite from the communal wall, across all three surfaces:
 *   • Music ★ Favorites view  — the row's ✕ removes the wall file(s).
 *   • Movies ★ Favorites view — same.
 *   • Images ★ Favourites column — owner-only ✕ per favourite row.
 *
 * The dev CSS server is in kitchen mode (index.html sets window.SolidKitchen),
 * so the owner affordances show and the unauth DELETE is accepted.
 * Run from project root: node claude/smoke-tests/e2e-fav-delete.mjs
 */
import puppeteer from 'puppeteer-core';
const BASE = 'http://localhost:3000/solid/open_media_player/';
const FAVS = BASE + 'favourites/';

let fails = 0;
const check = (ok, msg) => { if (!ok) { fails++; console.log(`✗ ${msg}`); } else console.log(`✓ ${msg}`); };

const ttl = ({ item, bucket, schemaType, name, link, download }) =>
`@prefix schema: <http://schema.org/> .
@prefix dct: <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix dctype: <http://purl.org/dc/dcmitype/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
<> a schema:BookmarkAction ; dct:creator "tester" ; dct:title ${JSON.stringify(name)} ;
   dct:created "2026-06-01T00:00:00Z"^^xsd:dateTime ; dct:references <${item}> .
<${item}> a dctype:${bucket}, schema:${schemaType} ; schema:name ${JSON.stringify(name)} ;
   ${download ? 'dcat:downloadURL' : 'dcat:landingPage'} <${link}> .
`;

async function postFav(f) {
  const r = await fetch(FAVS, { method: 'POST', headers: { 'Content-Type': 'text/turtle' }, body: ttl(f) });
  if (!r.ok) throw new Error(`POST fav HTTP ${r.status}`);
  return new URL(r.headers.get('Location'), FAVS).href;
}
async function favCount() {
  const r = await fetch(FAVS, { headers: { Accept: 'text/turtle' }, cache: 'no-store' });
  if (!r.ok) return 0;
  const t = await r.text();
  // CSS lists members as relative refs in an `ldp:contains <a>, <b>, … .` block.
  const m = t.match(/ldp:contains\s+([^.]+)\./s);
  return m ? [...m[1].matchAll(/<([^>]+)>/g)].length : 0;
}

const created = [];
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  created.push(await postFav({ item: 'https://archive.org/details/zzmovie', bucket: 'MovingImage',
    schemaType: 'VideoObject', name: 'ZZ Delete Movie', link: 'https://archive.org/details/zzmovie', download: false }));
  created.push(await postFav({ item: 'https://archive.org/download/zzsong/zzsong.mp3', bucket: 'Sound',
    schemaType: 'AudioObject', name: 'ZZ Delete Song', link: 'https://archive.org/download/zzsong/zzsong.mp3', download: true }));
  created.push(await postFav({ item: 'https://example.org/coll/zzgallery', bucket: 'Collection',
    schemaType: 'ImageGallery', name: 'ZZ Delete Gallery', link: 'https://example.org/coll/zzgallery', download: false }));

  const startCount = await favCount();

  const page = await browser.newPage();
  await page.setViewport({ width: 1320, height: 880 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', async (d) => { await d.accept(); });   // auto-confirm deletes

  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForFunction(
    () => document.querySelectorAll('#omp-tabs > .sol-tabs-bar > button').length === 4, { timeout: 20000 });
  const clickTab = (id) => page.evaluate((id) =>
    document.querySelector(`#omp-tabs > .sol-tabs-bar > button[data-tab-id="${id}"]`).click(), id);

  // Favourites now live in the "Community Favorites" column (both music and
  // movies), each row with an owner ✕ (.ia-row-favdel).
  const delFromFavCol = async (panel, re) => {
    await clickTab(panel === 'panel-music' ? 'Music' : 'Movies');
    await page.waitForFunction((p) =>
      document.querySelector(`#${p} #ia-h-favs`)?.textContent.trim() === 'Community Favorites', { timeout: 30000 }, panel);
    await page.waitForFunction((p, r) =>
      [...document.querySelectorAll(`#${p} .ia-favourites-list .ia-listbox-item`)].some(li => new RegExp(r).test(li.textContent)),
      { timeout: 15000 }, panel, re);
    const xVisible = await page.evaluate((p, r) => {
      const li = [...document.querySelectorAll(`#${p} .ia-favourites-list .ia-listbox-item`)].find(li => new RegExp(r).test(li.textContent));
      const x = li?.querySelector('.ia-row-favdel');
      return !!x && getComputedStyle(x).display !== 'none';
    }, panel, re);
    await page.evaluate((p, r) => {
      const li = [...document.querySelectorAll(`#${p} .ia-favourites-list .ia-listbox-item`)].find(li => new RegExp(r).test(li.textContent));
      li.querySelector('.ia-row-favdel').click();
    }, panel, re);
    const gone = await page.waitForFunction((p, r) =>
      ![...document.querySelectorAll(`#${p} .ia-favourites-list .ia-listbox-item`)].some(li => new RegExp(r).test(li.textContent)),
      { timeout: 15000 }, panel, re).then(() => true).catch(() => false);
    return { xVisible, gone };
  };

  // ---- Music: delete a favourited track from the Community Favorites column ----
  const m = await delFromFavCol('panel-music', 'ZZ Delete Song');
  check(m.xVisible, 'Music: owner sees a ✕ on the favourite row');
  check(m.gone, 'Music: the favourite disappears from the column after delete');

  // ---- Movies: delete a favourited film from the Community Favorites column ----
  const mv = await delFromFavCol('panel-movies', 'ZZ Delete Movie');
  check(mv.xVisible, 'Movies: owner sees a ✕ on the favourite-film row');
  check(mv.gone, 'Movies: the favourite film disappears from the column after delete');

  // ---- Images: owner-only ✕ on the favourites column ----
  // The <omp-images> element itself carries id="panel-images" (per tabs.ttl).
  await clickTab('Images');
  await page.waitForFunction(() => {
    const el = document.getElementById('panel-images');
    return el && el.shadowRoot && /ZZ Delete Gallery/.test(el.shadowRoot.textContent);
  }, { timeout: 30000 });
  const imgXVisible = await page.evaluate(() => {
    const sr = document.getElementById('panel-images').shadowRoot;
    const li = [...sr.querySelectorAll('.fav-col li')].find(li => /ZZ Delete Gallery/.test(li.textContent));
    const x = li?.querySelector('.fav-x');
    return !!x && getComputedStyle(x).display !== 'none';
  });
  check(imgXVisible, 'Images: owner sees a ✕ on the favourite-collection row');
  await page.evaluate(() => {
    const sr = document.getElementById('panel-images').shadowRoot;
    const li = [...sr.querySelectorAll('.fav-col li')].find(li => /ZZ Delete Gallery/.test(li.textContent));
    li.querySelector('.fav-x').click();
  });
  const galleryGone = await page.waitForFunction(() => {
    const sr = document.getElementById('panel-images').shadowRoot;
    return !/ZZ Delete Gallery/.test(sr.textContent);
  }, { timeout: 15000 }).then(() => true).catch(() => false);
  check(galleryGone, 'Images: the favourite collection disappears after delete');

  // ---- All three files actually gone from the folder ----
  const endCount = await favCount();
  check(endCount === startCount - 3, `wall lost exactly the 3 deleted files (start ${startCount} → end ${endCount})`);
  // Nothing left for the cleanup pass to delete (already removed via the UI).
  created.length = 0;

  check(errors.length === 0, `no page errors${errors.length ? ' — ' + errors.join('; ') : ''}`);
} finally {
  for (const f of created) { try { await fetch(f, { method: 'DELETE' }); } catch {} }
  await browser.close();
}
console.log(fails ? `\n${fails} failure(s)` : '\nFavourite-delete checks passed.');
process.exit(fails ? 1 : 0);
