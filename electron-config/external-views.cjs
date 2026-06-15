// Native overlays for external content, layered over the app view inside the
// #dk-content region.
//
//   pane   — shadows an external <iframe> the app mounted in #dk-content
//            (menu links to other sites). Lifetime follows the iframe: opened
//            when the preload reports one, closed when it's gone.
//   reader — shows window.open content (search results, feed articles). A
//            reused overlay made of a toolbar strip (Back/Forward/Reload/Close)
//            plus the content view. Esc or Close dismisses it.
//
// Both sit at the latest #dk-content rect reported by the preload. A real popup
// (OIDC login) is NOT handled here — main lets Electron open a true window.

const path = require('path');
const { WebContentsView, Menu, clipboard, shell, session } = require('electron');
const { PUBLIC_PORT } = require('./config.cjs');

const BAR_HEIGHT = 40;

// External content gets its own session (cookie jar separate from the app's)
// so requests from it can be filtered without touching the app view.
const EXTERNAL_PARTITION = 'persist:external';

// Deliberately-opened apps (panes) get a third session: isolated like external,
// but allowed to reach the local pod's PUBLIC port so they can run the pod's
// normal login. main.cjs blesses this session's pod-origin requests with the
// gate token. Incidental content (the reader) stays on EXTERNAL_PARTITION and
// is fully blocked. See the trusted-guest plan.
const TRUSTED_PARTITION = 'persist:trusted-guest';

// External pages must never reach this machine's local servers — the bundled
// CSS and proxy are no-auth, so a hostile page could read/write through them.
// Cancel any request from the external session to a loopback host. (The OIDC
// login popup is a real window on the default session, so it is unaffected.)
const LOOPBACK_HOST = /^(localhost|.+\.localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1?\]|\[::ffff:127\.[\d.]+\])$/i;
// A loopback host the pod's PUBLIC front is served on (only localhost/127.* —
// not 0.0.0.0 or ::1, which the front doesn't answer on).
const POD_LOOPBACK_HOST = /^(localhost|127\.\d+\.\d+\.\d+)$/i;

let hardened = false;
function hardenedExternalSession() {
  const ses = session.fromPartition(EXTERNAL_PARTITION);
  if (!hardened) {
    hardened = true;
    ses.webRequest.onBeforeRequest((details, callback) => {
      let host = '';
      try { host = new URL(details.url).hostname; } catch (_) {}
      callback({ cancel: LOOPBACK_HOST.test(host) });
    });
  }
  return ses;
}

// Like hardenedExternalSession, but a pane may reach the pod's PUBLIC port
// (localhost/127.* : PUBLIC_PORT). Every other loopback target — the internal
// CSS port, the proxy, anything else — is still cancelled, so the guest can
// talk to the pod front and nothing else on this machine.
let trustedGuestHardened = false;
function hardenedTrustedGuestSession() {
  const ses = session.fromPartition(TRUSTED_PARTITION);
  if (!trustedGuestHardened) {
    trustedGuestHardened = true;
    ses.webRequest.onBeforeRequest((details, callback) => {
      let host = '', port = '';
      try { const u = new URL(details.url); host = u.hostname; port = u.port || '80'; } catch (_) {}
      if (!LOOPBACK_HOST.test(host)) return callback({ cancel: false });   // off-machine: allow
      const podOk = POD_LOOPBACK_HOST.test(host) && Number(port) === PUBLIC_PORT;
      callback({ cancel: !podOk });
    });
  }
  return ses;
}

class ExternalViews {
  constructor(baseWindow) {
    this.baseWindow = baseWindow;
    this.contentRect = null;   // latest tab-content rect (renderer coords == base coords)
    this.paneRect = null;      // latest rect of the iframe the pane shadows
    this.pane = null;
    this.readerBar = null;
    this.readerContent = null;
  }

  setContentRect(rect) {
    this.contentRect = rect;
    if (this._readerShown) this._layoutReader();
  }

  // The pane shadows the page's external <iframe> exactly — the plugin page
  // draws its own chrome (sub-tab strips etc.) around it, which must stay
  // visible. The reader keeps using the whole content region.
  setPaneRect(rect) {
    this.paneRect = rect;
    if (this.pane && this._paneShown && !this._suspended) this.pane.setBounds(rect);
  }

  _paneRegion() { return this.paneRect || this._region(); }

  _region() {
    if (this.contentRect) return this.contentRect;
    // Fallback before the renderer has reported: inset within the window.
    const { width, height } = this.baseWindow.getBounds();
    return { x: 40, y: 120, width: Math.max(320, width - 80), height: Math.max(240, height - 160) };
  }

  _build(webPreferences, onEscape, partition = EXTERNAL_PARTITION) {
    if (partition === TRUSTED_PARTITION) hardenedTrustedGuestSession();
    else hardenedExternalSession();
    const view = new WebContentsView({
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, partition, ...webPreferences },
    });
    this._wireContextMenu(view);
    if (onEscape) {
      view.webContents.on('before-input-event', (e, input) => {
        if (input.type === 'keyDown' && input.key === 'Escape') onEscape();
      });
    }
    return view;
  }

  _wireContextMenu(view) {
    const wc = view.webContents;
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
        { label: 'Inspect Element', click: () => wc.inspectElement(params.x, params.y) },
      ]).popup();
    });
  }

  // --- pane (external iframe) ---------------------------------------------

  openPane(url, rect) {
    if (!url) return;
    if (rect) this.paneRect = rect;
    // A pane is a deliberately-opened app — give it the trusted-guest session so
    // it can reach (and log into) the local pod. The reader stays external.
    if (!this.pane) this.pane = this._build(undefined, undefined, TRUSTED_PARTITION);
    this._paneShown = true;
    if (!this._suspended) {
      this.baseWindow.contentView.addChildView(this.pane);  // on top of app view
      this.pane.setBounds(this._paneRegion());
    }
    if (this.pane.webContents.getURL() !== url) this.pane.webContents.loadURL(url);
  }

  closePane() {
    if (this.pane && this._paneShown) {
      this.baseWindow.contentView.removeChildView(this.pane);
      this._paneShown = false;
    }
    this.paneRect = null;
  }

  // --- reader (window.open content) ---------------------------------------

  _ensureReader() {
    if (this.readerContent) return;
    this.readerContent = this._build({}, () => this.closeReader());
    this.readerBar = this._build({ preload: path.join(__dirname, 'reader-chrome-preload.cjs'), sandbox: false });
    this.readerBar.webContents.loadFile(path.join(__dirname, 'reader-chrome.html'));

    const wc = this.readerContent.webContents;
    const pushState = () => {
      if (this.readerBar) this.readerBar.webContents.send('dk:reader-state', {
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
        url: wc.getURL(),
      });
    };
    wc.on('did-navigate', pushState);
    wc.on('did-navigate-in-page', pushState);
  }

  _layoutReader() {
    const r = this._region();
    this.readerBar.setBounds({ x: r.x, y: r.y, width: r.width, height: BAR_HEIGHT });
    this.readerContent.setBounds({ x: r.x, y: r.y + BAR_HEIGHT, width: r.width, height: Math.max(0, r.height - BAR_HEIGHT) });
  }

  openReader(url) {
    if (!url) return;
    this._ensureReader();
    this._readerShown = true;
    if (!this._suspended) {
      this.baseWindow.contentView.addChildView(this.readerContent);  // above pane + app
      this.baseWindow.contentView.addChildView(this.readerBar);
      this._layoutReader();
    }
    this.readerContent.webContents.loadURL(url);
    this.readerContent.webContents.focus();
  }

  closeReader() {
    if (!this._readerShown) return;
    this.baseWindow.contentView.removeChildView(this.readerBar);
    this.baseWindow.contentView.removeChildView(this.readerContent);
    this._readerShown = false;
  }

  // Native views always paint above the app view's HTML, so they occlude app
  // popups that overlap the content region (e.g. an open menu dropdown). While
  // such a popup is open the host suspends the overlays; resume restores
  // whatever was logically shown.
  suspend() {
    if (this._suspended) return;
    this._suspended = true;
    if (this.pane) this.baseWindow.contentView.removeChildView(this.pane);
    if (this.readerBar) this.baseWindow.contentView.removeChildView(this.readerBar);
    if (this.readerContent) this.baseWindow.contentView.removeChildView(this.readerContent);
  }

  resume() {
    if (!this._suspended) return;
    this._suspended = false;
    if (this._paneShown) {
      this.baseWindow.contentView.addChildView(this.pane);
      this.pane.setBounds(this._paneRegion());
    }
    if (this._readerShown) {
      this.baseWindow.contentView.addChildView(this.readerContent);
      this.baseWindow.contentView.addChildView(this.readerBar);
      this._layoutReader();
    }
  }

  readerBack()    { if (this.readerContent) this.readerContent.webContents.navigationHistory.goBack(); }
  readerForward() { if (this.readerContent) this.readerContent.webContents.navigationHistory.goForward(); }
  readerReload()  { if (this.readerContent) this.readerContent.webContents.reload(); }
}

module.exports = { ExternalViews };
