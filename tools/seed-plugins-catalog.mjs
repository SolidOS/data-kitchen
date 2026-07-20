// Seeder for ui-data/data-kitchen-plugins-catalog.ttl — PURE INGESTION, no content lives in
// this script. Every FLAT .ttl file in plugins/ is a manifest describing one
// catalog entry:
//
//   <> a ui:Plugin ; schema:additionalType ui:Component ;
//      schema:url <…/sol-thing.js> ; ui:attribute […]      a mountable plugin
//   <> a ui:Plugin ; schema:additionalType ui:Link ;
//      schema:url <url>                                    an external app
//
// (ONE payload predicate — schema:url — since 2026-07-19; the kind says how
// to read it. The retired ui:name/ui:module/ui:href spellings are not read.)
//
// (Manifests carry NO ui:region since 2026-07-17 — placement is the enclosing
// app's design decision, expressed as a `region` attribute on the MENU item.)
//
// plus ui:label, ui:icon, rdfs:comment (card blurb), dct:creator /
// dct:publisher (byline) and dct:subject literals (topic categories — one
// skos:Collection per distinct value). The catalog is ONE #Available list of
// everything; "in use" means ui-data/data-kitchen-main-menu.ttl mounts it.
//
// Folder manifests (plugins/<id>/manifest.ttl) are a DIFFERENT thing — the
// plugin standard (help, shapes, ☰ contributions) — and are not catalog
// entries.
//
//   node tools/seed-plugins-catalog.mjs      (re-running overwrites)
//   node tools/seed-plugins-catalog.mjs --plugins-dir <dir> --out <file>
//     (variant assembly: read manifests from <dir>, write the catalog to
//      <file> — defaults preserve the classic in-repo behavior)

import { writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rdf } from '../node_modules/sol-components/core/rdf.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const argOf = (flag) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : null;
};
const PLUGINS_DIR = argOf('--plugins-dir') || join(root, 'plugins');
const OUT_FILE = argOf('--out') || join(root, 'ui-data', 'data-kitchen-plugins-catalog.ttl');

const UI_NS = 'http://www.w3.org/ns/ui#';
const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS_NS = 'http://www.w3.org/2000/01/rdf-schema#';
const DCT_NS = 'http://purl.org/dc/terms/';
const SCHEMA_NS = 'http://schema.org/';

function readEntries() {
  const dir = PLUGINS_DIR;
  const entries = [];
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith('.ttl')) continue;
    const path = join(dir, f);
    if (!statSync(path).isFile()) continue;
    const base = 'http://dk.invalid/plugins/' + f;
    const store = rdf.graph();
    try { rdf.parse(readFileSync(path, 'utf8'), store, base, 'text/turtle'); }
    catch (e) { console.warn(`skip ${f}: ${e.message}`); continue; }
    const subj = rdf.sym(base);
    const has = (type) => store.statementsMatching(subj, rdf.sym(RDF_NS + 'type'), rdf.sym(UI_NS + type)).length > 0;
    const ui = (l) => { const n = store.any(subj, rdf.sym(UI_NS + l)); return n ? n.value : ''; };
    const dct = (l) => { const n = store.any(subj, rdf.sym(DCT_NS + l)); return n ? n.value : ''; };
    // Unified ui:Plugin seeds (2026-07-18): kind = schema:additionalType;
    // the payload is ONE schema:url (2026-07-19 — a Component's element tag
    // derives from its filename; the retired trio is not read).
    const addl = (store.any(subj, rdf.sym(SCHEMA_NS + 'additionalType')) || {}).value || '';
    const isLink = has('Plugin') ? addl === UI_NS + 'Link' : has('Link');
    const isComponent = has('Plugin') ? addl === UI_NS + 'Component' : has('Component');
    if (!isLink && !isComponent) continue;
    const payload = (store.any(subj, rdf.sym(SCHEMA_NS + 'url')) || {}).value || '';
    const hrefUrl = isLink ? payload : '';
    const moduleUrl = isComponent ? payload : '';
    if (isLink && !hrefUrl) { console.warn(`skip ${f}: Link kind without schema:url`); continue; }
    if (isComponent && !moduleUrl) { console.warn(`skip ${f}: Component kind without schema:url`); continue; }
    const params = store.each(subj, rdf.sym(UI_NS + 'attribute'), null).map((b) => [
      (store.any(b, rdf.sym(SCHEMA_NS + 'name')) || {}).value || '',
      (store.any(b, rdf.sym(SCHEMA_NS + 'value')) || {}).value || '',
    ]).filter(([k]) => k);
    entries.push({
      kind: isLink ? 'link' : 'component',
      label: ui('label') || f.replace(/\.ttl$/, ''),
      icon: ui('icon'),
      module: moduleUrl,
      href: hrefUrl,
      // ui:region retired from manifests 2026-07-17 — placement is the
      // enclosing app's decision (a `region` attribute on the MENU item),
      // never the plugin's. Not read, not emitted.
      desc: (store.any(subj, rdf.sym(SCHEMA_NS + 'description')) || {}).value
         || (store.any(subj, rdf.sym(RDFS_NS + 'comment')) || {}).value || '',
      publisher: dct('publisher'),
      cats: store.each(subj, rdf.sym(DCT_NS + 'subject'), null).map((n) => n.value),
      // settings pointers (dk-plugin-settings reads these off the ENTRY)
      conformsTo: dct('conformsTo'),
      references: store.each(subj, rdf.sym(DCT_NS + 'references'), null).map((n) => n.value),
      help: (store.any(subj, rdf.sym(SCHEMA_NS + 'softwareHelp')) || {}).value || '',
      params,
      file: f,
    });
  }
  entries.sort((a, b) => a.label.localeCompare(b.label));
  return entries;
}

const ENTRIES = readEntries();

// Built-in host commands seeded as ui:Command entries (decision 6 of the
// plugin-manifest-unification plan — exactly these three; other registry
// keys stay registry-only). No dct:source: there is no manifest file, the
// command lives in the host's sol-command allow-list.
ENTRIES.push(
  { kind: 'command', label: 'Theme',      icon: '🌙', key: 'toggleTheme',
    desc: 'Toggle the light / dark color scheme.', publisher: '', cats: ['UI Controls'], params: [], file: null },
  { kind: 'command', label: 'Text size',  icon: 'A',  key: 'cycleFontSize',
    desc: 'Cycle the interface text size.', publisher: '', cats: ['UI Controls'], params: [], file: null },
  { kind: 'command', label: 'Restart dk', icon: '🔄', key: 'restartApp',
    desc: 'Restart the Data Kitchen app.', publisher: '', cats: ['UI Controls'], params: [], file: null },
  // The ☰'s Customize/Settings pages: ordinary sol-include Component entries
  // (2026-07-18, Jeff — no longer inline furniture). The boolean if-logged-in
  // is the owner gate; `trusted` marks the page as app-authored.
  { kind: 'component', label: 'Customize',
    module: '/node_modules/sol-components/web/sol-include.js',
    desc: 'Choose plugins for your menus and bar.', publisher: '', cats: ['UI Controls'],
    params: [['if-logged-in', ''], ['source', './dk-pod/dk/pages/customize.html'], ['trusted', '']],
    file: null, icon: '' },
  { kind: 'component', label: 'Settings',
    module: '/node_modules/sol-components/web/sol-include.js',
    desc: 'Global Data Kitchen settings.', publisher: '', cats: ['UI Controls'],
    params: [['if-logged-in', ''], ['source', './dk-pod/dk/pages/settings.html'], ['trusted', '']],
    file: null, icon: '' },
);
const frag = (label) => label.replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '');

// ── RECONCILE MODE (plugin-manifest-unification stage 5) ────────────────────
// Once the catalog is the unified working copy (owner-edited ui:Plugin
// entries), the default run must be NON-DESTRUCTIVE: add entries for seeds
// the catalog lacks, rebuild the DERIVED topic collections, REPORT seed↔entry
// drift, and never touch an existing entry. --force keeps the old full
// regeneration (which discards owner edits — the guard below warns).
import { existsSync as _existsSync } from 'node:fs';
const ORIGIN = 'https://data-kitchen.invalid';
const CATDOC = ORIGIN + '/dk-pod/dk/ui-data/data-kitchen-plugins-catalog.ttl';

async function reconcileCatalog() {
  const { serializeMenuDocument } = await import('../node_modules/sol-components/core/menu-serialize.js');
  const UI = UI_NS, DCT = DCT_NS, SCHEMA = SCHEMA_NS;
  const SKOS = 'http://www.w3.org/2004/02/skos/core#';
  const store = rdf.graph();
  rdf.parse(readFileSync(OUT_FILE, 'utf8'), store, CATDOC, 'text/turtle');
  const doc = rdf.sym(CATDOC);
  const typeN = rdf.sym(RDF_NS + 'type');

  const existingSources = new Set();
  const existingFrags = new Set();
  for (const s of store.each(null, typeN, rdf.sym(UI + 'Plugin'))) {
    existingFrags.add(s.value.split('#')[1]);
    const src = store.any(s, rdf.sym(DCT + 'source'));
    if (src) existingSources.add(src.value.split('/').pop());
  }

  const lit = (v) => rdf.literal(String(v));
  let added = 0;
  const drift = [];
  for (const e of ENTRIES) {
    const exists = e.file ? existingSources.has(e.file) : existingFrags.has(frag(e.label));
    if (exists) {
      if (!e.file) continue;                       // builtins: nothing to drift-check
      const subj = [...store.each(null, rdf.sym(DCT + 'source'), null)]
        ? store.statementsMatching(null, rdf.sym(DCT + 'source'), null)
            .find((st) => st.object.value.split('/').pop() === e.file)?.subject : null;
      if (!subj) continue;
      const val = (pred) => store.any(subj, rdf.sym(pred))?.value || '';
      const rel = (v) => (v || '').replace(/^https?:\/\/[^/]+/, '');
      if (e.label && val(UI + 'label') !== e.label) drift.push(`${e.file}: label seed "${e.label}" vs entry "${val(UI + 'label')}"`);
      // ONE payload predicate — schema:url (2026-07-19); the seed side still
      // carries module/href separately, both compare against the entry's url
      if (e.module && rel(val(SCHEMA + 'url')) !== rel(e.module)) drift.push(`${e.file}: module seed "${rel(e.module)}" vs entry url "${rel(val(SCHEMA + 'url'))}"`);
      if (e.href && val(SCHEMA + 'url') !== e.href) drift.push(`${e.file}: href seed "${e.href}" vs entry url "${val(SCHEMA + 'url')}"`);
      if (e.desc && val(SCHEMA + 'description') !== e.desc) drift.push(`${e.file}: description differs`);
      // ADDITIVE fill: settings pointers a seed declares but the entry lacks
      // (adding what is absent never clobbers an owner edit)
      // seeds parse under their own synthetic base — STRIP any origin so
      // the stored fact is origin-independent (root-relative on write)
      const iri = (v) => {
        const path = v.replace(/^https?:\/\/[^/]+/, '');
        return rdf.sym(path.startsWith('/') ? ORIGIN + path : new URL(path, ORIGIN + '/dk-pod/dk/plugins/').href);
      };
      const fill = (pred, v) => {
        if (!v || store.any(subj, rdf.sym(pred))) return;
        store.add(subj, rdf.sym(pred), iri(v), doc);
        added++;
        console.log(`+ ${e.file}: filled ${pred.split(/[#/]/).pop()}`);
      };
      fill(DCT + 'conformsTo', e.conformsTo);
      for (const r of e.references || []) fill(DCT + 'references', r);
      fill(SCHEMA + 'softwareHelp', e.help);
      continue;
    }
    // ADD a new entry from the seed
    const node = rdf.sym(CATDOC + '#' + frag(e.label));
    store.add(node, typeN, rdf.sym(UI + 'Plugin'), doc);
    const kind = e.kind === 'link' ? 'Link' : e.kind === 'command' ? 'Command' : 'Component';
    store.add(node, rdf.sym(SCHEMA + 'additionalType'), rdf.sym(UI + kind), doc);
    store.add(node, rdf.sym(UI + 'label'), lit(e.label), doc);
    if (e.file) store.add(node, rdf.sym(DCT + 'source'), rdf.sym(ORIGIN + '/dk-pod/dk/plugins/' + e.file), doc);
    if (e.icon) store.add(node, rdf.sym(UI + 'icon'), lit(e.icon), doc);
    // ONE payload predicate — schema:url — interpreted by the kind
    // (2026-07-19): Link = the URL to open; Component = the ES module (tag
    // derives from filename); Command = a fragment IRI in the command
    // registry doc (the hyphen-free fragment is the key).
    if (e.kind === 'component') store.add(node, rdf.sym(SCHEMA + 'url'), rdf.sym(ORIGIN + e.module.replace(/^https?:\/\/[^/]+/, '')), doc);
    if (e.kind === 'command') store.add(node, rdf.sym(SCHEMA + 'url'), rdf.sym(ORIGIN + '/dk-pod/dk/ui-data/data-kitchen-commands.ttl#' + e.key), doc);
    if (e.kind === 'link') store.add(node, rdf.sym(SCHEMA + 'url'), rdf.sym(e.href), doc);
    if (e.desc) store.add(node, rdf.sym(SCHEMA + 'description'), lit(e.desc), doc);
    if (e.publisher) store.add(node, rdf.sym(DCT + 'publisher'), lit(e.publisher), doc);
    for (const c of e.cats) store.add(node, rdf.sym(DCT + 'subject'), lit(c), doc);
    for (const [k, v] of e.params) {
      const b = rdf.blankNode();
      store.add(b, rdf.sym(SCHEMA + 'name'), lit(k), doc);
      store.add(b, rdf.sym(SCHEMA + 'value'), lit(v ?? ''), doc);
      store.add(node, rdf.sym(UI + 'attribute'), b, doc);
    }
    // append to #Available — direct membership, ONE triple (the unordered
    // set form: no wrapper, no position)
    store.add(rdf.sym(CATDOC + '#Available'), rdf.sym(SCHEMA + 'itemListElement'), node, doc);
    added++;
    console.log(`+ added entry #${frag(e.label)} (${e.file || 'built-in'})`);
  }

  // Topic collections are a DERIVED index. Membership is the UNION of:
  //   (a) the EXISTING collections (owner-curated membership survives),
  //   (b) the seeds' dct:subject categories (entries carry no subject
  //       triples — the generated catalog only ever expressed topics as
  //       collections; deriving from entries alone WIPES the topics),
  //   (c) any dct:subject an owner added to an entry directly.
  const byCat = new Map();
  const addTo = (cat, iri) => {
    if (!cat || !iri) return;
    if (!byCat.has(cat)) byCat.set(cat, new Set());
    byCat.get(cat).add(iri);
  };
  // (a) existing membership, read BEFORE the collections are removed
  for (const cst of store.statementsMatching(null, rdf.sym(SKOS + 'member'), null)) {
    const label = (store.any(cst.subject, rdf.sym(SKOS + 'prefLabel')) || {}).value;
    addTo(label, cst.object.value);
  }
  // (b) seed categories, matched to entries by dct:source basename
  const entryBySource = new Map();
  for (const st of store.statementsMatching(null, rdf.sym(DCT + 'source'), null)) {
    entryBySource.set(st.object.value.split('/').pop(), st.subject.value);
  }
  for (const e of ENTRIES) {
    if (!e.file) continue;
    const iri = entryBySource.get(e.file);
    for (const c of e.cats) addTo(c, iri);
  }
  // (c) entry-level dct:subject (owner edits)
  for (const s of store.each(null, typeN, rdf.sym(UI + 'Plugin'))) {
    for (const c of store.each(s, rdf.sym(DCT + 'subject'), null)) addTo(c.value, s.value);
  }
  for (const st of [...store.statementsMatching(null, typeN, rdf.sym(SKOS + 'Collection'))]) {
    store.removeMatches(st.subject, null, null);
  }
  for (const [cat, members] of byCat) {
    const cnode = rdf.sym(CATDOC + '#' + frag(cat));
    store.add(cnode, typeN, rdf.sym(SKOS + 'Collection'), doc);
    store.add(cnode, rdf.sym(SKOS + 'prefLabel'), lit(cat), doc);
    for (const m of members) store.add(cnode, rdf.sym(SKOS + 'member'), rdf.sym(m), doc);
  }

  writeFileSync(OUT_FILE, await serializeMenuDocument(store, CATDOC));
  if (drift.length) {
    console.log(`\nDRIFT (seed vs owner entry — NOT applied; reconcile by hand or edit the entry):`);
    for (const d of drift) console.log('  ~ ' + d);
  }
  console.log(`reconciled ${OUT_FILE}: ${added} added, ${drift.length} drift note(s), collections rebuilt`);
}

if (_existsSync(OUT_FILE)
    && readFileSync(OUT_FILE, 'utf8').includes('ui:Plugin')
    && !process.argv.includes('--force')) {
  await reconcileCatalog();
  process.exit(0);
}


// One topic collection per distinct dct:subject value.
const CATS = [...new Set(ENTRIES.flatMap((e) => e.cats))].sort((a, b) => a.localeCompare(b));
const catMembers = (cat) =>
  ENTRIES.filter((e) => e.cats.includes(cat)).map((e) => `<#${frag(e.label)}>`).join(', ');

let ttl = `@prefix ui:     <http://www.w3.org/ns/ui#> .
@prefix rdfs:   <http://www.w3.org/2000/01/rdf-schema#> .
@prefix schema: <http://schema.org/> .
@prefix skos:   <http://www.w3.org/2004/02/skos/core#> .
@prefix dct:    <http://purl.org/dc/terms/> .

# GENERATED from the flat plugins/*.ttl manifests by
# tools/seed-plugins-catalog.mjs — edit a manifest (or use Customize) rather
# than this file; re-seeding overwrites it.

<#Available> a ui:Menu ; ui:label "Plugins Available" ;
  rdfs:comment "Every plugin and app the catalog knows, generated from the flat manifests in plugins/. In use means ui-data/data-kitchen-main-menu.ttl mounts it. Direct membership (an unordered set): adding a plugin is one schema:itemListElement triple." ;
  schema:itemListElement ${ENTRIES.map((e) => `<#${frag(e.label)}>`).join(', ')} .

${CATS.map((c) => `<#${frag(c)}> a skos:Collection ; skos:prefLabel ${JSON.stringify(c)} ;
  skos:member ${catMembers(c)} .`).join('\n\n')}

`;

for (const e of ENTRIES) {
  ttl += `<#${frag(e.label)}> a ui:Plugin ;\n  schema:additionalType ui:${e.kind === 'link' ? 'Link' : e.kind === 'command' ? 'Command' : 'Component'} ;\n  ui:label ${JSON.stringify(e.label)} ;\n`;
  // Provenance: the manifest this entry was generated from (relative to the
  // catalog doc), so Customize's delete can remove the plugin's manifest too.
  // Command entries have no manifest file — the key IS the plugin.
  if (e.file) ttl += `  dct:source <../plugins/${e.file}> ;\n`;
  if (e.icon) ttl += `  ui:icon ${JSON.stringify(e.icon)} ;\n`;
  // ONE payload predicate — schema:url — interpreted by the kind (2026-07-19)
  if (e.kind === 'component') ttl += `  schema:url <${e.module}> ;\n`;
  if (e.kind === 'command') ttl += `  schema:url <data-kitchen-commands.ttl#${e.key}> ;\n`;
  if (e.desc) ttl += `  schema:description ${JSON.stringify(e.desc)} ;\n`;
  if (e.publisher) ttl += `  dct:publisher ${JSON.stringify(e.publisher)} ;\n`;
  if (e.conformsTo) ttl += `  dct:conformsTo <${e.conformsTo}> ;\n`;
  for (const r of e.references || []) ttl += `  dct:references <${r}> ;\n`;
  if (e.help) ttl += `  schema:softwareHelp <${e.help}> ;\n`;
  if (e.kind === 'link') {
    ttl += `  schema:url <${e.href}> .\n\n`;
  } else if (e.params.length) {
    ttl += '  ui:attribute\n' + e.params.map(([k, v]) =>
      `    [ schema:name ${JSON.stringify(k)} ; schema:value ${JSON.stringify(v)} ]`).join(' ,\n') + ' .\n\n';
  } else {
    ttl = ttl.replace(/ ;\n$/, ' .\n') + '\n';
  }
}

// SEED-ONCE GUARD (2026-07-18): once menus reference the catalog, its entries
// carry the DEPLOYMENT's merged config (owner edits) — regenerating from the
// seeds would clobber them. Overwriting an existing unified catalog needs an
// explicit --force; reconcile-style seeding is the planned replacement.
import { existsSync } from 'node:fs';
if (existsSync(OUT_FILE)
    && readFileSync(OUT_FILE, 'utf8').includes('ui:Plugin')
    && !process.argv.includes('--force')) {
  console.error(`${OUT_FILE} is a unified ui:Plugin catalog (may hold owner edits) — rerun with --force to overwrite`);
  process.exit(1);
}
writeFileSync(OUT_FILE, ttl);
const links = ENTRIES.filter((e) => e.kind === 'link').length;
console.log(`wrote ${OUT_FILE}: ${ENTRIES.length - links} plugins + ${links} link apps in ${CATS.length} topics (all from manifests)`);
