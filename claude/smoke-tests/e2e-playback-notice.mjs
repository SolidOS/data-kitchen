/**
 * e2e-playback-notice.mjs — when media can't play, a PROMINENT notice banner
 * appears (not just a quiet status-bar line). Drives the movies tab with a
 * favourite whose file URL 404s, so the <audio> 'error' path fires.
 *
 * Server up at http://localhost:3000/solid/open_media_player/.
 * Run from project root: node claude/smoke-tests/e2e-playback-notice.mjs
 */
import puppeteer from 'puppeteer-core';
const BASE = 'http://localhost:3000/solid/open_media_player/';
const FAVS = BASE + 'favourites/';

let fails = 0;
const check = (ok, msg) => { if (!ok) { fails++; console.log(`✗ ${msg}`); } else console.log(`✓ ${msg}`); };

// A movie favourite pointing at a non-existent file → guaranteed load error.
const ttl = `@prefix schema: <http://schema.org/> .
@prefix dct: <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix dctype: <http://purl.org/dc/dcmitype/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
<> a schema:BookmarkAction ; dct:creator "noticetest" ; dct:title "ZZ Broken Film" ;
   dct:created "2026-06-02T00:00:00Z"^^xsd:dateTime ; dct:references <https://archive.org/download/zzbroken/zzbroken.mp4> .
<https://archive.org/download/zzbroken/zzbroken.mp4> a dctype:MovingImage, schema:VideoObject ;
   schema:name "ZZ Broken Film" ; dcat:downloadURL <https://archive.org/download/zzbroken/zzbroken.mp4> .`;

const r = await fetch(FAVS, { method: 'POST', headers: { 'Content-Type': 'text/turtle' }, body: ttl });
if (!r.ok) { console.log(`POST fav failed HTTP ${r.status}`); process.exit(1); }
const favFile = new URL(r.headers.get('Location'), FAVS).href;

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1320, height: 880 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForFunction(
    () => document.querySelectorAll('#omp-tabs > .sol-tabs-bar > button').length === 5, { timeout: 20000 });
  await page.evaluate(() =>
    document.querySelector('#omp-tabs > .sol-tabs-bar > button[data-tab-id="Movies"]').click());
  await page.waitForFunction(() =>
    [...document.querySelectorAll('#panel-movies .ia-favourites-list .ia-listbox-item')]
      .some(li => /ZZ Broken Film/.test(li.textContent)), { timeout: 30000 });

  // Click the broken film in the ★ Favourites column → it can't load.
  await page.evaluate(() =>
    [...document.querySelectorAll('#panel-movies .ia-favourites-list .ia-listbox-item')]
      .find(li => /ZZ Broken Film/.test(li.textContent)).click());

  const shown = await page.waitForFunction(() => {
    const n = document.querySelector('#panel-movies .ia-notice.show');
    return n && n.offsetHeight > 0;
  }, { timeout: 20000 }).then(() => true).catch(() => false);
  check(shown, 'A prominent notice banner appears when the media can\'t play');

  const info = await page.evaluate(() => {
    const n = document.querySelector('#panel-movies .ia-notice');
    return {
      text: n?.querySelector('.ia-notice-msg')?.textContent || '',
      hasClose: !!n?.querySelector('.ia-notice-close'),
      role: n?.getAttribute('role'),
    };
  });
  check(/can't play/i.test(info.text), `Notice names the problem (got: "${info.text}")`);
  check(info.hasClose, 'Notice has a dismiss (✕) button');
  check(info.role === 'alert', 'Notice is announced (role="alert")');

  // It auto-fades after a few seconds without any interaction.
  const t0 = await page.evaluate(() => performance.now());
  const autoFaded = await page.waitForFunction(() =>
    !document.querySelector('#panel-movies .ia-notice.show'), { timeout: 8000 }).then(() => true).catch(() => false);
  const elapsed = Math.round((await page.evaluate(() => performance.now())) - t0);
  check(autoFaded, `Notice auto-fades after a short time (no click needed, ~${elapsed}ms)`);

  check(errors.length === 0, `no page errors${errors.length ? ' — ' + errors.join('; ') : ''}`);
} finally {
  try { await fetch(favFile, { method: 'DELETE' }); } catch {}
  await browser.close();
}
console.log(fails ? `\n${fails} failure(s)` : '\nPlayback-notice checks passed.');
process.exit(fails ? 1 : 0);
