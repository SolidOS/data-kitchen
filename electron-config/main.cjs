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
  app, BaseWindow, WebContentsView, BrowserWindow, ipcMain, session, screen, Menu, clipboard, shell,
} = require('electron');
const path = require('path');

const { APP_URL, PUBLIC_PORT, PROXY_PORT } = require('./config.cjs');
const { Servers, getGateToken } = require('./servers.cjs');
const { ExternalViews } = require('./external-views.cjs');

// Dev: serve always-fresh files from the local working trees — both edited
// modules AND data TTLs the app re-fetches after a write (e.g. a settings
// save). Without this, Electron's HTTP cache returns the pre-write copy, so
// <sol-default> re-resolves stale and theme/font changes never take effect.
app.commandLine.appendSwitch('disable-http-cache');

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

// Opt-in auto-reload (DK_RELOAD=1). Off by default: it recursively watches the
// app tree, and node_modules blows the OS file-watcher limit (ENOSPC).
if (process.env.DK_RELOAD) {
  try {
    require('electron-reloader')(module, { ignore: ['node_modules', 'pivot-config', 'proxy'] });
  } catch (_) { /* dev-only */ }
}

class DesktopApp {
  constructor() {
    this.baseWindow = null;
    this.appView = null;
    this.external = null;
    this.servers = new Servers({ log: (m) => console.log(m) });
    app.whenReady().then(() => this.start());
    app.on('window-all-closed', () => { this.servers.stop(); if (process.platform !== 'darwin') app.quit(); });
    app.on('before-quit', () => this.servers.stop());
    app.on('web-contents-created', (_e, wc) => this.installOpenHandler(wc));
  }

  async start() {
    Menu.setApplicationMenu(null);
    this.installGateHeader();
    try {
      await this.servers.start();
    } catch (e) {
      console.error('server startup problem (continuing — a server may already be running):', e.message);
    }
    // Dev: the app is served from local working trees that change between
    // launches; clear the HTTP cache so edited modules are always picked up.
    try { await session.defaultSession.clearCache(); } catch (_) {}
    this.createWindow();
  }

  createWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    this.baseWindow = new BaseWindow({ width, height, x: 0, y: 0, title: 'Solid Data Kitchen' });

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
    setInterval(() => this.fitAppView(), 500);

    this.external = new ExternalViews(this.baseWindow);
    this.wireIpc();
    this.wireContextMenu(this.appView.webContents);

    const wc = this.appView.webContents;
    wc.on('did-finish-load', () => console.log(`[app] loaded ${wc.getURL()}`));
    wc.on('did-fail-load', (_e, code, desc, url) => console.log(`[app] load failed (${code} ${desc}) ${url}`));

    // A plain link to another site would otherwise navigate the whole app view
    // away (header and all, no way back). Keep the app put; show the external
    // page in the reader overlay instead. (window.open is handled separately
    // by setWindowOpenHandler; same-origin navigation stays in the app.)
    wc.on('will-navigate', (e, url) => {
      if (isExternalUrl(url)) { e.preventDefault(); this.external.openReader(url); }
    });

    wc.loadURL(APP_URL);
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
    session.defaultSession.webRequest.onBeforeSendHeaders({ urls }, (details, callback) => {
      details.requestHeaders['x-dk-token'] = token;
      callback({ requestHeaders: details.requestHeaders });
    });
  }

  // Keep the app view exactly the window's content size; cheap no-op when
  // already in sync (called from events AND the watchdog interval).
  fitAppView() {
    const { width, height } = this.baseWindow.getContentBounds();
    const b = this.appView.getBounds();
    if (b.width === width && b.height === height && b.x === 0 && b.y === 0) return;
    this.appView.setBounds({ x: 0, y: 0, width, height });
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
            webPreferences: { contextIsolation: true, nodeIntegration: false },
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
        { label: 'Open dk in Browser', click: () => shell.openExternal(`${APP_URL}?dk-token=${getGateToken()}`) },
        { type: 'separator' },
        { label: 'Toggle DevTools', click: () => wc.toggleDevTools() },
        { label: 'Inspect Element', click: () => wc.inspectElement(params.x, params.y) },
      ]).popup();
    });
  }
}

new DesktopApp();
