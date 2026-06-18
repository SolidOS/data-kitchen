// <dk-plugin-settings> — renders the Settings page's per-plugin settings groups
// from RDF, gated on catalog "in-use" status. Manifest-driven: nothing about a
// plugin's settings is duplicated here — each plugin declares its own.
//
// For each plugin currently IN USE (its ui:name is referenced in the active shell
// menu, menu=…), the settings shape comes LIBRARY-FIRST: if the component's
// library manifest (e.g. sol-components) declares a settings shape (dct:conformsTo)
// plus a default data doc (dct:references), those library facts describe the
// settings and we render a shape-driven <sol-form> editing the deployment's own
// document (the menu entry's `source`). Components no library describes fall back
// to a dk per-plugin manifest (plugins/<id>/manifest.jsonld) carrying the same
// shape + a settings .ttl in dct:requires. Either way the form's subject is the
// source document's #fragment, or its foaf:primaryTopic — the established Solid
// "what this document is about" convention — so no settings-subject term is needed.
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
      for (const entry of await this._inUseEntries(menu)) {
        const group = await this._groupFor(entry);
        if (group) this.appendChild(group);
      }
    } catch (err) {
      console.warn(`[dk-plugin-settings] ${err.message}`);
    }
  }

  // The plugins wired into the active shell (dk's "in use" = ui:name present in
  // the menu doc). Each entry carries: name (the component tag / ui:name), handler
  // (the `data-handler` when the entry is a launcher like <sol-button>, naming the
  // actual settings-bearing component), src (the settings DOCUMENT the entry edits,
  // from its `source` attribute), and id (the plugins/<id>/ folder, for the
  // per-plugin-manifest fallback).
  async _inUseEntries(menuRef) {
    const menuUrl = new URL(menuRef.split('#')[0], document.baseURI).href;
    const store = await loadTurtle(menuUrl);
    const seen = new Set();
    const out = [];
    for (const st of store.statementsMatching(null, rdf.sym(UI + 'name'), null)) {
      const name = st.object?.value;
      let src = null, handler = null;
      for (const a of store.each(st.subject, rdf.sym(UI + 'attribute'))) {
        const an = store.any(a, rdf.sym('http://schema.org/name'))?.value;
        if (an === 'source') src = store.any(a, rdf.sym('http://schema.org/value'))?.value;
        else if (an === 'data-handler') handler = store.any(a, rdf.sym('http://schema.org/value'))?.value;
      }
      const id = src && src.match(/plugins\/([^/]+)\//)?.[1];
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, name, src, handler });
    }
    return out;
  }

  // A component's display metadata as parsed from the loaded component-library
  // manifest(s) by component-interop — keyed by ui:name. shape/data are already
  // resolved to absolute document URLs against the library that declared them.
  async _libMeta(name) {
    if (!name) return null;
    try { await window.ComponentInterop?.ready; } catch {}
    return window.ComponentInterop?.manifest?.meta?.[name] || null;
  }

  // Build a settings group for an in-use plugin, or null if it has no settings.
  // Library-first: when the component's library manifest (e.g. sol-components)
  // declares both a settings `shape` AND a default `data` doc, those library facts
  // ARE its settings description — render a form over the deployment's own document
  // (the entry's `source`). Components no library describes fall back to a dk
  // per-plugin manifest.jsonld.
  async _groupFor(entry) {
    // The settings-bearing component is the entry's data-handler when it's a
    // launcher (<sol-button data-handler="sol-calendar" region="dropdown">), else
    // the entry's own ui:name.
    const meta = await this._libMeta(entry.handler || entry.name);
    if (meta?.shape && meta?.data) {
      const subject = await this._subjectOf(entry.src);
      if (!subject) return null;
      return this._group(meta.label || entry.handler || entry.name || 'Settings', meta.shape, subject);
    }
    return this._groupFromManifest(entry.id);
  }

  // The settings subject for an in-use entry's `source`: the document's own
  // fragment when the source names one (`…/x.ttl#Settings`), else the doc's
  // foaf:primaryTopic — the established "what this document is about" convention.
  async _subjectOf(src) {
    if (!src) return null;
    const abs = new URL(src, document.baseURI).href;
    if (abs.includes('#')) return abs;
    try {
      const dstore = await loadTurtle(abs);
      return dstore.any(rdf.sym(abs), rdf.sym(FOAF + 'primaryTopic'))?.value || null;
    } catch { return null; }
  }

  // Fallback: a dk per-plugin manifest (plugins/<id>/manifest.jsonld), read as
  // plain JSON-LD — its keys (shape/requires/label) drive the form directly.
  async _groupFromManifest(id) {
    if (!id) return null;
    const manifestUrl = new URL(`dk-pod/dk/plugins/${id}/manifest.jsonld`, document.baseURI).href;
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
