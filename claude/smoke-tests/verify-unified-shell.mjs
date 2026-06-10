// P4 verification — the unified dk shell (index.html). Loads the app as the
// electron view would (pivot server on :3000, proxy on :3002), waits for
// component-interop, and asserts FUNCTIONAL state per tab: the topmost
// sol-tabs renders the full union tab row, Home is the default with its
// dashboard widgets, ia-player lists tracks on Music, sol-feed renders on
// News, dk-podz mounts its panes on Podz, and no app-internal request fails.
// Run from dk root with both servers up:
//   node pivot/run-server.cjs . 3000 &   node proxy/index.cjs &
//   node claude/smoke-tests/verify-unified-shell.mjs
import { chromium } from '/home/jeff/solid/podz/node_modules/playwright-core/index.mjs';

const URL = 'http://localhost:3000/index.html';
// App-internal = our own origins. Everything else (news-article sites in the
// reader, CDNs, consent trackers) fails for its own reasons and is not ours.
// A proxied request (localhost:3002/proxy?uri=…) is judged by its TARGET:
// an upstream 4xx/5xx relayed by our proxy is external weather, not a bug.
const EXTERNAL = { test: (u) => !/^http:\/\/localhost:300[02]\//.test(u)
  || /^http:\/\/localhost:3002\/proxy\?/.test(u)
  || /\.well-known\/solid|\.acl|\.meta/.test(u) };
const errors = [], failed = [];
const fails = [];
const check = (name, ok, detail = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : '')); if (!ok) fails.push(name); };

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
page.on('requestfinished', async r => { const resp = await r.response(); if (resp && resp.status() >= 400 && !EXTERNAL.test(r.url())) failed.push(resp.status() + ' ' + r.url()); });
page.on('requestfailed', r => {
  const err = r.failure()?.errorText || '';
  if (err.includes('ERR_ABORTED')) return;   // cancelled duplicate loads, not failures
  if (!EXTERNAL.test(r.url())) failed.push(`${err} ${r.url()}`);
});

// Not networkidle: the Home feed aggregates many sources through the proxy
// and the network never goes idle. Interop-ready + a settle pause is the
// meaningful "app booted" signal.
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.evaluate(async () => { if (window.ComponentInterop?.ready) await window.ComponentInterop.ready; });
await page.waitForTimeout(6000);

async function clickTab(re, settleMs) {
  return page.evaluate(async ({ source, flags, settleMs }) => {
    const rx = new RegExp(source, flags);
    const tabset = document.querySelector('sol-tabs');
    const tab = [...(tabset?.querySelectorAll('[role="tab"], .sol-tab, button, a') || [])].find(e => rx.test(e.textContent));
    if (!tab) return false;
    tab.click();
    await new Promise(r => setTimeout(r, settleMs));
    return true;
  }, { source: re.source, flags: re.flags, settleMs });
}

// --- tab row renders the default set (Home and SolidOS are pantry:
//     defined in tabs.ttl + palette but not in the menu) ---
const tabs = await page.evaluate(() => {
  const tabset = document.querySelector('sol-tabs');
  if (!tabset) return null;
  return [...tabset.querySelectorAll('[role="tab"], .sol-tab, a')].map(e => e.textContent.trim()).filter(Boolean);
});
check('sol-tabs present', Array.isArray(tabs), '');
const want = ['News', 'Music', 'Movies', 'Images', 'Workspaces', 'Solid Resources', 'Dev Tools', 'Customize'];
const missing = want.filter(w => !(tabs || []).some(t => t.includes(w)));
const stray = ['Home', 'SolidOS', 'Podz'].filter(w => (tabs || []).some(t => t.includes(w)));
check('default tab set present', missing.length === 0, missing.length ? 'missing: ' + missing.join(', ') : (tabs || []).slice(0, 9).join(' | '));
check('pantry tabs absent from the row', stray.length === 0, stray.join(', '));

// --- News is the startup tab; media stays UNLOADED until visited ---
// (sol-tabs instantiates the deferred <ia-player> wrapper at mount — lazy
// means its DATA doesn't load: no library fetches, no track rows yet.)
const startup = await page.evaluate(() => {
  const player = document.querySelector('ia-player');
  const root = player && (player.shadowRoot || player);
  return {
    active: document.querySelector('sol-tabs')?.activeTab || null,
    newsFeed: !!document.querySelector('#panel-news'),
    playerRows: root ? root.querySelectorAll('tr, .track, [class*=track]').length : 0,
  };
});
check('News selected at startup', /news/i.test(startup.active || '') && startup.newsFeed, `active=${startup.active}`);
check('media lazy: no track rows before visiting Music', startup.playerRows === 0, `rows=${startup.playerRows}`);
const mediaFetched = await page.evaluate(() =>
  performance.getEntriesByType('resource').some(r => r.name.includes('internet_archive')));
check('media lazy: no music-library fetches at startup', !mediaFetched);

// --- Music: ia-player lists tracks (loads on first visit) ---
await clickTab(/music/i, 6000);
const music = await page.evaluate(() => {
  const player = document.querySelector('ia-player');
  if (!player) return { player: false };
  const root = player.shadowRoot || player;
  return { player: true, rows: root.querySelectorAll('tr, .track, [class*=track]').length };
});
check('ia-player mounts on Music', !!music.player);
check('ia-player lists tracks', (music.rows || 0) > 0, `rows=${music.rows}`);

// --- News: sol-feed threePanel renders ---
await clickTab(/news/i, 4000);
const news = await page.evaluate(() => {
  const feed = document.querySelector('#panel-news, sol-feed[view="threePanel"]');
  if (!feed) return { feed: false };
  const root = feed.shadowRoot || feed;
  return { feed: true, content: root.children.length > 0 || (root.innerHTML || '').length > 100 };
});
check('sol-feed mounts on News', !!news.feed);
check('News renders content', !!news.content);

// --- Workspaces: dk-podz mounts its panes ---
await clickTab(/workspaces/i, 6000);
const podz = await page.evaluate(() => {
  const el = document.querySelector('dk-podz');
  if (!el) return { el: false };
  return { el: true, pods: el.querySelectorAll('sol-pod').length };
});
check('dk-podz mounts on Workspaces tab', !!podz.el);
check('dk-podz shows both pod panes', (podz.pods || 0) >= 2, `sol-pods=${podz.pods}`);

// --- chrome present: search, calendar, settings, help, login, ⋮ ---
const chrome = await page.evaluate(() => ({
  search: !!document.querySelector('sol-search'),
  calendar: !!document.querySelector('dk-calendar-popout'),
  settings: !!document.querySelector('.omp-settings-launch'),
  help: !!document.querySelector('.omp-help-launch'),
  login: !!document.querySelector('sol-login'),
  more: !!document.querySelector('sol-dropdown-button.omp-more'),
}));
check('actions row + chrome complete', Object.values(chrome).every(Boolean), JSON.stringify(chrome));

// --- no app-internal failures / fatal errors ---
check('no failed app-internal requests', failed.length === 0, failed.slice(0, 5).join(' | '));
// "Failed to load resource" console lines duplicate the request-level check
// above (which already distinguishes app-internal from external) — drop them.
const fatal = errors.filter(e => !/favicon|net::ERR_|Failed to fetch|Failed to load resource|CORS|Worker registration failed|Attestation check|googleadservices|report-only Content Security Policy/.test(e));
check('no unexpected console errors', fatal.length === 0, fatal.slice(0, 3).join(' | '));

await page.screenshot({ path: 'claude/smoke-tests/unified-shell.png', fullPage: false });
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILURE(S)` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
