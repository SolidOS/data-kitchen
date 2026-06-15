// One-shot: add dct:source <../plugins/<file>> to every entry in the LIVE pod
// catalog, matched to its flat manifest by ui:href (links) / ui:name
// (components). Lets Customize's delete remove the plugin's manifest too.
// Existing entries lacked the provenance the generator now emits.
//
//   node claude/migration-scripts/backfill-catalog-dct-source.mjs [--write]
// Dry-run by default; pass --write to PUT the updated catalog.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { rdf } from '../../node_modules/sol-components/core/rdf.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORIGIN = process.env.DK_BASE || 'http://localhost:8000';
const CATALOG = `${ORIGIN}/dk-pod/dk/data/plugins-catalog.ttl`;
const PLUGINS = `${ORIGIN}/dk-pod/dk/plugins/`;
const UI = 'http://www.w3.org/ns/ui#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const DCT = 'http://purl.org/dc/terms/';
const write = process.argv.includes('--write');

const token = readFileSync(join(homedir(), '.config', 'data-kitchen', 'gate-token'), 'utf8').trim();
const H = { 'x-dk-token': token };

// Map href->file and name(tag)->file from the repo's flat manifests (same files
// the pod was seeded from; filenames match).
const hrefToFile = new Map(); const nameToFile = new Map();
for (const f of readdirSync(join(root, 'plugins')).sort()) {
  if (!f.endsWith('.ttl')) continue;
  const p = join(root, 'plugins', f);
  if (!statSync(p).isFile()) continue;
  const g = rdf.graph();
  try { rdf.parse(readFileSync(p, 'utf8'), g, 'http://dk.invalid/m', 'text/turtle'); } catch { continue; }
  const s = rdf.sym('http://dk.invalid/m');
  const href = (g.any(s, rdf.sym(UI + 'href')) || {}).value;
  const name = (g.any(s, rdf.sym(UI + 'name')) || {}).value;
  if (href) hrefToFile.set(href.replace(/\/$/, ''), f);
  if (name) nameToFile.set(name, f);
}

const ttl = await (await fetch(CATALOG, { headers: { ...H, accept: 'text/turtle' } })).text();
const store = rdf.graph();
rdf.parse(ttl, store, CATALOG, 'text/turtle');

// Match entries (read-only parse), then TEXT-INJECT a dct:source line after
// each entry's opening line — preserving the document exactly (rdflib reserialize
// mangled the ui:parts collection). Each entry block opens with
//   <#Frag> a ui:Link/Component ; ui:label "…" ;
// and we insert "  dct:source <../plugins/file> ;" as the next line.
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let out = ttl; let added = 0; const missed = []; const already = [];
const entries = [
  ...store.each(null, rdf.sym(RDF + 'type'), rdf.sym(UI + 'Link')),
  ...store.each(null, rdf.sym(RDF + 'type'), rdf.sym(UI + 'Component')),
];
for (const e of entries) {
  const frag = e.value.split('#')[1];
  if (store.any(e, rdf.sym(DCT + 'source'))) { already.push(frag); continue; }
  const href = (store.any(e, rdf.sym(UI + 'href')) || {}).value;
  const name = (store.any(e, rdf.sym(UI + 'name')) || {}).value;
  const file = (href && hrefToFile.get(href.replace(/\/$/, ''))) || (name && nameToFile.get(name));
  if (!file) { missed.push(frag); continue; }
  const re = new RegExp(`(^<#${esc(frag)}>[^\\n]*;[^\\n]*\\n)`, 'm');
  if (!re.test(out)) { missed.push(`${frag} (no opening line)`); continue; }
  out = out.replace(re, `$1  dct:source <../plugins/${file}> ;\n`);
  added++;
}
console.log(`entries=${entries.length} added=${added} already=${already.length} missed=${missed.length}`, missed.length ? missed : '');

// Verify the injected text still parses and keeps the list + collections.
const s2 = rdf.graph(); rdf.parse(out, s2, CATALOG, 'text/turtle');
const SKOS = 'http://www.w3.org/2004/02/skos/core#';
const linksN = s2.each(null, rdf.sym(RDF + 'type'), rdf.sym(UI + 'Link')).length;
const compsN = s2.each(null, rdf.sym(RDF + 'type'), rdf.sym(UI + 'Component')).length;
const colsN = s2.each(null, rdf.sym(RDF + 'type'), rdf.sym(SKOS + 'Collection')).length;
const srcsN = s2.statementsMatching(null, rdf.sym(DCT + 'source'), null).length;
const availLen = (out.match(/<#Available>[\s\S]*?\)\s*\./) || [''])[0].match(/<#[^>]+>/g)?.length || 0;
console.log(`re-parsed injected text: links=${linksN} components=${compsN} collections=${colsN} dct:source=${srcsN} | #Available list refs~=${availLen - 1}`);

if (write) {
  const r = await fetch(CATALOG, { method: 'PUT', headers: { ...H, 'content-type': 'text/turtle' }, body: out });
  console.log(`PUT ${CATALOG} -> ${r.status}`);
} else {
  console.log('(dry run — pass --write to PUT)');
}
