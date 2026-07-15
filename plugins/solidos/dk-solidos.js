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

import { getRegistry } from 'sol-components/core/pod-registry.js';
import { dkFetch as dkAuthFetch } from '../../src/dk-auth-router.js';
import { discoverOwnerWebIds, getStoragesFromWebIds } from 'sol-components/core/pod-ops.js';

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
    // Opt-in location bar: forwarded to the iframe's <sol-solidos> via ?bar=1.
    // Only the SolidOS browser def sets has-location-bar; AddressBook / notes /
    // meeting / chat / dokieli embeds leave it off.
    const bar = this.hasAttribute('has-location-bar')
      && this.getAttribute('has-location-bar') !== 'false' ? '&bar=1' : '';
    iframe.src = `${HOST_PAGE}?source=${encodeURIComponent(this._subject())}${bar}`;
    this._hostSrc = iframe.src;
    this._iframe = iframe;
    this.appendChild(iframe);

    iframe.addEventListener('load', () => {
      // Auth/SolidOS code inside the frame can REALLY navigate it off the host
      // page (the GotoSubject guard only diverts subjects, not navigations) —
      // seen on Android, where mashlib's session restore redirected the frame
      // to the IdP. A frame off the host page has lost the location bar and
      // the wormhole guard, so re-seat the host (capped: a boot that keeps
      // escaping must not ping-pong forever).
      let away = false;
      try { away = !/\/sol-solidos-host\.html$/.test(iframe.contentWindow.location.pathname); }
      catch (_) { away = true; }     // cross-origin — certainly not the host page
      if (away) {
        if ((this._reseats = (this._reseats || 0) + 1) <= 3) iframe.src = this._hostSrc;
        return;
      }
      this._shareAuth(); this._pushLocations();
    });
    this._onAuthChange = () => { this._shareAuth(); this._discoverLocations(); };
    document.addEventListener('sol-login', this._onAuthChange);
    document.addEventListener('sol-logout', this._onAuthChange);

    // Feed the location bar's "Locations" dropdown from the shared pod registry —
    // the pods sol-pod has discovered (default group). Seed with the current list
    // and re-feed on every change; _pushLocations forwards it into the iframe.
    this._reg = getRegistry();
    this._onPods = (pods) => this.setLocations(pods);
    this._reg.subscribe(this._onPods);
    this.setLocations(this._reg.list());
    // Don't depend on the Pod Browser having been opened: discover pods ourselves
    // (same path sol-pod uses) so the dropdown is populated on first open too.
    this._discoverLocations();

    this._mountExtras(iframe);
  }

  // Populate the shared pod registry the way sol-pod does, so the Locations dropdown
  // fills even when no <sol-pod> has mounted yet. Idempotent (addAll only adds new);
  // re-run on login so pods a fresh session reveals show up.
  async _discoverLocations() {
    try {
      const webIds = await discoverOwnerWebIds();
      const found = await getStoragesFromWebIds(webIds);
      if (found && found.length) this._reg.addAll(found);
    } catch (_) { /* not logged in / offline — leave the registry as-is */ }
  }

  disconnectedCallback() {
    document.removeEventListener('sol-login', this._onAuthChange);
    document.removeEventListener('sol-logout', this._onAuthChange);
    if (this._reg && this._onPods) this._reg.unsubscribe(this._onPods);
  }

  attributeChangedCallback(name, oldV, newV) {
    if (name === 'source' && oldV !== newV && this._iframe) {
      const win = this._iframe.contentWindow;
      if (win && typeof win.solSetSource === 'function') win.solSetSource(this._subject());
    }
  }

  // Feed the location bar's "Locations" dropdown with the pods sol-pod discovered.
  // We forward the list into the iframe's <sol-solidos>. Stored so a list set before
  // the iframe is ready (or an updated list) is (re)applied on the next iframe load.
  setLocations(list) {
    this._locations = Array.isArray(list) ? list.slice() : [];
    this._pushLocations();
  }

  _pushLocations() {
    const win = this._iframe && this._iframe.contentWindow;
    if (!win || !this._locations || !this._locations.length) return;
    let tries = 0;
    const apply = () => {
      try { if (typeof win.solSetLocations === 'function') { win.solSetLocations(this._locations.slice()); return; } }
      catch (_) { return; }                       // cross-origin/odd state — give up
      if (++tries < 40) setTimeout(apply, 50);    // the host publishes solSetLocations as its modules load
    };
    apply();
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
    const base = dkAuthFetch;
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
