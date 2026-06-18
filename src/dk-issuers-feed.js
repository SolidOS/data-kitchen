// dk-issuers-feed — single source of truth for the sign-in issuer list.
//
// Issuers come from SETTINGS, never hardcoded: the `solid:oidcIssuer` list on
// ui-data/data-kitchen-settings.ttl#Settings (edited on the Settings page via
// <dk-issuers-editor>; first = default). This module reads that list and applies
// it to every <sol-login> in the app — the chrome "Sign in" and each <sol-pod>'s
// built-in login (via the pod's `.login` getter) — so all of them offer exactly
// the issuers the user configured. It re-applies live when the list is edited
// (the editor dispatches `dk:issuers-changed`), and picks up logins that mount
// later (pods, healed chrome) via a MutationObserver.
import { rdf } from 'sol-components/core/rdf.js';
import { loadRdfStore } from 'sol-components/core/rdf-utils.js';
import { solFetch } from 'sol-components/core/auth-fetch.js';

const SOLID_OIDC = 'http://www.w3.org/ns/solid/terms#oidcIssuer';
const SETTINGS = './dk-pod/dk/ui-data/data-kitchen-settings.ttl';
// Last-resort only: the settings doc is seeded with these, so this is reached
// just if the doc can't be read at all.
const FALLBACK = [
  'https://solidcommunity.net', 'https://solidweb.me',
  'https://solidweb.org', 'https://login.inrupt.com',
];

let issuers = FALLBACK.slice();
let version = 0;               // bumped on each (re)load so fed elements re-apply
const fedAt = new WeakMap();   // sol-login element -> version last applied to it

async function load() {
  try {
    const docUrl = new URL(SETTINGS, document.baseURI).href;
    const store = await loadRdfStore(docUrl, solFetch);
    const list = store.each(rdf.sym(docUrl + '#Settings'), rdf.sym(SOLID_OIDC))
      .map((o) => o.value.replace(/\/$/, ''));
    if (list.length) issuers = list;
  } catch { /* keep the previous list / fallback */ }
  version += 1;
}

function feedEl(el) {
  if (!el || fedAt.get(el) === version) return;
  fedAt.set(el, version);
  try { el.issuers = issuers.slice(); } catch { /* element not ready yet */ }
}

function scan() {
  document.querySelectorAll('sol-login').forEach(feedEl);
  document.querySelectorAll('sol-pod').forEach((pod) => {
    const login = pod.login || (pod.shadowRoot && pod.shadowRoot.querySelector('sol-login'));
    if (login) feedEl(login);
  });
}

let pending = false;
function scheduleScan() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => { pending = false; scan(); });
}

(async () => {
  await load();
  scan();
  // Catch logins that appear after first paint (pods mounting, chrome heal).
  new MutationObserver(scheduleScan).observe(document.documentElement, {
    childList: true, subtree: true,
  });
  // Re-apply when the user edits the list on the Settings page.
  document.addEventListener('dk:issuers-changed', async () => { await load(); scan(); });
})();
