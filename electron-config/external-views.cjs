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
    this.articlePane = null;   // sol-feed inline reader (locked external session)
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
    if (this._paneLoadingShown && !this._suspended) this.paneLoading.setBounds(this._paneRegion());
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
    if (!this.pane) {
      this.pane = this._build(undefined, undefined, TRUSTED_PARTITION);
      // A slow external app (e.g. a Flutter pod that boots over several seconds)
      // otherwise shows a blank rectangle while it fetches. Cover the pane with a
      // "Loading…" overlay for the whole loading phase: shown when the pane
      // starts loading, removed when it stops (success or failure).
      const wc = this.pane.webContents;
      wc.on('did-start-loading', () => this._showPaneLoading());
      // Network "stopped" is NOT "painted": a Flutter app fetches CanvasKit and
      // paints AFTER did-stop-loading, leaving an uncomfortable pause if we hide
      // then. Hold the spinner until the app actually paints (or a safety cap).
      wc.on('did-stop-loading', () => this._waitForPaneContentThenHide());
      wc.on('did-fail-load', (_e, code, _d, _u, isMain) => { if (isMain && code !== -3) this._hidePaneLoading(); });
    }
    this._paneShown = true;
    if (!this._suspended) {
      this.baseWindow.contentView.addChildView(this.pane);  // on top of app view
      this.pane.setBounds(this._paneRegion());
    }
    if (this.pane.webContents.getURL() !== url) this.pane.webContents.loadURL(url);
  }

  closePane() {
    this._hidePaneLoading();
    if (this.pane && this._paneShown) {
      this.baseWindow.contentView.removeChildView(this.pane);
      this._paneShown = false;
    }
    this.paneRect = null;
  }

  // --- article pane (sol-feed inline reader) -------------------------------
  // A feed article shown beside sol-feed's card list. Like the pane it's a
  // native view over a sub-region the renderer reports — but on the LOCKED
  // external session (blocked from every loopback/pod service), because a feed
  // article is incidental external content, not a deliberately-opened pod app.
  // The live page runs its own JS (so e.g. a Cloudflare check clears) — the old
  // script-stripping proxy iframe could not do that. No toolbar: it's an inline
  // pane, not the pop-out reader.

  openArticlePane(url, rect) {
    if (!url) return;
    if (rect) this.articleRect = rect;
    if (!this.articlePane) this.articlePane = this._build(undefined, undefined, EXTERNAL_PARTITION);
    this._articlePaneShown = true;
    if (!this._suspended) {
      this.baseWindow.contentView.addChildView(this.articlePane);   // on top of app view
      this.articlePane.setBounds(this._articleRegion());
    }
    if (this.articlePane.webContents.getURL() !== url) this.articlePane.webContents.loadURL(url);
  }

  setArticleRect(rect) {
    this.articleRect = rect;
    if (this.articlePane && this._articlePaneShown && !this._suspended) this.articlePane.setBounds(rect);
  }

  closeArticlePane() {
    if (this.articlePane && this._articlePaneShown) {
      this.baseWindow.contentView.removeChildView(this.articlePane);
      this._articlePaneShown = false;
    }
    this.articleRect = null;
  }

  _articleRegion() { return this.articleRect || this._region(); }

  // --- pane loading overlay -----------------------------------------------

  _ensurePaneLoading() {
    if (this.paneLoading) return;
    // Isolated session (no pod access needed); loads a local file only.
    this.paneLoading = this._build({}, undefined, EXTERNAL_PARTITION);
    this.paneLoading.setBackgroundColor('#f5f6f8');   // opaque, so it hides the blank pane beneath
    this.paneLoading.webContents.loadFile(path.join(__dirname, 'pane-loading.html'));
  }

  _showPaneLoading() {
    if (this._suspended || !this._paneShown) return;
    this._clearPaneLoadingPoll();   // a fresh load supersedes any pending paint-wait
    this._ensurePaneLoading();
    this._paneLoadingShown = true;
    this.baseWindow.contentView.addChildView(this.paneLoading);   // above the pane
    this.paneLoading.setBounds(this._paneRegion());
    // Name the app being loaded (best-effort; ignore if the page isn't ready yet).
    let host = '';
    try { host = new URL(this.pane.webContents.getURL()).host; } catch (_) {}
    this.paneLoading.webContents.executeJavaScript(
      `window.dkSetHost && window.dkSetHost(${JSON.stringify(host)})`).catch(() => {});
  }

  // After the network stops, poll the pane until its app has actually painted —
  // a Flutter render root (flt-glass-pane / flutter-view) with size, or any
  // sizable/visible content for a normal app — then drop the spinner. A safety
  // cap hides it regardless so a quirky app never strands the overlay.
  _waitForPaneContentThenHide() {
    if (!this._paneLoadingShown) return;
    this._clearPaneLoadingPoll();
    const PAINTED = `(() => {
      const f = document.querySelector('flt-glass-pane, flutter-view, flt-scene-host, flt-semantics-host');
      if (f) { const r = f.getBoundingClientRect(); return r.width > 0 && r.height > 0; }
      const b = document.body; if (!b) return false;
      if ((b.innerText || '').trim().length > 0) return true;
      for (const el of b.children) {
        if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
        const r = el.getBoundingClientRect();
        if (r.width > 40 && r.height > 40) return true;
      }
      return false;
    })()`;
    const started = Date.now();
    const MAX_MS = 10000;
    let inFlight = false;
    this._paneLoadingPoll = setInterval(async () => {
      if (inFlight) return;
      if (Date.now() - started > MAX_MS) { this._hidePaneLoading(); return; }
      inFlight = true;
      let painted = false;
      try { painted = await this.pane.webContents.executeJavaScript(PAINTED); } catch (_) {}
      inFlight = false;
      if (painted) this._hidePaneLoading();
    }, 150);
  }

  _clearPaneLoadingPoll() {
    if (this._paneLoadingPoll) { clearInterval(this._paneLoadingPoll); this._paneLoadingPoll = null; }
  }

  _hidePaneLoading() {
    this._clearPaneLoadingPoll();
    if (!this._paneLoadingShown) return;
    this._paneLoadingShown = false;
    this.baseWindow.contentView.removeChildView(this.paneLoading);
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
    if (this.articlePane && this._articlePaneShown) this.baseWindow.contentView.removeChildView(this.articlePane);
    if (this._paneLoadingShown) this.baseWindow.contentView.removeChildView(this.paneLoading);
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
    if (this._articlePaneShown) {
      this.baseWindow.contentView.addChildView(this.articlePane);
      this.articlePane.setBounds(this._articleRegion());
    }
    if (this._paneLoadingShown) {
      this.baseWindow.contentView.addChildView(this.paneLoading);   // stays above the pane
      this.paneLoading.setBounds(this._paneRegion());
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
