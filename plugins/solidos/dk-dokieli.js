// dk-dokieli — dokieli as a bare in-app editor.
//
// Loads a dokieli document DIRECTLY in an iframe (no SolidOS browser chrome around
// it). Opens the last-visited doc; if there is none (or it's gone), mints a BLANK
// new dokieli document by PUTting the template into the dokieli folder and opens
// that. The doc's editor (dokie.li runtime, same-origin) receives dk's identity +
// authenticated fetch from the component-interop frame-sweep adapter
// (plugins/solidos/dokieli-adapter.js), so saves ride dk's session.
import DOKIELI_TEMPLATE from 'solid-panes/dist/dokieli/new.js';

const LAST_KEY = 'dk-dokieli:lastDoc';

class DkDokieli extends HTMLElement {
  get _folder() { return `${location.origin}/dk-pod/dokieli/`; }

  async connectedCallback() {
    if (this._wired) return;
    this._wired = true;
    this.style.display = 'block';
    if (!this.style.height) this.style.height = '100%';

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
    if (uri) iframe.src = uri;
    else iframe.srcdoc = '<p style="font:16px system-ui;padding:2rem">Could not create a dokieli document.</p>';
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
