// Preload for the app view. Runs with contextIsolation, has DOM access, and
// is the renderer-side half of the external-content interception.
//
// The web app, unchanged, renders an external (cross-origin) menu link as an
// <iframe> inside #dk-content. In a browser that iframe is usually refused by
// X-Frame-Options; on the desktop we instead overlay a native WebContentsView
// over the #dk-content region. This preload:
//   - reports the live #dk-content rect to main (so it can place native
//     overlays there), and
//   - detects when an external iframe is mounted/removed in #dk-content,
//     hiding it and telling main to show / hide the native pane.
// Crucially, the external iframe is also NEUTRALIZED (its src is swapped to
// about:blank, the real URL stashed in data-dk-external-src) so it becomes a
// pure layout placeholder. Only the hardened native WebContentsView (loopback
// blocked) ever loads the external content. Left live, an XFO-less cross-origin
// page would run in the app's DEFAULT session — the one whose pod requests get
// the gate token auto-injected — which is exactly the privilege the native-view
// overlay exists to deny external content.
// window.open content (search, feed, login) is handled entirely in main via
// setWindowOpenHandler — nothing to do here.

const { contextBridge, ipcRenderer } = require('electron');

const CONTENT_SELECTOR = '#dk-content';

// The native overlays must cover ONLY the tab content region. The whole
// sol-tabs shell (tab bar + actions row included) lives INSIDE #dk-content
// (the inline <sol-tabs> in index.html), so overlaying the #dk-content rect
// would obscure the chrome. Report the tabset's content element once it
// exists; fall back to #dk-content while the tabs are still building.
function contentRegionEl() {
  return document.querySelector('.sol-tabs-content')
      || document.querySelector(CONTENT_SELECTOR);
}

// Minimal, self-contained mirror of sol-components' isExternal(): a cross-origin
// http(s) URL. Kept local on purpose so the preload has no app dependency.
function isExternal(href) {
  if (!href) return false;
  try {
    const u = new URL(href, document.baseURI);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return u.origin !== location.origin;
  } catch {
    return false;
  }
}

function rectOf(el) {
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
}

// The external iframe currently shadowed by the native pane, if any.
let trackedIframe = null;

// The real external URL of an adopted iframe, stashed element-side (NOT as a
// markup attribute) because once adopted the iframe's own src is about:blank.
// WeakMap so a removed/keep-alive-dropped iframe doesn't leak.
const externalUrls = new WeakMap();

// The external URL an iframe stands for: the stashed real URL if we've already
// adopted it (its `data-dk-native-view` is set and src is now about:blank),
// else a freshly-mounted external src.
function externalUrlOf(f) {
  if (f.dataset.dkNativeView) return externalUrls.get(f) || null;
  const src = f.getAttribute('src');
  return isExternal(src) ? src : null;
}

function findExternalIframe() {
  const content = document.querySelector(CONTENT_SELECTOR);
  if (!content) return null;
  // Menu items mount keep-alive panes: several external iframes can coexist,
  // only the active one displayed (inactive wrappers are display:none).
  // getClientRects() is empty for display:none but non-empty for our
  // visibility:hidden tracked iframe, so it finds the active pane.
  // Return the LAST displayed external iframe (keep-alive hides inactive
  // wrappers with the `hidden` attribute → display:none → no client rects;
  // our own visibility:hidden still has rects, so the active pane wins). Null
  // when none is displayed, so switching to non-external content closes the pane.
  // We match by externalUrlOf() — once adopted an iframe's src is about:blank,
  // so the real URL is recovered from the externalUrls stash.
  let active = null;
  for (const f of content.querySelectorAll('iframe')) {
    if (!externalUrlOf(f)) continue;
    if (f.getClientRects().length > 0) active = f;
  }
  return active;
}

// sol-feed inline article pane (see syncArticlePane): the reading-pane element
// currently mirrored by a native browserview, and the URL it shows.
let articlePaneEl = null;
let articleUrl = '';
const feedShadowsBound = new WeakSet();

let rafPending = false;
function report() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    const content = contentRegionEl();
    if (content) ipcRenderer.send('dk:content-rect', rectOf(content));
    // The pane shadows the IFRAME's own box, not the whole content region —
    // plugin pages draw their own chrome (e.g. a sub-tab strip) around the
    // iframe, and that must stay visible.
    if (trackedIframe) ipcRenderer.send('dk:pane-rect', rectOf(trackedIframe));
    // Keep the article pane glued to sol-feed's reading-pane box; if that box is
    // gone (its tab was hidden or the feed removed), close the native view.
    if (articlePaneEl) {
      if (articlePaneEl.getClientRects().length > 0) ipcRenderer.send('dk:article-rect', rectOf(articlePaneEl));
      else { articlePaneEl = null; articleUrl = ''; ipcRenderer.send('dk:article-close'); }
    }
  });
}

function sync() {
  const iframe = findExternalIframe();
  if (iframe && iframe !== trackedIframe) {
    trackedIframe = iframe;
    const url = externalUrlOf(iframe);
    externalUrls.set(iframe, url);        // remember it before we blank src
    iframe.dataset.dkNativeView = '1';
    iframe.style.visibility = 'hidden';   // keep its layout box; native view sits on top
    ipcRenderer.send('dk:pane-open', { url, rect: rectOf(iframe) });
    // Neutralize the iframe: only the hardened native WebContentsView loads the
    // external URL. Left live, the cross-origin page would run in the app's
    // default (gate-token-bearing) session. (src changes aren't observed — the
    // MutationObserver below filters to the `hidden` attribute — so this is safe
    // and won't re-enter sync().)
    if (iframe.getAttribute('src') !== 'about:blank') iframe.src = 'about:blank';
  } else if (!iframe && trackedIframe) {
    trackedIframe = null;
    ipcRenderer.send('dk:pane-close');
  }
  report();
}

// --- sol-feed inline article pane -----------------------------------------
// sol-feed (in Electron) shows a clicked article in a native browserview rather
// than a stripped iframe: it marks its reading-pane element (.feed-article-pane,
// inside its OPEN shadow root) with data-article-url=<the live URL>. dk paints a
// locked WebContentsView over that element's box; an empty/removed attribute
// closes it. querySelector can't cross a shadow boundary, so we observe each
// sol-feed's shadowRoot directly (a cross-world MutationObserver — the same
// technique the overlay guard uses) to notice the pane appearing and the
// attribute changing on a click.
function findArticlePane() {
  for (const feed of document.querySelectorAll('sol-feed')) {
    const pane = feed.shadowRoot && feed.shadowRoot.querySelector('.feed-article-pane');
    if (pane) return pane;
  }
  return null;
}

function bindFeedShadows() {
  for (const feed of document.querySelectorAll('sol-feed')) {
    if (feed.shadowRoot && !feedShadowsBound.has(feed)) {
      feedShadowsBound.add(feed);
      new MutationObserver(syncArticlePane).observe(feed.shadowRoot, {
        // `class` so the editor (feed source manager) toggling `editor-open` on
        // .sol-feed — which hides the reading pane — re-runs syncArticlePane and
        // tears the native article view down (and repaints it on close).
        childList: true, subtree: true, attributes: true, attributeFilter: ['data-article-url', 'class'],
      });
    }
  }
  syncArticlePane();
}

function syncArticlePane() {
  const pane = findArticlePane();
  const url = (pane && pane.getAttribute('data-article-url')) || '';
  // Only paint when the pane is actually on screen: while the editor (feed source
  // manager) is open it sets .feed-reader-split to display:none, so the pane has
  // no layout box — fall through to the close branch and remove the native view.
  if (pane && url && pane.getClientRects().length > 0) {
    if (pane !== articlePaneEl || url !== articleUrl) {
      articlePaneEl = pane;
      articleUrl = url;
      ipcRenderer.send('dk:article-open', { url, rect: rectOf(pane) });
    }
  } else if (articlePaneEl) {
    articlePaneEl = null;
    articleUrl = '';
    ipcRenderer.send('dk:article-close');
  }
  report();
}

function install() {
  const content = document.querySelector(CONTENT_SELECTOR);
  if (!content) return false;

  // React to content swaps AND keep-alive show/hide: menu navigation appends
  // wrappers (childList) and toggles their `hidden` attribute to switch panes
  // (re-selecting an existing item is a hidden-attr change with no childList
  // change), so watch both.
  new MutationObserver(() => { sync(); bindFeedShadows(); }).observe(content, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'],
  });

  // Keep native overlays glued to the region as layout shifts.
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(report).observe(content);
  window.addEventListener('resize', report, { passive: true });
  window.addEventListener('scroll', report, { passive: true, capture: true });

  sync();
  bindFeedShadows();
  return true;
}

// The native pane is a SEPARATE WebContentsView painted above the app's
// HTML, so any popup OR overlay drawn by the app (search panel, calendar
// popout, ☰ menu, the inline help overlay, modals) would be occluded by
// it. Watch every such host and have the main process BLANK the native
// overlays while one is open:
//   sol-dropdown-button — shadow .sol-dd-popup toggles `hidden`
//   sol-search          — shadow .panel toggles `open`
//   sol-dropdown        — conjured into <body> while open, removed on close
//                         (the calendar/dropdown region surface; like sol-modal)
//   sol-button (help ?) — reflects `open` on the host while its inline
//                         overlay is shown
//   sol-modal           — conjured into <body> while open, removed on close
//   #dk-menu-pane       — the ☰ component items' replace pane over the tab
//                         content; toggles `hidden` (shown on mount, hidden
//                         when a tab is picked)
// Custom elements upgrade asynchronously (component-interop imports them
// after the include lands), so shadow roots appear at different times. The
// guard binds INCREMENTALLY — each boot tick adopts any newly-upgraded
// hosts — and reports done only once every host type present in the DOM is
// actually watched.
const guardBound = new Set();   // elements already being observed
const guardHosts = { dropdown: [], search: [] };
let guardSuspended = false;

function guardAnyOpen() {
  return guardHosts.dropdown.some((d) => { const p = d.shadowRoot.querySelector('.sol-dd-popup'); return p && !p.hidden; })
    || guardHosts.search.some((s) => { const p = s.shadowRoot.querySelector('.panel'); return p && p.hasAttribute('open'); })
    || !!document.querySelector('sol-button[open]')   // inline overlay (help ?)
    || !!document.querySelector('sol-modal')          // conjured modal
    || !!document.querySelector('sol-dropdown')       // conjured calendar/dropdown surface
    || !!document.querySelector('#dk-menu-pane:not([hidden])'); // ☰ items' replace pane
}
function guardCheck() {
  const open = guardAnyOpen();
  if (open === guardSuspended) return;
  guardSuspended = open;
  ipcRenderer.send(open ? 'dk:overlays-suspend' : 'dk:overlays-resume');
}
function guardWatch(el, root, kind) {
  if (guardBound.has(el)) return;
  guardBound.add(el);
  guardHosts[kind].push(el);
  new MutationObserver(guardCheck).observe(root, {
    subtree: true, attributes: true, attributeFilter: ['hidden', 'open'],
  });
}
let guardBodyWatched = false;
function setupMenuOverlayGuard() {
  // One body-level observer covers the light-DOM signals: sol-button's
  // reflected `open` attribute, sol-modal elements entering/leaving, and
  // #dk-menu-pane's `hidden` toggling.
  if (!guardBodyWatched && document.body) {
    guardBodyWatched = true;
    // Re-bind on every mutation, not just at boot: the submenu-dropdown
    // launchers (Solid Resources, Dev Tools, …) are built by sol-tabs from RDF
    // AFTER the boot loop ends, and are rebuilt wholesale on a Customize save —
    // each rebuild makes NEW sol-dropdown-button elements whose shadow popups
    // would otherwise go unwatched, so opening one over an external pane would
    // not suspend the native overlay (the popup gets occluded = "truncated").
    new MutationObserver(() => { setupMenuOverlayGuard(); guardCheck(); }).observe(document.body, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'hidden'],
    });
  }
  for (const d of document.querySelectorAll('sol-dropdown-button')) {
    if (d.shadowRoot) guardWatch(d, d.shadowRoot, 'dropdown');
  }
  for (const s of document.querySelectorAll('sol-search')) {
    if (s.shadowRoot) guardWatch(s, s.shadowRoot, 'search');
  }
  // Done when every host ELEMENT in the DOM is bound (i.e. none is still
  // awaiting upgrade). Until then the boot loop keeps calling back.
  const pending = [...document.querySelectorAll('sol-dropdown-button, sol-search')]
    .filter((el) => !guardBound.has(el));
  return guardBound.size > 0 && pending.length === 0;
}

function boot() {
  // #dk-content / sol-menu may not exist yet on a parser-blocked load; retry.
  let contentReady = install();
  let menuReady = setupMenuOverlayGuard();
  if (contentReady && menuReady) return;
  let tries = 0;
  const id = setInterval(() => {
    if (!contentReady) contentReady = install();
    if (!menuReady) menuReady = setupMenuOverlayGuard();
    if ((contentReady && menuReady) || ++tries > 100) clearInterval(id);
  }, 100);
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

// Diagnostic / feature-detection hook, plus the hard-restart bridge (the ☰
// "Restart dk" command): a renderer can't relaunch the Electron process itself,
// so it asks main, which calls app.relaunch() + exit.
contextBridge.exposeInMainWorld('dkElectron', {
  isElectron: true,
  restart: () => ipcRenderer.send('dk:restart'),
  // Dismiss the native reader overlay. The reader (a window.open'd external
  // page — duck.ai, bluesky, feed articles, search) floats above
  // .sol-tabs-content with no tie to the tab beneath it; the shell calls this
  // on a tab switch so the destination tab isn't left occluded. (Esc / the
  // reader's own Close button still work too — handler at main.cjs dk:reader-close.)
  closeReader: () => ipcRenderer.send('dk:reader-close'),
  // "Move my pod": main shows a folder picker, copies the pod tree there,
  // persists the choice and relaunches. Resolves to {status,…} on
  // cancel/error/same/nested (it relaunches on success). status values:
  // moved | cancelled | same | nested | error.
  moveMyPod: () => ipcRenderer.invoke('dk:move-pod'),
  // Settings page: read the JSON-LD electron/pivot config (+ the effective
  // values this process booted with) and save an edited one. saveConfig
  // resolves to { status: 'saved' | 'saved'+pending:'next-launch' |
  // 'relaunching' | 'error' } — main prompts reload-now vs next-launch when a
  // port changed, and applies window-geometry edits live.
  getConfig: () => ipcRenderer.invoke('dk:get-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('dk:save-config', cfg),
  // Import-music (ia-player): main shows a folder picker, recursively scans the
  // audio files and parses their ID3/tags. importMusic() resolves to
  // { status: 'scanned', root, count, tracks } | { status: 'cancelled' } |
  // { status: 'error', message }. onImportProgress(cb) subscribes to per-file
  // progress ({ done, total, absPath }) during a scan; returns an unsubscribe.
  // readCover(absPath) resolves to { format, base64 } | null for one track's
  // embedded art. The renderer turns this metadata into the library RDF.
  importMusic: () => ipcRenderer.invoke('dk:import-music'),
  readCover: (absPath) => ipcRenderer.invoke('dk:read-cover', absPath),
  onImportProgress: (cb) => {
    const h = (_e, p) => cb(p);
    ipcRenderer.on('dk:import-progress', h);
    return () => ipcRenderer.removeListener('dk:import-progress', h);
  },

  // "Remember this IdP" — durable, headless per-issuer login. Secrets stay in
  // main; the renderer only names issuers and gets back status / a proxied fetch.
  //   rememberIdp(issuer, {email,password}?) → {status:'remembered'|'unavailable'|'error', webId?}
  //     (local pod needs no creds; a remote CSS issuer supplies them once).
  //   getRememberedIdps() → [issuerOrigin, …] (no secrets).
  //   forgetIdp(issuer) → {status:'forgotten', revoked}.
  //   silentLogin(issuer) → {status:'ok'|'none'|'error', webId?, issuer?}; on 'ok'
  //     main has armed a session and idpFetch(issuer,…) will authenticate.
  //   idpFetch(issuer, url, init) → plain {status, statusText, headers:[[k,v]…],
  //     body:ArrayBuffer}; the caller reconstructs a Response in the main world
  //     (a Response can't cross contextBridge intact — src/dk-idp-proxy-session.js).
  rememberIdp: (issuer, creds) => ipcRenderer.invoke('dk:remember-idp', { issuer, ...(creds || {}) }),
  // After a real (non-local) sign-in, ask main to offer remembering it — main
  // decides (CSS-capable, not already remembered/declined) and, if so, opens the
  // dedicated password window. Returns { offered }.
  offerRemember: (issuer) => ipcRenderer.invoke('dk:offer-remember', { issuer }),
  getRememberedIdps: () => ipcRenderer.invoke('dk:get-remembered-idp'),
  forgetIdp: (issuer) => ipcRenderer.invoke('dk:forget-idp', { issuer }),
  silentLogin: (issuer) => ipcRenderer.invoke('dk:silent-login', { issuer }),
  idpFetch: async (issuer, url, init) => {
    const r = await ipcRenderer.invoke('dk:idp-fetch', { issuer, url, init });
    if (!r || r.error) throw new Error(r ? r.error : 'idp-fetch failed');
    return { status: r.status, statusText: r.statusText, headers: r.headers, body: r.body };
  },
});
