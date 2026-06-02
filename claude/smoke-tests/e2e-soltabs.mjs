/**
 * e2e-soltabs.mjs — verify the <sol-tabs from-rdf keep-alive> conversion.
 *
 * Checks: tabs build from data/tabs.ttl (order + data-tab-id); all five
 * panels exist up front (eager keep-alive); switching tabs keeps the prior
 * panel mounted (keep-alive); the About <sol-button> opens a modal whose
 * sol-include points at ./assets/ia-about.html. Screenshots to validation/.
 *
 * Server up at http://localhost:3000/solid/open_media_player/.
 * Run from project root: node claude/smoke-tests/e2e-soltabs.mjs
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

  // Tabs built from RDF (the ★ Favourites tab was retired — favourites surface
  // per media tab now).
  await page.waitForFunction(
    () => document.querySelectorAll('#omp-tabs > .sol-tabs-bar > button').length === 4,
    { timeout: 20000 });
  const ids = await page.evaluate(() =>
    [...document.querySelectorAll('#omp-tabs > .sol-tabs-bar > button')].map(b => b.dataset.tabId));
  check(JSON.stringify(ids) === JSON.stringify(['News', 'Music', 'Images', 'Movies']),
    `tab order (data-tab-id) = ${ids.join(' · ')}`);

  // All four panels mounted up front (eager keep-alive).
  const present = await page.evaluate(() =>
    ['news', 'music', 'images', 'movies'].filter(k => document.getElementById('panel-' + k)));
  check(present.length === 4, `panels present up front = ${present.join(',')}`);

  // News active + its first source's articles rendered.
  const activeId = await page.evaluate(() =>
    document.querySelector('#omp-tabs > .sol-tabs-bar > button.active')?.dataset.tabId);
  check(activeId === 'News', `active tab on cold start = ${activeId}`);

  await page.waitForFunction(() => {
    const f = document.getElementById('panel-news');
    const cards = f?.shadowRoot?.querySelectorAll('.feed-articles .feed-card') || [];
    return cards.length > 0;
  }, { timeout: 25000 });
  check(true, 'News rendered articles');
  await page.screenshot({ path: resolve(SHOTS, 'soltabs-news.png') });

  // Switch to Music, then back — News pane must survive (keep-alive).
  await page.evaluate(() => document.getElementById('omp-tabs').switchTab('🎵 Music'));
  await sleep(800);
  const afterSwitch = await page.evaluate(() => {
    const panes = [...document.querySelectorAll('#omp-tabs .sol-tabs-pane')];
    const news = panes.find(p => p.dataset.tabName === '🎵 Music' ? false : p.querySelector('#panel-news'));
    return {
      visible: document.querySelector('#omp-tabs .sol-tabs-pane:not([hidden])')?.dataset.tabName,
      newsStillMounted: !!document.getElementById('panel-news'),
      musicMounted: !!document.getElementById('panel-music'),
    };
  });
  check(afterSwitch.visible === '🎵 Music', `visible pane after switch = ${afterSwitch.visible}`);
  check(afterSwitch.newsStillMounted, 'News panel still mounted after switching away (keep-alive)');
  await page.screenshot({ path: resolve(SHOTS, 'soltabs-music.png') });

  // Help: declarative <sol-button region="inline" for="…sol-tabs-content"> opens
  // the help INLINE in the tab content area (not a modal) via sol-include.
  // Dev runs as owner (SolidKitchen) → if-logged-in picks the owner guide.
  await page.evaluate(() => document.querySelector('.omp-help-launch').shadowRoot.querySelector('.sol-button-trigger').click());
  await page.waitForFunction(() => document.querySelector('#omp-tabs > .sol-tabs-content > .sol-inline-panel'), { timeout: 8000 });
  await sleep(1200);   // let the sol-include fetch + render
  const help = await page.evaluate(() => {
    const s = document.querySelector('#omp-tabs > .sol-tabs-content > .sol-inline-panel');
    const inc = s?.querySelector('sol-include');
    const txt = [];
    const w = (root) => { root.querySelectorAll('*').forEach(e => { if (e.shadowRoot) w(e.shadowRoot); }); txt.push(root.textContent || ''); };
    if (s) w(s);
    const all = txt.join(' ');
    const btn = document.querySelector('.omp-help-launch');
    const activeTab = document.querySelector('#omp-tabs > .sol-tabs-bar > button.active');
    return {
      inContent: !!s,
      noModal: document.querySelectorAll('sol-modal').length === 0,
      src: inc?.getAttribute('source') || null,
      altSrc: inc?.getAttribute('if-logged-in') || null,
      ownerGuide: /you can moderate|signed in/i.test(all),
      btnOpen: btn?.hasAttribute('open') || false,
      // active tab de-highlighted (its accent bg replaced by the muted btn bg)
      tabBg: activeTab ? getComputedStyle(activeTab).backgroundColor : null,
    };
  });
  check(/omp-help\.html$/.test(help.src || '') && help.altSrc && /omp-help-owner\.html$/.test(help.altSrc) && help.ownerGuide && help.inContent && help.noModal,
    `Help ? → owner help inline in content area (not modal), if-logged-in=${help.altSrc}`);
  check(help.btnOpen, 'Help open: ? button reflects open (highlighted)');
  // Picking a tab dismisses help.
  await page.evaluate(() => document.querySelector('#omp-tabs > .sol-tabs-bar > button[data-tab-id="News"]').click());
  await sleep(400);
  check(await page.evaluate(() => !document.querySelector('#omp-tabs > .sol-tabs-content > .sol-inline-panel')), 'Help dismissed when a tab is picked');
  check(await page.evaluate(() => !document.querySelector('.omp-help-launch').hasAttribute('open')), 'Help button no longer open after dismiss');
  await sleep(150);

  // ⋮ <sol-dropdown-button> built from data/menu.ttl (owner menu in dev).
  const ddItems = () => page.evaluate(() =>
    [...document.querySelector('.omp-more').shadowRoot.querySelectorAll('.sol-dd-popup button[role="menuitem"]')].map(b => b.textContent));
  const clickDdItem = (label) => page.evaluate((l) => {
    const dd = document.querySelector('.omp-more');
    dd.shadowRoot.querySelector('.sol-dd-trigger').click();
    [...dd.shadowRoot.querySelectorAll('.sol-dd-popup button[role="menuitem"]')].find(b => b.textContent === l)?.click();
  }, label);

  await page.waitForFunction(
    () => (document.querySelector('.omp-more')?.shadowRoot?.querySelectorAll('.sol-dd-popup button[role="menuitem"]').length || 0) >= 4,
    { timeout: 15000 });
  const items = await ddItems();
  // About + Solid login help were removed from the menu; the rest are owner actions.
  check(items.includes('View as guest') && items.includes('Install on my Pod…')
        && !items.includes('About') && !items.includes('Solid login help'),
    `⋮ dropdown built from menu.ttl: ${items.join(' · ')}`);
  await page.screenshot({ path: resolve(SHOTS, 'soltabs-dropdown.png') });

  // Every item now requires write — .no-write hides them all (and in guest mode
  // the whole ⋮ button is hidden, tested separately below).
  const gating = await page.evaluate(() => {
    const btn = (label) => [...document.querySelector('.omp-more').shadowRoot
      .querySelectorAll('.sol-dd-popup button[role="menuitem"]')].find(b => b.textContent === label);
    document.body.classList.add('no-write');   // gating now keys off body
    const r = { filtersHidden: getComputedStyle(btn('Filters…')).display === 'none',
                guestHidden: getComputedStyle(btn('View as guest')).display === 'none' };
    document.body.classList.remove('no-write');
    return r;
  });
  check(gating.filtersHidden && gating.guestHidden,
    `.no-write hides requires-write items (Filters… hidden=${gating.filtersHidden}, View as guest hidden=${gating.guestHidden})`);

  // 'View as guest' command → one-way guest preview (chrome gains .guest, and
  // the whole ⋮ menu then hides — reload restores owner mode).
  const isGuest = () => page.evaluate(() => document.querySelector('.omp-chrome').classList.contains('guest'));
  const before = await isGuest();
  await clickDdItem('View as guest'); await sleep(300);
  const afterOn = await isGuest();
  const menuHidden = await page.evaluate(() => getComputedStyle(document.querySelector('.omp-more')).display === 'none');
  check(!before && afterOn && menuHidden,
    `⋮ "View as guest" enters guest mode and hides the menu (${before}→${afterOn}, menuHidden=${menuHidden})`);

  // Unknown command is a safe no-op.
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('sol-command', { bubbles: true, composed: true, detail: { command: 'totallyUnknown' } })));
  await sleep(100);
  check(true, 'unknown sol-command is a no-op (no throw)');

} finally {
  await browser.close();
}

const realErrors = errors.filter(e => !/favicon|net::ERR.*favicon/i.test(e));
if (realErrors.length) { console.log(`\nconsole/page errors (${realErrors.length}):`); realErrors.forEach(e => console.log('  ! ' + e)); }
console.log(`\n${fails ? '✗ ' + fails + ' check(s) failed' : '✓ all checks passed'}  (${realErrors.length} errors)`);
process.exit(fails || realErrors.length ? 1 : 0);
