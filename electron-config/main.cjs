// Data-Kitchen "home" (desktop) shell.
//
// One app WebContentsView fills the window and loads the current web app from
// the bundled CSS server. External content the web app would iframe or
// window.open is redirected into native views instead (see external-views.js):
//   - window.open (search, feed, region=tab/window) → native reader overlay
//   - OIDC login popup                              → a real popup window
//   - external <iframe> in #dk-content              → native pane overlay
// The CSS "pivot" server (:3000) and CORS proxy (:3002) start with the app and
// are killed on quit (servers.js).

const {
  app, BaseWindow, WebContentsView, BrowserWindow, ipcMain, session, screen, Menu, clipboard, shell,
} = require('electron');
const path = require('path');

const { APP_URL } = require('./config.cjs');
const { Servers } = require('./servers.cjs');
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
    this.baseWindow.contentView.addChildView(this.appView);
    this.fitAppView();
    this.baseWindow.on('resize', () => this.fitAppView());

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

  fitAppView() {
    const { width, height } = this.baseWindow.getContentBounds();
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
    ipcMain.on('dk:pane-open', (_e, { url }) => this.external.openPane(url));
    ipcMain.on('dk:pane-close', () => this.external.closePane());
    ipcMain.on('dk:overlays-suspend', () => this.external.suspend());
    ipcMain.on('dk:overlays-resume', () => this.external.resume());
    ipcMain.on('dk:reader-back', () => this.external.readerBack());
    ipcMain.on('dk:reader-forward', () => this.external.readerForward());
    ipcMain.on('dk:reader-reload', () => this.external.readerReload());
    ipcMain.on('dk:reader-close', () => this.external.closeReader());
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
        { label: 'Toggle DevTools', click: () => wc.toggleDevTools() },
        { label: 'Inspect Element', click: () => wc.inspectElement(params.x, params.y) },
      ]).popup();
    });
  }
}

new DesktopApp();
