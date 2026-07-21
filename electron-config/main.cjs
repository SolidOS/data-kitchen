// Data-Kitchen "home" (desktop) shell.
//
// One app WebContentsView fills the window and loads the current web app from
// the bundled CSS server. External content the web app would iframe or
// window.open is redirected into native views instead (see external-views.js):
//   - window.open (search, feed, region=tab/window) → native reader overlay
//   - OIDC login popup                              → a real popup window
//   - external <iframe> in #dk-content              → native pane overlay
// The routing front server (:8000), the CSS "pivot" behind it (:8010), and the
// CORS proxy (:8001) start with the app and are killed on quit (servers.js).

const {
  app, BaseWindow, WebContentsView, BrowserWindow, ipcMain, session, screen, Menu, clipboard, shell, dialog, protocol,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { Readable } = require('node:stream');

const {
  APP_URL, PUBLIC_ORIGIN, PUBLIC_PORT, CSS_INTERNAL_PORT, PROXY_PORT, POD_ROOT, POD_POINTER,
  readConfig, writeConfig, configTopic,
} = require('./config.cjs');
const { Servers, getGateToken } = require('./servers.cjs');
const { initFileLog, getLogPath } = require('./log.cjs');
const { blessNonce } = require('./gate.cjs');
const { LibraryRoots } = require('./library-roots.cjs');
const { checkForUpdates } = require('./update-check.cjs');
const idpVault = require('./idp-vault.cjs');
const { mintCredential, createGrantSession, revokeCredentialViaAccount } = require('./idp-grant.cjs');
const { OWNER_EMAIL, OWNER_PASSWORD } = require('./seed-account.cjs');

// The local pod owner WebID (see seed-account.cjs) — the identity the local-pod
// client-credential is bound to.
const OWNER_WEBID = `${PUBLIC_ORIGIN}/dk-pod/profile/card#me`;

// The config's home is a real, browsable pod resource — the source of truth the
// user sees and the sol-form edits. userData (what config.cjs reads at launch,
// before the pod is served) just trails it: on boot we sync userData FROM the
// pod (pod wins), and every change is written through to the pod so it stays
// current. CSS serves/patches it natively.
const POD_CONFIG_URL = `${PUBLIC_ORIGIN}/dk-pod/dk/ui-data/data-kitchen-startup.ttl`;
const CFG_PRED = {
  publicPort:  'http://www.w3.org/ns/ui#publicPort',
  privatePort: 'http://www.w3.org/ns/ui#privatePort',
  proxyPort:   'http://www.w3.org/ns/ui#proxyPort',
  width:       'http://schema.org/width',
  height:      'http://schema.org/height',
  windowX:     'http://www.w3.org/ns/ui#windowX',
  windowY:     'http://www.w3.org/ns/ui#windowY',
};
const PIM_STORAGE = 'http://www.w3.org/ns/pim/space#storage';
const { ExternalViews } = require('./external-views.cjs');

// A fresh JSON-LD electron/pivot config seeded with the values this process
// booted with: one subject (foaf:primaryTopic) carrying distinct predicates, so
// the renderer edits it as a real sol-form and Node reads it as plain JSON.
function buildDefaultConfig() {
  return {
    '@context': {
      ui: 'http://www.w3.org/ns/ui#',
      schema: 'http://schema.org/',
      pim: 'http://www.w3.org/ns/pim/space#',
      foaf: 'http://xmlns.com/foaf/0.1/',
      wd: 'http://www.wikidata.org/entity/',
      publicPort: 'ui:publicPort',
      privatePort: 'ui:privatePort',
      proxyPort: 'ui:proxyPort',
      width: 'schema:width',
      height: 'schema:height',
      windowX: 'ui:windowX',
      windowY: 'ui:windowY',
      storage: { '@id': 'pim:storage' },
      primaryTopic: { '@id': 'foaf:primaryTopic', '@type': '@id' },
    },
    '@id': '',
    '@type': 'wd:Q1193846',
    primaryTopic: {
      '@id': '#config',
      publicPort: PUBLIC_PORT,
      privatePort: CSS_INTERNAL_PORT,
      proxyPort: PROXY_PORT,
      storage: POD_ROOT,
    },
  };
}
// The editable numeric fields the settings form round-trips.
const CONFIG_NUM_KEYS = ['publicPort', 'privatePort', 'proxyPort', 'width', 'height', 'windowX', 'windowY'];

// Dev: serve always-fresh files from the local working trees — both edited
// modules AND data TTLs the app re-fetches after a write (e.g. a settings
// save). Without this, Electron's HTTP cache returns the pre-write copy, so
// <sol-default> re-resolves stale and theme/font changes never take effect.
app.commandLine.appendSwitch('disable-http-cache');

// Let the http-origin app view play the user's OWN imported audio. An imported
// music library keeps the originals in place and stores file:// URLs in mo:item;
// but Chromium blocks file:// as a local resource from a non-file origin, and
// the block can't be lifted for the special file: scheme. So local audio is
// served over a custom dkfile: scheme that IS fetchable/streamable from the app
// origin — the player rewrites a track's file:// URL to dkfile: only when it
// sets the media element src. Must be declared before app 'ready'; the bytes
// are served read-only, with Range support, by installFileProtocol().
const LOCAL_SCHEME = 'dkfile';
try {
  protocol.registerSchemesAsPrivileged([
    { scheme: LOCAL_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
  ]);
} catch (e) { console.warn('[dk] could not register the local-file scheme:', e.message); }

const APP_ORIGIN = new URL(APP_URL).origin;

// A cross-origin http(s) URL — content that should leave the app view and show
// in a native overlay instead of replacing the app.
function isExternalUrl(url) {
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.origin !== APP_ORIGIN;
  } catch {
    return false;
  }
}

// Content-Type for a local media file served by installFileProtocol(). Covers
// the audio formats the importer scans; falls back to a generic stream so an
// unknown extension still downloads rather than 415s.
const AUDIO_MIME = {
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
  '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.oga': 'audio/ogg',
  '.opus': 'audio/opus', '.wav': 'audio/wav', '.weba': 'audio/webm',
};
function audioMime(filePath) {
  return AUDIO_MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

// Opt-in auto-reload (DK_RELOAD=1). Off by default: it recursively watches the
// app tree, and node_modules blows the OS file-watcher limit (ENOSPC).
if (process.env.DK_RELOAD) {
  try {
    require('electron-reloader')(module, { ignore: ['node_modules', 'pivot-config', 'proxy'] });
  } catch (_) { /* dev-only */ }
}

// Teardown races (quit / restart / reload) can fire a window/view callback after
// the object is gone — "Object has been destroyed" — harmless, but Electron would
// pop its main-process error dialog. Swallow exactly that; surface anything else.
process.on('uncaughtException', (err) => {
  const msg = String((err && err.message) || err);
  if (/Object has been destroyed/.test(msg)) return;
  try {
    require('electron').dialog.showErrorBox('A JavaScript error in the main process', (err && err.stack) || msg);
  } catch { /* dialog unavailable */ }
});

class DesktopApp {
  constructor() {
    this.baseWindow = null;
    this.appView = null;
    this.external = null;
    this.servers = new Servers({ log: (m) => console.log(m) });
    // Live headless sessions for "remember this IdP" (keyed by issuer origin).
    // Built on demand by dk:silent-login from the encrypted vault; their .fetch
    // backs dk:idp-fetch. The access tokens / DPoP keys live ONLY here in main.
    this._grantSessions = new Map();
    // Issuers the user declined to remember this run (so the post-login offer
    // doesn't re-pop after a "Not now").
    this._declinedRemember = new Set();
    app.whenReady().then(() => this.start());
    // Quit on window close on EVERY platform, mac included. The mac stay-
    // resident convention is a trap here: the servers stop with the window and
    // nothing re-creates it (no activate handler), so a lingering dock icon
    // would be a zombie shell over dead servers.
    app.on('window-all-closed', () => { this._stopWatchdog(); this.servers.stop(); app.quit(); });
    app.on('before-quit', () => { this._stopWatchdog(); this.servers.stop(); });
    app.on('web-contents-created', (_e, wc) => this.installOpenHandler(wc));
  }

  async start() {
    // First thing, so the server spawn/seed lines below are captured: mirror
    // console output to <userData>/dk.log — the packaged app (esp. the Windows
    // zip) has no terminal, and this file is what a bug report can include.
    const logPath = initFileLog(app.getPath('userData'));
    if (logPath) console.log(`[dk] v${app.getVersion()} — logging to ${logPath}`);
    // No menu bar — EXCEPT on macOS, where the application menu is what
    // provides the standard key bindings: a null menu kills Cmd+C/V/X/A in
    // every input field plus Cmd+Q/W/M/H. Minimal role-based menu there.
    // (No viewMenu: its Cmd+R reload is deliberately blocked in this shell.)
    Menu.setApplicationMenu(process.platform === 'darwin'
      ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }])
      : null);
    // dkfile: allow-list (imported music folders); persisted in userData.
    this._libraryRoots = new LibraryRoots(app.getPath('userData'));
    this.installGateHeader();
    try {
      await this.servers.start();
    } catch (e) {
      console.error('server startup problem (continuing — a server may already be running):', e.message);
    }
    // Dev: the app is served from local working trees that change between
    // launches; clear the HTTP cache so edited modules are always picked up.
    try { await session.defaultSession.clearCache(); } catch (_) {}
    // Let the http-origin app view play the user's OWN local audio files: an
    // imported music library stores file:// URLs in mo:item (the originals are
    // never copied). webSecurity stays on; this handler only ever GETs the
    // requested file, with Range support so the <video> element can seek.
    this.installFileProtocol();
    // The pod resource is the source of truth: trail userData to it (and seed it
    // if absent) now that CSS is up, BEFORE creating the window so geometry is
    // current.
    await this.syncConfigFromPod();
    this.createWindow();
    // Zero-friction durable login for the local pod: mint its client-credential
    // once (idempotent — skipped if already vaulted), so clicking the local
    // issuer logs in headlessly. Best-effort + non-blocking; retries cover the
    // race with the fire-and-forget account seeding in servers.start().
    this.autoMintLocal();
    // Startup update check (GitHub Releases) — non-blocking; silent unless a
    // newer release exists, then asks before doing anything (update-check.cjs).
    checkForUpdates(this.baseWindow)
      .catch((e) => console.warn('[update] check failed:', e.message));
  }

  // Mint + vault the local-pod credential if we don't already have one. The
  // owner account/password are known to the app (seed-account.cjs), so this needs
  // no prompt. Retries a few times because the account is seeded asynchronously.
  async autoMintLocal() {
    if (!idpVault.isAvailable() || idpVault.getCredential(PUBLIC_ORIGIN)) return;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const rec = await mintCredential({
          origin: PUBLIC_ORIGIN, email: OWNER_EMAIL, password: OWNER_PASSWORD,
          webId: OWNER_WEBID, gateToken: getGateToken(),
        });
        idpVault.putCredential(PUBLIC_ORIGIN, {
          clientId: rec.clientId, secret: rec.secret, webId: rec.webId,
          tokenEndpoint: rec.tokenEndpoint, resource: rec.resource, issuerOrigin: rec.issuerOrigin,
        });
        console.log('[idp] local pod credential minted + vaulted');
        return;
      } catch (e) {
        if (attempt === 4) { console.warn('[idp] local auto-mint gave up:', e.message); return; }
        await new Promise((r) => setTimeout(r, 2000));   // wait for account seeding
      }
    }
  }

  createWindow() {
    // Window geometry: the JSON-LD config (schema:width/height, ui:windowX/Y)
    // when present, else the full work area at the top-left.
    const cfg = readConfig();
    const winCfg = cfg && cfg.primaryTopic;
    const { width: scrW, height: scrH } = screen.getPrimaryDisplay().workAreaSize;
    const width  = (winCfg && Number.isFinite(winCfg.width))   ? winCfg.width   : scrW;
    const height = (winCfg && Number.isFinite(winCfg.height))  ? winCfg.height  : scrH;
    const x = (winCfg && Number.isFinite(winCfg.windowX)) ? winCfg.windowX : 0;
    const y = (winCfg && Number.isFinite(winCfg.windowY)) ? winCfg.windowY : 0;
    this.baseWindow = new BaseWindow({
      width, height, x, y, title: 'Solid Data Kitchen',
      icon: path.join(__dirname, '..', 'assets', 'icons', 'dk-512.png'),
    });
    // Startup default is FULL SCREEN (maximized). The saved geometry above
    // still matters: it is what unmaximize restores to.
    this.baseWindow.maximize();

    this.appView = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    // The app view fills the window's container view. (Not setContentView:
    // the native overlay panes must be SIBLINGS of the app view — children
    // of a WebContentsView don't paint over its web texture.) Manual fitting
    // must never miss a geometry change, so: every resize-ish event, plus a
    // cheap drift watchdog that refits if the bounds ever disagree anyway.
    this.baseWindow.contentView.addChildView(this.appView);
    this.fitAppView();
    for (const ev of ['resize', 'resized', 'maximize', 'unmaximize', 'restore',
                      'enter-full-screen', 'leave-full-screen']) {
      this.baseWindow.on(ev, () => this.fitAppView());
    }
    // Remember window geometry across launches: persist (debounced) into the
    // JSON-LD config when the user resizes or moves the window.
    for (const ev of ['resized', 'moved']) {
      this.baseWindow.on(ev, () => this._scheduleSaveBounds());
    }
    this._fitTimer = setInterval(() => this.fitAppView(), 500);

    this.external = new ExternalViews(this.baseWindow);
    this.wireIpc();
    this.wireContextMenu(this.appView.webContents);

    const wc = this.appView.webContents;
    wc.on('did-finish-load', () => console.log(`[app] loaded ${wc.getURL()}`));
    // A failed main-frame load would leave the user staring at a blank window
    // with zero diagnostics (the v2.1.1 Windows report) — show what failed
    // instead. -3 = ERR_ABORTED, the normal noise of an interrupted/redirected
    // navigation, never a dead end.
    wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
      console.error(`[app] load failed (${code} ${desc}) ${url}`);
      if (isMainFrame && code !== -3) this.showStartupError(url, `${desc || 'error'} (${code})`);
    });

    // A plain link to another site would otherwise navigate the whole app view
    // away (header and all, no way back). Keep the app put; show the external
    // page in the reader overlay instead. (window.open is handled separately
    // by setWindowOpenHandler; same-origin navigation stays in the app.)
    wc.on('will-navigate', (e, url) => {
      if (isExternalUrl(url)) { e.preventDefault(); this.external.openReader(url); }
    });

    wc.loadURL(APP_URL);
  }

  // Replace a blank failed window with a static page saying what failed, what
  // the servers reported, and where the log file is. Generated inline and
  // loaded as a data: URL — no scripts, all content fixed at generation time;
  // "Try again" is a plain link back to the app URL.
  showStartupError(failedUrl, reason) {
    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const rows = [
      ['Failed to load', failedUrl],
      ['Reason', reason],
      ['Server startup', this.servers.startupError || 'no error reported'],
      ['Log file', getLogPath() || 'unavailable'],
    ].map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8">
      <title>Solid Data Kitchen — startup problem</title>
      <style>
        body { font: 16px/1.5 system-ui, sans-serif; margin: 3rem auto; max-width: 42rem; padding: 0 1rem; color: #222; }
        h1 { font-size: 1.4rem; }
        table { border-collapse: collapse; margin: 1rem 0; }
        th, td { text-align: left; vertical-align: top; padding: .3rem .8rem .3rem 0; font-size: 16px; }
        th { white-space: nowrap; color: #555; font-weight: 600; }
        td { word-break: break-all; }
        a.retry { display: inline-block; margin-top: .5rem; padding: .5rem 1.2rem;
                  background: #1a5fb4; color: #fff; border-radius: 6px; text-decoration: none; }
      </style></head><body>
      <h1>Solid Data Kitchen could not start its local server</h1>
      <p>The app page did not load. This usually means the bundled pod server
      failed to start, or another program is already using its port
      (${PUBLIC_PORT} / ${CSS_INTERNAL_PORT}).</p>
      <table>${rows}</table>
      <p>If this keeps happening, please include the log file in a bug report.</p>
      <a class="retry" href="${esc(APP_URL)}">Try again</a>
      </body></html>`;
    this.appView.webContents
      .loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
      .catch((e) => console.error('[app] error page failed to load:', e.message));
  }

  // The local servers require the per-install gate token (gate.cjs). Inject it
  // on every default-session request to them, so the app just works — pages in
  // outside browsers don't have it and get 401. Scoped to the loopback URLs
  // only, so the token never leaves the machine; the external-views partition
  // is a different session and stays unblessed (its loopback requests are
  // cancelled outright in external-views.cjs).
  installGateHeader() {
    const token = getGateToken();
    const urls = [];
    for (const p of [PUBLIC_PORT, PROXY_PORT]) {
      urls.push(`http://localhost:${p}/*`, `http://127.0.0.1:${p}/*`);
    }
    // Media-host identification rides the SAME listener — Electron keeps only
    // one onBeforeSendHeaders per session, so a second call would silently
    // replace the gate hook. Internet Archive / Wikimedia requests (API calls
    // AND media streams) get the open-media-player token appended to the real
    // User-Agent — the only place it CAN be set: Chromium drops a JS fetch
    // UA override, and IA's CORS refuses every custom header (Wikimedia API
    // calls additionally carry omp's Api-User-Agent from the renderer).
    let ompUserAgent = '';
    try { ompUserAgent = 'open-media-player/' + require('open-media-player/package.json').version; }
    catch (_) { /* package absent → requests keep the default UA */ }
    const mediaUrls = ['https://archive.org/*', 'https://*.archive.org/*', 'https://*.wikimedia.org/*'];
    const isMediaHost = (h) => h === 'archive.org' || h.endsWith('.archive.org')
      || h === 'wikimedia.org' || h.endsWith('.wikimedia.org');
    session.defaultSession.webRequest.onBeforeSendHeaders({ urls: [...urls, ...mediaUrls] }, (details, callback) => {
      let hostname = '';
      try { hostname = new URL(details.url).hostname; } catch (_) {}
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        details.requestHeaders['x-dk-token'] = token;
      } else if (ompUserAgent && isMediaHost(hostname)) {
        details.requestHeaders['User-Agent'] =
          `${details.requestHeaders['User-Agent'] || ''} ${ompUserAgent}`.trim();
      }
      callback({ requestHeaders: details.requestHeaders });
    });

    // Deliberately-opened apps (panes) run on the trusted-guest session so they
    // can log into the local pod. Bless their pod-origin requests with the same
    // token — but ONLY the pod's PUBLIC port, never the proxy. Everything else
    // on this machine stays out of reach (the session itself cancels non-pod
    // loopback in external-views.cjs).
    const podUrls = [`http://localhost:${PUBLIC_PORT}/*`, `http://127.0.0.1:${PUBLIC_PORT}/*`];
    session.fromPartition('persist:trusted-guest').webRequest.onBeforeSendHeaders({ urls: podUrls }, (details, callback) => {
      details.requestHeaders['x-dk-token'] = token;
      callback({ requestHeaders: details.requestHeaders });
    });
  }

  // Stream local files to the (http-origin) app view over the custom dkfile:
  // scheme so a <video>/<audio> element can play the user's in-place audio
  // (Chromium blocks file:// from a non-file origin). Read-only GET; honours the
  // Range header (a 206 partial response) so seeking works. Scoped to the
  // default (app) session.
  installFileProtocol() {
    session.defaultSession.protocol.handle(LOCAL_SCHEME, async (request) => {
      let filePath;
      try {
        // The renderer rewrites file:///abs → dkfile:///abs. As a *standard*
        // scheme Chromium folds the first path segment of dkfile:///home/… into
        // the URL host, so reassemble the absolute path as "/<host><pathname>".
        const u = new URL(request.url);
        filePath = (u.host ? '/' + decodeURIComponent(u.host) : '') + decodeURIComponent(u.pathname);
        // Windows: strip the leading slash before the drive letter (/C:/…).
        if (process.platform === 'win32' && /^\/[A-Za-z]:/.test(filePath)) filePath = filePath.slice(1);
      } catch {
        return new Response('Bad file URL', { status: 400 });
      }
      // Only serve files under a folder the user explicitly imported — a track's
      // mo:item file:// URL is attacker-influenceable, so an unrestricted handler
      // would be an arbitrary local-file read within the app origin.
      if (!this._libraryRoots || !this._libraryRoots.isAllowed(filePath)) {
        return new Response('Forbidden', { status: 403 });
      }
      let stat;
      try { stat = await fs.promises.stat(filePath); }
      catch { return new Response('Not found', { status: 404 }); }
      if (!stat.isFile()) return new Response('Forbidden', { status: 403 });

      const total = stat.size;
      const type = audioMime(filePath);
      const range = request.headers.get('range');
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
        let start = m[1] ? parseInt(m[1], 10) : 0;
        let end   = m[2] ? parseInt(m[2], 10) : total - 1;
        if (!Number.isFinite(start) || start < 0) start = 0;
        if (!Number.isFinite(end) || end >= total) end = total - 1;
        if (start > end) return new Response('Range Not Satisfiable', { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
        const stream = fs.createReadStream(filePath, { start, end });
        return new Response(Readable.toWeb(stream), {
          status: 206,
          headers: {
            'Content-Type': type,
            'Content-Length': String(end - start + 1),
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Accept-Ranges': 'bytes',
          },
        });
      }
      return new Response(Readable.toWeb(fs.createReadStream(filePath)), {
        status: 200,
        headers: { 'Content-Type': type, 'Content-Length': String(total), 'Accept-Ranges': 'bytes' },
      });
    });
  }

  _stopWatchdog() { if (this._fitTimer) { clearInterval(this._fitTimer); this._fitTimer = null; } }

  // Debounce rapid resize/move events into one config write.
  _scheduleSaveBounds() {
    if (this._saveBoundsTimer) clearTimeout(this._saveBoundsTimer);
    this._saveBoundsTimer = setTimeout(() => { this._saveBoundsTimer = null; this.saveWindowBounds(); }, 600);
  }

  // Persist the current window bounds into the config (userData + pod).
  saveWindowBounds() {
    try {
      if (!this.baseWindow || this.baseWindow.isDestroyed()) return;
      const b = this.baseWindow.getBounds();
      const cfg = readConfig() || buildDefaultConfig();
      const win = configTopic(cfg);
      win.width = b.width; win.height = b.height; win.windowX = b.x; win.windowY = b.y;
      writeConfig(cfg);
      this.publishConfigToPod();   // keep the pod copy current
    } catch { /* config dir unwritable — geometry just won't persist */ }
  }

  // Write the current config (userData) THROUGH to the browsable pod resource,
  // so the pod always shows live values. Authed PUT via the gate token (CSS).
  async publishConfigToPod() {
    try {
      const cfg = readConfig() || buildDefaultConfig();
      const t = configTopic(cfg);
      const stmts = [];
      for (const [k, p] of Object.entries(CFG_PRED)) {
        if (Number.isFinite(t[k])) stmts.push(`   <${p}> ${t[k]}`);
      }
      // Always publish the pod root: the chosen one (config pim:storage) or,
      // when none is set yet, the root this process actually booted with — so
      // the settings form's Pod Root field always shows the live value.
      const storage = (typeof t.storage === 'string' && t.storage) || POD_ROOT;
      if (storage) stmts.push(`   <${PIM_STORAGE}> ${JSON.stringify(storage)}`);
      const body =
        `<> a <http://www.wikidata.org/entity/Q1193846> ;\n` +
        `   <http://xmlns.com/foaf/0.1/primaryTopic> <#config> .\n` +
        `<#config>\n${stmts.join(' ;\n')} .\n`;
      await fetch(POD_CONFIG_URL, {
        method: 'PUT', headers: { 'content-type': 'text/turtle', 'x-dk-token': getGateToken() }, body,
      });
    } catch (e) { console.warn('[dk] publish config to pod failed:', e.message); }
  }

  // On boot (servers up): the pod resource is authoritative. Read it and trail
  // userData to it; if it's absent, seed it from userData/defaults.
  async syncConfigFromPod() {
    let text = null;
    try {
      const r = await fetch(POD_CONFIG_URL, { headers: { 'x-dk-token': getGateToken(), accept: 'text/turtle' } });
      if (r.status === 404) { await this.publishConfigToPod(); return; }
      if (r.ok) text = await r.text();
    } catch (e) { console.warn('[dk] read pod config failed:', e.message); return; }
    if (!text) return;
    try {
      const $rdf = require('rdflib');
      const store = $rdf.graph();
      $rdf.parse(text, store, POD_CONFIG_URL, 'text/turtle');
      const subj = $rdf.sym(POD_CONFIG_URL + '#config');
      const cfg = readConfig() || buildDefaultConfig();
      const t = configTopic(cfg);
      let changed = false;
      for (const [k, p] of Object.entries(CFG_PRED)) {
        const o = store.any(subj, $rdf.sym(p));
        const v = o && parseInt(o.value, 10);
        if (Number.isFinite(v) && t[k] !== v) { t[k] = v; changed = true; }
      }
      const stor = store.any(subj, $rdf.sym(PIM_STORAGE));
      if (stor && typeof stor.value === 'string' && t.storage !== stor.value) { t.storage = stor.value; changed = true; }
      if (changed) writeConfig(cfg);
      // Republish so the doc always carries the full current state — notably
      // the pim:storage line (the effective root when none is chosen), which
      // the settings form's Pod Root field reads. Idempotent when unchanged.
      await this.publishConfigToPod();
    } catch (e) { console.warn('[dk] parse pod config failed:', e.message); }
  }

  // Keep the app view exactly the window's content size; cheap no-op when
  // already in sync (called from events AND the watchdog interval). Guards
  // against the window/view being torn down (quit, restart, reload) — otherwise
  // the watchdog fires on a destroyed object and loops an uncaught exception.
  fitAppView() {
    try {
      if (!this.baseWindow || this.baseWindow.isDestroyed()) { this._stopWatchdog(); return; }
      const { width, height } = this.baseWindow.getContentBounds();
      const b = this.appView.getBounds();
      if (b.width === width && b.height === height && b.x === 0 && b.y === 0) return;
      this.appView.setBounds({ x: 0, y: 0, width, height });
    } catch {
      // Window/view torn down mid-fit (quit, restart, close) — accessing it
      // (even .isDestroyed) can throw "Object has been destroyed". Stop fitting.
      this._stopWatchdog();
    }
  }

  // Redirect window.open: OIDC login → real popup window; everything else →
  // the native reader overlay. Installed on every webContents (app + popups).
  installOpenHandler(wc) {
    wc.setWindowOpenHandler(({ url, frameName, features }) => {
      const isLogin = /login/i.test(frameName || '') || /\bpopup\b/i.test(features || '');
      if (isLogin) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 480, height: 620, autoHideMenuBar: true,
            // sandbox:true like every other view — it's just an external IdP login
            // page, so it needs no privileged APIs.
            webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
          },
        };
      }
      if (this.external && url) this.external.openReader(url);
      return { action: 'deny' };
    });
  }

  wireIpc() {
    ipcMain.on('dk:content-rect', (_e, rect) => this.external.setContentRect(rect));
    ipcMain.on('dk:pane-rect', (_e, rect) => this.external.setPaneRect(rect));
    ipcMain.on('dk:pane-open', (_e, { url, rect }) => this.external.openPane(url, rect));
    ipcMain.on('dk:pane-close', () => this.external.closePane());
    // sol-feed inline article pane (locked external session, sub-region).
    ipcMain.on('dk:article-rect', (_e, rect) => this.external.setArticleRect(rect));
    ipcMain.on('dk:article-open', (_e, { url, rect }) => this.external.openArticlePane(url, rect));
    ipcMain.on('dk:article-close', () => this.external.closeArticlePane());
    ipcMain.on('dk:overlays-suspend', () => this.external.suspend());
    ipcMain.on('dk:overlays-resume', () => this.external.resume());
    ipcMain.on('dk:reader-back', () => this.external.readerBack());
    ipcMain.on('dk:reader-forward', () => this.external.readerForward());
    ipcMain.on('dk:reader-reload', () => this.external.readerReload());
    ipcMain.on('dk:reader-close', () => this.external.closeReader());
    // Hard restart (☰ "Restart dk"): relaunch the whole app so a fresh process
    // picks up main / electron-config / server / bundle changes. quit() (not
    // exit()) so before-quit fires and the bundled servers are stopped first.
    ipcMain.on('dk:restart', () => { app.relaunch(); app.quit(); });

    // Settings page: read the JSON-LD electron/pivot config plus the values this
    // process actually booted with (so the UI can show current vs edited).
    ipcMain.handle('dk:get-config', () => ({
      config: readConfig() || buildDefaultConfig(),
      effective: {
        publicPort: PUBLIC_PORT, privatePort: CSS_INTERNAL_PORT, proxyPort: PROXY_PORT,
        root: POD_ROOT,
      },
    }));

    // Settings page: persist the edited numeric fields (read by the renderer off
    // the sol-form's pod mirror). Window geometry applies live via setBounds; a
    // changed port can't rebind a running server, so prompt reload-now /
    // wait-until-next-launch (only main can relaunch).
    ipcMain.handle('dk:save-config', async (_e, vals) => {
      if (!vals || typeof vals !== 'object') return { status: 'error', message: 'malformed values' };
      const cfg = readConfig() || buildDefaultConfig();
      const t = configTopic(cfg);
      for (const k of CONFIG_NUM_KEYS) { if (Number.isFinite(vals[k])) t[k] = vals[k]; }
      // Pod Root (pim:storage): adopt an edited path into the config at once —
      // it becomes the root on the next launch (data is NOT moved; the app just
      // re-roots there). Adopting immediately also keeps publishConfigToPod
      // from wiping a doc-only edit on the next republish (window resize).
      if (typeof vals.storage === 'string' && vals.storage.trim()) {
        const to = path.resolve(vals.storage.trim());
        const cur = (typeof t.storage === 'string' && t.storage) ? path.resolve(t.storage) : path.resolve(POD_ROOT);
        if (to !== cur) {
          t.storage = to;
          // Keep the legacy pointer in step — it's the boot fallback.
          try { fs.writeFileSync(path.join(app.getPath('userData'), POD_POINTER), to + '\n'); } catch { /* pointer optional */ }
        }
      }
      if (!writeConfig(cfg)) return { status: 'error', message: 'could not write config' };
      this.publishConfigToPod();   // keep the pod source-of-truth in lock-step

      // Window geometry can apply immediately.
      if (this.baseWindow && !this.baseWindow.isDestroyed()) {
        const b = this.baseWindow.getBounds();
        this.baseWindow.setBounds({
          x:      Number.isFinite(t.windowX) ? t.windowX : b.x,
          y:      Number.isFinite(t.windowY) ? t.windowY : b.y,
          width:  Number.isFinite(t.width)   ? t.width   : b.width,
          height: Number.isFinite(t.height)  ? t.height  : b.height,
        });
      }
      const portsChanged =
        (Number.isFinite(vals.publicPort)  && Number(vals.publicPort)  !== PUBLIC_PORT) ||
        (Number.isFinite(vals.privatePort) && Number(vals.privatePort) !== CSS_INTERNAL_PORT) ||
        (Number.isFinite(vals.proxyPort)   && Number(vals.proxyPort)   !== PROXY_PORT);
      // No modal here — the sol-form autosaves per field, so the renderer
      // surfaces a dismissible "ports changed — reload?" banner and triggers
      // dk:restart when the user is ready.
      return { status: 'saved', portsChanged };
    });

    // Import music: pick a folder, recursively scan its audio files and parse
    // their tags in the main process (Node + music-metadata), streaming progress
    // back to the renderer. Returns the flat metadata; the renderer authors the
    // library RDF and points mo:item file:// at the originals (never copied).
    ipcMain.handle('dk:import-music', async (e) => {
      // Test hook: DK_IMPORT_TEST_DIR bypasses the interactive folder picker so
      // the full scan→author→write path can be driven end-to-end in e2e tests.
      // Never set in production.
      let root = process.env.DK_IMPORT_TEST_DIR || null;
      if (!root) {
        const res = await dialog.showOpenDialog({
          title: 'Choose a folder of music to import',
          properties: ['openDirectory'],
        });
        if (res.canceled || !res.filePaths || !res.filePaths[0]) return { status: 'cancelled' };
        root = res.filePaths[0];
      }
      // Authorize dkfile: to serve tracks under this folder (the mo:item file://
      // originals live here). Persisted, so playback survives a restart.
      this._libraryRoots.add(root);
      try {
        const { scanFolder } = await this._musicScanner();
        const send = (payload) => { try { if (!e.sender.isDestroyed()) e.sender.send('dk:import-progress', payload); } catch { /* renderer gone */ } };
        const result = await scanFolder(root, { onProgress: send });
        return { status: 'scanned', ...result };
      } catch (err) {
        return { status: 'error', message: err.message || String(err) };
      }
    });

    // Read one file's embedded cover art (base64); the renderer requests one per
    // release to write as the release artwork (foaf:depiction).
    ipcMain.handle('dk:read-cover', async (_e, absPath) => {
      if (typeof absPath !== 'string' || !absPath) return null;
      // Same allow-list as dkfile: — only read art from an imported library folder.
      if (!this._libraryRoots || !this._libraryRoots.isAllowed(absPath)) return null;
      try {
        const { readCover } = await this._musicScanner();
        return await readCover(absPath);
      } catch { return null; }
    });

    // ── "Remember this IdP" — durable, headless per-issuer login ─────────────
    // Secrets stay in main: the renderer only ever names an issuer and receives a
    // proxied fetch (dk:idp-fetch); it never sees a token or the DPoP key.

    // Mint + vault a durable client-credential. The local pod uses its known
    // owner account (no creds needed); a remote CSS issuer supplies email+password
    // ONCE — used transiently to mint, then discarded (only {id,secret} is stored).
    ipcMain.handle('dk:remember-idp', (_e, { issuer, email, password } = {}) =>
      this._rememberIdp(issuer, email, password));

    // Post-login offer: the renderer reports a real (non-local) sign-in; if the
    // issuer is a CSS account API we can durably remember, isn't already
    // remembered, and wasn't declined this run, open the dedicated password
    // window. The decision + any secret stay in main.
    ipcMain.handle('dk:offer-remember', async (_e, { issuer } = {}) => {
      if (!issuer || !idpVault.isAvailable() || this._isLocalIssuer(issuer)) return { offered: false };
      const key = idpVault.issuerKey(issuer);
      if (idpVault.getCredential(issuer) || this._declinedRemember.has(key)) return { offered: false };
      if (!await this._isCssRememberable(issuer)) return { offered: false };
      this.openRememberWindow(issuer);
      return { offered: true };
    });

    // The dedicated "Remember this sign-in" window (remember-idp-window.html via
    // its own preload) talks to main over these channels — the password reaches
    // ONLY main, is used to mint, and is never persisted or sent to the app view.
    ipcMain.handle('dk:remember-context', () => ({ issuer: this._rememberIssuer || null }));
    ipcMain.handle('dk:remember-submit', async (_e, { email, password } = {}) => {
      const issuer = this._rememberIssuer;
      if (!issuer) return { status: 'error', message: 'no pending issuer' };
      const r = await this._rememberIdp(issuer, email, password);
      if (r.status === 'remembered' && this._rememberWin && !this._rememberWin.isDestroyed()) this._rememberWin.close();
      return r;
    });
    ipcMain.handle('dk:remember-cancel', () => {
      if (this._rememberIssuer) this._declinedRemember.add(idpVault.issuerKey(this._rememberIssuer));
      if (this._rememberWin && !this._rememberWin.isDestroyed()) this._rememberWin.close();
      return { status: 'cancelled' };
    });

    // Which issuers have a stored credential (origins only — never secrets), so
    // the renderer knows when to take the silent path.
    ipcMain.handle('dk:get-remembered-idp', () => (idpVault.isAvailable() ? idpVault.listIssuers() : []));

    // Drop a remembered issuer; for the local pod we also revoke server-side (we
    // still hold its password). Remote credentials can only be dropped locally
    // (revoking needs the account password, which we never kept) — note it.
    ipcMain.handle('dk:forget-idp', async (_e, { issuer } = {}) => {
      if (!issuer) return { status: 'error', message: 'no issuer' };
      this._grantSessions.delete(idpVault.issuerKey(issuer));
      const rec = idpVault.getCredential(issuer);
      let revoked = false;
      if (rec && this._isLocalIssuer(issuer)) {
        try { revoked = await revokeCredentialViaAccount({ origin: PUBLIC_ORIGIN, email: OWNER_EMAIL, password: OWNER_PASSWORD, gateToken: getGateToken(), resource: rec.resource }); }
        catch (e) { console.warn('[idp] server-side revoke failed:', e.message); }
      }
      idpVault.forgetCredential(issuer);
      return { status: 'forgotten', revoked };
    });

    // Build the headless session from the vaulted credential and confirm it still
    // works (warmup forces a fresh grant — fails if revoked/expired). On success
    // the session is cached for dk:idp-fetch; the renderer then registers it. On
    // failure the renderer falls back to the normal interactive login.
    ipcMain.handle('dk:silent-login', async (_e, { issuer } = {}) => {
      if (!issuer) return { status: 'error', message: 'no issuer' };
      const rec = idpVault.getCredential(issuer);
      if (!rec) return { status: 'none' };
      // A headless grant needs no popup, so this little window is the only
      // visible sign an auto-login is happening; open it for the grant and
      // close it however the grant ends.
      const statusWin = this.openAutoLoginWindow(issuer);
      try {
        const opts = this._isLocalIssuer(issuer) ? { gateToken: getGateToken(), gatedOrigin: PUBLIC_ORIGIN } : {};
        const sess = createGrantSession(rec, opts);
        const webId = await sess.warmup();
        this._grantSessions.set(idpVault.issuerKey(issuer), sess);
        return { status: 'ok', webId, issuer: idpVault.issuerKey(issuer) };
      } catch (e) {
        return { status: 'error', message: e.message };
      } finally {
        this.closeAutoLoginWindow(statusWin);
      }
    });

    // Per-request proxy for MainProxySession.fetch (src/dk-idp-proxy-session.js):
    // run the request under the issuer's headless session in main, return a
    // serialized response. The token/DPoP key never cross to the renderer.
    ipcMain.handle('dk:idp-fetch', async (_e, { issuer, url, init } = {}) => {
      const sess = this._grantSessions.get(idpVault.issuerKey(issuer || ''));
      if (!sess) return { error: 'no-session' };
      try {
        const res = await sess.fetch(url, init || {});
        const body = await res.arrayBuffer();
        return { ok: true, status: res.status, statusText: res.statusText, headers: [...res.headers], body };
      } catch (e) {
        return { error: e.message };
      }
    });
  }

  // Is this issuer our bundled local pod (the gated loopback origin)?
  _isLocalIssuer(issuer) {
    try { return idpVault.issuerKey(issuer) === idpVault.issuerKey(PUBLIC_ORIGIN); }
    catch { return false; }
  }

  // Mint a durable client-credential and vault it (shared by the app IPC and the
  // dedicated window). Local pod uses its known owner account; a remote CSS issuer
  // supplies email+password transiently — only {id,secret} is ever stored.
  async _rememberIdp(issuer, email, password) {
    if (!issuer) return { status: 'error', message: 'no issuer' };
    if (!idpVault.isAvailable()) return { status: 'unavailable' };
    try {
      const rec = this._isLocalIssuer(issuer)
        ? await mintCredential({ origin: PUBLIC_ORIGIN, email: OWNER_EMAIL, password: OWNER_PASSWORD, webId: OWNER_WEBID, gateToken: getGateToken() })
        : await mintCredential({ origin: new URL(issuer).origin, email, password });
      idpVault.putCredential(issuer, {
        clientId: rec.clientId, secret: rec.secret, webId: rec.webId,
        tokenEndpoint: rec.tokenEndpoint, resource: rec.resource, issuerOrigin: rec.issuerOrigin,
      });
      return { status: 'remembered', webId: rec.webId };
    } catch (e) {
      return { status: 'error', message: e.message };
    }
  }

  // Does this issuer expose a CSS account API we can mint a durable credential
  // against? (The unauthenticated password-login control is the tell.) Non-CSS
  // issuers return false → no remember offer (Tier 1 only).
  async _isCssRememberable(issuer) {
    try {
      const res = await fetch(`${new URL(issuer).origin}/.account/`, { headers: { accept: 'application/json' } });
      if (!res.ok) return false;
      const j = await res.json().catch(() => null);
      return !!(j && j.controls && j.controls.password && j.controls.password.login);
    } catch { return false; }
  }

  // The dedicated, minimal window that collects the account email+password ONCE
  // for a remote CSS issuer. A separate BrowserWindow (not an app modal) keeps the
  // password out of the app renderer entirely; it posts straight to main.
  openRememberWindow(issuer) {
    if (this._rememberWin && !this._rememberWin.isDestroyed()) { this._rememberWin.focus(); return; }
    this._rememberIssuer = issuer;
    const win = new BrowserWindow({
      width: 460, height: 430, resizable: false, autoHideMenuBar: true, title: 'Remember this sign-in',
      parent: this.baseWindow || undefined, modal: false,
      webPreferences: {
        preload: path.join(__dirname, 'remember-idp-preload.cjs'),
        contextIsolation: true, nodeIntegration: false,
      },
    });
    this._rememberWin = win;
    win.on('closed', () => { if (this._rememberWin === win) { this._rememberWin = null; this._rememberIssuer = null; } });
    win.loadFile(path.join(__dirname, 'remember-idp-window.html'));
  }

  // The transient "Logging in automatically…" window shown while a remembered
  // issuer completes its headless grant (dk:silent-login). Frameless, centred,
  // on top; no input or IPC — main opens it and closes it.
  openAutoLoginWindow(issuer) {
    let host = issuer;
    try { host = new URL(issuer).host; } catch { /* keep raw */ }
    const win = new BrowserWindow({
      width: 360, height: 116, frame: false, resizable: false, alwaysOnTop: true,
      skipTaskbar: true, backgroundColor: '#1d2126', show: false,
      parent: this.baseWindow || undefined,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });
    win._openedAt = Date.now();
    win.once('ready-to-show', () => { try { win.center(); win.show(); } catch { /* window gone */ } });
    win.loadFile(path.join(__dirname, 'auto-login-window.html'), { search: 'host=' + encodeURIComponent(host) });
    return win;
  }

  // Close the auto-login window, but keep it visible a beat (even when the grant
  // returns in well under a second) so it reads as a message, not a flicker.
  closeAutoLoginWindow(win) {
    if (!win || win.isDestroyed()) return;
    const MIN_MS = 700;
    const wait = Math.max(0, MIN_MS - (Date.now() - (win._openedAt || 0)));
    const finish = () => { try { if (!win.isDestroyed()) win.close(); } catch { /* window gone */ } };
    if (wait === 0) finish(); else setTimeout(finish, wait);
  }

  // Load the ESM scanner once (music-metadata is ESM-only; main is CommonJS).
  _musicScanner() {
    return (this._scannerPromise ||= import(
      require('node:url').pathToFileURL(path.join(__dirname, 'import-music.mjs')).href
    ));
  }

  wireContextMenu(wc) {
    wc.on('context-menu', (event, params) => {
      Menu.buildFromTemplate([
        { label: 'Back',    enabled: wc.navigationHistory.canGoBack(),    click: () => wc.navigationHistory.goBack() },
        { label: 'Forward', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() },
        { label: 'Reload',  click: () => wc.reload() },
        { type: 'separator' },
        ...(params.linkURL ? [
          { label: 'Open Link in Browser', click: () => shell.openExternal(params.linkURL) },
          { label: 'Copy Link Address',    click: () => clipboard.writeText(params.linkURL) },
          { type: 'separator' },
        ] : []),
        { label: 'Open dk in Browser', click: () => shell.openExternal(`${APP_URL}?dk-bless=${blessNonce(getGateToken())}`) },
        { type: 'separator' },
        { label: 'Toggle DevTools', click: () => wc.toggleDevTools() },
        { label: 'Inspect Element', click: () => wc.inspectElement(params.x, params.y) },
      ]).popup();
    });
  }
}

new DesktopApp();
