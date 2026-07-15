// ⚠ PARKED 2026-07-14 — component-interop no longer runs on dk's page, so
// nothing calls this adapter's registerConsumer hooks. dokieli runs as an
// external app (its own login against the local pod via me@dk.local); the
// in-app dk-dokieli editor keeps working through its imported dkFetch. If
// the in-app DO machinery ever goes live, wire adoptDokieliUser (from the
// sol-login event) + adoptDokieliFetch (from sc's solFetch) DIRECTLY.
//
// dokieli-adapter.js — component-interop CONSUMER: bridge dk's owner identity AND
// dk's live authenticated fetch into the embedded dokieli editor, so dokieli
// treats you as logged-in (like SolidOS does) without its own OIDC prompt, AND
// its reads/writes follow whatever pod dk is logged into — local OR remote.
//
// The contract is declarative (see the manifests):
//   • dk.manifest.json         provides { webid } — from dk-owner-session's
//                              `sol-login` event (detail.webId = current owner/login).
//   • sol-components manifest   provides { auth }  — the live solFetch (routes through
//                              AuthManager.fetchFor → the session covering each URL).
//   • dokieli.manifest.json    consumes { webid → adoptDokieliUser,
//                                         auth  → adoptDokieliFetch }, module: this file.
//   • index.html               data-objects="webid:data-kitchen auth:sol-components".
//
// dokieli (loaded from the dokie.li CDN inside a same-origin doc iframe) keeps its
// current user in `window.DO.C.User.IRI` and uses the frame's global `fetch` for
// reads/writes; its init only prompts for login when the IRI is empty. So we
// pre-seed the owner WebID (skip the prompt) AND install dk's authenticated fetch
// as that frame's `window.fetch` — the same seam SolidOS uses (installAuthFetch in
// solidos-host.html). solFetch is origin-aware: local-pod writes ride the gate,
// remote writes carry the logged-in session's auth.
//
// The dokieli doc iframe is created LATE (when you open a .html) and NESTED
// (main page → solidos-host iframe → doc iframe), all same-origin, so we sweep
// the frame tree and apply to any dokieli frame. The IRI is set only when empty so
// a genuine in-dokieli login is never clobbered; the fetch is (re)applied so it
// always tracks dk's current session.

let ownerWebId = null;
let liveFetch = null;
let timer = null;

function applyToWindow(win) {
  let DO;
  try { DO = win.DO; } catch (_) { return; }            // cross-origin frame — skip
  if (!DO || !DO.C || !DO.C.User) return;               // not a dokieli frame yet
  try {
    if (!DO.C.User.IRI && ownerWebId) DO.C.User.IRI = ownerWebId;  // adopt only when unset
  } catch (_) { /* frozen/odd state — ignore */ }
  try {
    // Install dk's authed fetch as this dokieli frame's global fetch so its
    // reads/writes follow the current login. liveFetch is a stable ref, so this
    // assigns once (and re-asserts if dokieli swapped fetch back).
    if (liveFetch && win.fetch !== liveFetch) win.fetch = liveFetch;
  } catch (_) { /* frozen/odd state — ignore */ }
}

function sweep(win) {
  applyToWindow(win);
  let frames;
  try { frames = win.frames; } catch (_) { return; }    // cross-origin — can't descend
  for (let i = 0, n = frames ? frames.length : 0; i < n; i++) {
    try { sweep(frames[i]); } catch (_) {}
  }
}

function startSweeping() {
  sweep(window);
  // dokieli iframes open later (on navigating to a .html); keep applying so each
  // new one is seeded before its init reads User.IRI / makes its first fetch.
  // ~150ms aims to land in the gap between dokieli publishing window.DO and its
  // load-time auth init.
  if (!timer) timer = setInterval(() => sweep(window), 150);
}

export function adoptDokieliUser(webId) {
  if (!webId) return;
  ownerWebId = webId;
  startSweeping();
}

export function adoptDokieliFetch(fetchFn) {
  if (typeof fetchFn !== 'function') return;
  // Wrap so liveFetch is a single stable reference across re-applies, and so the
  // dokieli frame (a separate realm) calls our fetch with the expected signature.
  liveFetch = (input, init) => fetchFn(input, init);
  startSweeping();
}

const ci = (typeof window !== 'undefined') && (window.ComponentInterop || window.SolidWebComponents);
if (ci && typeof ci.registerConsumer === 'function') {
  ci.registerConsumer('adoptDokieliUser', adoptDokieliUser);
  ci.registerConsumer('adoptDokieliFetch', adoptDokieliFetch);
}
