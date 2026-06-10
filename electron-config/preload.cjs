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
    const content = document.querySelector(CONTENT_SELECTOR);
    if (content) ipcRenderer.send('dk:content-rect', rectOf(content));
  });
}

function sync() {
  const iframe = findExternalIframe();
  if (iframe && iframe !== trackedIframe) {
    trackedIframe = iframe;
    iframe.style.visibility = 'hidden';   // keep its layout box; native view sits on top
    iframe.dataset.dkNativeView = '1';
    ipcRenderer.send('dk:pane-open', { url: iframe.getAttribute('src') });
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

// A native overlay paints above the app's HTML, so an open menu dropdown that
// extends over #dk-content would be occluded. Watch sol-menu for an open
// dropdown (it sets `.sol-menu-group.open`) and have the host suspend/restore
// the overlays around it.
let menuGuardSet = false;
function setupMenuOverlayGuard() {
  if (menuGuardSet) return true;
  const menu = document.querySelector('sol-menu');
  if (!menu || !menu.shadowRoot) return false;
  let suspended = false;
  const check = () => {
    const open = !!menu.shadowRoot.querySelector('.sol-menu-group.open');
    if (open === suspended) return;
    suspended = open;
    ipcRenderer.send(open ? 'dk:overlays-suspend' : 'dk:overlays-resume');
  };
  new MutationObserver(check).observe(menu.shadowRoot, {
    subtree: true, attributes: true, attributeFilter: ['class'],
  });
  menuGuardSet = true;
  return true;
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

// Diagnostic / future feature-detection hook. Phase-1 interception needs no app
// cooperation, but exposing the flag is harmless and useful later.
contextBridge.exposeInMainWorld('dkElectron', { isElectron: true });
