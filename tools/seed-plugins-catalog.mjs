// Seeder for ui-data/data-kitchen-plugins-catalog.ttl — PURE INGESTION, no content lives in
// this script. Every FLAT .ttl file in plugins/ is a manifest describing one
// catalog entry:
//
//   <> a ui:Component ; ui:name "tag" ; ui:attribute […]   a mountable plugin
//   <> a ui:Link ; ui:href <url> ; ui:region ui:Tab        an external app
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

import { writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rdf } from '../node_modules/sol-components/core/rdf.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const UI_NS = 'http://www.w3.org/ns/ui#';
const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS_NS = 'http://www.w3.org/2000/01/rdf-schema#';
const DCT_NS = 'http://purl.org/dc/terms/';
const SCHEMA_NS = 'http://schema.org/';

function readEntries() {
  const dir = join(root, 'plugins');
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
    const isLink = has('Link');
    const isComponent = has('Component');
    if (!isLink && !isComponent) continue;
    if (isLink && !ui('href')) { console.warn(`skip ${f}: ui:Link without ui:href`); continue; }
    if (isComponent && !ui('name')) { console.warn(`skip ${f}: ui:Component without ui:name`); continue; }
    const params = store.each(subj, rdf.sym(UI_NS + 'attribute'), null).map((b) => [
      (store.any(b, rdf.sym(SCHEMA_NS + 'name')) || {}).value || '',
      (store.any(b, rdf.sym(SCHEMA_NS + 'value')) || {}).value || '',
    ]).filter(([k]) => k);
    entries.push({
      kind: isLink ? 'link' : 'component',
      label: ui('label') || f.replace(/\.ttl$/, ''),
      icon: ui('icon'),
      tag: ui('name'),
      href: ui('href'),
      region: (ui('region') || '').split('#').pop(),
      desc: (store.any(subj, rdf.sym(RDFS_NS + 'comment')) || {}).value || '',
      creator: dct('creator'),
      publisher: dct('publisher'),
      cats: store.each(subj, rdf.sym(DCT_NS + 'subject'), null).map((n) => n.value),
      params,
      file: f,
    });
  }
  entries.sort((a, b) => a.label.localeCompare(b.label));
  return entries;
}

const ENTRIES = readEntries();
const frag = (label) => label.replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '');

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
  rdfs:comment "Every plugin and app the catalog knows, generated from the flat manifests in plugins/. In use means ui-data/data-kitchen-main-menu.ttl mounts it." ;
  ui:parts ( ${ENTRIES.map((e) => `<#${frag(e.label)}>`).join(' ')} ) .

${CATS.map((c) => `<#${frag(c)}> a skos:Collection ; skos:prefLabel ${JSON.stringify(c)} ;
  skos:member ${catMembers(c)} .`).join('\n\n')}

`;

for (const e of ENTRIES) {
  ttl += `<#${frag(e.label)}> a ui:${e.kind === 'link' ? 'Link' : 'Component'} ; ui:label ${JSON.stringify(e.label)} ;\n`;
  // Provenance: the manifest this entry was generated from (relative to the
  // catalog doc), so Customize's delete can remove the plugin's manifest too.
  ttl += `  dct:source <../plugins/${e.file}> ;\n`;
  if (e.icon) ttl += `  ui:icon ${JSON.stringify(e.icon)} ;\n`;
  if (e.kind === 'component') ttl += `  ui:name ${JSON.stringify(e.tag)} ;\n`;
  if (e.region) ttl += `  ui:region ui:${e.region} ;\n`;
  if (e.desc) ttl += `  rdfs:comment ${JSON.stringify(e.desc)} ;\n`;
  if (e.creator) ttl += `  dct:creator ${JSON.stringify(e.creator)} ;\n`;
  if (e.publisher) ttl += `  dct:publisher ${JSON.stringify(e.publisher)} ;\n`;
  if (e.kind === 'link') {
    ttl += `  ui:href <${e.href}> .\n\n`;
  } else if (e.params.length) {
    ttl += '  ui:attribute\n' + e.params.map(([k, v]) =>
      `    [ schema:name ${JSON.stringify(k)} ; schema:value ${JSON.stringify(v)} ]`).join(' ,\n') + ' .\n\n';
  } else {
    ttl = ttl.replace(/ ;\n$/, ' .\n') + '\n';
  }
}

writeFileSync(join(root, 'ui-data', 'data-kitchen-plugins-catalog.ttl'), ttl);
const links = ENTRIES.filter((e) => e.kind === 'link').length;
console.log(`wrote ui-data/data-kitchen-plugins-catalog.ttl: ${ENTRIES.length - links} plugins + ${links} link apps in ${CATS.length} topics (all from manifests)`);
