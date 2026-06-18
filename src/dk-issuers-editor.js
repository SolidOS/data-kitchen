// <dk-issuers-editor source="…settings.ttl#Settings"> — edits the sign-in issuer
// list (solid:oidcIssuer) on the given pod subject. Order is preference: the
// FIRST issuer is the default. The "add" dropdown offers a curated set of known
// Solid issuers plus a custom-URL entry. Writes back to the pod over solFetch.
//
// Stored as plain solid:oidcIssuer triples; this editor rewrites the whole set
// in UI order on every change so the serialized order encodes "first = default".

import { rdf } from 'sol-components/core/rdf.js';
import { loadRdfStore } from 'sol-components/core/rdf-utils.js';
import { solFetch } from 'sol-components/core/auth-fetch.js';

const SOLID_OIDC = 'http://www.w3.org/ns/solid/terms#oidcIssuer';
const CURATED = [
  'https://solidcommunity.net',
  'https://solidweb.me',
  'https://solidweb.org',
  'https://login.inrupt.com',
];

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

class DkIssuersEditor extends HTMLElement {
  async connectedCallback() {
    if (this._wired) return;
    this._wired = true;
    this.issuers = [];
    await this.load();
  }

  get source() { return this.getAttribute('source') || ''; }
  docUrl() { return new URL(this.source.split('#')[0], document.baseURI).href; }
  subjectUrl() {
    const [doc, frag] = this.source.split('#');
    return new URL(doc, document.baseURI).href + '#' + (frag || 'Settings');
  }

  async load() {
    try {
      this._store = await loadRdfStore(this.docUrl(), solFetch);
      const subj = rdf.sym(this.subjectUrl());
      this.issuers = this._store.each(subj, rdf.sym(SOLID_OIDC)).map((o) => o.value);
    } catch {
      this.issuers = [];
    }
    this.render();
  }

  async persist() {
    try {
      const docUrl = this.docUrl();
      const store = this._store || await loadRdfStore(docUrl, solFetch);
      const subj = rdf.sym(this.subjectUrl());
      const pred = rdf.sym(SOLID_OIDC);
      const doc = rdf.sym(docUrl);
      store.removeMatches(subj, pred, null);
      for (const url of this.issuers) store.add(subj, pred, rdf.sym(url), doc);
      const body = await new Promise((res, rej) =>
        rdf.serialize(doc, store, docUrl, 'text/turtle', (err, str) => (err ? rej(err) : res(str))));
      const r = await solFetch(docUrl, { method: 'PUT', headers: { 'content-type': 'text/turtle' }, body });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      this.status('Saved.', 'ok');
      // Tell the live shell to re-feed every <sol-login> from the new list.
      document.dispatchEvent(new CustomEvent('dk:issuers-changed'));
    } catch (e) {
      this.status(`Couldn't save issuers: ${e?.message || e}`, 'err');
    }
  }

  status(msg, kind) {
    const el = this.querySelector('[data-status]');
    if (!el) return;
    el.textContent = msg || '';
    el.hidden = !msg;
    el.dataset.kind = kind || '';
  }

  render() {
    const rows = this.issuers.map((url, i) => `
      <div class="dk-issuer-row">
        <span class="dk-issuer-url" title="${esc(url)}">${esc(url)}</span>
        ${i === 0
          ? '<span class="dk-issuer-default">default</span>'
          : `<button type="button" class="dk-issuer-iconbtn" data-act="default" data-i="${i}" title="Make default">★</button>`}
        <button type="button" class="dk-issuer-iconbtn" data-act="remove" data-i="${i}" title="Remove">✕</button>
      </div>`).join('');

    const options = CURATED.map((u) => `<option value="${esc(u)}">${esc(u)}</option>`).join('');

    this.innerHTML = `
      <div class="dk-issuers">
        <span class="dk-settings-field-label">Sign-in issuers <span class="dk-settings-field-hint">(first is the default)</span></span>
        <div class="dk-issuers-list">${rows || '<span class="dk-settings-field-hint">No issuers yet — add one below.</span>'}</div>
        <div class="dk-issuers-add">
          <select data-pick>
            ${options}
            <option value="__custom__">Custom URL…</option>
          </select>
          <input type="url" data-custom placeholder="https://your-issuer.example" hidden>
          <button type="button" class="dk-settings-btn" data-act="add">Add</button>
        </div>
        <p class="dk-settings-status" data-status hidden></p>
      </div>`;

    const pick = this.querySelector('[data-pick]');
    const custom = this.querySelector('[data-custom]');
    pick.addEventListener('change', () => { custom.hidden = pick.value !== '__custom__'; });
    this.querySelector('[data-act="add"]').addEventListener('click', () => this.add(pick, custom));
    for (const btn of this.querySelectorAll('[data-act="remove"]')) {
      btn.addEventListener('click', () => this.remove(Number(btn.dataset.i)));
    }
    for (const btn of this.querySelectorAll('[data-act="default"]')) {
      btn.addEventListener('click', () => this.makeDefault(Number(btn.dataset.i)));
    }
  }

  add(pick, custom) {
    let url = pick.value === '__custom__' ? custom.value.trim() : pick.value;
    if (!url) return;
    try { url = new URL(url).href.replace(/\/$/, ''); } catch { this.status('Not a valid URL.', 'err'); return; }
    if (this.issuers.includes(url)) { this.status('Already in the list.', 'err'); return; }
    this.issuers.push(url);
    this.render();
    this.persist();
  }

  remove(i) {
    this.issuers.splice(i, 1);
    this.render();
    this.persist();
  }

  makeDefault(i) {
    const [u] = this.issuers.splice(i, 1);
    this.issuers.unshift(u);
    this.render();
    this.persist();
  }
}

if (!customElements.get('dk-issuers-editor')) {
  customElements.define('dk-issuers-editor', DkIssuersEditor);
}

export { DkIssuersEditor };
