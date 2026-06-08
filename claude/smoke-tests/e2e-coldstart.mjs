/**
 * e2e-coldstart.mjs — verify cold-start behaviour and tab order.
 *
 * Clears localStorage (cold start), reloads, and checks:
 *   • tab order is News · Music · Images · Movies;
 *   • News is the active panel on load;
 *   • News auto-selects its first source and shows that source's articles.
 *
 * Server up at http://localhost:3000/solid/open_media_player/.
 * Run from project root: node claude/smoke-tests/e2e-coldstart.mjs
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = resolve(HERE, '../validation/images-e2e');
mkdirSync(SHOTS, { recursive: true });
const URL = 'http://localhost:3000/solid/open_media_player/';

let fails = 0;
const errors = [];
const check = (ok, msg) => { if (!ok) { fails++; console.log(`✗ ${msg}`); } else console.log(`✓ ${msg}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 820 });
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));

  // First visit just to get an origin, then clear storage = cold start.
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });

  // Tab order.
  await page.waitForFunction(
    () => document.querySelectorAll('#omp-tabs > .sol-tabs-bar > button').length === 4,
    { timeout: 20000 });
  const order = await page.evaluate(() =>
    [...document.querySelectorAll('#omp-tabs > .sol-tabs-bar > button')].map(b => b.dataset.tabId));
  check(JSON.stringify(order) === JSON.stringify(['panel-news', 'panel-music', 'panel-images', 'panel-movies']),
    `tab order = ${order.join(' · ')}`);

  // News active on cold start.
  const active = await page.evaluate(() =>
    document.querySelector('#omp-tabs > .sol-tabs-bar > button.active')?.dataset.tabId);
  check(active === 'panel-news', `active panel on cold start = ${active}`);

  // News auto-selected its first source and rendered its articles.
  await page.waitForFunction(() => {
    const f = document.getElementById('panel-news');
    const sel = f?.shadowRoot?.querySelector('.feed-link.selected');
    const cards = f?.shadowRoot?.querySelectorAll('.feed-articles .feed-card') || [];
    return sel && cards.length > 0;
  }, { timeout: 25000 });

  const info = await page.evaluate(() => {
    const root = document.getElementById('panel-news').shadowRoot;
    const links = [...root.querySelectorAll('.feed-source-list .feed-link')];
    const sel = root.querySelector('.feed-link.selected');
    return {
      firstLabel: links[0]?.textContent || '',
      selectedLabel: sel?.textContent || '',
      cards: root.querySelectorAll('.feed-articles .feed-card').length,
    };
  });
  check(info.selectedLabel === info.firstLabel,
    `first source selected (${info.selectedLabel} == first ${info.firstLabel})`);
  check(info.cards > 0, `first source's articles displayed (${info.cards} cards)`);

  await page.screenshot({ path: `${SHOTS}/4-coldstart-news.png` });
  check(errors.length === 0, `no console / page errors${errors.length ? ' — ' + errors.join('; ') : ''}`);

  console.log(fails ? `\n${fails} failure(s)` : '\nCold-start checks passed.');
} finally {
  await browser.close();
}
process.exit(fails ? 1 : 0);
