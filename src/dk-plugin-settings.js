// <dk-plugin-settings> — renders the Settings page's per-plugin settings groups
// from RDF, gated on catalog "in-use" status. Manifest-driven: nothing about a
// plugin's settings is duplicated here — each plugin declares its own.
//
// For each plugin currently IN USE (its ui:name is referenced in the active shell
// menu, menu=…), this loads the plugin's manifest (plugins/<id>/manifest.jsonld)
// and, if it declares a settings shape (dct:conformsTo) plus a settings document
// (a .ttl in dct:requires), renders a shape-driven <sol-form> for it. The form's
// subject is the document's own foaf:primaryTopic — the established Solid
// "what this document is about" convention (every settings doc already declares
// `<> foaf:primaryTopic <#Settings>`), so no settings-subject term is needed.
//
// A plugin parked in the catalog (not wired into the shell) is skipped. sc's
// <sol-settings> DOM-discovery is left untouched, so other apps keep zero-config
// auto-discovery.

import { rdf } from 'sol-components/core/rdf.js';
import { solFetch } from 'sol-components/core/auth-fetch.js';

const UI   = 'http://www.w3.org/ns/ui#';
const FOAF = 'http://xmlns.com/foaf/0.1/';

async function loadTurtle(url) {
  const ttl = await (await solFetch(url)).text();
  const store = rdf.graph();
  rdf.parse(ttl, store, url, 'text/turtle');
  return store;
}

class DkPluginSettings extends HTMLElement {
  async connectedCallback() {
    if (this._rendered) return;
    this._rendered = true;

    const menu = this.getAttribute('menu')
      || document.getElementById('dk-tabs')?.getAttribute('from-rdf');
    if (!menu) { console.warn('[dk-plugin-settings] no menu source'); return; }

    try {
      for (const manifestUrl of await this._inUseManifests(menu)) {
        const group = await this._groupFor(manifestUrl);
        if (group) this.appendChild(group);
      }
    } catch (err) {
      console.warn(`[dk-plugin-settings] ${err.message}`);
    }
  }

  // Manifest URLs of the plugins wired into the active shell (dk's "in use" =
  // ui:name present in the menu doc), derived from each entry's source path.
  async _inUseManifests(menuRef) {
    const menuUrl = new URL(menuRef.split('#')[0], document.baseURI).href;
    const store = await loadTurtle(menuUrl);
    const seen = new Set();
    const out = [];
    for (const st of store.statementsMatching(null, rdf.sym(UI + 'name'), null)) {
      let src = null;
      for (const a of store.each(st.subject, rdf.sym(UI + 'attribute'))) {
        if (store.any(a, rdf.sym('http://schema.org/name'))?.value === 'source') {
          src = store.any(a, rdf.sym('http://schema.org/value'))?.value; break;
        }
      }
      const id = src && src.match(/plugins\/([^/]+)\//)?.[1];
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(new URL(`dk-pod/dk/plugins/${id}/manifest.jsonld`, document.baseURI).href);
    }
    return out;
  }

  // Build a settings group from a plugin manifest, or null if it has no settings.
  // The manifest is JSON-LD; its keys (shape/requires/label) are read directly.
  async _groupFor(manifestUrl) {
    let m;
    try { m = await (await solFetch(manifestUrl)).json(); } catch { return null; }
    if (!m.shape) return null;                         // no settings shape → no form
    const requires = Array.isArray(m.requires) ? m.requires : (m.requires ? [m.requires] : []);
    const ttl = requires.find((r) => String(r).endsWith('.ttl'));
    if (!ttl) return null;

    const shape   = new URL(m.shape, manifestUrl).href;       // /node_modules/…/x.shacl
    const docUrl  = new URL(ttl, manifestUrl).href;           // plugins/<id>/x.ttl
    let subject;
    try {
      const dstore = await loadTurtle(docUrl);
      subject = dstore.any(rdf.sym(docUrl), rdf.sym(FOAF + 'primaryTopic'))?.value;
    } catch { return null; }
    if (!subject) return null;

    return this._group(m.label || m.name || 'Settings', shape, subject);
  }

  // One settings group, styled like the page's hardcoded groups. data-settings-skip
  // keeps these forms out of the discovery <sol-settings> accordion below.
  _group(label, shape, subject) {
    const section = document.createElement('section');
    section.className = 'dk-settings-group';
    section.setAttribute('data-settings-skip', '');
    const h3 = document.createElement('h3');
    h3.textContent = label;
    const form = document.createElement('sol-form');
    form.setAttribute('data-settings-skip', '');
    form.setAttribute('shape', shape);
    form.setAttribute('subject', subject);
    form.setAttribute('save-to', subject);
    section.append(h3, form);
    return section;
  }
}

customElements.define('dk-plugin-settings', DkPluginSettings);
