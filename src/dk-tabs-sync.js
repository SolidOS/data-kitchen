// dk-tabs-sync — keep the running shell AND html-first.html in step with
// data/tabs.ttl after a Customize save. On save, two things happen:
//
//   (a) the live tab bar updates IN PLACE — sol-tabs.applyTabs() merges the new
//       tabs into the existing <sol-tabs>, so a new/renamed tab appears at once
//       with no reload (keep-alive panes, chrome, and listeners all survive).
//   (b) html-first.html is regenerated and PUT, so the file on disk mirrors the
//       RDF — the thing someone sees opening it matches what the app renders.
//
// Not yet: BAR edits persist to html-first but aren't live-updated (they show on
// the next reload — Reload dk). And importing a hand-edited html-first.html back
// into the RDF (the reverse direction) is built (core/menu-html.js) but not wired.

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

  // (a) Live update the running tab bar in place.
  const solTabs = document.getElementById('dk-tabs');
  if (solTabs && typeof solTabs.applyTabs === 'function') {
    try { solTabs.applyTabs(tabs); }
    catch (e) { console.warn('[dk-tabs-sync] live update failed', e); }
  }

  // (b) Regenerate + persist html-first.html so the file mirrors the RDF.
  const current = await (await solFetch(shellUrl)).text();
  const { html, chrome } = generateShell({
    tabs, bar, currentHtml: current,
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
// Once, shortly after load (after the shell has settled).
setTimeout(() => { importHandEdits().catch((e) => console.warn('[dk-tabs-sync] import-on-load failed', e)); }, 1500);

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
