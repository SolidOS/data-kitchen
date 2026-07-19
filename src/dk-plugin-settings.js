// <dk-plugin-settings> — renders the Settings page's per-plugin settings groups
// from RDF, gated on "in use" (the plugin is wired into the active shell menu).
//
// UNIFIED MODEL (plugin-manifest-unification, 2026-07-18): menus are REFERENCE
// lists over ui:Plugin entries in the catalog doc; the ENTRY is the working
// copy of the plugin's description and carries its settings pointers —
//   dct:conformsTo       the SHACL shape driving the form
//   dct:references       the default/live data doc
//   ui:label             the group heading
// One lookup, one description system for sc, dk-own, and third-party plugins
// alike. The old manifest.jsonld fallback is RETIRED (decision 4) — the
// .jsonld files stay on disk for possible component-interop use only.
// Legacy inline menu items (third-party menus) still resolve via their
// dct:source manifest doc.
//
// The form edits the deployment's live doc: subject = the entry's `source`
// attribute when it names a settings document (fragment or foaf:primaryTopic),
// else the dct:references doc's primaryTopic (e.g. podz, whose `source` is its
// HTML panel). Groups dedupe by the plugins/<id>/ dir of the settings doc, so
// the three ia-player rooms share one group as before.

import { rdf } from 'sol-components/core/rdf.js';
import { solFetch } from 'sol-components/core/auth-fetch.js';
import { parseMenuItems, loadReferencedDocs } from 'sol-components/core/menu-rdf.js';

const UI   = 'http://www.w3.org/ns/ui#';
const RDF_ = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const DCT  = 'http://purl.org/dc/terms/';
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

  // Every component plugin wired into the active shell. Parses the menu doc
  // with the shared sc machinery (references resolve into the catalog via
  // loadReferencedDocs), walking every ui:Menu in the doc.
  async _inUseEntries(menuRef) {
    const menuUrl = new URL(menuRef.split('#')[0], document.baseURI).href;
    const store = await loadTurtle(menuUrl);
    await loadReferencedDocs(store, menuUrl, solFetch);
    const out = [];
    const seen = new Set();
    const walk = (items) => {
      for (const it of items || []) {
        if (it.type === 'submenu') { walk(it.children); continue; }
        if (it.type !== 'component' || !it.tag) continue;
        const params = Object.fromEntries(it.params || []);
        out.push({
          name: it.tag,
          handler: params['data-handler'] || null,
          src: params.source || null,
          label: it.name || null,
          entryIri: it.entry || null,
          manifest: it.manifest || null,
        });
      }
    };
    for (const menuNode of store.each(null, rdf.sym(RDF_ + 'type'), rdf.sym(UI + 'Menu'))) {
      if (menuNode.value.split('#')[0] !== menuUrl) continue;   // this doc's menus only
      walk(parseMenuItems(store, menuNode));
    }
    // the settings STORE for entry lookups (the referenced catalog is loaded)
    this._store = store;
    return out.filter((e) => !seen.has(e.entryIri || e.name) && seen.add(e.entryIri || e.name));
  }

  // Settings pointers for an in-use plugin: from its ui:Plugin ENTRY (already
  // in the parse store — no extra fetch) or, for a legacy inline item, from
  // its dct:source manifest doc.
  async _settingsMeta(entry) {
    const read = (store, subjIri) => {
      const subj = rdf.sym(subjIri);
      const val = (pred) => store.any(subj, rdf.sym(pred))?.value || null;
      const shape = val(DCT + 'conformsTo');
      const data = val(DCT + 'references');
      const label = val(UI + 'label');
      return shape ? { shape, data, label } : null;
    };
    if (entry.entryIri) return read(this._store, entry.entryIri);
    if (!entry.manifest) return null;
    const abs = new URL(entry.manifest, document.baseURI).href;
    try { return read(await loadTurtle(abs), abs); } catch { return null; }
  }

  // Build a settings group, or null when the plugin declares no settings
  // (no shape, or no resolvable subject). Dedupe by the settings doc's
  // plugins/<id>/ dir so plugins sharing one settings home (the ia-player
  // rooms) render one group.
  async _groupFor(entry) {
    const meta = await this._settingsMeta(entry);
    if (!meta?.shape) return null;
    const subject = await this._subjectOf(entry.src) || await this._subjectOf(meta.data);
    if (!subject) return null;
    const home = subject.match(/plugins\/([^/]+)\//)?.[1] || subject;
    this._homes = this._homes || new Set();
    if (this._homes.has(home)) return null;
    this._homes.add(home);
    return this._group(meta.label || entry.label || entry.handler || entry.name || 'Settings',
      meta.shape, subject);
  }

  // The settings subject for a doc: its own fragment when the URL names one
  // (`…/x.ttl#Settings`), else the doc's foaf:primaryTopic — the established
  // "what this document is about" convention. Non-ttl docs resolve to null.
  async _subjectOf(src) {
    if (!src) return null;
    const abs = new URL(src, document.baseURI).href;
    if (abs.includes('#')) return abs;
    if (!/\.ttl$/.test(abs.split('?')[0])) return null;
    try {
      const dstore = await loadTurtle(abs);
      return dstore.any(rdf.sym(abs), rdf.sym(FOAF + 'primaryTopic'))?.value || null;
    } catch { return null; }
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
