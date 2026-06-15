// Migration verification — FUNCTIONAL, not just registration. Loads dk headless
// and asserts the things that actually matter to a user: the menu renders its
// items (the "tabs"), clicking a tab mounts its content, the dropdown submenus
// open, a single rdflib instance is shared, and no old-name requests / unexpected
// console errors occur. Registration-only checks (customElements.get) are NOT
// enough — they pass even when nothing renders. Run from dk root with the dev
// server on :8081 (npm run serve).
import { chromium } from 'playwright-core';

const URL = 'http://localhost:8081/index.html';
const EXTERNAL = /open-meteo|w3\.org|google|esm\.sh|cdn\.|matrix|forum\.solid|solidproject|\.well-known\/solid|\.acl|\.meta/;
const errors = [], requests = [], failed = [];
const fails = [];
const check = (name, ok, detail = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : '')); if (!ok) fails.push(name); };

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
page.on('requestfinished', async r => { requests.push(r.url()); const resp = await r.response(); if (resp && resp.status() >= 400 && !EXTERNAL.test(r.url())) failed.push(resp.status() + ' ' + r.url()); });
page.on('requestfailed', r => { if (!EXTERNAL.test(r.url())) failed.push('FAILED ' + r.url()); });

await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
await page.evaluate(async () => { if (window.ComponentInterop?.ready) await window.ComponentInterop.ready; });
await page.waitForTimeout(2500);

// --- loader / globals ---
const g = await page.evaluate(() => ({
  interop: !!window.ComponentInterop, alias: window.SolidWebComponents === window.ComponentInterop,
  auth: !!(window.SolidWebComponents?.AuthManager),
}));
check('component-interop ready + alias', g.interop && g.alias);
check('AuthManager published', g.auth);

// --- THE MENU RENDERS ITS ITEMS (the "tabs") ---
const menu = await page.evaluate(() => {
  const m = document.querySelector('sol-menu');
  const nav = m?.shadowRoot?.querySelector('.sol-menu-nav');
  const btns = nav ? [...nav.querySelectorAll('button')] : [];
  return { count: btns.length, labels: btns.map(b => (b.textContent || '').trim()), navW: nav ? nav.getBoundingClientRect().width : 0 };
});
check('menu renders items (tabs present)', menu.count > 0 && menu.navW > 50, `${menu.count} items, navW=${Math.round(menu.navW)}`);
check('top-level tabs present', ['Home', 'Podz', 'SolidResources'].every(l => menu.labels.includes(l)), menu.labels.join(', '));

// --- CHROME BUTTONS (Help / Settings) MOUNT THEIR PANES ---
// Checked on the FRESH page (the user's actual flow) BEFORE any tab navigation:
// the menu's region controller transiently reclaims #dk-content right after a
// tab switch, so clicking a chrome button in that window is racy — that's a test
// artifact, not the reported bug. sol-button needs region= (NOT target=) to
// resolve where to mount; a wrong/missing region silently mounts nothing (only a
// console.warn). So assert the pane actually appears with the right source.
const clickChrome = (name) => page.evaluate(async (nm) => {
  const sb = [...document.querySelectorAll('sol-button')].find(b => b.getAttribute('name') === nm);
  if (!sb) return { found: false };
  (sb.shadowRoot?.querySelector('button') || sb).click();
  await new Promise(r => setTimeout(r, 1800));
  const incs = [...document.getElementById('dk-content').querySelectorAll('sol-include')];
  return { found: true, srcs: incs.map(i => i.getAttribute('source')) };
}, name);
const help = await clickChrome('Help');
check('Help button mounts help/dk.html', help.found && help.srcs.includes('help/dk.html'), help.srcs?.join(', '));
const settings = await clickChrome('Settings');
check('Settings button mounts pages/settings.html', settings.found && settings.srcs.includes('pages/settings.html'), settings.srcs?.join(', '));

// --- CLICKING A TAB MOUNTS ITS CONTENT ---
const tab = await page.evaluate(async () => {
  const nav = document.querySelector('sol-menu').shadowRoot.querySelector('.sol-menu-nav');
  const btn = [...nav.querySelectorAll('button')].find(b => /podz/i.test(b.textContent || ''));
  if (!btn) return { clicked: false };
  btn.click(); await new Promise(r => setTimeout(r, 1800));
  return { clicked: true, hasDkPodz: !!document.getElementById('dk-content').querySelector('dk-podz') };
});
check('clicking "Podz" tab mounts dk-podz', tab.clicked && tab.hasDkPodz);

// --- DROPDOWN SUBMENU OPENS ---
const dd = await page.evaluate(async () => {
  const m = document.querySelector('sol-menu');
  const nav = m.shadowRoot.querySelector('.sol-menu-nav');
  const btn = [...nav.querySelectorAll('button')].find(b => /resources/i.test(b.textContent || ''));
  if (!btn) return { found: false };
  btn.click(); await new Promise(r => setTimeout(r, 700));
  return { found: true, expanded: btn.getAttribute('aria-expanded') === 'true' };
});
check('dropdown submenu opens', dd.found && dd.expanded);

// --- single rdflib, no old-name requests ---
const rdflib = [...new Set(requests.filter(u => /\/rdflib(\.|\/)/i.test(u)))];
const oldName = requests.filter(u => /solid-web-components/.test(u));
check('single rdflib instance', rdflib.length === 1, rdflib.join(', '));
check('no solid-web-components requests', oldName.length === 0, oldName.join(', '));
check('no non-external failed requests', failed.length === 0, failed.slice(0, 4).join(' | '));
const realErrors = errors.filter(e => !EXTERNAL.test(e) && !/Failed to load resource/.test(e));
check('no unexpected console errors', realErrors.length === 0, realErrors.slice(0, 3).join(' || '));

console.log('\n' + (fails.length ? `RESULT: ${fails.length} FAILED → ${fails.join('; ')}` : 'RESULT: ALL PASS'));
await browser.close();
process.exit(fails.length ? 1 : 0);
