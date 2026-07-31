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

// Filename (under Electron userData) where "Move my pod" persists the chosen
// pod-root path. Read by resolvePodRoot(); written by main.cjs's dk:move-pod.
const POD_POINTER = 'dk-pod-root';

// JSON-LD electron/pivot config (ports, window geometry, pod root) under
// Electron userData. Node reads it as plain JSON; the renderer edits it as a
// real sol-form (over a pod mirror) because the doc is one RDF subject — the
// foaf:primaryTopic node — carrying distinct predicates (ui:publicPort /
// ui:internalPort / ui:proxyPort, schema:width/height, ui:windowX/Y,
// pim:storage). Absent until first run / first save — every value falls back to
// the defaults below (and the env vars still override the ports).
const CONFIG_FILE = 'electron-config.jsonld';
function electronApp() { try { return require('electron').app; } catch { return null; } }
function configPath() { const a = electronApp(); return a ? path.join(a.getPath('userData'), CONFIG_FILE) : null; }
function readConfig() {
  const p = configPath();
  if (!p) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }   // absent/unreadable — use defaults
}
function writeConfig(cfg) {
  const p = configPath();
  if (!p) return false;
  try { fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n'); return true; } catch { return false; }
}
// The single config subject (the doc's foaf:primaryTopic node); created if absent.
function configTopic(cfg) {
  if (!cfg.primaryTopic || typeof cfg.primaryTopic !== 'object') cfg.primaryTopic = { '@id': '#config' };
  return cfg.primaryTopic;
}
const ELECTRON_CONFIG = readConfig();
function cfgVal(key) {
  const t = ELECTRON_CONFIG && ELECTRON_CONFIG.primaryTopic;
  const v = t && t[key];
  return Number.isFinite(v) ? v : undefined;
}
function cfgStorage() {
  const t = ELECTRON_CONFIG && ELECTRON_CONFIG.primaryTopic;
  return (t && typeof t.storage === 'string' && t.storage) || undefined;
}

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
  // The JSON-LD config's pim:storage (written by "Move my pod") is the chosen
  // root; it subsumes the legacy dk-pod-root pointer, which stays as a fallback
  // for installs that haven't written a config yet.
  const fromConfig = cfgStorage();
  if (fromConfig) return fromConfig;
  let app;
  try { app = require('electron').app; } catch { return REPO_ROOT; }
  // A "Move my pod" choice (persisted in userData) wins over the install-dir
  // default. The origin doesn't change on a move, so the WebID needs no rewrite.
  try {
    const saved = fs.readFileSync(path.join(app.getPath('userData'), POD_POINTER), 'utf8').trim();
    if (saved) return saved;
  } catch { /* no saved choice — fall through */ }
  if (!app || !app.isPackaged) return REPO_ROOT;
  // "Beside the app file" per platform. linux: beside the AppImage. mac:
  // beside the .app BUNDLE — dirname(exe) would be Contents/MacOS/ inside it,
  // so the pod would die with every "replace the app to update", and a
  // quarantined (translocated) bundle is read-only anyway. win: beside the exe.
  let installDir;
  if (process.env.APPIMAGE) {
    installDir = path.dirname(process.env.APPIMAGE);
  } else if (process.platform === 'darwin') {
    // exe = <install dir>/Solid Data Kitchen.app/Contents/MacOS/<binary>
    installDir = path.resolve(path.dirname(app.getPath('exe')), '..', '..', '..');
  } else {
    installDir = path.dirname(app.getPath('exe'));
  }
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
// Precedence: env var → JSON-LD config (#public/#internal/#proxy ui:portNumber)
// → built-in default.
const PUBLIC_PORT = Number(process.env.DK_PUBLIC_PORT) || cfgVal('publicPort') || 8000;
// Pivot CSS listens here, BEHIND the router; never addressed directly by the app.
const CSS_INTERNAL_PORT = Number(process.env.DK_CSS_INTERNAL_PORT) || cfgVal('privatePort') || 8010;
// CORS proxy (unchanged role).
const PROXY_PORT = Number(process.env.DK_PROXY_PORT) || cfgVal('proxyPort') || 8001;

module.exports = {
  REPO_ROOT,
  POD_POINTER,
  CONFIG_FILE,
  configPath,
  readConfig,
  writeConfig,
  configTopic,
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
