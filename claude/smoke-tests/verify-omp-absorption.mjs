// P3 verification — the absorbed omp shell works from the dk repo. Loads the
// interim omp.html (served by the pivot server on :3000), waits for
// component-interop, and asserts FUNCTIONAL state: the sol-tabs render their
// tab list, ia-player mounts on the Music tab with a populated track list,
// News (sol-feed threePanel) renders its bar, and no app-internal requests
// 404. Run from dk root with the pivot server up:
//   node pivot/run-server.cjs . 3000 &   (or npm run start-css)
//   node claude/smoke-tests/verify-omp-absorption.mjs
import { chromium } from '/home/jeff/solid/podz/node_modules/playwright-core/index.mjs';

const URL = 'http://localhost:3000/omp.html';
// App-internal = our own origins. Everything else (news-article sites in the
// reader, CDNs, consent trackers) fails for its own reasons and is not ours.
const EXTERNAL = { test: (u) => !/^http:\/\/localhost:300[02]\//.test(u) || /\.well-known\/solid|\.acl|\.meta/.test(u) };
const errors = [], failed = [];
const fails = [];
const check = (name, ok, detail = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : '')); if (!ok) fails.push(name); };

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
// /libraries/workspaces/ is the dropped omp Workspaces tab — its leftovers
// 404 until P4 replaces the tab with dk-podz; not a P3 regression.
const KNOWN_INTERIM = /\/libraries\/workspaces\//;
page.on('requestfinished', async r => { const resp = await r.response(); if (resp && resp.status() >= 400 && !EXTERNAL.test(r.url()) && !KNOWN_INTERIM.test(r.url())) failed.push(resp.status() + ' ' + r.url()); });
page.on('requestfailed', r => {
  const err = r.failure()?.errorText || '';
  if (err.includes('ERR_ABORTED')) return;   // cancelled duplicate loads, not failures
  if (!EXTERNAL.test(r.url()) && !KNOWN_INTERIM.test(r.url())) failed.push(`${err} ${r.url()}`);
});

await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 });
await page.evaluate(async () => { if (window.ComponentInterop?.ready) await window.ComponentInterop.ready; });
await page.waitForTimeout(3000);

// --- tabs render ---
const tabs = await page.evaluate(() => {
  const tabset = document.querySelector('sol-tabs');
  if (!tabset) return null;
  const labels = [...tabset.querySelectorAll('[role="tab"], .sol-tab, a')].map(e => e.textContent.trim()).filter(Boolean);
  return labels;
});
check('sol-tabs present with tab labels', Array.isArray(tabs) && tabs.length >= 4, JSON.stringify((tabs || []).slice(0, 8)));

// --- Music tab mounts ia-player with tracks ---
const music = await page.evaluate(async () => {
  const tabset = document.querySelector('sol-tabs');
  const musicTab = [...(tabset?.querySelectorAll('[role="tab"], .sol-tab, button, a') || [])].find(e => /music/i.test(e.textContent));
  if (musicTab) musicTab.click();
  await new Promise(r => setTimeout(r, 6000));
  const player = document.querySelector('ia-player');
  if (!player) return { player: false };
  const root = player.shadowRoot || player;
  const rows = root.querySelectorAll('tr, .track, [class*=track]').length;
  return { player: true, rows };
});
check('ia-player mounts on Music tab', !!music?.player);
check('ia-player shows track/list rows', (music?.rows || 0) > 0, `rows=${music?.rows}`);

// --- News tab (sol-feed threePanel) ---
const news = await page.evaluate(async () => {
  const tabset = document.querySelector('sol-tabs');
  const newsTab = [...(tabset?.querySelectorAll('[role="tab"], .sol-tab, button, a') || [])].find(e => /news/i.test(e.textContent));
  if (newsTab) newsTab.click();
  await new Promise(r => setTimeout(r, 4000));
  const feed = document.querySelector('sol-feed');
  if (!feed) return { feed: false };
  const root = feed.shadowRoot || feed;
  return { feed: true, content: root.children.length > 0 || root.innerHTML.length > 100 };
});
check('sol-feed mounts on News tab', !!news?.feed);
check('sol-feed renders content', !!news?.content);

// --- no app-internal 404s / fatal errors ---
check('no failed app-internal requests', failed.length === 0, failed.slice(0, 5).join(' | '));
const fatal = errors.filter(e => !/favicon|net::ERR_|Failed to fetch|CORS|404|libraries\/workspaces|Worker registration failed|Attestation check|googleadservices/.test(e));
check('no unexpected console errors', fatal.length === 0, fatal.slice(0, 3).join(' | '));

await page.screenshot({ path: 'claude/smoke-tests/omp-absorption.png', fullPage: false });
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILURE(S)` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
