// dk-solidos — thin host for the upstream SolidOS (mashlib) panes.
//
// It embeds the isolating `sol-solidos-host.html` iframe, which runs the upstream
// <sol-solidos> against mashlib with mash.css loaded INSIDE the iframe — so SolidOS
// renders exactly as upstream intends while its global CSS cannot leak into dk's
// chrome. dk shares its authenticated fetch into the iframe via component-interop
// (`adoptAuth` → the iframe broker's adoptedFetch → getAuthFetch → the panes), so
// reads/writes follow whatever pod dk is logged into (local or remote).
//
// The pod subject to display comes from the `source` attribute (a resource URI) or
// a subclass `_landingSubject()`, defaulting to the pod root. This replaces the old
// two-pane (sol-pod sidebar + hand-rolled mashlib glue) implementation.

const HOST_PAGE = 'dk-pod/dk/plugins/solidos/sol-solidos-host.html';

class DkSolidos extends HTMLElement {
  static get observedAttributes() { return ['source']; }

  connectedCallback() {
    if (this._wired) return;
    this._wired = true;
    this.style.display = 'block';
    if (!this.style.height) this.style.height = '100%';

    const iframe = document.createElement('iframe');
    iframe.className = 'dk-solidos-frame';
    iframe.style.cssText = 'border:0;width:100%;height:100%;display:block';
    iframe.src = `${HOST_PAGE}?source=${encodeURIComponent(this._subject())}`;
    this._iframe = iframe;
    this.appendChild(iframe);

    iframe.addEventListener('load', () => this._shareAuth());
    this._onAuthChange = () => this._shareAuth();
    document.addEventListener('sol-login', this._onAuthChange);
    document.addEventListener('sol-logout', this._onAuthChange);

    this._mountExtras(iframe);
  }

  disconnectedCallback() {
    document.removeEventListener('sol-login', this._onAuthChange);
    document.removeEventListener('sol-logout', this._onAuthChange);
  }

  attributeChangedCallback(name, oldV, newV) {
    if (name === 'source' && oldV !== newV && this._iframe) {
      const win = this._iframe.contentWindow;
      if (win && typeof win.solSetSource === 'function') win.solSetSource(this._subject());
    }
  }

  // The subject URI: an explicit `source` (absolute/rooted), else a subclass landing
  // subject, else the local pod root. (The old menu wiring used `source` for a
  // template path — anything that isn't a real URI falls through to the default.)
  _subject() {
    const src = this.getAttribute('source') || '';
    if (/^https?:\/\//.test(src)) return src;            // absolute URI
    if (src.startsWith('/')) return location.origin + src; // pod-rooted path → URI
    // Base SolidOS opens at the local server root; subclasses (dk-dokieli) pin their own.
    return this._landingSubject() || `${location.origin}/`;
  }

  // Hand dk's authenticated fetch to the iframe (component-interop auth channel).
  // Retries briefly because the iframe's adoptAuth is published as its modules load.
  _shareAuth() {
    const win = this._iframe && this._iframe.contentWindow;
    if (!win) return;
    const base = window.dkFetch || ((u, o) => fetch(u, o));
    // Containers (URLs whose path ends in '/') must be fetched as RDF. The local
    // server content-negotiates '/' to the app's index.html (a wormhole) under
    // Accept: text/html, and other folders to the Pivot HTML view — so force
    // Accept: text/turtle for container requests and SolidOS gets the container,
    // rendering its own folder pane.
    const dkFetch = (input, init) => {
      let u = '';
      try { u = typeof input === 'string' ? input : (input && (input.url || input.href)) || ''; } catch (_) {}
      const path = u.split('#')[0].split('?')[0];
      if (path.endsWith('/')) {
        const h = new Headers((init && init.headers) || {});
        h.set('Accept', 'text/turtle');
        return base(input, { ...(init || {}), headers: h });
      }
      return base(input, init);
    };
    const webId = `${location.origin}/dk-pod/profile/card#me`;
    let tries = 0;
    const apply = () => {
      try { if (typeof win.adoptAuth === 'function') { win.adoptAuth(dkFetch, { webId }); return; } }
      catch (_) { /* cross-origin/odd state — give up */ return; }
      if (++tries < 40) setTimeout(apply, 50);
    };
    apply();
  }

  // Subclass hooks (dk-dokieli pins a landing folder; base has neither).
  _landingSubject() { return null; }
  _mountExtras(/* iframe */) {}
}

customElements.define('dk-solidos', DkSolidos);

export { DkSolidos };
