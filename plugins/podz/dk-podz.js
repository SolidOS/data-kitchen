// dk-podz is the in-house pod-browser (the former `podz` app, absorbed into dk).
// dk owns the shell now: it injects the two-panel markup, then constructs
// SolidFileBrowser itself — no self-instantiating bundle. The shell modules
// (podz.js + podz-{ui,state,auth,pod,utils}.js, podz.css) live beside this file
// and are bundled into dist/dk.bundle.js with the rest of dk's source. The
// sol-* custom elements (sol-pod, sol-modal, sol-pod-ops, sol-live-edit, …)
// still come from sol-components via the component-interop importmap.
//
// Persistent-tabs mode (the keep-alive default) means dk-podz mounts once and
// stays in the DOM, hidden when other tabs are active. SolidFileBrowser keeps
// its in-memory state across nav, so we build it a single time.
import { SolidFileBrowser } from './podz.js';

const PODZ_CSS = 'dk-pod/dk/plugins/podz/podz.css';

function ensurePodzCss() {
  if (document.querySelector('link[data-dk-podz-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = PODZ_CSS;
  link.dataset.dkPodzCss = '1';
  document.head.appendChild(link);
}

let browser = null;

class DkPodz extends HTMLElement {
  static get template() { return 'dk-pod/dk/plugins/podz/dk-podz.html'; }
  static get manifest() { return 'dk-pod/dk/plugins/podz/manifest.jsonld'; }

  /**
   * Editable widgets this app hosts (read by dk-settings). The pod browser
   * exposes the sol-* tools through its own modals and side-panel UI; none of
   * them are RDF-source-driven the way the dashboard widgets are, so the
   * manifest is empty for v0.
   */
  static get editableWidgets() { return []; }

  async connectedCallback() {
    if (this._rendered) return;
    this._rendered = true;

    const tpl = await fetch(this.constructor.template);
    this.innerHTML = await tpl.text();
    ensurePodzCss();

    // The shell resolves its panels via document.getElementById('left-pod' /
    // 'right-pod'), which the template above just placed. Build it once.
    if (!browser) browser = new SolidFileBrowser();
  }
}

customElements.define('dk-podz', DkPodz);
