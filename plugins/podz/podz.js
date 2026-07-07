import { initializeElements } from './podz-utils.js';

// Custom elements (sol-pod, sol-pod-ops, sol-modal, sol-tabs, sol-live-edit,
// sol-wac) and all live-edit renderers/help/examples come from sol-components,
// registered by the host's component-interop loader. SolModal is also imported
// directly below for its programmatic SolModal.choice() dialog.
import { SolModal } from 'sol-components/sol-modal.js';
import { AuthManager } from './podz-auth.js';
import { StateManager } from './podz-state.js';
import { UIManager } from './podz-ui.js';
import { PodManager } from './podz-pod.js';

export class SolidFileBrowser {
  constructor() {
    console.info(
      '%c Multi-Pod %c "Fetch failed loading: PUT ..." messages on ACL saves are a ' +
      'known Chrome bug with HTTP 205 responses and can safely be ignored \u2014 the save succeeded.',
      'background:#2196f3;color:white;padding:2px 6px;border-radius:3px;font-weight:bold',
      'color:#666'
    );

    this.elements = initializeElements();
    // Each <sol-pod> renders its own popup-mode <sol-login> in its header
    // (configured via the side / login-mode attributes in index.html; the
    // popup callback page defaults to sol-login's own packaged copy). Grab
    // those built-in login elements — they share one
    // module-level AuthManager, with sessions keyed by side.
    this.leftLogin  = this.elements.leftPod.login;
    this.rightLogin = this.elements.rightPod.login;
    this.authManager = this.leftLogin.auth;   // shared singleton (=== rightLogin.auth)
    this.uiManager = new UIManager(this.elements);
    this.stateManager = new StateManager((err, op) => {
      console.error(`[podz-state] localStorage ${op} failed:`, err);
      this._panelError(
        'Settings can’t be saved — browser storage is full or disabled. ' +
        'Layout, pod list, and preferences will not persist this session.',
        [this.elements.leftPod, this.elements.rightPod]);
    });
    this.podManager = new PodManager(this.authManager);

    this.currentPaths = { left: '', right: '' };
    this.draggedItems = [];
    this.draggedSourceSide = null;
    this.pendingCopy = null;
    this.restoringState = false;
    this._undoLedger = [];

    // Each sol-pod carries its own side tag (the `side` attribute in
    // index.html), so its authenticated fetches resolve to that side's
    // session — left pod / left login, right pod / right login.

    // Apply preferences (theme + font size). Hide-path filtering is owned by
    // each <sol-pod> via its data-subject settings doc (ui:ignorePattern) —
    // podz no longer pushes hide flags down.
    this.prefs = this._loadPrefs();
    this._applyPrefs(this.prefs);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (this.prefs.theme === 'system') this._applyPrefs(this.prefs);
    });

    // Preferences modal — the dk-hosted chrome owns prefs UI now, but
    // when podz is loaded standalone (no enclosing shell) the local
    // #prefs-modal is still here; bind it if present so nothing breaks.
    const prefsModal = document.getElementById('prefs-modal');
    if (prefsModal) {
      prefsModal.addEventListener('sol-ready', (e) => {
        this.uiManager._wirePrefs(e.detail.body, this.prefs, (newPrefs) => {
          this.prefs = newPrefs;
          this._savePrefs(newPrefs);
          this._applyPrefs(newPrefs);
        });
      });
    }

    // Wire each side's login events independently — a login/logout on one
    // side only reloads that side's panel.
    this._wireLoginEvents('left',  this.leftLogin);
    this._wireLoginEvents('right', this.rightLogin);

    // Wire collapse buttons
    document.getElementById('collapse-left-btn').addEventListener('click', (e) => {
      e.currentTarget.blur(); this._collapsePanel('left');
    });
    document.getElementById('collapse-right-btn').addEventListener('click', (e) => {
      e.currentTarget.blur(); this._collapsePanel('right');
    });

    // Wire splitter — drag to resize, double-click to reset, arrows to nudge.
    this._wireSplitter();

    // Single-panel (default) vs dual-browser mode. Single shows one
    // browser at a fixed width and opens pod-ops in the inline right
    // panel; dual is the classic two-browser view with the ops modal.
    // Guards allow legacy markup without the mode elements (stays dual).
    const modeBtn = document.getElementById('mode-toggle-btn');
    if (modeBtn && document.getElementById('ops-panel')) {
      const layout = this.stateManager.loadLayout() || {};
      this._singleWidth = Number.isFinite(layout.singleLeftWidth) ? layout.singleLeftWidth : 420;
      modeBtn.addEventListener('click', (e) => {
        e.currentTarget.blur();
        this._setMode(this._mode === 'single' ? 'dual' : 'single');
      });
      document.getElementById('ops-close-btn').addEventListener('click', () => this._closeOpsPanel());
      document.getElementById('ops-panel').addEventListener('keydown', (e) => {
        // Yield to editors that claim Escape (e.g. vim keys in Live Edit).
        if (e.key === 'Escape' && !e.defaultPrevented) { e.stopPropagation(); this._closeOpsPanel(); }
      });
      this._setMode(layout.mode === 'dual' ? 'dual' : 'single', { persist: false });
    } else {
      this._mode = 'dual';
    }

    // Ctrl/Cmd+Z triggers the last drag-drop undo unless an input has focus.
    window.addEventListener('keydown', (e) => {
      if (!(e.key === 'z' || e.key === 'Z') || e.shiftKey || e.altKey) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const a = document.activeElement;
      const tag = (a?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || a?.isContentEditable) return;
      if (a?.shadowRoot) return; // let shadow-DOM components handle their own undo
      if (this._undoLedger.length === 0) return;
      e.preventDefault();
      this._doUndo();
    });

    // Wire sol-pod events
    this._wirePodEvents('left', this.elements.leftPod);
    this._wirePodEvents('right', this.elements.rightPod);

    // The pods own the shared pod registry; persist it whenever it grows.
    // The event bubbles from either pod (and may fire once per pod) —
    // one document-level listener and an idempotent save cover it.
    document.addEventListener('sol-pod-pods-changed', (e) => {
      this.stateManager.saveSessionPods(e.detail.pods || []);
    });

    // Wire cross-panel drag-and-drop
    this._wireDropZone('left', document.getElementById('left-panel'));
    this._wireDropZone('right', document.getElementById('right-panel'));

    this.initialize();
  }

  _wirePodEvents(side, pod) {
    pod.addEventListener('sol-navigate', (e) => {
      this.currentPaths[side] = e.detail.url;
      // NB: do not call authManager.setSideOrigin() here — in popup mode
      // it would replace this side's PopupProxySession with a fresh empty
      // Inrupt Session. The popup owns the session for this side.
      this.saveState();
    });

    pod.addEventListener('sol-drag-start', (e) => {
      const items = e.detail.items || [e.detail.item];
      this.draggedItems = items.map(it => ({
        url: it.url,
        name: it.name,
        isContainer: it.isContainer,
      }));
      this.draggedSourceSide = side;
    });

    // Clear dragged state if a drag ends without dropping into either panel
    // (drop on file list, browser chrome, etc.). Without this, stale items
    // would linger until the next drag starts.
    pod.addEventListener('sol-drag-end', () => this._clearDragState());
    window.addEventListener('dragend', () => this._clearDragState());

    pod.addEventListener('sol-status', (e) => {
      // Operation feedback from the pod: errors go in its panel (like the no-auth
      // notice), transient progress/success in the auto-dismissing popup.
      if ((e.detail.type || '') === 'error') this._panelError(e.detail.message, [pod]);
      else this.uiManager.setStatus(e.detail.message, e.detail.type || '');
    });

    // sol-pod already shows "Authentication required \u2014 please log in." in its own
    // panel on sol-auth-needed, so no separate status notice is needed here.
  }

  // Put a panel-level error in the affected pod panel(s) \u2014 the same surface as the
  // no-auth notice \u2014 rather than a status line. Transient/operational feedback (and
  // messages with action buttons, e.g. Undo) still use the popup via setStatus.
  _panelError(message, pods) {
    for (const p of pods) { try { p?.showMessage?.(message, true); } catch (_) { /* pod not ready */ } }
  }

  _wireLoginEvents(side, loginEl) {
    // The pod re-discovers pods and reloads its container on login —
    // sol-pod owns both. podz only needs to surface a blocked popup.
    loginEl.addEventListener('sol-popup-blocked', () => {
      this._panelError(
        `Popup blocked \u2014 allow popups for this site, then click Log in for the ${side} panel again.`,
        [this.elements[side === 'left' ? 'leftPod' : 'rightPod']]);
    });
  }

  _clearDragState() {
    this.draggedItems = [];
    this.draggedSourceSide = null;
  }

  _wireDropZone(side, panelEl) {
    panelEl.addEventListener('dragover', (e) => {
      if (this.draggedItems.length && this.draggedSourceSide !== side) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        panelEl.classList.add('drag-over');
      }
    });
    panelEl.addEventListener('dragleave', (e) => {
      if (e.target === panelEl || !panelEl.contains(e.relatedTarget)) {
        panelEl.classList.remove('drag-over');
      }
    });
    panelEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      panelEl.classList.remove('drag-over');
      await this.handleDrop(side);
    });
  }

  _wireSplitter() {
    const container = document.querySelector('.container');
    const splitter = document.getElementById('panel-splitter');
    const left = document.getElementById('left-panel');
    const right = document.getElementById('right-panel');
    if (!container || !splitter || !left || !right) return;

    // Apply persisted ratio (clamped to a sensible range).
    const layout = this.stateManager.loadLayout() || {};
    const initial = typeof layout.splitRatio === 'number' ? layout.splitRatio : 0.5;
    this._applySplitRatio(this._clampRatio(initial));

    // Usable width between the container's padding edges, minus the
    // splitter itself — the space the two panels share.
    const usableWidth = () => {
      const rect = container.getBoundingClientRect();
      const padLeft = parseFloat(getComputedStyle(container).paddingLeft) || 0;
      const padRight = parseFloat(getComputedStyle(container).paddingRight) || 0;
      return rect.width - padLeft - padRight - splitter.offsetWidth;
    };

    const setFromClientX = (clientX) => {
      const rect = container.getBoundingClientRect();
      const padLeft = parseFloat(getComputedStyle(container).paddingLeft) || 0;
      const usable = usableWidth();
      if (usable <= 0) return;
      const leftWidth = clientX - rect.left - padLeft;
      if (this._mode === 'single') {
        this._applySingleWidth(this._clampSingleWidth(leftWidth, usable));
      } else {
        this._applySplitRatio(this._clampRatio(leftWidth / usable));
      }
    };

    let pointerId = null;
    splitter.addEventListener('pointerdown', (e) => {
      if (this._splitterInert()) return;
      if (left.classList.contains('panel-collapsed') || right.classList.contains('panel-collapsed')) return;
      pointerId = e.pointerId;
      splitter.setPointerCapture(pointerId);
      splitter.classList.add('dragging');
      document.body.classList.add('splitter-dragging');
      e.preventDefault();
    });
    splitter.addEventListener('pointermove', (e) => {
      if (pointerId === null || e.pointerId !== pointerId) return;
      setFromClientX(e.clientX);
    });
    const endDrag = (e) => {
      if (pointerId === null || (e && e.pointerId !== pointerId)) return;
      try { splitter.releasePointerCapture(pointerId); } catch {}
      pointerId = null;
      splitter.classList.remove('dragging');
      document.body.classList.remove('splitter-dragging');
      if (this._mode === 'single') this._persistSingleWidth();
      else this._persistSplitRatio();
    };
    splitter.addEventListener('pointerup', endDrag);
    splitter.addEventListener('pointercancel', endDrag);

    splitter.addEventListener('dblclick', () => {
      if (this._splitterInert()) return;
      if (this._mode === 'single') {
        this._applySingleWidth(420);
        this._persistSingleWidth();
      } else {
        this._applySplitRatio(0.5);
        this._persistSplitRatio();
      }
    });

    splitter.addEventListener('keydown', (e) => {
      if (this._splitterInert()) return;
      if (this._mode === 'single') {
        const step = e.shiftKey ? 48 : 16;
        const usable = usableWidth();
        if (e.key === 'ArrowLeft') {
          this._applySingleWidth(this._clampSingleWidth(this._singleWidth - step, usable));
          this._persistSingleWidth();
          e.preventDefault();
        } else if (e.key === 'ArrowRight') {
          this._applySingleWidth(this._clampSingleWidth(this._singleWidth + step, usable));
          this._persistSingleWidth();
          e.preventDefault();
        } else if (e.key === 'Home') {
          this._applySingleWidth(420);
          this._persistSingleWidth();
          e.preventDefault();
        }
        return;
      }
      const cur = this._splitRatio ?? 0.5;
      const step = e.shiftKey ? 0.05 : 0.02;
      if (e.key === 'ArrowLeft') {
        this._applySplitRatio(this._clampRatio(cur - step));
        this._persistSplitRatio();
        e.preventDefault();
      } else if (e.key === 'ArrowRight') {
        this._applySplitRatio(this._clampRatio(cur + step));
        this._persistSplitRatio();
        e.preventDefault();
      } else if (e.key === 'Home') {
        this._applySplitRatio(0.5);
        this._persistSplitRatio();
        e.preventDefault();
      }
    });
  }

  // The splitter has nothing to resize against while single mode's ops
  // panel is empty (CSS also hides its handle / blocks pointer events —
  // this covers the keyboard paths).
  _splitterInert() {
    if (this._mode !== 'single') return false;
    const ops = document.getElementById('ops-panel');
    return !ops || ops.classList.contains('ops-empty');
  }

  _clampRatio(r) {
    if (!Number.isFinite(r)) return 0.5;
    return Math.min(0.85, Math.max(0.15, r));
  }

  _applySplitRatio(r) {
    this._splitRatio = r;
    const container = document.querySelector('.container');
    const left = document.getElementById('left-panel');
    const right = document.getElementById('right-panel');
    if (!container || !left || !right) return;
    // Use grow factors so flex still divvies up remaining space when
    // either panel is collapsed (collapsed panels override with their
    // own fixed flex-basis in CSS).
    left.style.flex = `${r} 1 0`;
    right.style.flex = `${1 - r} 1 0`;
    container.style.setProperty('--split-ratio', String(r));
  }

  _persistSplitRatio() {
    const existing = this.stateManager.loadLayout() || {};
    this.stateManager.saveLayout({ ...existing, splitRatio: this._splitRatio });
  }

  // ── Single-panel mode + inline ops panel ──────────────────────────

  _setMode(mode, { persist = true } = {}) {
    this._mode = mode;
    const container = document.querySelector('.container');
    const modeBtn = document.getElementById('mode-toggle-btn');
    if (!container || !modeBtn) return;
    container.classList.toggle('mode-single', mode === 'single');
    container.classList.toggle('mode-dual', mode === 'dual');

    if (mode === 'single') {
      // Collapse is meaningless with one browser panel — expand anything
      // collapsed (reuses _collapsePanel's own restore + persistence path,
      // which also clears the inline flex that would fight the fixed width).
      for (const side of ['left', 'right']) {
        const panel = document.getElementById(`${side}-panel`);
        if (panel?.classList.contains('panel-collapsed')) this._collapsePanel(side);
      }
      this.elements.leftPod.podClickAction = (item, pod) => this._openOpsPanel(item, pod);
      this._applySingleWidth(this._singleWidth ?? 420);
    } else {
      // Back to the classic view: gear/double-click opens the modal again.
      this.elements.leftPod.podClickAction = null;
      this._closeOpsPanel({ restoreFocus: false });
      this._applySplitRatio(this._splitRatio ?? 0.5);
    }

    modeBtn.setAttribute('aria-pressed', String(mode === 'dual'));
    modeBtn.title = mode === 'dual' ? 'Single-panel view' : 'Show two pod panels';
    if (persist) {
      const existing = this.stateManager.loadLayout() || {};
      this.stateManager.saveLayout({ ...existing, mode });
    }
  }

  _openOpsPanel(item, pod) {
    const panel = document.getElementById('ops-panel');
    const body = document.getElementById('ops-panel-body');
    if (!panel || !body) return;

    this._opsReturn = { pod, url: item.url };   // focus-restore target

    // Fresh instance per item — re-targeting a live sol-pod-ops double-loads
    // (the `item` setter and the `source` attribute each trigger a load).
    body.querySelector('sol-pod-ops')?.remove();
    const ops = document.createElement('sol-pod-ops');
    ops.item = item;                            // pre-connect: stores, no load
    const login = pod.login;
    if (login?.fetchFor) ops.fetchFn = login.fetchFor(item.url, pod.side);
    ops.editorKeys = pod.editorKeys;
    ops.setAttribute('source', item.url);

    ops.addEventListener('sol-status', (e) => {
      // ALL ops feedback — errors included — goes to the popup toast (error
      // toasts persist until dismissed). _panelError would paint the message
      // over the pod's folder listing, which ops errors have nothing to do with.
      this.uiManager.setStatus(e.detail.message, e.detail.type || '');
    });
    // sol-pod has no public persist API for editor keys (the modal path
    // calls this same method internally) — optional-chained on purpose.
    ops.addEventListener('sol-editor-keys-change', (e) => pod._persistEditorKeys?.(e.detail.keys));
    ops.addEventListener('sol-navigate', async () => {
      // Rename/delete/create finished — the item may no longer exist.
      this._closeOpsPanel({ restoreFocus: false });
      if (pod.currentPath) await pod.loadContainer(pod.currentPath);
    });

    document.getElementById('ops-panel-title').textContent = item.isContainer
      ? `Folder: ${item.displayName || item.name}`
      : (item.displayName || item.name);
    body.appendChild(ops);                      // connectedCallback → one load
    panel.classList.remove('ops-empty');
    this._applySingleWidth(this._singleWidth ?? 420);
    panel.focus();                              // focus in — no trap, it's a panel
  }

  _closeOpsPanel({ restoreFocus = true } = {}) {
    const panel = document.getElementById('ops-panel');
    if (!panel || panel.classList.contains('ops-empty')) return;
    document.getElementById('ops-panel-body').querySelector('sol-pod-ops')?.remove();
    panel.classList.add('ops-empty');
    if (restoreFocus && this._opsReturn) {
      const { pod, url } = this._opsReturn;
      const li = pod.shadowRoot?.querySelector(`li[data-url="${CSS.escape(url)}"]`);
      if (li) li.focus();
      else pod.shadowRoot?.querySelector('.tree-wrapper')?.focus?.();
    }
    this._opsReturn = null;
  }

  _applySingleWidth(px) {
    this._singleWidth = px;
    const left = document.getElementById('left-panel');
    const ops = document.getElementById('ops-panel');
    if (!left || !ops) return;
    left.style.flex = `0 0 ${px}px`;
    ops.style.flex = '1 1 0';
  }

  _clampSingleWidth(px, usable) {
    const min = 300;
    // Keep the ops side usable — it is meant to be the wider panel.
    const max = Math.max(min, usable - 360);
    return Math.min(max, Math.max(min, Number.isFinite(px) ? px : 420));
  }

  _persistSingleWidth() {
    const existing = this.stateManager.loadLayout() || {};
    this.stateManager.saveLayout({ ...existing, singleLeftWidth: this._singleWidth });
  }

  _collapsePanel(side) {
    const thisPanel   = document.getElementById(side === 'left' ? 'left-panel'  : 'right-panel');
    const otherPanel  = document.getElementById(side === 'left' ? 'right-panel' : 'left-panel');
    const collapseBtn = document.getElementById(side === 'left' ? 'collapse-left-btn' : 'collapse-right-btn');
    const isCollapsed = thisPanel.classList.contains('panel-collapsed');

    if (isCollapsed) {
      thisPanel.classList.remove('panel-collapsed');
      otherPanel.classList.remove('panel-expanded');
      collapseBtn.textContent = side === 'left' ? '\u00ab' : '\u00bb';
      collapseBtn.title = 'Collapse panel';
      // Restore the persisted split ratio on both panels.
      this._applySplitRatio(this._splitRatio ?? 0.5);
    } else {
      thisPanel.classList.add('panel-collapsed');
      otherPanel.classList.add('panel-expanded');
      collapseBtn.textContent = side === 'left' ? '\u00bb' : '\u00ab';
      collapseBtn.title = 'Expand panel';
      // Inline flex from _applySplitRatio would beat the .panel-collapsed
      // rule \u2014 clear it on both panels while collapsed.
      thisPanel.style.flex = '';
      otherPanel.style.flex = '';
    }

    const existing = this.stateManager.loadLayout() || {};
    this.stateManager.saveLayout({
      ...existing,
      leftCollapsed:  document.getElementById('left-panel').classList.contains('panel-collapsed'),
      rightCollapsed: document.getElementById('right-panel').classList.contains('panel-collapsed'),
    });
  }

  _loadPrefs() {
    const stored = this.stateManager.loadPrefs();
    return stored || {
      theme: 'system', fontSize: 'medium',
    };
  }

  _savePrefs(prefs) {
    this.stateManager.savePrefs(prefs);
  }

  _applyPrefs(prefs) {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && prefersDark);
    document.body.classList.toggle('dark', dark);

    const fontVar = { small: 'var(--font-sm)', medium: 'var(--font-md)', large: 'var(--font-lg)' }[prefs.fontSize] || 'var(--font-md)';
    document.documentElement.style.setProperty('--font-app', fontVar);
  }

  async initialize() {
    try {
      const layout = this.stateManager.loadLayout();
      // Collapse is a dual-mode concept; single mode keeps its fixed width.
      if (this._mode === 'dual') {
        if (layout?.leftCollapsed)  this._collapsePanel('left');
        if (layout?.rightCollapsed) this._collapsePanel('right');
      }

      await this.handleRedirect();
    } catch (error) {
      console.error('Initialization error:', error);
      this._panelError(`Initialization failed: ${error.message}`,
        [this.elements.leftPod, this.elements.rightPod]);
    }
  }

  saveState() {
    if (this.restoringState) return;
    const leftPod = this.elements.leftPod;
    const rightPod = this.elements.rightPod;
    const leftPodUrl = leftPod.rootUrl || leftPod.source;
    const rightPodUrl = rightPod.rootUrl || rightPod.source;
    const state = this.stateManager.createState(
      leftPodUrl,
      rightPodUrl,
      this.currentPaths.left,
      this.currentPaths.right,
      this.pendingCopy
    );
    this.stateManager.save(state);
    this.stateManager.savePodSelection({
      leftPodUrl, rightPodUrl,
      leftPath:  this.currentPaths.left,
      rightPath: this.currentPaths.right,
    });
  }

  async restoreState(state) {
    this.restoringState = true;
    const leftPod = this.elements.leftPod;
    const rightPod = this.elements.rightPod;

    if (state.leftPodUrl) {
      leftPod.source = state.leftPodUrl;
      await leftPod.initialize();
      if (state.leftPath && state.leftPath !== state.leftPodUrl) {
        await leftPod.loadContainer(state.leftPath);
      }
    }
    if (state.rightPodUrl) {
      rightPod.source = state.rightPodUrl;
      await rightPod.initialize();
      if (state.rightPath && state.rightPath !== state.rightPodUrl) {
        await rightPod.loadContainer(state.rightPath);
      }
    }

    this.restoringState = false;

    if (state.pendingCopy) {
      const { sourceUrl, targetUrl, fileName, targetSide, isContainer } = state.pendingCopy;
      const sourceSide = targetSide === 'left' ? 'right' : 'left';
      this.uiManager.setStatus('Resuming copy...', '');

      let result;
      if (isContainer) {
        result = await this.podManager.copyFolder(sourceUrl, targetUrl, fileName,
          msg => this.uiManager.setStatus(msg, ''), sourceSide, targetSide);
      } else {
        result = await this.podManager.copyFile(sourceUrl, targetUrl, fileName, sourceSide, targetSide);
      }

      if (result.success) {
        this.uiManager.setStatus(`Copied ${fileName} successfully!`, 'success');
        const targetPod = targetSide === 'left' ? leftPod : rightPod;
        await targetPod.loadContainer(targetUrl);
      } else {
        this._panelError('Copy failed. Check console for details.',
          [targetSide === 'left' ? leftPod : rightPod]);
      }

      this.pendingCopy = null;
      this.saveState();
    }
  }

  async handleRedirect() {
    // Popup-mode sol-login: initialize() just syncs UI / rdflib (no
    // top-level OAuth redirect — each side's popup handles its own).
    await this.leftLogin.initialize();
    await this.rightLogin.initialize();

    // Seed the pods' shared registry with the persisted pod list before
    // they initialize — discovery then adds to it. Both pods are in
    // sol-pod's default group, so seeding one feeds both.
    this.elements.leftPod.seedPods(this.stateManager.loadSessionPods());

    const oauthState = this.stateManager.load();
    const restoreFrom = oauthState || this.stateManager.loadPodSelection();
    if (oauthState) this.stateManager.clear();

    if (restoreFrom) {
      // Returning user — use saved selection on both sides.
      await this.restoreState(restoreFrom);
    } else {
      // Fresh-session staged init:
      //   1. Init left — it discovers pods for the current session and
      //      adds them to the shared registry (which both pods' selectors
      //      draw from). Usually lands on localhost in local dev, or the
      //      user's home pod when served from a Solid origin.
      //   2. Init right — if the left landed on a no-auth URL, point
      //      right at the first remote pod now known to the registry
      //      (or a configured OIDC issuer as a fallback).
      await this.elements.leftPod.initialize();
      await this._initializeRightPodWithFreshDefault();
    }
  }

  async _initializeRightPodWithFreshDefault() {
    const target = this._chooseFreshRightTarget();
    const rightPod = this.elements.rightPod;
    if (target) {
      rightPod.source = target;          // _setSource → registry + loadContainer
      this.saveState();
    } else {
      await rightPod.initialize();
    }
  }

  /**
   * Pick a starting URL for the right panel on a fresh session.
   *
   * Returns null (= use right pod's own default initialization) unless
   * the left panel landed on a localhost URL. When it did, picks:
   *
   *   1. The first pod in the shared registry (leftPod.storages) whose
   *      host isn't localhost — typically something discovery turned up.
   *   2. Failing that, the first <sol-login issuers="..."> entry
   *      whose host isn't localhost. These are the providers the user
   *      is offered as login options; their origins make sensible
   *      "show me this provider's root" defaults.
   *
   * Note: we intentionally use a direct URL check here rather than
   * `authManager.isNoAuth(url)`. AuthManager.isNoAuth requires a
   * noAuthConfig that podz never sets, so it currently always returns
   * false — useless for "is this a local pod?" detection.
   */
  _chooseFreshRightTarget() {
    const leftUrl = this.elements.leftPod.rootUrl;
    if (!leftUrl || !this._isLocalUrl(leftUrl)) return null;

    let target = this.elements.leftPod.storages.find(u => !this._isLocalUrl(u));
    if (!target) {
      const issuers = this.rightLogin?.issuers || this.leftLogin?.issuers || [];
      for (const origin of issuers) {
        const url = origin.endsWith('/') ? origin : origin + '/';
        if (!this._isLocalUrl(url)) { target = url; break; }
      }
    }
    return target || null;
  }

  _isLocalUrl(url) {
    try {
      const h = new URL(url).hostname;
      return h === 'localhost'
          || h === '127.0.0.1'
          || h === '0.0.0.0'
          || h.endsWith('.localhost');
    } catch { return false; }
  }

  async handleDrop(targetSide) {
    if (!this.draggedItems.length || this.draggedSourceSide === targetSide) return;
    const sourceSide = this.draggedSourceSide;
    const targetUrl = this.currentPaths[targetSide];
    if (!targetUrl) return;

    const items = this.draggedItems.slice();
    const sourceContainer = this.currentPaths[sourceSide];

    // No pre-flight auth check: anon PUT may succeed against a publicly-
    // writable target, and when it doesn't, the underlying solFetch fires
    // `sol-auth-needed` so the per-pod <sol-login> chip can prompt with
    // popup-mode auth (not the redirect-mode flow the old eager check
    // used, which navigated the whole tab away from podz/dk).

    const mode = await this._promptMoveOrCopy(items);
    if (!mode) return;

    const verb = mode === 'move' ? 'Moving' : 'Copying';
    const succeeded = [];
    const partial = []; // copied but delete-source failed (move only)
    const failed = [];

    for (const it of items) {
      this.uiManager.setStatus(`${verb} ${it.name}...`, '');
      const copyResult = it.isContainer
        ? await this.podManager.copyFolder(it.url, targetUrl, it.name,
            msg => this.uiManager.setStatus(msg, ''), sourceSide, targetSide)
        : await this.podManager.copyFile(it.url, targetUrl, it.name, sourceSide, targetSide);
      if (!copyResult?.success) { failed.push(it); continue; }
      if (mode === 'move') {
        const delResult = await this.podManager.deleteResource(it.url, it.isContainer, sourceSide);
        if (!delResult.success) { partial.push(it); continue; }
      }
      succeeded.push(it);
    }

    this._reportDropResult({ mode, items, succeeded, partial, failed, sourceSide, targetSide, targetUrl, sourceContainer });

    const targetPod = targetSide === 'left' ? this.elements.leftPod : this.elements.rightPod;
    await targetPod.loadContainer(targetUrl);
    if (mode === 'move' && this.currentPaths[sourceSide]) {
      const sourcePod = sourceSide === 'left' ? this.elements.leftPod : this.elements.rightPod;
      await sourcePod.loadContainer(this.currentPaths[sourceSide]);
    }
    this.pendingCopy = null;
    this.saveState();
  }

  /**
   * Build and show the post-drop status toast. Lists failing names so
   * the user can act on them; offers Undo when at least one item moved
   * or copied successfully.
   */
  _reportDropResult({ mode, items, succeeded, partial, failed, sourceSide, targetSide, targetUrl, sourceContainer }) {
    const verbDone = mode === 'move' ? 'Moved' : 'Copied';
    const total = items.length;
    const ok = succeeded.length;

    const problems = [];
    if (failed.length)  problems.push(`failed: ${failed.map(it => it.name).join(', ')}`);
    if (partial.length) problems.push(`copied but kept original (delete failed): ${partial.map(it => it.name).join(', ')}`);

    let message;
    let type;
    if (ok === total) {
      message = total === 1 ? `${verbDone} ${items[0].name}.` : `${verbDone} ${ok} item(s).`;
      type = 'success';
    } else if (ok > 0) {
      message = `${verbDone} ${ok}/${total}. ${problems.join(' — ')}`;
      type = 'error';
    } else {
      message = `${verbDone === 'Moved' ? 'Move' : 'Copy'} failed. ${problems.join(' — ')}`;
      type = 'error';
    }

    const actions = [];
    if (succeeded.length > 0 && sourceContainer) {
      const record = this._makeUndoRecord({ mode, items: succeeded, sourceContainer, targetUrl, sourceSide, targetSide });
      this._pushUndo(record);
      actions.push({ label: 'Undo', onClick: () => this._doUndo(record) });
    }
    this.uiManager.setStatus(message, type, actions);
  }

  _makeUndoRecord({ mode, items, sourceContainer, targetUrl, sourceSide, targetSide }) {
    return {
      description: `${mode === 'move' ? 'Move' : 'Copy'} ${items.length} item(s)`,
      undo: async () => {
        // Inverse of copy = delete the copies at target.
        // Inverse of move = copy them back to source, then delete from target.
        for (const it of items) {
          const targetItemUrl = targetUrl + encodeURIComponent(it.name) + (it.isContainer ? '/' : '');
          if (mode === 'move') {
            const r = it.isContainer
              ? await this.podManager.copyFolder(targetItemUrl, sourceContainer, it.name,
                  msg => this.uiManager.setStatus(msg, ''), targetSide, sourceSide)
              : await this.podManager.copyFile(targetItemUrl, sourceContainer, it.name, targetSide, sourceSide);
            if (!r?.success) throw new Error(`Failed to restore ${it.name}`);
          }
          const d = await this.podManager.deleteResource(targetItemUrl, it.isContainer, targetSide);
          if (!d.success) throw new Error(`Failed to remove copy of ${it.name} from target`);
        }
        // Refresh both panels affected by the undo.
        const lp = this.elements.leftPod, rp = this.elements.rightPod;
        if (lp.currentPath) await lp.loadContainer(lp.currentPath);
        if (rp.currentPath) await rp.loadContainer(rp.currentPath);
      },
    };
  }

  _pushUndo(record) {
    this._undoLedger.unshift(record);
    // Keep last 5 — enough to recover from a misclick, not enough to grow unbounded.
    if (this._undoLedger.length > 5) this._undoLedger.length = 5;
  }

  async _doUndo(record) {
    const target = record || this._undoLedger[0];
    if (!target) return;
    this.uiManager.setStatus('Undoing…', '');
    try {
      await target.undo();
      const i = this._undoLedger.indexOf(target);
      if (i >= 0) this._undoLedger.splice(i, 1);
      this.uiManager.setStatus('Undone.', 'success');
    } catch (e) {
      console.error('[podz] undo failed:', e);
      this._panelError(`Undo failed: ${e.message}`,
        [this.elements.leftPod, this.elements.rightPod]);
    }
  }

  _promptMoveOrCopy(items) {
    if (!SolModal?.choice) {
      console.error('[podz] SolModal.choice missing — falling back to confirm()');
      return Promise.resolve(window.confirm('Move (OK) or Copy (Cancel)?') ? 'move' : 'copy');
    }
    const count = items.length;
    return SolModal.choice({
      size: 'small',
      title: count === 1 ? `Transfer "${items[0].name}"` : `Transfer ${count} items`,
      message: 'Move (delete original) or copy (keep original)?',
      render: count > 1 ? (body) => {
        const list = document.createElement('ul');
        list.style.cssText = 'margin:8px 0 0 0;padding-left:20px;max-height:160px;overflow:auto;font-size:0.9em;color:#555;';
        for (const it of items) {
          const li = document.createElement('li');
          li.textContent = `${it.isContainer ? '\u{1F4C1}' : '\u{1F4C4}'} ${it.name}`;
          list.appendChild(li);
        }
        body.appendChild(list);
      } : undefined,
      buttons: [
        { label: 'Cancel', value: null },
        { label: 'Copy',   value: 'copy' },
        { label: 'Move',   value: 'move', primary: true },
      ],
    });
  }
}

// Self-instantiation removed: dk owns mounting. dk-podz.js imports
// { SolidFileBrowser } and constructs it once after injecting the panel markup.
// (A standalone host would do the same after placing #left-pod / #right-pod.)
