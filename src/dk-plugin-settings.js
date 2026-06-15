// <dk-plugin-settings> — renders the Settings page's per-plugin settings groups
// from RDF, gated on catalog "in-use" status.
//
// Why this exists: sc's <sol-settings> discovers settings by walking the live
// DOM, so a plugin's settings only appear once its (often deferred) tab has been
// opened. Instead, this dk component reads two RDF inputs and renders a
// shape-driven <sol-form> for each plugin that has settings AND is currently in
// use — independent of whether the plugin is mounted:
//
//   source=  a list of settings groups (ui-data/data-kitchen-settings-groups.ttl):
//            each <#X> a ui:Component ; ui:name <tag> ; ui:label <heading> ;
//            ui:attribute [schema:name "shape"|"subject" ; schema:value …] .
//   menu=    the active shell config (data-kitchen-main-menu.ttl). A plugin is
//            "in use" when its ui:name appears there (the catalog's own
//            definition). Defaults to the page's <sol-tabs from-rdf> document.
//
// Pure composition over sc primitives (rdflib + <sol-form>); sc's discovery is
// left untouched, so other apps keep zero-config auto-discovery.

import { rdf } from 'sol-components/core/rdf.js';
import { solFetch } from 'sol-components/core/auth-fetch.js';

const UI     = 'http://www.w3.org/ns/ui#';
const SCHEMA = 'http://schema.org/';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

async function loadStore(url) {
  const abs = new URL(url, document.baseURI).href;
  const ttl = await (await solFetch(abs)).text();
  const store = rdf.graph();
  rdf.parse(ttl, store, abs, 'text/turtle');
  return store;
}

class DkPluginSettings extends HTMLElement {
  async connectedCallback() {
    if (this._rendered) return;
    this._rendered = true;

    const source = this.getAttribute('source');
    if (!source) { console.warn('[dk-plugin-settings] no source'); return; }
    // Default the in-use source to the page's <sol-tabs from-rdf> shell doc.
    const menu = this.getAttribute('menu')
      || document.getElementById('dk-tabs')?.getAttribute('from-rdf')
      || null;

    try {
      const groupStore = await loadStore(source);
      const inUse = menu ? await this._inUseNames(menu) : null;

      for (const subj of groupStore.each(null, rdf.sym(RDF_TYPE), rdf.sym(UI + 'Component'))) {
        const name = groupStore.any(subj, rdf.sym(UI + 'name'))?.value;
        if (!name) continue;
        // Gate on catalog in-use status: skip plugins not wired into the shell.
        if (inUse && !inUse.has(name)) continue;

        const attrs = {};
        for (const a of groupStore.each(subj, rdf.sym(UI + 'attribute'))) {
          const k = groupStore.any(a, rdf.sym(SCHEMA + 'name'))?.value;
          const v = groupStore.any(a, rdf.sym(SCHEMA + 'value'))?.value;
          if (k) attrs[k] = v;
        }
        if (!attrs.shape || !attrs.subject) continue;

        const label = groupStore.any(subj, rdf.sym(UI + 'label'))?.value || name;
        this.appendChild(this._group(label, attrs.shape, attrs.subject));
      }
    } catch (err) {
      console.warn(`[dk-plugin-settings] ${source}: ${err.message}`);
    }
  }

  // The set of plugin ui:names referenced anywhere in the active shell doc —
  // dk's definition of "in use" (vs parked in the catalog).
  async _inUseNames(menuUrl) {
    const store = await loadStore(menuUrl.split('#')[0]);
    const names = new Set();
    for (const st of store.statementsMatching(null, rdf.sym(UI + 'name'), null)) {
      names.add(st.object.value);
    }
    return names;
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
