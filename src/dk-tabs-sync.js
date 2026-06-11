// dk-tabs-sync — keep the running shell AND html-first.html in step with
// data/tabs.ttl. On a Customize save:
//
//   (a) the live shell updates IN PLACE — sol-tabs.applyTabs() merges the new
//       tabs and applyLaunchers() rebuilds the bar items (chrome matched by class
//       and kept), so a new/renamed tab OR bar item appears at once with no
//       reload (keep-alive panes and listeners survive).
//   (b) html-first.html is regenerated and PUT — tabs, bar AND the chrome block
//       (now emitted from #Chrome) — so the file on disk mirrors the RDF.
//
// On load it also (c) imports a hand-edited html-first's tabs back into the RDF
// (reverse sync), and (d) self-heals #Chrome — reinserting any mandatory chrome
// item a hand-edit dropped, then regenerating the shell.

import { rdf } from 'sol-components/core/rdf.js';
import { parseMenuItems, rdfVal } from 'sol-components/core/menu-rdf.js';
import { generateShell } from 'sol-components/core/menu-generate.js';
import { extractFromHtml } from 'sol-components/core/menu-html.js';
import { updateMenuInStore, serializeMenuDocument } from 'sol-components/core/menu-serialize.js';
import { solFetch } from 'sol-components/core/auth-fetch.js';

const TABS_DOC = 'data/tabs.ttl';
const SHELL = 'html-first.html';

const abs = (rel) => new URL(rel, document.baseURI).href;

async function syncShell() {
  const tabsUrl = abs(TABS_DOC);
  const shellUrl = abs(SHELL);

  // Fresh parse of the just-saved tabs document.
  const ttl = await (await solFetch(tabsUrl)).text();
  const store = rdf.graph();
  rdf.parse(ttl, store, tabsUrl, 'text/turtle');
  const tabs = parseMenuItems(store, rdf.sym(`${tabsUrl}#Tabs`));
  const bar = parseMenuItems(store, rdf.sym(`${tabsUrl}#Bar`));
  const chromeItems = parseMenuItems(store, rdf.sym(`${tabsUrl}#Chrome`));

  // (a) Live update the running tab bar in place — tabs, then the bar launchers.
  // Chrome launchers are matched by class and KEPT (not re-created), so a bar
  // edit never disturbs the ☰ menu or sol-login.
  const solTabs = document.getElementById('dk-tabs');
  if (solTabs && typeof solTabs.applyTabs === 'function') {
    try { solTabs.applyTabs(tabs); }
    catch (e) { console.warn('[dk-tabs-sync] tab live update failed', e); }
  }
  if (solTabs && typeof solTabs.applyLaunchers === 'function') {
    try {
      const isChrome = (el) => /\bomp-(help-launch|more|sollogin)\b/.test(el.className || '');
      solTabs.applyLaunchers(bar, isChrome);
    } catch (e) { console.warn('[dk-tabs-sync] bar live update failed', e); }
  }

  // (b) Regenerate + persist html-first.html so the file mirrors the RDF —
  // including the chrome block, now emitted from #Chrome (comments and all).
  const current = await (await solFetch(shellUrl)).text();
  const { html, chrome } = generateShell({
    tabs, bar, chrome: chromeItems, currentHtml: current,
    warn: (m) => console.warn('[dk-tabs-sync] ' + m),
  });
  if (!chrome) {
    console.warn('[dk-tabs-sync] html-first.html lacks chrome markers; not regenerating');
    return;
  }
  if (html.trim() === current.trim()) return;   // file already matches the RDF

  const res = await solFetch(shellUrl, {
    method: 'PUT', headers: { 'Content-Type': 'text/html' }, body: html,
  });
  if (!res || res.ok === false) {
    console.warn('[dk-tabs-sync] PUT html-first.html failed', res && res.status);
  }
}

// --- Reverse sync: import a hand-edited html-first.html back into the RDF ---
// On load, if the html-first tab anchors no longer match data/tabs.ttl#Tabs, the
// user hand-edited the file — import those tabs into the RDF so the two stay
// consistent (HTML wins on a load-time divergence). Tabs only: bar items have no
// stable fragment in the HTML, so importing them would churn (left to the builder).
const tabKey = (t) => `${t.id || t.name}|${t.tag || ''}|${(t.params || []).map((p) => p.join('=')).sort().join(',')}`;
const sameTabs = (a, b) => a.length === b.length && a.every((t, i) => tabKey(t) === tabKey(b[i]));

function menuMeta(store, node) {
  const o = rdfVal(store, node, 'orientation');
  return {
    label: rdfVal(store, node, 'label') || undefined,
    orientation: o ? (o.includes('#') ? o.slice(o.indexOf('#') + 1) : o).toLowerCase() : undefined,
  };
}

async function importHandEdits() {
  const tabsUrl = abs(TABS_DOC);
  const shellUrl = abs(SHELL);
  const ttl = await (await solFetch(tabsUrl)).text();
  const store = rdf.graph();
  rdf.parse(ttl, store, tabsUrl, 'text/turtle');
  const tabsNode = rdf.sym(`${tabsUrl}#Tabs`);
  const rdfTabs = parseMenuItems(store, tabsNode);

  const html = await (await solFetch(shellUrl)).text();
  const { tabs: htmlTabs } = extractFromHtml(html);
  if (!htmlTabs.length || sameTabs(rdfTabs, htmlTabs)) return;   // empty parse / consistent → nothing

  updateMenuInStore(store, tabsUrl, `${tabsUrl}#Tabs`, { ...menuMeta(store, tabsNode), items: htmlTabs });
  const out = await serializeMenuDocument(store, tabsUrl);
  const res = await solFetch(tabsUrl, { method: 'PUT', headers: { 'Content-Type': 'text/turtle' }, body: out });
  if (res && res.ok !== false) console.info('[dk-tabs-sync] imported hand-edited html-first.html into tabs.ttl');
}
// --- Self-healing chrome ---
// The chrome items (help, ☰ menu, sign-in) are mandatory shell furniture, modeled
// in tabs.ttl#Chrome. If a hand-edit to tabs.ttl drops one, reinsert its default
// (the config below is app-owned, not user data) so the shell can't be bricked,
// then regenerate html-first.html so it reappears. Runs on load.
const CHROME_DEFAULTS = [
  { type: 'component', id: 'chrome-help', name: '?', tag: 'sol-button',
    comment: 'Help — opens ./help/dk.html (or ./help/dk-owner.html when signed in) in a trusted inline overlay.',
    params: [['class', 'omp-help-launch'], ['title', 'Help'], ['aria-label', 'Help'],
             ['data-handler', 'sol-include'], ['source', './help/dk.html'],
             ['if-logged-in', './help/dk-owner.html'], ['inline', ''], ['trusted', '']] },
  { type: 'component', id: 'chrome-menu', name: 'Menu', tag: 'sol-dropdown-button', region: 'modal',
    comment: '☰ menu — items live in data/menu.ttl#More (Customize, Settings, Sign in, and owner commands). Component items open in a modal.',
    params: [['class', 'omp-more'], ['title', 'Menu'], ['aria-label', 'Menu'],
             ['label', '☰'], ['source', './data/menu.ttl#More']] },
  { type: 'component', id: 'chrome-login', name: 'Sign in', tag: 'sol-login',
    comment: 'Sign-in — hidden until a flow needs it; sol-login surfaces itself with [active] for the duration (see dk-chrome.css).',
    params: [['class', 'omp-sollogin'], ['mode', 'popup'],
             ['popup-callback', 'node_modules/podz/popup-auth-callback.html'],
             ['issuers', 'https://solidcommunity.net,https://solidweb.me,https://solidweb.org,https://login.inrupt.com']] },
];

async function healChrome() {
  const tabsUrl = abs(TABS_DOC);
  const ttl = await (await solFetch(tabsUrl)).text();
  const store = rdf.graph();
  rdf.parse(ttl, store, tabsUrl, 'text/turtle');
  const chromeNode = rdf.sym(`${tabsUrl}#Chrome`);
  const present = parseMenuItems(store, chromeNode);
  const ids = new Set(present.map((c) => c.id));
  if (CHROME_DEFAULTS.every((d) => ids.has(d.id))) return;   // all mandatory present

  // Canonical order with defaults for the missing; keep any extra chrome after.
  const merged = CHROME_DEFAULTS.map((d) => present.find((c) => c.id === d.id) || d);
  for (const c of present) if (!CHROME_DEFAULTS.some((d) => d.id === c.id)) merged.push(c);
  updateMenuInStore(store, tabsUrl, `${tabsUrl}#Chrome`, { label: 'chrome', items: merged });
  const out = await serializeMenuDocument(store, tabsUrl);
  await solFetch(tabsUrl, { method: 'PUT', headers: { 'Content-Type': 'text/turtle' }, body: out });

  // Bring html-first.html back in line with the healed chrome.
  const shellUrl = abs(SHELL);
  const current = await (await solFetch(shellUrl)).text();
  const tabs = parseMenuItems(store, rdf.sym(`${tabsUrl}#Tabs`));
  const bar = parseMenuItems(store, rdf.sym(`${tabsUrl}#Bar`));
  const { html } = generateShell({ tabs, bar, chrome: parseMenuItems(store, chromeNode), currentHtml: current });
  if (html && html.trim() !== current.trim()) {
    await solFetch(shellUrl, { method: 'PUT', headers: { 'Content-Type': 'text/html' }, body: html });
  }
  console.info('[dk-tabs-sync] reinserted missing mandatory chrome into #Chrome');
}

// Once, shortly after load (after the shell has settled).
setTimeout(() => {
  importHandEdits().catch((e) => console.warn('[dk-tabs-sync] import-on-load failed', e));
  healChrome().catch((e) => console.warn('[dk-tabs-sync] chrome heal failed', e));
}, 1500);

// sol-menu-built bubbles (composed) from sol-menu-builder / sol-bar-builder.
// React only to saves of the tabs document, and debounce — the Tabs and Bar
// builders can each fire one in quick succession.
let timer = null;
document.addEventListener('sol-menu-built', (e) => {
  const src = (e.detail && e.detail.source) || '';
  if (!/\btabs\.ttl\b/.test(src)) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    syncShell().catch((err) => console.warn('[dk-tabs-sync]', err));
  }, 150);
});
