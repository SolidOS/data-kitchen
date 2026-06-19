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
  let active = null;
  for (const f of content.querySelectorAll('iframe[src]')) {
    if (!isExternal(f.getAttribute('src'))) continue;
    if (f.getClientRects().length > 0) active = f;
  }
  return active;
}

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
  });
}

function sync() {
  const iframe = findExternalIframe();
  if (iframe && iframe !== trackedIframe) {
    trackedIframe = iframe;
    iframe.style.visibility = 'hidden';   // keep its layout box; native view sits on top
    iframe.dataset.dkNativeView = '1';
    ipcRenderer.send('dk:pane-open', { url: iframe.getAttribute('src'), rect: rectOf(iframe) });
  } else if (!iframe && trackedIframe) {
    trackedIframe = null;
    ipcRenderer.send('dk:pane-close');
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
  new MutationObserver(() => sync()).observe(content, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'],
  });

  // Keep native overlays glued to the region as layout shifts.
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(report).observe(content);
  window.addEventListener('resize', report, { passive: true });
  window.addEventListener('scroll', report, { passive: true, capture: true });

  sync();
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
});
