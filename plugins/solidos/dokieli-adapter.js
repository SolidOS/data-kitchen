// dokieli-adapter.js — component-interop CONSUMER: adopt dk's owner WebID into
// the embedded dokieli editor so it treats you as logged-in (like SolidOS does)
// without dokieli's own OIDC prompt.
//
// The contract is declarative (see the manifests):
//   • dk.manifest.json       provides { webid }  — sourced from dk-owner-session's
//                            `sol-login` event (detail.webId = the local owner).
//   • dokieli.manifest.json  consumes { webid }  — call: adoptDokieliUser,
//                            module: this file (eager-loaded by the broker).
//   • index.html             data-objects="webid:data-kitchen"  — the page opt-in.
// The broker invokes adoptDokieliUser(webId) when the owner session announces.
//
// dokieli (loaded from the dokie.li CDN inside a same-origin humanReadablePane
// iframe) keeps its current user in `window.DO.C.User.IRI`, and its init only
// prompts for login when that is empty — so pre-seeding the owner WebID makes it
// adopt the identity and skip the prompt. Writes still ride dk's gate cookie
// (the pod is allow-all behind the gate), so no real OIDC token is needed.
//
// The dokieli doc iframe is created LATE (when you open a .html) and NESTED
// (main page → solidos-host iframe → doc iframe), all same-origin, so we sweep
// the frame tree and apply to any dokieli that has no user yet. We set the IRI
// ONLY when it is empty, so a genuine in-dokieli login is never clobbered.

let ownerWebId = null;
let timer = null;

function applyToWindow(win) {
  let DO;
  try { DO = win.DO; } catch (_) { return; }            // cross-origin frame — skip
  if (!DO || !DO.C || !DO.C.User) return;               // dokieli not present/ready
  try {
    if (!DO.C.User.IRI) DO.C.User.IRI = ownerWebId;     // adopt only when unset
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

export function adoptDokieliUser(webId) {
  if (!webId) return;
  ownerWebId = webId;
  sweep(window);
  // dokieli iframes open later (on navigating to a .html); keep applying so each
  // new one is seeded before its init reads User.IRI. ~150ms aims to land in the
  // gap between dokieli publishing window.DO and its load-time auth init.
  if (!timer) timer = setInterval(() => sweep(window), 150);
}

const ci = (typeof window !== 'undefined') && (window.ComponentInterop || window.SolidWebComponents);
if (ci && typeof ci.registerConsumer === 'function') {
  ci.registerConsumer('adoptDokieliUser', adoptDokieliUser);
}
