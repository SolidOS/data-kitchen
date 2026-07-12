// dk-issuers-feed — single source of truth for the sign-in issuer list.
//
// Issuers come from SETTINGS, never hardcoded: the `#Issuers` schema:ItemList
// in ui-data/data-kitchen-settings.ttl (entries are schema:ListItem nodes —
// schema:item issuer URL, schema:name label, schema:position order — edited on
// the Settings page via the oidc-issuers.shacl rolodex; position 1 = the
// default). Same positioned-list model as #Locations / dk-locations-feed.
// This module reads that list position-sorted and applies it to every
// <sol-login> in the app — each <sol-pod>'s built-in login (via the pod's
// `.login` getter) and any standalone login — so all of them offer exactly
// the issuers the user configured. It re-applies live when the list is edited
// (`sol-form-save` on the settings doc), and picks up logins that mount
// later (pods, healed chrome) via a MutationObserver.
import { rdf } from 'sol-components/core/rdf.js';
import { loadRdfStore } from 'sol-components/core/rdf-utils.js';
import { solFetch } from 'sol-components/core/auth-fetch.js';
import { createMainProxySession } from './dk-idp-proxy-session.js';
import { DEFAULT_OIDC_ISSUERS as FALLBACK } from './shared/oidc-issuers.js';

const SETTINGS = './dk-pod/dk/ui-data/data-kitchen-settings.ttl';
// FALLBACK (the curated defaults) is last-resort only: the settings doc is seeded
// with these, so it is reached just if the doc can't be read at all.

const SCHEMA = 'http://schema.org/';
const ELEM = rdf.sym(`${SCHEMA}itemListElement`);
const ITEM = rdf.sym(`${SCHEMA}item`);
const POS = rdf.sym(`${SCHEMA}position`);

let issuers = FALLBACK.slice();
let version = 0;               // bumped on each (re)load so fed elements re-apply
const fedAt = new WeakMap();   // sol-login element -> version last applied to it

async function load() {
  try {
    const docUrl = new URL(SETTINGS, document.baseURI).href;
    const store = await loadRdfStore(docUrl, solFetch);
    const entries = [];
    for (const subj of store.each(rdf.sym(docUrl + '#Issuers'), ELEM)) {
      const item = store.any(subj, ITEM);
      if (!item || !item.value) continue;
      const n = parseInt(store.anyValue(subj, POS), 10);
      entries.push({ url: item.value.replace(/\/$/, ''), pos: Number.isFinite(n) ? n : Infinity });
    }
    entries.sort((a, b) => a.pos - b.pos);
    const list = [...new Set(entries.map((e) => e.url))];
    if (list.length) issuers = list;
  } catch { /* keep the previous list / fallback */ }
  version += 1;
}

function feedEl(el) {
  if (!el || fedAt.get(el) === version) return;
  fedAt.set(el, version);
  try { el.issuers = issuers.slice(); } catch { /* element not ready yet */ }
  installRememberHook(el);
}

// "Remember this IdP": wrap the <sol-login>'s public login() so that picking a
// previously-remembered issuer logs in via main's durable headless session
// (no popup) instead of the interactive flow. Falls through to the normal popup
// when the issuer isn't remembered or the silent login fails (token revoked /
// expired). dk-local only — outside Electron window.dkElectron is undefined and
// login() is left untouched. Wrapped once per element.
const hooked = new WeakSet();
function installRememberHook(el) {
  const dk = window.dkElectron;
  if (!dk || !dk.silentLogin || hooked.has(el) || typeof el.login !== 'function') return;
  hooked.add(el);
  const orig = el.login.bind(el);
  el.login = async (issuerUrl, tag) => {
    try {
      const origin = new URL(issuerUrl).origin;
      const remembered = await dk.getRememberedIdps();
      if (remembered.includes(origin)) {
        const r = await dk.silentLogin(origin);
        if (r && r.status === 'ok') {
          const side = el._side || 'default';
          const am = window.SolidWebComponents?.AuthManager?.shared;
          am?.sessions.set(side, createMainProxySession(r.issuer, r.webId));
          // Repaint the button to its logged-in state and wire the authed fetch
          // into rdflib — the interactive popup path does both (sol-login.js
          // _onPopupMessage); the silent path bypasses login(), so do it here too.
          try { el._updateUI?.(); } catch { /* shadow not ready */ }
          try { el._integrateWithRdflib?.(); } catch { /* optional */ }
          el.dispatchEvent(new CustomEvent('sol-login', {
            bubbles: true, composed: true,
            detail: { webId: r.webId, issuer: r.issuer, side },
          }));
          return;   // skip the interactive popup — we're authed
        }
      }
    } catch { /* fall through to the normal login */ }
    return orig(issuerUrl, tag);
  };
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

// After a real sign-in to a REMOTE issuer, offer to remember it (main decides
// whether it's a CSS issuer we can durably remember and opens the password
// window). Skips the synthetic local-owner login (same-origin issuer) and is a
// no-op outside Electron. main de-dupes already-remembered / declined issuers.
if (window.dkElectron?.offerRemember) {
  document.addEventListener('sol-login', (e) => {
    const issuer = e?.detail?.issuer;
    if (!issuer) return;
    try { if (new URL(issuer).origin === location.origin) return; } catch { return; }
    window.dkElectron.offerRemember(issuer);
  });
}

(async () => {
  await load();
  scan();
  // Catch logins that appear after first paint (pods mounting, chrome heal).
  new MutationObserver(scheduleScan).observe(document.documentElement, {
    childList: true, subtree: true,
  });
  // Re-apply when the user edits the list on the Settings page (the #Issuers
  // rolodex fires sol-form-save on the settings doc; #Settings/#Locations
  // saves share the doc — a re-read on those is harmless).
  const docUrl = new URL(SETTINGS, document.baseURI).href;
  document.addEventListener('sol-form-save', async (e) => {
    if (e.detail?.target !== docUrl) return;
    await load(); scan();
  });
})();
