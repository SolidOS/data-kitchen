// <dk-config-settings> — the Electron and Pivot groups of the settings page
// (two sibling sections, so the settings chip nav gives each its own chip).
//
// The config (window geometry, server ports, pod root) is the pod resource
// dk-pod/dk/ui-data/data-kitchen-startup.ttl — the SOURCE OF TRUTH the user can browse.
// The main process publishes it on boot and keeps it current; userData is just a
// launch-time cache that trails it (see electron-config/main.cjs). This component
// mounts real shape-driven <sol-form>s directly on that pod resource (CSS
// handles GET/PATCH), so the fields match every other setting: the Electron
// section edits the window geometry (data-kitchen-startup-electron.shacl),
// the Pivot section the server ports (data-kitchen-startup-pivot.shacl). On
// each save it reads the resource back as RDF and pushes the values to
// userData via the IPC saveConfig (so they survive the next launch). Window
// geometry applies LIVE (setBounds on save) so the Electron section needs no
// reload; the Pivot section (ports, pod root) carries a permanent "Needs
// reload for changes" row with a Reload button.
// It never overwrites the resource on open — only seeds it if absent.
// Pod Root (pim:storage) is a plain form field: editing it points the app at
// that folder on the next reload — the data is NOT moved. Outside Electron we
// show a short notice.

import { rdf } from 'sol-components/core/rdf.js';
import { loadRdfStore } from 'sol-components/core/rdf-utils.js';
import { solFetch } from 'sol-components/core/auth-fetch.js';
import { esc } from './shared/html-escape.js';

const UI = 'http://www.w3.org/ns/ui#';
const SCHEMA = 'http://schema.org/';
const MIRROR = './dk-pod/dk/ui-data/data-kitchen-startup.ttl';
const SHAPE_ELECTRON = './dk-pod/dk/ui-data/data-kitchen-startup-electron.shacl';
const SHAPE_PIVOT    = './dk-pod/dk/ui-data/data-kitchen-startup-pivot.shacl';
const CONFIG_FILE_TYPE = 'http://www.wikidata.org/entity/Q1193846';

// form field key → predicate IRI (the editable numbers)
const FIELD_PREDS = {
  publicPort:  UI + 'publicPort',
  proxyPort:   UI + 'proxyPort',
  privatePort: UI + 'privatePort',
  width:       SCHEMA + 'width',
  height:      SCHEMA + 'height',
  windowX:     UI + 'windowX',
  windowY:     UI + 'windowY',
};
// Pod Root — a string path, synced separately from the numbers.
const PIM_STORAGE = 'http://www.w3.org/ns/pim/space#storage';
// The runtime CORS-proxy URL (ui:proxy on the main settings doc) follows the
// proxy PORT edited here — components read the URL, the user edits the port.
const SETTINGS_DOC = './dk-pod/dk/ui-data/data-kitchen-settings.ttl';
const UI_PROXY = UI + 'proxy';

class DkConfigSettings extends HTMLElement {
  async connectedCallback() {
    if (this._rendered) return;
    this._rendered = true;
    const dk = (typeof window !== 'undefined') ? window.dkElectron : null;
    if (!dk || typeof dk.getConfig !== 'function') {
      const hint =
        `<p class="dk-settings-hint">Window size, position, server ports and the pod root are part of the ` +
        `desktop app — open Data Kitchen as the Electron app to edit them.</p>`;
      this.innerHTML =
        `<section class="dk-settings-group"><h3>Electron</h3>${hint}</section>` +
        `<section class="dk-settings-group"><h3>Pivot</h3>${hint}</section>`;
      return;
    }
    try {
      const { config } = await dk.getConfig();
      await this.ensureMirror(config);
      this.render();
      this.wire();
    } catch (e) {
      this.innerHTML =
        `<section class="dk-settings-group"><p class="dk-settings-empty">Couldn't load app settings: ${esc(e?.message || e)}</p></section>`;
    }
  }

  mirrorUrl()  { return new URL(MIRROR, document.baseURI).href; }
  subjectUrl() { return this.mirrorUrl() + '#config'; }

  // The pod resource is the SOURCE OF TRUTH — the main process publishes it on
  // boot and keeps it current. Don't clobber it on open; only seed it if it's
  // somehow missing.
  async ensureMirror(config) {
    try {
      const r = await solFetch(this.mirrorUrl(), { headers: { accept: 'text/turtle' } });
      if (r.ok) return;
    } catch { /* fall through and seed */ }
    const t = (config && config.primaryTopic) || {};
    const stmts = Object.entries(FIELD_PREDS)
      .filter(([k]) => Number.isFinite(t[k]))
      .map(([k, pred]) => `   <${pred}> ${t[k]}`);
    const body =
      `<> a <${CONFIG_FILE_TYPE}> ;\n` +
      `   <http://xmlns.com/foaf/0.1/primaryTopic> <#config> .\n` +
      `<#config>\n${stmts.join(' ;\n')} .\n`;
    await solFetch(this.mirrorUrl(), { method: 'PUT', headers: { 'content-type': 'text/turtle' }, body });
  }

  render() {
    const reloadRow = `
        <div class="dk-settings-actions">
          <span class="dk-settings-field-hint">Needs reload for changes.</span>
          <button type="button" class="dk-settings-btn dk-settings-btn-primary" data-act="reload">Reload now</button>
        </div>`;
    const form = (shape) => `
        <sol-form
            data-settings-skip
            subject="${esc(this.subjectUrl())}"
            save-to="${esc(this.subjectUrl())}"
            shape="${esc(new URL(shape, document.baseURI).href)}"></sol-form>`;
    this.innerHTML = `
      <section class="dk-settings-group">
        <h3>Electron</h3>
        ${form(SHAPE_ELECTRON)}
        <p class="dk-settings-status" data-status hidden></p>
      </section>
      <section class="dk-settings-group">
        <h3>Pivot</h3>
        ${form(SHAPE_PIVOT)}
        <p class="dk-settings-status" data-status hidden></p>
        ${reloadRow}
      </section>`;
  }

  wire() {
    this.querySelectorAll('sol-form').forEach((f) => {
      f.addEventListener('sol-form-save', () => this.syncBack(f.closest('section')));
    });
    this.querySelectorAll('[data-act="reload"]').forEach((b) => {
      b.addEventListener('click', () => window.dkElectron.restart());
    });
  }

  // Status messages land in the section the action happened in (each section
  // has its own [data-status]); with no section given, use the Pivot one
  // (the last — where the Move button lives).
  status(msg, kind, section) {
    const el = section
      ? section.querySelector('[data-status]')
      : [...this.querySelectorAll('[data-status]')].pop();
    if (!el) return;
    el.textContent = msg || '';
    el.hidden = !msg;
    el.dataset.kind = kind || '';
  }

  // Read the freshly-edited mirror as RDF and push the values to userData.
  async syncBack(section) {
    try {
      const store = await loadRdfStore(this.mirrorUrl(), solFetch);
      const subj = rdf.sym(this.subjectUrl());
      const vals = {};
      for (const [k, pred] of Object.entries(FIELD_PREDS)) {
        const o = store.any(subj, rdf.sym(pred));
        if (o) { const n = parseInt(o.value, 10); if (Number.isFinite(n)) vals[k] = n; }
      }
      const stor = store.any(subj, rdf.sym(PIM_STORAGE));
      if (stor && stor.value.trim()) vals.storage = stor.value.trim();
      const r = await window.dkElectron.saveConfig(vals);
      if (r?.status === 'saved') {
        this.status('Saved.', 'ok', section);
        if (Number.isFinite(vals.proxyPort)) this.syncProxyUrl(vals.proxyPort);
      } else {
        this.status(`Couldn't save: ${r?.message || 'unknown error'}`, 'err', section);
      }
    } catch (e) {
      this.status(`Couldn't save: ${e?.message || e}`, 'err', section);
    }
  }

  // Keep the runtime proxy URL in step with the edited port: rewrite the PORT
  // inside the existing ui:proxy value on the main settings doc (host/path
  // untouched). Goes through the SHARED rdf store and its updater — the same
  // graph the settings forms and feeds use — then announces the change with
  // the standard sol-form-save signal so dk-settings-applier re-applies it.
  // (Until the user hits Reload the proxy still runs on the old port — the
  // section's permanent "Needs reload for changes" row is the contract.)
  async syncProxyUrl(proxyPort) {
    try {
      const docUrl = new URL(SETTINGS_DOC, document.baseURI).href;
      const s = rdf.store;
      if (!s.fetcher) s.fetcher = new (rdf.Fetcher)(s);
      if (!s.updater) s.updater = new (rdf.UpdateManager)(s);
      await rdf.load(docUrl);
      const doc = rdf.sym(docUrl);
      const subj = rdf.sym(docUrl + '#Settings');
      const cur = s.any(subj, rdf.sym(UI_PROXY), null, doc);
      if (!cur) return;                          // no proxy configured — nothing to follow
      const u = new URL(cur.value);
      if (u.port === String(proxyPort)) return;  // already in step
      u.port = String(proxyPort);
      await new Promise((resolve, reject) => s.updater.update(
        [rdf.st(subj, rdf.sym(UI_PROXY), cur, doc)],
        [rdf.st(subj, rdf.sym(UI_PROXY), rdf.literal(u.href), doc)],
        (_u, ok, msg) => (ok ? resolve() : reject(new Error(msg))),
      ));
      document.dispatchEvent(new CustomEvent('sol-form-save', {
        detail: { subject: subj.value, target: docUrl },
      }));
    } catch (e) {
      console.warn('[dk-config-settings] proxy URL sync failed:', e?.message || e);
    }
  }
}

if (!customElements.get('dk-config-settings')) {
  customElements.define('dk-config-settings', DkConfigSettings);
}

export { DkConfigSettings };
