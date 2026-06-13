// Central constants for the data-kitchen desktop shell.
//
// dk is a self-hosting, user-redesignable app. The editable app DEFINITION (HTML
// shells, RDF config, favourites, content) lives in the user's writable pod root;
// the read-only ENGINE (component libraries, vendor bundles, compiled plugin dist,
// dk's own bundle) ships inside the executable. A single-origin ROUTING server
// (router/index.cjs) presents both under one origin so the definition's relative
// engine refs resolve: engine path prefixes come from the engine dir, everything
// else is reverse-proxied to a Community Solid Server ("pivot") rooted at the pod.
// The renderer loads over HTTP (not file://) so the origin is real — same-origin
// checks, Solid auth and the importmap all depend on it.

const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.join(__dirname, '..');

// Where the user's writable pod root lives when the app is packaged.
// Portable-app pattern: a "data-kitchen-home" folder NEXT TO the AppImage (or
// the executable in other packaged layouts), so the app file and its data
// travel together. When that spot isn't writable (e.g. an /opt install), fall
// back to Electron's per-user data dir. Dev (unpackaged) keeps pod == repo, so
// seeding stays a no-op. DK_POD_ROOT overrides everything.
// Eventually a user-home TEMPLATE will be planted here; today seed.cjs plants
// the app definition.
function resolvePodRoot() {
  if (process.env.DK_POD_ROOT) return process.env.DK_POD_ROOT;
  let app;
  try { app = require('electron').app; } catch { return REPO_ROOT; }
  if (!app || !app.isPackaged) return REPO_ROOT;
  const installDir = process.env.APPIMAGE
    ? path.dirname(process.env.APPIMAGE)
    : path.dirname(app.getPath('exe'));
  for (const base of [installDir, app.getPath('userData')]) {
    const home = path.join(base, 'data-kitchen-home');
    try {
      fs.mkdirSync(home, { recursive: true });
      fs.accessSync(home, fs.constants.W_OK);
      return home;
    } catch { /* not writable — try the next base */ }
  }
  return path.join(app.getPath('userData'), 'data-kitchen-home');
}

// Public origin the app + blessed browsers talk to (the routing front server).
const PUBLIC_PORT = Number(process.env.DK_PUBLIC_PORT) || 8000;
// Pivot CSS listens here, BEHIND the router; never addressed directly by the app.
const CSS_INTERNAL_PORT = Number(process.env.DK_CSS_INTERNAL_PORT) || 8010;
// CORS proxy (unchanged role).
const PROXY_PORT = Number(process.env.DK_PROXY_PORT) || 8001;

module.exports = {
  REPO_ROOT,
  PUBLIC_PORT,
  CSS_INTERNAL_PORT,
  PROXY_PORT,
  PUBLIC_ORIGIN: `http://localhost:${PUBLIC_PORT}`,
  PROXY_ORIGIN:  `http://localhost:${PROXY_PORT}`,

  // What the app view loads — index.html from the pod root, via the router.
  APP_URL: `http://localhost:${PUBLIC_PORT}/index.html`,

  // Read-only engine dir the router serves engine paths from. In dev this is the
  // repo; in a packaged app it is the unpacked resources dir — both are __dirname's
  // parent, so REPO_ROOT is correct in both.
  ENGINE_DIR: REPO_ROOT,

  // Writable pod root the user redesigns in (served by pivot, fronted by router).
  // See resolvePodRoot() above for how it is chosen. Only ever passed to the
  // spawned server as a string — the shell never reads inside it.
  POD_ROOT: resolvePodRoot(),

  // The element in the web app that hosts swapped-in content. External content
  // (tab iframes, search/feed readers) is overlaid with native views there
  // instead of being iframed. NOTE: the preload reports the TABSET CONTENT
  // rect (.sol-tabs-content inside this element) once the included shell
  // exists — the tab bar and actions row also live inside #dk-content and
  // must never be covered (see preload.cjs contentRegionEl).
  CONTENT_SELECTOR: '#dk-content',
};
