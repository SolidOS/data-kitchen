// dk-tabs-rdf — the RDF side of the topmost shell (rdf-first).
//
// ui-data/data-kitchen-main-menu.ttl is the ONLY live artifact of the shell. index.html declares
// <sol-tabs id="dk-tabs" from-rdf="./dk-pod/dk/ui-data/data-kitchen-main-menu.ttl#Tabs">, so sol-tabs renders
// the tabs itself; this module covers the rest of the same document:
//
//   (a) on load it builds the #Bar launchers and the #Chrome furniture
//       (help / ☰ menu / sign-in) via applyLaunchers. The markup names the
//       document ONCE — the from-rdf attribute — and this module reads the
//       document URL from there, so no source is hidden in script.
//   (b) after a Customize save (sol-menu-built from sol-menu-manager /
//       sol-button-bar-manager) it re-reads the document and live-updates the
//       running shell IN PLACE — applyTabs merges the tabs (keep-alive panes
//       and listeners survive) and applyLaunchers rebuilds the bar while
//       KEEPING the chrome elements by class, so a bar edit never disturbs
//       the ☰ menu or sol-login state. No reload.
//   (c) it self-heals #Chrome — the mandatory shell furniture is app-owned
//       config (the defaults below); if a hand-edit to tabs.ttl drops one,
//       it is reinserted so the shell can't be bricked.
//
// There is no companion HTML file and no sync: to edit the shell as HTML,
// round-trip it offline — npm run rdf2html → edit → npm run html2rdf
// (tools/conversion/).

import { rdf } from 'sol-components/core/rdf.js';
import { parseMenuItems } from 'sol-components/core/menu-rdf.js';
import { updateMenuInStore, serializeMenuDocument } from 'sol-components/core/menu-serialize.js';
import { solFetch } from 'sol-components/core/auth-fetch.js';

const solTabsEl = () => document.getElementById('dk-tabs');

// The shell document, as the markup declares it (from-rdf="./dk-pod/dk/ui-data/data-kitchen-main-menu.ttl#Tabs").
function tabsDocUrl() {
  const src = solTabsEl()?.getAttribute('from-rdf') || '';
  return src ? new URL(src.split('#')[0], document.baseURI).href : null;
}

// Chrome launchers are matched by class so a live bar rebuild KEEPS them
// (re-creating sol-login would drop auth state; the ☰ menu would reload).
const isChrome = (el) => /\bomp-(help-launch|more|sollogin)\b/.test(el.className || '');

async function loadShellModel() {
  const tabsUrl = tabsDocUrl();
  if (!tabsUrl) return null;
  const ttl = await (await solFetch(tabsUrl)).text();
  const store = rdf.graph();
  rdf.parse(ttl, store, tabsUrl, 'text/turtle');
  return {
    tabsUrl,
    store,
    tabs: parseMenuItems(store, rdf.sym(`${tabsUrl}#Tabs`)),
    bar: parseMenuItems(store, rdf.sym(`${tabsUrl}#Bar`)),
    chrome: parseMenuItems(store, rdf.sym(`${tabsUrl}#Chrome`)),
  };
}

// (a) Initial launchers: bar items first, chrome after (the bar renders fresh
// before kept, so this matches applyLaunchers' live-refresh order too).
async function buildLaunchers() {
  const model = await loadShellModel();
  const solTabs = solTabsEl();
  if (!model || !solTabs || typeof solTabs.applyLaunchers !== 'function') return;
  solTabs.applyLaunchers([...model.bar, ...model.chrome]);
}

// (b) Live refresh after a Customize save — tabs merged, bar rebuilt, chrome kept.
async function refreshShell() {
  const model = await loadShellModel();
  const solTabs = solTabsEl();
  if (!model || !solTabs) return;
  if (typeof solTabs.applyTabs === 'function') {
    try { solTabs.applyTabs(model.tabs); }
    catch (e) { console.warn('[dk-tabs-rdf] tab live update failed', e); }
  }
  if (typeof solTabs.applyLaunchers === 'function') {
    try { solTabs.applyLaunchers(model.bar, isChrome); }
    catch (e) { console.warn('[dk-tabs-rdf] bar live update failed', e); }
  }
}

// --- (c) Self-healing chrome ---
// The chrome items (help, ☰ menu, sign-in) are mandatory shell furniture,
// modeled in tabs.ttl#Chrome so their wiring (which help file, which menu
// document, the issuer list) stays user-editable data. If a hand-edit drops
// one, reinsert its default (this config is app-owned, not user data).
const CHROME_DEFAULTS = [
  { type: 'component', id: 'chrome-help', name: '?', tag: 'sol-button',
    comment: 'Help — opens ./help/dk.html (or ./help/dk-owner.html when signed in) in a trusted inline overlay.',
    params: [['class', 'omp-help-launch'], ['title', 'Help'], ['aria-label', 'Help'],
             ['data-handler', 'sol-include'], ['source', './dk-pod/dk/help/dk.html'],
             ['if-logged-in', './dk-pod/dk/help/dk-owner.html'], ['inline', ''], ['trusted', '']] },
  { type: 'component', id: 'chrome-menu', name: 'Menu', tag: 'sol-dropdown-button', region: 'modal',
    comment: '☰ menu — items live in ui-data/data-kitchen-hamburger-menu.ttl#More (Manage Plugins, Manage Menus, Settings, Sign in, and owner commands). Component items display in the #dk-menu-pane replace pane over the tab content.',
    params: [['class', 'omp-more'], ['title', 'Menu'], ['aria-label', 'Menu'],
             ['label', '☰'], ['source', './dk-pod/dk/ui-data/data-kitchen-hamburger-menu.ttl#More'],
             ['data-settings-skip', '']] },   // menus are edited on the Customize Plugins page, not in Preferences
  { type: 'component', id: 'chrome-login', name: 'Sign in', tag: 'sol-login',
    comment: 'Sign-in — hidden until a flow needs it; sol-login surfaces itself with [active] for the duration (see dk-chrome.css).',
    params: [['class', 'omp-sollogin'], ['mode', 'popup'],
             ['popup-callback', 'dk-pod/dk/plugins/podz/popup-auth-callback.html'],
             ['issuers', 'https://solidcommunity.net,https://solidweb.me,https://solidweb.org,https://login.inrupt.com']] },
];

async function healChrome() {
  const model = await loadShellModel();
  if (!model) return;
  const { tabsUrl, store, chrome: present } = model;
  const ids = new Set(present.map((c) => c.id));
  if (CHROME_DEFAULTS.every((d) => ids.has(d.id))) return;   // all mandatory present

  // Canonical order with defaults for the missing; keep any extra chrome after.
  const merged = CHROME_DEFAULTS.map((d) => present.find((c) => c.id === d.id) || d);
  for (const c of present) if (!CHROME_DEFAULTS.some((d) => d.id === c.id)) merged.push(c);
  updateMenuInStore(store, tabsUrl, `${tabsUrl}#Chrome`, { label: 'chrome', items: merged });
  const out = await serializeMenuDocument(store, tabsUrl);
  await solFetch(tabsUrl, { method: 'PUT', headers: { 'Content-Type': 'text/turtle' }, body: out });

  // Rebuild the launchers so the reinserted chrome appears at once.
  const solTabs = solTabsEl();
  if (solTabs && typeof solTabs.applyLaunchers === 'function') {
    const healed = await loadShellModel();
    if (healed) solTabs.applyLaunchers([...healed.bar, ...healed.chrome]);
  }
  console.info('[dk-tabs-rdf] reinserted missing mandatory chrome into #Chrome');
}

// Build once the element is upgraded (dk-shell imports this module after the
// component loader settles, so in practice it already is).
customElements.whenDefined('sol-tabs').then(() => {
  buildLaunchers()
    .then(() => healChrome())
    .catch((e) => console.warn('[dk-tabs-rdf] launcher build failed', e));
});

// sol-menu-built bubbles (composed) from sol-menu-manager / sol-button-bar-manager
// (and from sol-plugin-manager, whose plugins-catalog.ttl saves the filter ignores).
// React only to saves of the tabs document, and debounce — the Tabs and Bar
// managers can each fire one in quick succession.
let timer = null;
document.addEventListener('sol-menu-built', (e) => {
  const src = (e.detail && e.detail.source) || '';
  // React only to saves of the tabs document itself (the #Tabs/#Bar/#Chrome
  // doc), NOT plugins-catalog.ttl or other menus. Compare the saved doc URL to
  // the live from-rdf source — earlier this matched a hardcoded "tabs.ttl",
  // which silently stopped firing once the doc was renamed.
  const want = tabsDocUrl();
  let saved;
  try { saved = new URL(src.split('#')[0], document.baseURI).href; } catch { return; }
  if (!want || saved !== want) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    refreshShell().catch((err) => console.warn('[dk-tabs-rdf]', err));
  }, 150);
});
