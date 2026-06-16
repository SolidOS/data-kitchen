// dk-solidos hosts a two-pane workspace: <sol-pod> sidebar on the
// left, an iframe loading plugins/solidos/solidos-host.html on the right.
// The host page runs mashlib in isolation (no CSS, theme, or global leaks
// back into dk) and hand-rolls the panes glue — panes.initMainPage +
// outliner.GotoSubject — exposed as window.gotoSubject for parent-driven
// navigation. (sol-components ships a general <sol-solidos> that mounts
// mashlib INLINE; dk deliberately wraps mashlib in this isolating iframe
// instead, which is why dk-solidos exists alongside it.) Same-origin, so:
//
//   - parent can call into the iframe directly (no postMessage)
//   - theme + font-size are pushed from dk into the iframe document
//
// Auth is NOT shared via IndexedDB: sol-pod's popup-mode session is a
// PopupProxySession (tokens live in the popup window, proxied via
// postMessage), and mashlib bundles its own solid-client-authn copy
// with a separate Session singleton. So we plumb auth explicitly in
// both directions:
//
//   - parent -> iframe: the parent's authed fetch (from sol-pod._fetchFor)
//     is installed as the iframe's `window.fetch` via the iframe's
//     `installAuthFetch()` hook BEFORE mashlib loads. solid-logic's
//     boundFetch resolves global `fetch` at call time, so the override
//     propagates everywhere mashlib makes requests. Reloaded on
//     sol-login / sol-logout to refresh the session state.
//
//   - iframe -> parent: when the user logs in via SolidOS's banner
//     (mashlib redirect flow), we hook the iframe's bundled
//     authSession.events and monkey-patch sol-pod._fetchFor to fall
//     back to the iframe's session.fetch for plain-fetch URLs. So
//     pod-side queries (storage listing) inherit the iframe-side
//     login. pod.loadContainer is refreshed on apply/release.
//
// Cross-window visual cue: plugins/solidos/solidos-host.html also broadcasts
// mashlib's session events on BroadcastChannel('sol-auth'), and
// sol-pod's embedded sol-login listens on the same channel — so
// logging in inside SolidOS lights up sol-pod's login button green
// even when no direct adoption has happened.

class DkSolidos extends HTMLElement {
  static get template() { return 'dk-pod/dk/plugins/solidos/dk-solidos.html'; }

  static get editableWidgets() { return []; }

  async connectedCallback() {
    if (this._rendered) return;
    this._rendered = true;

    const tpl = await fetch(this.constructor.template);
    this.innerHTML = await tpl.text();

    const pod = this.querySelector('sol-pod');
    const iframe = this.querySelector('.dk-solidos-iframe');
    if (pod && iframe) {
      // Track where the iframe is pointed so we can restore it after
      // a session-change reload.
      let currentUri = null;
      pod.podClickAction = (item) => {
        if (!item || !item.url) return;
        currentUri = item.url;
        const win = iframe.contentWindow;
        if (win && typeof win.gotoSubject === 'function') {
          win.gotoSubject(item.url);
        } else {
          // Fallback: iframe not yet ready — fall back to navigating
          // the iframe URL (works standalone via ?uri=…).
          iframe.src = 'dk-pod/dk/plugins/solidos/solidos-host.html?uri=' + encodeURIComponent(item.url);
        }
      };
      try { await pod.initialize(); }
      catch (err) { console.warn('[dk-solidos] pod.initialize failed:', err); }

      // Kick the iframe into rendering with the pod root so the
      // SolidOS banner shows up immediately (its first paint is
      // deferred to the first gotoSubject — see solidos-host.html).
      const primeIframe = () => {
        // pod.currentPath honors the remembered last-visited container
        // (see _pickStartPath in sol-pod), so the iframe view tracks
        // wherever sol-pod actually landed — not just the pod root.
        const start = pod.currentPath || pod.rootUrl;
        const win = iframe.contentWindow;
        // Subclasses (dk-dokieli) can pin an initial landing subject;
        // otherwise follow wherever sol-pod actually landed.
        const target = currentUri || this._landingSubject() || start;
        if (target && win && typeof win.gotoSubject === 'function') {
          if (!currentUri) currentUri = target;
          win.gotoSubject(target);
        }
      };
      if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
        primeIframe();
      } else {
        iframe.addEventListener('load', primeIframe, { once: true });
      }

      // The iframe's bundled solid-logic ships its own Session
      // singleton, and sol-pod's popup-mode session is a
      // PopupProxySession (tokens live in the popup window, proxied
      // via postMessage — not stored where the iframe's authn could
      // find them). So we hand the iframe an authed fetch sourced
      // from the parent's pod, and the iframe sets window.fetch to
      // it BEFORE loading mashlib (see plugins/solidos/solidos-host.html).
      // boundFetch in solid-logic resolves global fetch at call time,
      // so all of mashlib's traffic inherits the auth.
      const podAuthedFetch = (input, init) => {
        const u = typeof input === 'string'
          ? input
          : (input && (input.url || input.href)) || '';
        return pod._fetchFor(u)(input, init);
      };
      const installAuthFetch = () => {
        const win = iframe.contentWindow;
        if (!win) return;
        // Tell the host page who the local pod owner is, BEFORE mashlib loads,
        // so it can show logged-in-as-owner (the local CSS is allow-all behind
        // dk's gate — no OIDC session; identity is a synthetic overlay, matching
        // src/dk-owner-session.js for the main page).
        win.dkOwnerWebId = `${location.origin}/dk-pod/profile/card#me`;
        if (typeof win.installAuthFetch === 'function') {
          win.installAuthFetch(podAuthedFetch);
        }
      };
      iframe.addEventListener('load', installAuthFetch);
      // Initial load may already be complete by the time we attach.
      if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
        installAuthFetch();
      }

      // sol-login / sol-logout: reload so mashlib re-bootstraps with
      // the new fetch override (the `load` listener above re-runs
      // installAuthFetch, primeIframe restores the current URL).
      const reloadForAuth = () => {
        iframe.addEventListener('load', primeIframe, { once: true });
        iframe.contentWindow.location.reload();
      };
      pod.addEventListener('sol-login', reloadForAuth);
      pod.addEventListener('sol-logout', reloadForAuth);

      // The reverse direction: when the user logs in via SolidOS's
      // own banner (mashlib's redirect flow inside the iframe),
      // sol-pod has no session of its own — but the iframe does.
      // Monkey-patch pod._fetchFor so pod operations (storage
      // listing, container fetches) delegate to the iframe's
      // authSession.fetch whenever pod's own fetchFor would otherwise
      // fall back to plain fetch.
      let currentSessFetch = null;
      const origFetchFor = pod._fetchFor.bind(pod);
      pod._fetchFor = (url) => {
        const own = origFetchFor(url);
        const isPlainFetch = own === fetch || own === window.fetch;
        return (isPlainFetch && currentSessFetch) ? currentSessFetch : own;
      };
      const wireIframeAuth = async () => {
        const win = iframe.contentWindow;
        try { await win?.mashlibReady; } catch (_) { return; }
        const SL   = win && win.SolidLogic && win.SolidLogic.solidLogicSingleton;
        const sess = SL && SL.authn && SL.authn.authSession;
        if (!sess || !sess.events) return;
        const apply = () => {
          if (!sess.info?.isLoggedIn) { currentSessFetch = null; return; }
          currentSessFetch = sess.fetch.bind(sess);
          if (pod._rootUrl) pod.loadContainer(pod._rootUrl).catch(() => {});
        };
        const release = () => {
          currentSessFetch = null;
          if (pod._rootUrl) pod.loadContainer(pod._rootUrl).catch(() => {});
        };
        sess.events.on('login',  apply);
        sess.events.on('logout', release);
        if (sess.info?.isLoggedIn) apply();
      };
      iframe.addEventListener('load', wireIframeAuth);

      // Push dk's theme + --font-size into the iframe on load and on
      // any settings save. Same-origin iframe so direct DOM access is
      // allowed; no postMessage needed.
      const syncEnv = () => {
        const doc = iframe.contentDocument;
        if (!doc) return;
        const dkHtml = document.documentElement;
        doc.documentElement.dataset.theme = dkHtml.dataset.theme || '';
        const fs = dkHtml.style.getPropertyValue('--font-size')
                || getComputedStyle(dkHtml).getPropertyValue('--font-size');
        if (fs) doc.documentElement.style.setProperty('--font-size', fs);
      };
      iframe.addEventListener('load', syncEnv);
      document.addEventListener('sol-form-save', syncEnv);

      // Subclass extension point (dk-dokieli adds a "New document" button).
      this._mountExtras(iframe, pod);
    }

    this._wireSplitter();
  }

  // Subclass hooks. Base dk-solidos is sidebar-driven with no extra chrome;
  // dk-dokieli overrides these to pin a landing folder and add a New button.
  _landingSubject() { return null; }
  _mountExtras(/* iframe, pod */) {}

  _wireSplitter() {
    const splitter = this.querySelector('.dk-solidos-splitter');
    const left = this.querySelector('.dk-solidos-sidebar');
    const container = this.querySelector('.dk-solidos-layout');
    if (!splitter || !left || !container) return;

    let dragging = false;
    const onMove = (e) => {
      if (!dragging) return;
      const rect = container.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const min = 160, max = rect.width - 240;
      left.style.width = Math.max(min, Math.min(max, x)) + 'px';
    };
    const onUp = () => {
      dragging = false;
      document.body.style.userSelect = '';
    };
    splitter.addEventListener('mousedown', () => {
      dragging = true;
      document.body.style.userSelect = 'none';
    });
    splitter.addEventListener('touchstart', () => { dragging = true; });
    splitter.addEventListener('dblclick', () => { left.style.width = ''; });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
  }
}

customElements.define('dk-solidos', DkSolidos);

export { DkSolidos };
