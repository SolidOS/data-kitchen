// E2E harness — the unified dk shell booted from the ASSEMBLED base variant
// (what a release seeds), served by pivot. Run via `npm run test:e2e`, which
// assembles the tree, supplies the shell code (src/dist/assets/node_modules)
// beside it, and serves on :3050 (DK_E2E_PORT overrides).
//
// Asserts: the shell boots, the tab row is exactly the menus the shipped
// main-menu.ttl declares (no pod-only Home tab), the shipped catalog carries
// no pod-only entries, a tab menu opens and mounts the pod browser, and no
// app-internal request or fatal console error fires.
import { chromium } from 'playwright-core';
import { rdf } from '../../node_modules/sol-components/core/rdf.js';

const PORT = process.env.DK_E2E_PORT || '3050';
const BASE = `http://localhost:${PORT}`;
const URL = `${BASE}/index.html`;

// App-internal = our own origin. Everything else (news sites, CDNs, the
// machine's proxy) fails for its own reasons and is not ours.
const EXTERNAL = { test: (u) => !u.startsWith(BASE + '/')
  || /\.well-known\/solid|\.acl|\.meta/.test(u) };
const errors = [], failed = [];
const fails = [];
const check = (name, ok, detail = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : '')); if (!ok) fails.push(name); };

// --- expected tabs come from the SHIPPED main-menu, not a hardcoded list ---
const SCHEMA = 'http://schema.org/';
const UI = 'http://www.w3.org/ns/ui#';
async function expectedTabs() {
  const doc = `${BASE}/dk-pod/dk/ui-data/data-kitchen-main-menu.ttl`;
  const store = rdf.graph();
  rdf.parse(await (await fetch(doc)).text(), store, doc, 'text/turtle');
  const wrappers = store.each(rdf.sym(doc + '#Tabs'), rdf.sym(SCHEMA + 'itemListElement'), null)
    .map((w) => ({
      pos: Number(store.anyValue(w, rdf.sym(SCHEMA + 'position')) || 0),
      menu: store.any(w, rdf.sym(SCHEMA + 'item'), null),
    }))
    .sort((a, b) => a.pos - b.pos);
  return wrappers.map((w) => store.anyValue(w.menu, rdf.sym(UI + 'label'))).filter(Boolean);
}

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

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.evaluate(async () => { if (window.ComponentInterop?.ready) await window.ComponentInterop.ready; });
await page.waitForTimeout(6000);

// --- tab row is exactly the shipped Tabs menu (pod-only Home must not ship) ---
const want = await expectedTabs();
// .sol-tabs-submenu only — the ☰ chrome dropdown shares the bar but is not a tab.
const tabs = await page.evaluate(() =>
  [...document.querySelectorAll('sol-tabs .sol-tabs-bar sol-dropdown-button.sol-tabs-submenu')].map((b) => b.getAttribute('title')));
check('sol-tabs renders the tab row', tabs.length > 0, tabs.join(' | '));
check('tab row matches the shipped Tabs menu', JSON.stringify(tabs) === JSON.stringify(want),
  `want ${want.join('|')} got ${tabs.join('|')}`);
check('no pod-only Home tab', !tabs.some((t) => /home/i.test(t || '')));
const active = await page.evaluate(() => document.querySelector('sol-tabs sol-dropdown-button.active')?.getAttribute('title') || null);
check('first tab is active at startup', active === want[0], `active=${active}`);

// --- the shipped catalog carries no pod-only entries ---
const catalog = await (await fetch(`${BASE}/dk-pod/dk/ui-data/data-kitchen-plugins-catalog.ttl`)).text();
check('catalog served', catalog.includes('ui:Plugin'));
check('no pod-only catalog entries (google cards, Home)',
  !/Gmail|Google-Calendar|Google-Maps|Google-Messages|:Home\b/.test(catalog));

// --- a tab menu opens from its RDF source ---
const menu = await page.evaluate(async (tabTitle) => {
  const dd = document.querySelector(`sol-tabs sol-dropdown-button[title="${tabTitle}"]`);
  dd?.shadowRoot?.querySelector('.sol-dd-trigger')?.click();
  await new Promise((r) => setTimeout(r, 2000));
  const items = [...(dd?.shadowRoot?.querySelectorAll('[role="menuitem"]') || [])].map((b) => b.title || b.textContent.trim());
  return items;
}, want[0]);
check('tab menu lists its items', menu.length > 0, menu.slice(0, 6).join(' | '));
check('pod browser present in the first tab menu', menu.some((t) => /pod browser/i.test(t)), '');

// --- mounting the pod browser paints both panes (podz drag-drop home) ---
const podz = await page.evaluate(async () => {
  const dd = document.querySelector('sol-tabs sol-dropdown-button.active');
  const item = [...(dd?.shadowRoot?.querySelectorAll('[role="menuitem"]') || [])]
    .find((b) => /pod browser/i.test(b.title || b.textContent));
  if (!item) return { clicked: false };
  item.click();
  await new Promise((r) => setTimeout(r, 9000));
  const el = document.querySelector('dk-podz');
  return { clicked: true, mounted: !!el, pods: el ? el.querySelectorAll('sol-pod').length : 0 };
});
check('pod browser menu item clicks', podz.clicked);
check('dk-podz mounts', !!podz.mounted);
check('dk-podz shows both pod panes', (podz.pods || 0) >= 2, `sol-pods=${podz.pods}`);

// --- no app-internal failures / fatal errors ---
check('no failed app-internal requests', failed.length === 0, failed.slice(0, 5).join(' | '));
const fatal = errors.filter(e => !/favicon|net::ERR_|Failed to fetch|Failed to load resource|CORS|Worker registration failed|report-only Content Security Policy/.test(e));
check('no unexpected console errors', fatal.length === 0, fatal.slice(0, 3).join(' | '));

await page.screenshot({ path: 'test/e2e/unified-shell.png', fullPage: false });
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILURE(S)` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
