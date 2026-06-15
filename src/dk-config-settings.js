// <dk-config-settings> — the Electron + Pivot group of the settings page.
//
// The config (window geometry, server ports, pod root) is the pod resource
// dk-pod/dk/data/electron-config.ttl — the SOURCE OF TRUTH the user can browse.
// The main process publishes it on boot and keeps it current; userData is just a
// launch-time cache that trails it (see electron-config/main.cjs). This component
// mounts a real shape-driven <sol-form> directly on that pod resource (CSS
// handles GET/PATCH), so the fields match every other setting; on each save it
// reads the resource back as RDF and pushes the numbers to userData via the IPC
// saveConfig (so they survive the next launch and the window applies live). It
// never overwrites the resource on open — only seeds it if absent. Pod root
// stays read-only with a "Move my pod" button (a path edit wouldn't move the
// data). Outside Electron we show a short notice.

import { rdf } from 'sol-components/core/rdf.js';
import { loadRdfStore } from 'sol-components/core/rdf-utils.js';
import { solFetch } from 'sol-components/core/auth-fetch.js';

const UI = 'http://www.w3.org/ns/ui#';
const SCHEMA = 'http://schema.org/';
const MIRROR = './dk-pod/dk/data/electron-config.ttl';
const SHAPE  = './dk-pod/dk/shapes/electron-config.shacl';
const CONFIG_FILE_TYPE = 'urn:swc:shape:electron-config:ElectronConfigFile';

// form field key → predicate IRI (the editable numbers; pod root is not here)
const FIELD_PREDS = {
  publicPort:  UI + 'publicPort',
  proxyPort:   UI + 'proxyPort',
  privatePort: UI + 'privatePort',
  width:       SCHEMA + 'width',
  height:      SCHEMA + 'height',
  windowX:     UI + 'windowX',
  windowY:     UI + 'windowY',
};

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

class DkConfigSettings extends HTMLElement {
  async connectedCallback() {
    if (this._rendered) return;
    this._rendered = true;
    const dk = (typeof window !== 'undefined') ? window.dkElectron : null;
    if (!dk || typeof dk.getConfig !== 'function') {
      this.innerHTML =
        `<section class="dk-settings-group"><h3>Electron &amp; Pivot</h3>` +
        `<p class="dk-settings-hint">Window size, position, server ports and the pod root are part of the ` +
        `desktop app — open Data Kitchen as the Electron app to edit them.</p></section>`;
      return;
    }
    try {
      const { config, effective } = await dk.getConfig();
      this._effective = effective || {};
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
    const root = this._effective.root || '';
    this.innerHTML = `
      <section class="dk-settings-group">
        <h3>Electron &amp; Pivot</h3>
        <sol-form
            data-settings-skip
            subject="${esc(this.subjectUrl())}"
            save-to="${esc(this.subjectUrl())}"
            shape="${esc(new URL(SHAPE, document.baseURI).href)}"></sol-form>
        <div class="dk-settings-field dk-settings-root">
          <span class="dk-settings-field-label">Root <span class="dk-settings-field-hint">(pod home — changing it moves your pod)</span></span>
          <span class="dk-settings-root-row">
            <span class="dk-settings-root-path" title="${esc(root)}">${esc(root) || '—'}</span>
            <button type="button" class="dk-settings-btn" data-act="move">Move my pod…</button>
          </span>
        </div>
        <p class="dk-settings-status" data-status hidden></p>
        <div class="dk-settings-actions" data-reload hidden>
          <span class="dk-settings-field-hint">Server ports changed — restart to apply.</span>
          <button type="button" class="dk-settings-btn dk-settings-btn-primary" data-act="reload">Reload now</button>
        </div>
      </section>`;
  }

  wire() {
    this.querySelector('sol-form')?.addEventListener('sol-form-save', () => this.syncBack());
    this.querySelector('[data-act="move"]')?.addEventListener('click', () => this.movePod());
    this.querySelector('[data-act="reload"]')?.addEventListener('click', () => window.dkElectron.restart());
  }

  status(msg, kind) {
    const el = this.querySelector('[data-status]');
    if (!el) return;
    el.textContent = msg || '';
    el.hidden = !msg;
    el.dataset.kind = kind || '';
  }

  // Read the freshly-edited mirror as RDF and push the numbers to userData.
  async syncBack() {
    try {
      const store = await loadRdfStore(this.mirrorUrl(), solFetch);
      const subj = rdf.sym(this.subjectUrl());
      const vals = {};
      for (const [k, pred] of Object.entries(FIELD_PREDS)) {
        const o = store.any(subj, rdf.sym(pred));
        if (o) { const n = parseInt(o.value, 10); if (Number.isFinite(n)) vals[k] = n; }
      }
      const r = await window.dkElectron.saveConfig(vals);
      if (r?.status === 'saved') {
        this.status('Saved.', 'ok');
        const banner = this.querySelector('[data-reload]');
        if (banner) banner.hidden = !r.portsChanged;
      } else {
        this.status(`Couldn't save: ${r?.message || 'unknown error'}`, 'err');
      }
    } catch (e) {
      this.status(`Couldn't save: ${e?.message || e}`, 'err');
    }
  }

  async movePod() {
    this.status('Choose a new home folder…');
    try {
      const r = await window.dkElectron.moveMyPod();
      if (r?.status === 'moved') this.status('Pod moved — restarting…');
      else if (r?.status === 'cancelled') this.status('');
      else if (r?.status === 'same') this.status('That is already the pod root.', 'err');
      else if (r?.status === 'nested') this.status("Can't move the pod inside itself.", 'err');
      else this.status(`Move failed: ${r?.message || 'unknown error'}`, 'err');
    } catch (e) {
      this.status(`Move failed: ${e?.message || e}`, 'err');
    }
  }
}

if (!customElements.get('dk-config-settings')) {
  customElements.define('dk-config-settings', DkConfigSettings);
}

export { DkConfigSettings };
