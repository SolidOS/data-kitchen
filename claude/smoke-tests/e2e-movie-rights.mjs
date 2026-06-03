/**
 * e2e-movie-rights.mjs — end-to-end check that a film's Rights line renders in
 * the film-intro overlay (proves the IA-adapter `_rights` threads through the
 * track mapper → showFilmIntro → DOM). Hits live archive.org.
 *
 * Movies → first film type → first collection → click films until one opens,
 * then assert `.ia-film-intro-rights` shows "⚖ …".
 *
 * Server up at http://localhost:3000/solid/open_media_player/.
 * Run from project root: node claude/smoke-tests/e2e-movie-rights.mjs
 */
import puppeteer from 'puppeteer-core';
const URL = 'http://localhost:3000/solid/open_media_player/';

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails++; };
const P = '#panel-movies';
const opts = (col) => `${P} [data-column="${col}"] .ia-listbox li[role="option"][data-id]:not([data-id=""])`;

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 820 });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForFunction(() =>
    document.querySelectorAll('#omp-tabs > .sol-tabs-bar > button').length === 4, { timeout: 20000 });

  await page.evaluate(() =>
    document.querySelector('#omp-tabs > .sol-tabs-bar > button[data-tab-id="panel-movies"]').click());

  // Film types (local RDF) → pick the first.
  await page.waitForFunction((s) => document.querySelectorAll(s).length > 0, { timeout: 30000 }, opts('genre'));
  await page.evaluate((s) => document.querySelector(s).click(), opts('genre'));
  check(true, 'selected a film type');

  // Collections (local RDF) → pick the first.
  await page.waitForFunction((s) => document.querySelectorAll(s).length > 0, { timeout: 30000 }, opts('artist'));
  await page.evaluate((s) => document.querySelector(s).click(), opts('artist'));
  check(true, 'selected a collection');

  // Films (network: getAlbums) → click each until one opens a film-intro.
  await page.waitForFunction((s) => document.querySelectorAll(s).length > 0, { timeout: 40000 }, opts('album'));
  const filmCount = await page.evaluate((s) => document.querySelectorAll(s).length, opts('album'));
  check(filmCount > 0, `collection lists ${filmCount} film(s)`);

  let rightsText = null;
  const N = Math.min(filmCount, 5);
  for (let i = 0; i < N; i++) {
    await page.evaluate((s, i) => document.querySelectorAll(s)[i]?.click(), opts('album'), i);
    try {
      await page.waitForFunction(() => {
        const el = document.querySelector('#panel-movies .ia-film-intro-rights');
        return el && /⚖/.test(el.textContent);
      }, { timeout: 25000 });
      rightsText = await page.evaluate(() =>
        document.querySelector('#panel-movies .ia-film-intro-rights').textContent);
      break;
    } catch { /* access-restricted / no playable video — try next film */ }
  }

  check(!!rightsText, `film-intro shows a Rights line (after ≤${N} film(s))`);
  if (rightsText) {
    console.log(`  rights line: "${rightsText}"`);
    check(/^⚖\s+.+/.test(rightsText), 'Rights line is "⚖ <label>" (label or "Rights unknown")');
  }

  console.log(fails ? `\n${fails} failure(s)` : '\nMovie rights line verified.');
} finally {
  await browser.close();
}
process.exit(fails ? 1 : 0);
