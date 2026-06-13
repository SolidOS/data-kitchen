// dk-podz hosts the existing podz app inside its light DOM. podz's
// source self-instantiates `new SolidFileBrowser()` on module load and
// resolves its DOM via `document.getElementById`, so the sequence is:
// 1) inject markup, 2) load podz.css + podz bundle.
//
// Persistent-tabs mode (the mountInTarget default) means dk-podz
// mounts once and stays in the DOM, hidden when other tabs are
// active. SolidFileBrowser keeps its in-memory state across nav.

const PODZ_CSS    = 'node_modules/podz/src/podz.css';
const PODZ_BUNDLE = 'node_modules/podz/dist/podz.bundle.min.js';

let bootstrapped = false;

function ensurePodzCss() {
  const existing = document.querySelector('link[data-dk-podz-css]');
  if (existing) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = PODZ_CSS;
  link.dataset.dkPodzCss = '1';
  document.head.appendChild(link);
}

let bundleLoaded = false;

function loadPodzBundle() {
  if (bundleLoaded) return Promise.resolve();
  bundleLoaded = true;
  // podz ships an ESM bundle now (not an IIFE <script>). Its bare imports
  // (rdflib, sol-components/*) resolve via the page's component-interop
  // importmap, so podz shares dk's single rdflib instance + AuthManager —
  // import it as a module so that resolution applies. The specifier is a
  // runtime variable so esbuild leaves this as a live dynamic import.
  const url = new URL(PODZ_BUNDLE, document.baseURI).href;
  return import(url);
}

class DkPodz extends HTMLElement {
  static get template() { return 'dk-pod/dk/plugins/podz/dk-podz.html'; }
  static get manifest() { return 'dk-pod/dk/plugins/podz/manifest.ttl'; }

  /**
   * Editable widgets this app hosts (read by dk-settings). Podz
   * exposes the sol-* tools through its own modals and side-panel UI;
   * none of them are RDF-source-driven in the same way the dashboard
   * widgets are, so the manifest is empty for v0.
   */
  static get editableWidgets() { return []; }

  async connectedCallback() {
    if (this._rendered) return;
    this._rendered = true;

    const tpl = await fetch(this.constructor.template);
    this.innerHTML = await tpl.text();
    ensurePodzCss();
    if (bootstrapped) {
      const warn = document.createElement('div');
      warn.style.cssText = 'padding:1rem;margin:1rem;background:var(--warn-bg, #fdecea);color:var(--text, #000);border:1px solid var(--warn-border, #e53935);border-radius:var(--radius-md, 6px);';
      warn.textContent = 'Podz is single-mount. Refresh the page to re-initialise it.';
      this.prepend(warn);
      return;
    }
    bootstrapped = true;
    loadPodzBundle().catch(err => console.error('[dk-podz]', err));
  }
}

customElements.define('dk-podz', DkPodz);
