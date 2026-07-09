// dk-dokieli — dokieli as a bare in-app editor.
//
// Loads a dokieli document DIRECTLY in an iframe (no SolidOS browser chrome around
// it). Opens the last-visited doc; if there is none (or it's gone), mints a BLANK
// new dokieli document by PUTting the template into the dokieli folder and opens
// that. The doc's editor (dokie.li runtime, same-origin) receives dk's identity +
// authenticated fetch from the component-interop frame-sweep adapter
// (plugins/solidos/dokieli-adapter.js), so saves ride dk's session.
// solid-panes ships this as CommonJS (exports.default = <html string>). Depending on
// the interop, the default import can arrive as the module namespace object
// ({default: "...", __esModule: true}) rather than the string — which would PUT
// "[object Object]" as the doc body. Coerce to the actual template string.
import DOKIELI_NEW from 'solid-panes/dist/dokieli/new.js';
const DOKIELI_TEMPLATE =
  typeof DOKIELI_NEW === 'string' ? DOKIELI_NEW : (DOKIELI_NEW && DOKIELI_NEW.default) || DOKIELI_NEW;

const LAST_KEY = 'dk-dokieli:lastDoc';

class DkDokieli extends HTMLElement {
  get _folder() { return `${location.origin}/dk-pod/solidos-apps/dokieli/`; }

  async connectedCallback() {
    if (this._wired) return;
    this._wired = true;
    this.style.display = 'block';
    this.style.position = 'relative';   // anchor the loading overlay
    if (!this.style.height) this.style.height = '100%';

    // Loading spinner: minting/opening a dokieli doc PUTs a template and pulls the
    // dokieli runtime, so the frame is blank for several seconds. Mirror the
    // sol-solidos-host spinner (dk-dokieli bypasses that host page, loading the doc
    // directly, so it doesn't inherit it). Hide once the doc frame loads, with a
    // timeout fallback so it never spins forever.
    const spinner = document.createElement('div');
    spinner.className = 'dk-dokieli-loading';
    spinner.setAttribute('role', 'status');
    spinner.setAttribute('aria-label', 'Loading');
    spinner.style.cssText = 'position:absolute;inset:0;z-index:5;display:flex;'
      + 'align-items:center;justify-content:center;background:#1f2933';
    const ring = document.createElement('div');
    ring.style.cssText = 'width:2.2rem;height:2.2rem;border:4px solid #3e4c59;'
      + 'border-top-color:#4fd1c5;border-radius:50%;animation:dk-dokieli-spin 0.8s linear infinite';
    spinner.appendChild(ring);
    if (!document.getElementById('dk-dokieli-spin-style')) {
      const st = document.createElement('style');
      st.id = 'dk-dokieli-spin-style';
      st.textContent = '@keyframes dk-dokieli-spin{to{transform:rotate(360deg)}}';
      document.head.appendChild(st);
    }
    this.appendChild(spinner);
    let spinnerDone = false;
    const hideSpinner = () => {
      if (spinnerDone) return;
      spinnerDone = true;
      spinner.remove();
      clearTimeout(spinFallback);
    };
    const spinFallback = setTimeout(hideSpinner, 30000);

    const iframe = document.createElement('iframe');
    iframe.className = 'dk-dokieli-frame';
    iframe.style.cssText = 'border:0;width:100%;height:100%;display:block';
    this._iframe = iframe;
    this.appendChild(iframe);

    let uri = localStorage.getItem(LAST_KEY);
    if (uri && !(await this._exists(uri))) uri = null;   // last doc was deleted
    if (!uri) {
      uri = await this._mintBlank();
      if (uri) localStorage.setItem(LAST_KEY, uri);
    }
    if (uri) {
      // Listener added AFTER src is set so the initial about:blank load can't
      // dismiss the spinner before the real document has loaded.
      iframe.src = uri;
      iframe.addEventListener('load', hideSpinner, { once: true });
    } else {
      iframe.srcdoc = '<p style="font:16px system-ui;padding:2rem">Could not create a dokieli document.</p>';
      hideSpinner();
    }
  }

  _fetch(url, init) { return (window.dkFetch || ((u, o) => fetch(u, o)))(url, init); }

  async _exists(uri) {
    try { const r = await this._fetch(uri, { method: 'HEAD' }); return !!(r && r.ok); }
    catch (_) { return false; }
  }

  async _mintBlank() {
    const uri = `${this._folder}note-${Date.now()}.html`;
    try {
      const res = await this._fetch(uri, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/html' },
        body: DOKIELI_TEMPLATE,
      });
      if (res && (res.ok || res.status === 201 || res.status === 205 || res.status === 200)) return uri;
      console.warn('[dk-dokieli] mint PUT status', res && res.status);
    } catch (e) { console.warn('[dk-dokieli] mint failed:', e); }
    return null;
  }
}

customElements.define('dk-dokieli', DkDokieli);

export { DkDokieli };
