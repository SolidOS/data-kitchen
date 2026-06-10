// <omp-images> — the Images panel shell, laid out like the music/movies
// <ia-player>: a Favourites column on the left, a three-column Miller browser
// (Library → Topic → Collection) across the top-right, and the masonry image
// gallery filling the bottom-right.
//
//   ┌───────────┬──────────────────────────────────┐
//   │ ★ Favour. │ Library │  Topic   │  Collection  │   3 cols, top-right
//   │ (collec-  │ (Art /  │ (under   │ (under Topic;│
//   │  tions)   │  Life)  │  Library)│  ★ to fav)   │
//   │           ├──────────────────────────────────┤
//   │           │        <sol-gallery> (masonry)    │   bottom-right
//   └───────────┴──────────────────────────────────┘
//
// omp owns the LOCAL concerns the display-only <sol-gallery> shed: it reads the
// curated SKOS/DCAT file (images.ttl), renders the selectors + owner-only add
// controls, and on a collection click pumps the Commons fetcher's image pages
// into the gallery (clear → add → end). Topics/genres are local by design.
//
// Favourites (collections) persist in localStorage this pass — works signed-out
// and signed-in alike; owner→RDF (PATCH) sync is a follow-up, as is favouriting
// individual images (which must mint nodes since images stream live).

import { rdf } from 'sol-components/core/rdf.js';
import { NS } from 'sol-components/web/utils/contract.js';
import { loadCategory } from './sources/commons.js';
// <sol-gallery> is registered by component-interop (see index.html); used as a tag here.
import { star } from '../../src/shared/omp-favourites-ui.js';
import { listFavourites, removeFavouriteFile } from '../../src/shared/omp-favourites-store.js';

import CSS from './omp-images.css';

class OmpImages extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._loaded = false;
    this._favColls = [];              // communal favourites that are image collections
    this._favLandings = new Set();    // their landingPages — for the ☆/★ row state
  }

  connectedCallback() {
    if (this._built) return;
    this._built = true;
    this.source = this.getAttribute('source') || '';

    const style = document.createElement('style');
    style.textContent = CSS;

    // left: Favourites column
    this._favPane = this._pane('Community Favorites', 'fav-col');

    // right: browser (3 columns) over the gallery
    const right = document.createElement('div');
    right.className = 'right';
    const browser = document.createElement('div');
    browser.className = 'browser';
    this._libPane = this._pane('Library');
    this._topicPane = this._pane('Topic');
    this._collPane = this._pane('Collection');
    browser.append(this._libPane.pane, this._topicPane.pane, this._collPane.pane);

    this._gallery = document.createElement('sol-gallery');
    this._gallery.addEventListener('load-more', () => this._pump && this._pump());
    right.append(browser, this._gallery);

    this.shadowRoot.append(style, this._favPane.pane, right);

    this._buildAddControls();
    this._syncOwner();
    this._onGating = () => this._syncOwner();
    document.addEventListener('omp:reapply-gating', this._onGating);
    // A star anywhere (incl. this tab) → refresh the communal favourites column.
    this._onFav = () => this._loadCommunalFavs();
    document.addEventListener('omp:favourited', this._onFav);

    this._renderFavourites();
    this._loadCommunalFavs();
  }

  disconnectedCallback() {
    document.removeEventListener('omp:reapply-gating', this._onGating);
    document.removeEventListener('omp:favourited', this._onFav);
  }

  _pane(label, extraClass) {
    const pane = document.createElement('div');
    pane.className = 'pane' + (extraClass ? ' ' + extraClass : '');
    const head = document.createElement('div');
    head.className = 'pane-head';
    head.textContent = label;
    const list = document.createElement('ul');
    list.className = 'list';
    pane.append(head, list);
    return { pane, list };
  }

  /* ── shell API ────────────────────────────────────────────────────────── */

  ensureLoaded() {
    if (this._loaded || this._loading) return;
    this._load().catch((e) => console.warn('[omp-images] load failed:', e.message));
  }

  async reload() { this._loaded = false; return this._load(); }

  /* ── load + read model ────────────────────────────────────────────────── */

  async _load() {
    this._loading = true;
    try {
      const docUrl = this._docUrl();
      const resp = await fetch(docUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${docUrl}`);
      const store = rdf.graph();
      rdf.parse(await resp.text(), store, docUrl, 'text/turtle');
      this._readModel(store);
      this._renderLibraries();
      this._renderFavourites();
      this._restoreSelection();
      this._loaded = true;
    } finally {
      this._loading = false;
    }
  }

  // Three local tiers: Library = skos:topConceptOf the scheme; Topic =
  // skos:broader → a Library; Collection = dcat:theme → a Topic.
  _readModel(store) {
    const a = rdf.sym(NS.rdf + 'type');
    const pref = (n) => store.any(n, rdf.sym(NS.skos + 'prefLabel'))?.value || n.value;
    const scheme = rdf.sym(this._schemeIri());

    this._libraries = store.each(undefined, rdf.sym(NS.skos + 'topConceptOf'), scheme)
      .map((t) => ({ iri: t.value, label: this._libLabel(pref(t)) }))
      .sort((x, y) => x.label.localeCompare(y.label));

    this._topicsByLib = new Map();
    this._topicByIri = new Map();
    this._topicLib = new Map();
    for (const lib of this._libraries) {
      const kids = store.each(undefined, rdf.sym(NS.skos + 'broader'), rdf.sym(lib.iri))
        .map((c) => ({ iri: c.value, label: pref(c) }))
        .sort((x, y) => x.label.localeCompare(y.label));
      this._topicsByLib.set(lib.iri, kids);
      for (const t of kids) { this._topicByIri.set(t.iri, t); this._topicLib.set(t.iri, lib.iri); }
    }

    this._collsByTopic = new Map();
    this._collByIri = new Map();
    for (const d of store.each(undefined, a, rdf.sym(NS.dcat + 'Dataset'))) {
      const theme = store.any(d, rdf.sym(NS.dcat + 'theme'))?.value;
      if (!theme) continue;
      const rec = {
        iri: d.value,
        title: store.any(d, rdf.sym(NS.dct + 'title'))?.value || '(untitled)',
        landingPage: store.any(d, rdf.sym(NS.dcat + 'landingPage'))?.value || '',
        theme,
      };
      if (!this._collsByTopic.has(theme)) this._collsByTopic.set(theme, []);
      this._collsByTopic.get(theme).push(rec);
      this._collByIri.set(d.value, rec);
    }
    for (const list of this._collsByTopic.values()) list.sort((x, y) => x.title.localeCompare(y.title));
  }

  _libLabel(s) { return s.replace(/^Images\s*-\s*/i, '').trim() || s; }

  /* ── Library column ───────────────────────────────────────────────────── */

  _renderLibraries() {
    this._libPane.list.replaceChildren();
    this._libBtns = new Map();
    for (const lib of this._libraries) {
      const b = this._row(this._libPane.list, 'lib', lib.label);
      b.addEventListener('click', () => this._selectLibrary(lib));
      this._libBtns.set(lib.iri, b);
    }
    if (!this._libraries.length) this._hint(this._libPane.list, 'No libraries');
  }

  _selectLibrary(lib) {
    this._activeLibrary = lib;
    this._mark(this._libBtns, this._libBtns.get(lib.iri));
    this._renderTopics(lib);
    // reset downstream
    this._activeTopic = null;
    this._collPane.list.replaceChildren();
    this._hint(this._collPane.list, 'Select a topic');
    this._addCollBtn.disabled = true;
    this._addTopicBtn.disabled = false;
  }

  /* ── Topic column ─────────────────────────────────────────────────────── */

  _renderTopics(lib) {
    this._topicPane.list.replaceChildren();
    this._topicBtns = new Map();
    const topics = this._topicsByLib.get(lib.iri) || [];
    for (const t of topics) {
      const b = this._row(this._topicPane.list, 'topic', t.label);
      b.addEventListener('click', () => this._selectTopic(t));
      this._topicBtns.set(t.iri, b);
    }
    if (!topics.length) this._hint(this._topicPane.list, 'No topics in this library yet');
  }

  _selectTopic(topic) {
    this._activeTopic = topic;
    this._mark(this._topicBtns, this._topicBtns.get(topic.iri));
    this._renderColls(topic);
    this._addCollBtn.disabled = false;
  }

  /* ── Collection column (with ★) ───────────────────────────────────────── */

  _renderColls(topic) {
    this._collPane.list.replaceChildren();
    this._collBtns = new Map();
    this._starByIri = new Map();
    const colls = this._collsByTopic.get(topic.iri) || [];
    for (const c of colls) {
      const li = document.createElement('li');
      li.className = 'has-star';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'row coll';
      b.textContent = c.title;
      b.addEventListener('click', () => this._openCollection(c));
      const star = this._starButton(c);
      li.append(b, star);
      this._collPane.list.appendChild(li);
      this._collBtns.set(c.iri, b);
    }
    if (!colls.length) this._hint(this._collPane.list, 'No collections in this topic yet');
    if (this._activeCollIri && this._collBtns.has(this._activeCollIri)) {
      this._collBtns.get(this._activeCollIri).classList.add('selected');
    }
  }

  _starButton(coll) {
    const on = this._favLandings.has(coll.landingPage);
    const star = document.createElement('button');
    star.type = 'button';
    star.className = 'star' + (on ? ' on' : '');
    star.textContent = on ? '★' : '☆';
    star.title = 'Add to the communal favourites';
    star.setAttribute('aria-label', 'Favourite');
    star.addEventListener('click', (e) => { e.stopPropagation(); this._favourite(coll); });
    this._starByIri.set(coll.iri, star);
    return star;
  }

  /* ── Favourites column — the communal image-collection favourites ───────── */

  /** Read the communal wall, keep the image-collection favourites, render. */
  async _loadCommunalFavs() {
    try {
      const all = await listFavourites();
      this._favColls = all.filter((g) => g.bucket === 'Collection' || g.schemaType === 'ImageGallery');
      this._favLandings = new Set(this._favColls.map((g) => g.link || g.item));
    } catch { this._favColls = []; this._favLandings = new Set(); }
    this._renderFavourites();
    this._refreshStars();
  }

  /** Update the ☆/★ state of any visible collection rows. */
  _refreshStars() {
    for (const [iri, btn] of (this._starByIri || new Map())) {
      const rec = this._collByIri?.get(iri);
      const on = rec && this._favLandings.has(rec.landingPage);
      btn.classList.toggle('on', !!on);
      btn.textContent = on ? '★' : '☆';
    }
  }

  _renderFavourites() {
    const list = this._favPane.list;
    list.replaceChildren();
    const favs = [...this._favColls].sort((a, b) => a.canonicalTitle.localeCompare(b.canonicalTitle));
    if (!favs.length) {
      this._hint(list, 'Star a collection — it joins the ★ Favourites wall');
      return;
    }
    for (const g of favs) {
      const li = document.createElement('li');
      li.className = 'has-star';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'row fav-link';
      b.textContent = g.canonicalTitle + (g.count > 1 ? `  ·  ★${g.count}` : '');
      b.title = `Favourited by ${g.contributors.map((c) => c.name).join(', ')}`;
      b.addEventListener('click', () => this.openByRef(g.link || g.item));
      li.append(b, this._favDeleteButton(g));
      list.appendChild(li);
    }
  }

  /** Owner-only ✕ that removes a favourite (all its files) from the wall. */
  _favDeleteButton(g) {
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'fav-x';
    x.textContent = '✕';
    x.title = 'Remove from the communal favourites';
    x.setAttribute('aria-label', 'Remove favourite');
    x.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Remove “${g.canonicalTitle}” from the communal favourites?`)) return;
      for (const c of (g.contributors || [])) {
        if (c.file) { try { await removeFavouriteFile(c.file); } catch (err) { console.warn('[fav delete]', err.message); } }
      }
      // Tell every open view (both players + this tab) to re-read the wall.
      document.dispatchEvent(new CustomEvent('omp:favourited'));
    });
    return x;
  }

  /** Toggle a collection's favourite. ☆ appends to the wall; a lit ★ removes
   *  it (owner moderation — the server rejects an unauthorised delete). */
  async _favourite(coll) {
    if (this._favLandings.has(coll.landingPage)) {
      const rec = this._favColls.find((g) => (g.link || g.item) === coll.landingPage);
      for (const c of (rec?.contributors || [])) {
        if (c.file) { try { await removeFavouriteFile(c.file); } catch (e) { console.warn('[fav delete]', e.message); } }
      }
      document.dispatchEvent(new CustomEvent('omp:favourited'));
      return;
    }
    const saved = await star({
      item: coll.landingPage, bucket: 'Collection', schemaType: 'ImageGallery',
      name: coll.title, link: coll.landingPage, download: false,
    });
    if (saved) this._loadCommunalFavs();
  }

  /** Open a collection by its Commons-category URL (used by the favourites wall). */
  openByRef(landingPage) {
    for (const rec of (this._collByIri?.values() || [])) {
      if (rec.landingPage === landingPage) { this._jumpToCollection(rec.iri); return; }
    }
  }

  /** Click a favourite → drill the browser to it (library → topic → open). */
  _jumpToCollection(iri) {
    const rec = this._collByIri?.get(iri);
    if (!rec) return;
    const libIri = this._topicLib.get(rec.theme);
    const lib = this._libraries.find((l) => l.iri === libIri);
    const topic = this._topicByIri.get(rec.theme);
    if (lib) this._selectLibrary(lib);
    if (topic) this._selectTopic(topic);
    this._openCollection(rec);
    requestAnimationFrame(() => {
      this._libBtns.get(libIri)?.scrollIntoView({ block: 'nearest' });
      this._topicBtns.get(rec.theme)?.scrollIntoView({ block: 'nearest' });
      this._collBtns.get(iri)?.scrollIntoView({ block: 'nearest' });
    });
  }

  /* ── open a collection → pump the gallery ─────────────────────────────── */

  _openCollection(coll) {
    this._activeCollIri = coll.iri;
    if (this._collBtns) this._mark(this._collBtns, this._collBtns.get(coll.iri));
    try { localStorage.setItem(this._selKey(), coll.landingPage); } catch {}

    const ref = coll.landingPage;
    if (!ref) { this._gallery.clear(); this._gallery.end(); return; }

    this._abort?.abort();
    this._abort = new AbortController();
    const signal = this._abort.signal;
    this._gallery.clear();

    const iter = loadCategory(ref, { signal })[Symbol.asyncIterator]();
    let done = false, inflight = false;
    this._pump = async () => {
      if (done || inflight) return;
      inflight = true;
      try {
        const { value, done: d } = await iter.next();
        if (signal.aborted) return;
        if (d) { done = true; this._gallery.end(); return; }
        this._gallery.add(value);
      } catch (e) {
        done = true;
        if (e.name !== 'AbortError') { this._gallery.end(); console.warn('[omp-images]', e.message); }
      } finally {
        inflight = false;
      }
    };
    this._pump();
  }

  _restoreSelection() {
    let remembered = null;
    try { remembered = localStorage.getItem(this._selKey()); } catch {}
    if (!remembered) return;
    for (const rec of this._collByIri.values()) {
      if (rec.landingPage === remembered) { this._jumpToCollection(rec.iri); return; }
    }
  }

  /* ── shared row helpers ───────────────────────────────────────────────── */

  _row(list, cls, label) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `row ${cls}`;
    b.textContent = label;
    li.appendChild(b);
    list.appendChild(li);
    return b;
  }

  _hint(list, text) {
    if (!text) { list.replaceChildren(); return; }
    const li = document.createElement('li');
    li.className = 'hint';
    li.textContent = text;
    list.replaceChildren(li);
  }

  /** Highlight `btn` within a Map of buttons (clears the others). */
  _mark(btns, btn) {
    for (const b of btns.values()) {
      const on = b === btn;
      b.classList.toggle('selected', on);
      if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    }
  }

  /* ── owner-only add controls ──────────────────────────────────────────── */

  _buildAddControls() {
    const ta = document.createElement('div');
    ta.className = 'add';
    this._addTopicBtn = this._mkAddBtn('+ Add topic', () => this._openAddTopic(ta));
    this._addTopicBtn.disabled = true;            // needs a library selected
    ta.appendChild(this._addTopicBtn);
    this._topicPane.pane.appendChild(ta);

    const ca = document.createElement('div');
    ca.className = 'add';
    this._addCollBtn = this._mkAddBtn('+ Add collection', () => this._openAddCollection(ca));
    this._addCollBtn.disabled = true;             // needs a topic selected
    ca.appendChild(this._addCollBtn);
    this._collPane.pane.appendChild(ca);
  }

  _mkAddBtn(label, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'add-btn';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  _openAddTopic(container) {
    if (!this._activeLibrary) return;
    this._addTopicBtn.style.display = 'none';
    const { form, inputs, ok, err, reset } = this._addForm(container, [{ ph: 'Topic name' }], this._addTopicBtn);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const label = inputs[0].value.trim();
      if (!label) return;
      ok.disabled = true; err.textContent = '';
      try {
        await this._addTopic(label, this._activeLibrary.iri);
        const keepLib = this._activeLibrary.iri;
        reset();
        await this.reload();
        const lib = this._libraries.find((l) => l.iri === keepLib);
        if (lib) this._selectLibrary(lib);
      } catch (ex) { err.textContent = ex.message; ok.disabled = false; }
    });
  }

  _openAddCollection(container) {
    if (!this._activeTopic) return;
    this._addCollBtn.style.display = 'none';
    const { form, inputs, ok, err, reset } = this._addForm(container, [
      { ph: 'Collection title' },
      { ph: 'Commons category URL', value: 'https://commons.wikimedia.org/wiki/Category:' },
    ], this._addCollBtn);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const t = inputs[0].value.trim(), c = inputs[1].value.trim();
      if (!t || !c) return;
      ok.disabled = true; err.textContent = '';
      try {
        await this._addCollection(t, c, this._activeTopic.iri);
        const keepTopic = this._activeTopic.iri, keepLib = this._activeLibrary.iri;
        reset();
        await this.reload();
        const lib = this._libraries.find((l) => l.iri === keepLib);
        if (lib) this._selectLibrary(lib);
        const topic = this._topicByIri.get(keepTopic);
        if (topic) this._selectTopic(topic);
      } catch (ex) { err.textContent = ex.message; ok.disabled = false; }
    });
  }

  /** Build an inline add-form (inputs + Add/Cancel) and return its parts. */
  _addForm(container, fields, addBtn) {
    const form = document.createElement('form');
    form.className = 'add-form';
    const inputs = fields.map((f) => {
      const i = document.createElement('input');
      i.placeholder = f.ph; i.required = true;
      if (f.value) i.value = f.value;
      form.appendChild(i);
      return i;
    });
    const row = document.createElement('div'); row.className = 'add-row';
    const ok = document.createElement('button'); ok.type = 'submit'; ok.className = 'primary'; ok.textContent = 'Add';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
    const err = document.createElement('div'); err.className = 'add-err';
    row.append(ok, cancel);
    form.append(row, err);
    container.appendChild(form);
    inputs[0].focus();
    const reset = () => { form.remove(); addBtn.style.display = ''; };
    cancel.addEventListener('click', reset);
    return { form, inputs, ok, err, reset };
  }

  /* ── writes (raw sparql-update PATCH against the served file) ──────────── */

  async _addTopic(label, libraryIri) {
    const iri = this._mintIri(label);
    await this._patch(
      `<${iri}> a skos:Concept, schema:DefinedTerm ; ` +
      `skos:prefLabel ${JSON.stringify(label)} ; ` +
      `skos:broader <${libraryIri}> .`);
  }

  async _addCollection(title, categoryUrl, themeIri) {
    const iri = this._mintIri(title, 'coll');
    await this._patch(
      `<${iri}> a <${NS.dcat}Dataset>, <${NS.schema}ImageGallery> ; ` +
      `dct:title ${JSON.stringify(title)} ; ` +
      `dcat:landingPage <${categoryUrl}> ; ` +
      `dcat:theme <${themeIri}> .`);
  }

  async _patch(insertTriples) {
    const body =
      `PREFIX skos: <${NS.skos}>\nPREFIX schema: <${NS.schema}>\n` +
      `PREFIX dct: <${NS.dct}>\nPREFIX dcat: <${NS.dcat}>\n` +
      `INSERT DATA {\n${insertTriples}\n}\n`;
    const resp = await fetch(this._docUrl(), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/sparql-update' },
      body,
    });
    if (!resp.ok) throw new Error(`Save failed (HTTP ${resp.status}). The file must be on a Solid pod you own.`);
  }

  /* ── helpers ──────────────────────────────────────────────────────────── */

  _docUrl() { return new URL(this.source, document.baseURI).href.split('#')[0]; }
  _schemeIri() {
    const frag = (this.source.split('#')[1]) || 'Images';
    return `${this._docUrl()}#${frag}`;
  }
  _selKey() { return `omp-images:collection:${this.source}`; }

  _mintIri(label, prefix) {
    const base = (prefix ? prefix + '-' : '') +
      label.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
    let frag = base || 'item';
    const docUrl = this._docUrl();
    const exists = (f) =>
      this._topicByIri.has(`${docUrl}#${f}`) ||
      this._libraries.some((l) => l.iri === `${docUrl}#${f}`) ||
      this._collByIri.has(`${docUrl}#${f}`);
    let n = 2;
    while (exists(frag)) frag = `${base}_${n++}`;
    return `${docUrl}#${frag}`;
  }

  _syncOwner() {
    const owner = !!document.querySelector('sol-default')?.hasAttribute('solid-kitchen')
               || !!document.querySelector('sol-login')?.isLoggedIn;
    this.classList.toggle('owner', owner);
  }
}

if (!customElements.get('omp-images')) customElements.define('omp-images', OmpImages);

export { OmpImages };
