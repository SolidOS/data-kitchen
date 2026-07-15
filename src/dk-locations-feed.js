// dk-locations-feed — single source of truth for the pod locations list.
//
// Locations come from SETTINGS, never localStorage: the `#Locations`
// schema:ItemList in ui-data/data-kitchen-settings.ttl (entries are
// schema:ListItem nodes — schema:item URL, schema:name label, schema:position
// order — edited on the Settings page via the pod-locations.shacl rolodex).
// This module is the two-way bridge between that document and sc's shared
// in-memory pod registry (core/pod-registry.js), which every pod selector
// (podz Pod Browser <sol-pod>s, the SolidOS Locations dropdown) draws from:
//
//   RDF → registry: on boot the list seeds the registry in schema:position
//   order (silent — no persist echo); every `sol-form-save` on the settings
//   doc re-syncs adds/removes the same way. Dropdowns repaint live.
//
//   registry → RDF: pods that appear at runtime (WebID-profile discovery,
//   pods added in the Pod Browser) arrive as NON-silent registry changes and
//   are appended here as new ListItems with the next position. Removals
//   (stale-root cleanup) delete the matching entry.
//
// Ordering semantics: boot order = schema:position order; runtime additions
// append at the end of both the registry and the RDF list; a reorder in the
// Settings form takes effect in the dropdowns on the next app start (the
// registry keeps insertion order and has no reorder primitive).
//
// Writes go through the SHARED rdf.store and its updater — the same graph and
// PATCH path the mounted settings <sol-form> uses — so the form and this feed
// never diverge, and a feed write can't clobber concurrent #Settings edits
// (statement-level patches, never whole-doc PUT).
import { rdf } from 'sol-components/core/rdf.js';
import { getRegistry } from 'sol-components/core/pod-registry.js';

const SETTINGS = './dk-pod/dk/ui-data/data-kitchen-settings.ttl';

const SCHEMA = 'http://schema.org/';
const ELEM = rdf.sym(`${SCHEMA}itemListElement`);
const ITEM = rdf.sym(`${SCHEMA}item`);
const POS = rdf.sym(`${SCHEMA}position`);
const LIST_ITEM = rdf.sym(`${SCHEMA}ListItem`);
const LABEL = rdf.sym(`${SCHEMA}name`);   // entry label (pod-locations.shacl)
const RDF_TYPE = rdf.sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
const XSD_INT = rdf.sym('http://www.w3.org/2001/XMLSchema#integer');

const docUrl = new URL(SETTINGS, document.baseURI).href;
const doc = rdf.sym(docUrl);
const list = rdf.sym(docUrl + '#Locations');

const registry = getRegistry();          // default group — sol-pod + dk-solidos share it
const rdfPods = new Map();               // normalized url → ListItem subject (NamedNode)
// URLs the user removed (form or registry) this session: a later profile
// discovery may legitimately re-add them to the REGISTRY, but we must not
// resurrect the RDF entry the user just deleted.
const removedThisSession = new Set();
// URLs that were in the RDF list at some point this session (so a form delete
// can be told apart from a never-persisted, session-only discovery).
const removedFromRdf = new Set();
// Writes run strictly one-at-a-time: position = max+1 is computed against the
// store, and a batch's inserts land in the store only when its PATCH succeeds —
// two concurrent appends would mint the same position.
let writeChain = Promise.resolve();
const enqueue = (fn) => { writeChain = writeChain.then(() => new Promise(fn)).catch(() => {}); };

const norm = (u) => {
  if (typeof u !== 'string' || !u.trim()) return null;
  const t = u.trim();
  return t.endsWith('/') ? t : t + '/';
};

function store() {
  const s = rdf.store;
  if (!s.fetcher) s.fetcher = new (rdf.Fetcher)(s);
  if (!s.updater) s.updater = new (rdf.UpdateManager)(s);
  return s;
}

// Read the #Locations entries from the shared store, position-sorted.
// Rebuilds rdfPods and returns the ordered URL list.
function readList() {
  const s = store();
  rdfPods.clear();
  const entries = [];
  for (const subj of s.each(list, ELEM, null, doc)) {
    const item = s.any(subj, ITEM, null, doc);
    const url = item && norm(item.value);
    if (!url) continue;
    const n = parseInt(s.anyValue(subj, POS, null, doc), 10);
    entries.push({ subj, url, pos: Number.isFinite(n) ? n : Infinity });
  }
  entries.sort((a, b) => a.pos - b.pos);
  for (const e of entries) if (!rdfPods.has(e.url)) rdfPods.set(e.url, e.subj);
  return [...rdfPods.keys()];
}

function maxPosition() {
  const s = store();
  let max = 0;
  for (const subj of s.each(list, ELEM, null, doc)) {
    const n = parseInt(s.anyValue(subj, POS, null, doc), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

// Mint a doc-unique #locN fragment for a new entry.
function mintSubject() {
  const s = store();
  let n = 1;
  while (s.statementsMatching(rdf.sym(`${docUrl}#loc${n}`), null, null, doc).length) n++;
  return rdf.sym(`${docUrl}#loc${n}`);
}

// Default label for an auto-persisted pod: host (+ path when not just "/").
function labelFor(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, '');
    return u.host + path;
  } catch (_) { return url; }
}

// Append one ListItem for a runtime-discovered pod. One batch: membership +
// type + item + title + position. Enqueued (see writeChain).
function appendEntry(url) {
  enqueue((done) => {
    if (rdfPods.has(url) || removedThisSession.has(url)) return done();
    const s = store();
    const subj = mintSubject();
    const inserts = [
      rdf.st(list, ELEM, subj, doc),
      rdf.st(subj, RDF_TYPE, LIST_ITEM, doc),
      rdf.st(subj, ITEM, rdf.sym(url), doc),
      rdf.st(subj, LABEL, rdf.literal(labelFor(url)), doc),
      rdf.st(subj, POS, rdf.literal(String(maxPosition() + 1), XSD_INT), doc),
    ];
    s.updater.update([], inserts, (_u, ok, msg) => {
      if (ok) { rdfPods.set(url, subj); removedFromRdf.add(url); }
      else console.warn('[dk-locations-feed] append failed for', url, msg);
      done();
    });
  });
}

// Delete a ListItem entry (its own triples + the membership triple). Enqueued.
function deleteEntry(url) {
  enqueue((done) => {
    const s = store();
    const subj = rdfPods.get(url);
    if (!subj) return done();
    const dels = [
      ...s.statementsMatching(subj, null, null, doc),
      ...s.statementsMatching(null, null, subj, doc),
    ];
    s.updater.update(dels, [], (_u, ok, msg) => {
      if (ok) rdfPods.delete(url);
      else console.warn('[dk-locations-feed] remove failed for', url, msg);
      done();
    });
  });
}

// RDF → registry: reconcile the registry with the current RDF list (silent so
// onRegistryChange ignores the echo; dropdowns still repaint on change).
function syncToRegistry() {
  const inRegistry = new Set(registry.list());
  const inRdf = readList();
  const added = inRdf.filter((u) => !inRegistry.has(u));
  const rdfSet = new Set(inRdf);
  // Only remove registry URLs the RDF list ever knew about — session-only
  // discoveries that were deliberately NOT persisted stay in the dropdowns.
  const removed = [...inRegistry].filter((u) => !rdfSet.has(u) && removedFromRdf.has(u));
  if (added.length) registry.addAll(added, { silent: true });
  if (removed.length) { removed.forEach((u) => removedThisSession.add(u)); registry.removeAll(removed, { silent: true }); }
}

// registry → RDF: persist non-silent additions; drop non-silent removals.
function onRegistryChange(snapshot, silent) {
  if (silent) return;
  for (const url of snapshot) {
    if (!rdfPods.has(url) && !removedThisSession.has(url)) appendEntry(url);
  }
  for (const url of [...rdfPods.keys()]) {
    if (!snapshot.includes(url)) { removedThisSession.add(url); deleteEntry(url); }
  }
}

// Diagnostic access WITHOUT a window global (2026-07-14): the registry is
// bundle-internal (a console import() gets a second instance), so probes
// dispatch 'dk-diag-pod-registry' with a detail object and read the
// registry off it:  const d = {}; document.dispatchEvent(
//   new CustomEvent('dk-diag-pod-registry', { detail: d })); d.registry
document.addEventListener('dk-diag-pod-registry', (e) => {
  if (e.detail) e.detail.registry = registry;
});

try {
  await rdf.load(docUrl);
  const ordered = readList();
  ordered.forEach((u) => removedFromRdf.add(u));
  if (ordered.length) registry.addAll(ordered, { silent: true });
  registry.subscribe(onRegistryChange);
  document.addEventListener('sol-form-save', (e) => {
    if (e.detail?.target !== docUrl) return;   // #Settings + issuer saves share the doc — harmless, but skip
    readList().forEach((u) => removedFromRdf.add(u));
    syncToRegistry();
  });
} catch (err) {
  // A failed local read must not wedge shell boot — the registry then fills
  // from discovery alone, exactly like the pre-RDF behavior.
  console.warn('[dk-locations-feed] could not load the locations list:', err?.message || err);
  try { registry.subscribe(onRegistryChange); } catch (_) { /* still persist future finds */ }
}
