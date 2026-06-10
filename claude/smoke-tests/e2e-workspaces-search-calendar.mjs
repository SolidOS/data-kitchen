/**
 * e2e-workspaces-search-calendar.mjs — verify the three additions:
 *   • Search (<sol-search>) + Calendar (<omp-calendar-popout>) action buttons,
 *     placed leftmost (before the ? Help button) in the tab action row.
 *   • Workspaces tab (bare data-handler="podz" command) mounting the vendored
 *     podz two-pane shell (#left-pod / #right-pod / #panel-splitter) into its pane.
 *
 * Server up at http://localhost:3000/solid/open_media_player/ (:3002 proxy
 * optional — only the calendar's ICS fetch needs it).
 * Run from project root: node claude/smoke-tests/e2e-workspaces-search-calendar.mjs
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

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });

  // Five tabs now (Workspaces added), in order.
  await page.waitForFunction(
    () => document.querySelectorAll('#omp-tabs > .sol-tabs-bar > button').length === 5,
    { timeout: 20000 });
  const ids = await page.evaluate(() =>
    [...document.querySelectorAll('#omp-tabs > .sol-tabs-bar > button')].map(b => b.dataset.tabId));
  check(JSON.stringify(ids) === JSON.stringify(['panel-news', 'panel-music', 'panel-images', 'panel-movies', 'panel-workspaces']),
    `tab order = ${ids.join(' · ')}`);

  // Search + Calendar action launchers, leftmost (first two in the launch group).
  const launchers = await page.evaluate(() =>
    [...document.querySelectorAll('#omp-tabs > .sol-tabs-bar > .sol-tabs-launch > *')].map(el => el.tagName.toLowerCase()));
  check(launchers[0] === 'sol-search' && launchers[1] === 'omp-calendar-popout',
    `action row order (launchers) = ${launchers.join(' · ')}`);
  check(launchers.indexOf('sol-search') < launchers.indexOf('sol-button'),
    'Search sits before the ? Help button');

  // Search opens its panel on trigger click.
  await page.evaluate(() => document.querySelector('.omp-search').shadowRoot.querySelector('[part="trigger"]').click());
  await sleep(250);
  const searchOpen = await page.evaluate(() => {
    const s = document.querySelector('.omp-search');
    const panel = s.shadowRoot.querySelector('.panel, [part="panel"]');
    const engines = [...s.shadowRoot.querySelectorAll('input[type="radio"], option')].length;
    return { open: !!panel && getComputedStyle(panel).display !== 'none', engines };
  });
  check(searchOpen.open, 'Search panel opens on click');
  check(searchOpen.engines >= 1, `Search engines loaded from TTL (${searchOpen.engines})`);
  await page.screenshot({ path: resolve(SHOTS, 'wsc-search.png') });

  // Calendar popout opens its panel (containing a <sol-calendar>).
  await page.evaluate(() => document.querySelector('.omp-calendar .omp-popout-trigger').click());
  await sleep(250);
  const calOpen = await page.evaluate(() => {
    const panel = document.querySelector('.omp-calendar .omp-popout-panel');
    return { open: panel && !panel.hidden, hasCal: !!panel?.querySelector('sol-calendar') };
  });
  check(calOpen.open, 'Calendar popout opens on click');
  check(calOpen.hasCal, 'Calendar popout contains a <sol-calendar>');
  await page.screenshot({ path: resolve(SHOTS, 'wsc-calendar.png') });

  // Workspaces: the podz shell mounts into its pane (the command placed it).
  await page.waitForFunction(
    () => document.getElementById('left-pod') && document.getElementById('right-pod') && document.getElementById('panel-splitter'),
    { timeout: 20000 });
  check(true, 'podz two-pane shell mounted (#left-pod / #right-pod / #panel-splitter)');
  const ws = await page.evaluate(() => {
    const app = document.getElementById('panel-workspaces');
    const pane = app?.closest('.sol-tabs-pane');
    const lp = document.getElementById('left-pod');
    return {
      inPane: !!pane,
      paneTab: pane?.dataset.tabName,
      podUpgraded: !!(lp && lp.shadowRoot),   // sol-pod custom element upgraded
    };
  });
  check(ws.inPane && ws.paneTab === '🗂 Workspaces', `shell is inside the Workspaces pane (${ws.paneTab})`);
  check(ws.podUpgraded, 'sol-pod elements upgraded (component-interop + podz bundle loaded)');

  // Switch to Workspaces and screenshot the two-pane browser.
  await page.evaluate(() => document.getElementById('omp-tabs').switchTab('🗂 Workspaces'));
  await sleep(800);
  const visible = await page.evaluate(() =>
    document.querySelector('#omp-tabs .sol-tabs-pane:not([hidden])')?.dataset.tabName);
  check(visible === '🗂 Workspaces', `Workspaces pane visible after switch = ${visible}`);
  // Existing tabs survive (keep-alive) — News still mounted.
  check(await page.evaluate(() => !!document.getElementById('panel-news')), 'News panel still mounted (keep-alive)');
  await page.screenshot({ path: resolve(SHOTS, 'wsc-workspaces.png') });

} finally {
  await browser.close();
}

// The calendar's ICS feeds need the :3002 proxy; when it's down they fail with
// CORS / ERR_CONNECTION_REFUSED / ERR_FAILED — all environmental, not the feature.
const realErrors = errors.filter(e =>
  !/favicon/i.test(e)
  && !/calendar|\.ics|ical|3002|proxy|w3\.org\/groups/i.test(e)
  && !/ERR_CONNECTION_REFUSED|ERR_FAILED|blocked by CORS/i.test(e));
if (realErrors.length) { console.log(`\nconsole/page errors (${realErrors.length}):`); realErrors.forEach(e => console.log('  ! ' + e)); }
console.log(`\n${fails ? '✗ ' + fails + ' check(s) failed' : '✓ all checks passed'}  (${realErrors.length} errors)`);
process.exit(fails || realErrors.length ? 1 : 0);
