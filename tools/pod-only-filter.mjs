// Strip POD-ONLY content from the pulled defaults, so the owner's personal
// entries never ship in the repo seed. Sibling of assemble-variant.mjs's
// filterCatalog — same rdflib approach (never text surgery), different
// direction: this cleans the BASE repo copies right after a pull.
//
// POD-ONLY means:
//   manifests       flat plugins/*.ttl that stay on the pod (google cards)
//   catalogEntries  catalog entries with no repo manifest anchor (Home)
//   menuEntries     main-menu components that only exist on the pod (Home tab)
//   locations       #Locations keeps only same-origin entries (own pod, local
//                   root); absolute URLs are the owner's personal pods
//   theme           ui:colorScheme/ui:fontSize reset to the neutral defaults
//
// Used by pull-defaults.mjs; each strip* function is idempotent.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SC = join(root, 'node_modules', 'sol-components', 'core');

export const POD_ONLY = {
  manifests: new Set([
    'gmail.ttl', 'google-calendar.ttl', 'google-maps.ttl', 'google-messages.ttl',
  ]),
  catalogEntries: ['Home'],
  menuEntries: ['Home', 'Home-2', 'Home-3'],
};

// Deep enough that ../../-style relative IRIs never climb past the root —
// they must survive the parse/serialize round-trip in relative form.
const BASE = 'https://pull.invalid/pod/dk/ui-data/';
const UI = 'http://www.w3.org/ns/ui#';
const SCHEMA = 'http://schema.org/';
const SKOS = 'http://www.w3.org/2004/02/skos/core#';
const DCT = 'http://purl.org/dc/terms/';

async function lib() {
  const { rdf } = await import(join(SC, 'rdf.js'));
  const { serializeMenuDocument } = await import(join(SC, 'menu-serialize.js'));
  return { rdf, serializeMenuDocument };
}

function load(rdf, path, doc) {
  const store = rdf.graph();
  rdf.parse(readFileSync(path, 'utf8'), store, doc, 'text/turtle');
  return store;
}

// Remove a subject's body (incl. additionalProperty/ui:attribute blanks), its
// ListItem wrappers, and every membership reference to it.
function dropEntry(rdf, store, node) {
  for (const p of [UI + 'attribute', SCHEMA + 'additionalProperty']) {
    for (const b of store.each(node, rdf.sym(p), null)) {
      if (b.termType === 'BlankNode') store.removeMatches(b, null, null);
    }
  }
  store.removeMatches(node, null, null);
  store.removeMatches(null, rdf.sym(SKOS + 'member'), node);
  store.removeMatches(null, rdf.sym(SCHEMA + 'itemListElement'), node);
  for (const st of store.statementsMatching(null, rdf.sym(SCHEMA + 'item'), node)) {
    store.removeMatches(null, rdf.sym(SCHEMA + 'itemListElement'), st.subject);
    store.removeMatches(st.subject, null, null);
  }
}

// Catalog: drop named POD-ONLY entries plus every entry whose dct:source
// manifest is not in the repo's plugins/ dir.
export async function stripCatalog(catPath, pluginsDir) {
  if (!existsSync(catPath)) return [];
  const { rdf, serializeMenuDocument } = await lib();
  const doc = BASE + 'data-kitchen-plugins-catalog.ttl';
  const store = load(rdf, catPath, doc);
  const present = new Set(readdirSync(pluginsDir).filter((f) => f.endsWith('.ttl')));
  const gone = new Set(POD_ONLY.catalogEntries.map((n) => doc + '#' + n));
  for (const st of store.statementsMatching(null, rdf.sym(DCT + 'source'), null)) {
    if (!present.has(st.object.value.split('/').pop())) gone.add(st.subject.value);
  }
  const dropped = [...gone].filter((v) => store.any(rdf.sym(v), null, null));
  if (!dropped.length) return [];
  for (const v of dropped) dropEntry(rdf, store, rdf.sym(v));
  writeFileSync(catPath, await serializeMenuDocument(store, doc));
  return dropped.map((v) => v.split('#').pop());
}

// Main menu: drop the named POD-ONLY components and any wrapper that mounts a
// POD-ONLY catalog entry (schema:item → catalog#<entry>).
export async function stripMainMenu(menuPath) {
  if (!existsSync(menuPath)) return [];
  const { rdf, serializeMenuDocument } = await lib();
  const doc = BASE + 'data-kitchen-main-menu.ttl';
  const store = load(rdf, menuPath, doc);
  const catDoc = BASE + 'data-kitchen-plugins-catalog.ttl';
  const targets = [
    ...POD_ONLY.menuEntries.map((n) => doc + '#' + n),
    ...POD_ONLY.catalogEntries.map((n) => catDoc + '#' + n),
  ];
  const dropped = [];
  for (const v of targets) {
    const node = rdf.sym(v);
    const referenced = store.any(node, null, null) || store.any(null, null, node);
    if (!referenced) continue;
    dropEntry(rdf, store, node);
    dropped.push(v.split('#').pop());
  }
  if (dropped.length) writeFileSync(menuPath, await serializeMenuDocument(store, doc));
  return dropped;
}

// Settings: #Locations keeps only same-origin (relative) entries; absolute
// URLs are the owner's personal pods. Theme prefs reset to neutral defaults.
export async function stripSettings(settingsPath) {
  if (!existsSync(settingsPath)) return [];
  const { rdf, serializeMenuDocument } = await lib();
  const doc = BASE + 'data-kitchen-settings.ttl';
  const store = load(rdf, settingsPath, doc);
  const origin = new URL(BASE).origin;
  const sameOrigin = (v) => v === origin || v.startsWith(origin + '/');
  const dropped = [];
  const locations = rdf.sym(doc + '#Locations');
  for (const w of [...store.each(locations, rdf.sym(SCHEMA + 'itemListElement'), null)]) {
    const item = store.any(w, rdf.sym(SCHEMA + 'item'), null);
    if (item && !sameOrigin(item.value)) {
      dropped.push(store.anyValue(w, rdf.sym(SCHEMA + 'name')) || item.value);
      store.removeMatches(locations, rdf.sym(SCHEMA + 'itemListElement'), w);
      store.removeMatches(w, null, null);
    }
  }
  const settings = rdf.sym(doc + '#Settings');
  for (const [pred, neutral] of [
    ['colorScheme', 'SystemColorScheme'], ['fontSize', 'MediumFont'],
  ]) {
    const cur = store.any(settings, rdf.sym(UI + pred), null);
    if (cur && cur.value !== UI + neutral) {
      dropped.push(`${pred}→${neutral}`);
      store.removeMatches(settings, rdf.sym(UI + pred), null);
      store.add(settings, rdf.sym(UI + pred), rdf.sym(UI + neutral), rdf.sym(doc));
    }
  }
  if (dropped.length) writeFileSync(settingsPath, await serializeMenuDocument(store, doc));
  return dropped;
}
