// One-shot: (re)add dct:source <../plugins/<file>> to every entry in the LIVE
// pod catalog, matched to its flat manifest by fragment (= frag(label), the
// same id the generator/serializer use — unique even when components share a
// ui:name, e.g. Music vs Movies both ia-player). The component's serializer
// strips dct:source on save; this restores it (and menu-serialize now preserves
// it going forward).
//
//   node claude/migration-scripts/backfill-catalog-dct-source.mjs [--write]
// Dry-run by default; --write PUTs the updated catalog.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { rdf } from '../../node_modules/sol-components/core/rdf.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORIGIN = process.env.DK_BASE || 'http://localhost:8000';
const CATALOG = `${ORIGIN}/dk-pod/dk/ui-data/data-kitchen-plugins-catalog.ttl`;
const PLUGINS = `${ORIGIN}/dk-pod/dk/plugins/`;
const UI = 'http://www.w3.org/ns/ui#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const DCT = 'http://purl.org/dc/terms/';
const write = process.argv.includes('--write');
const frag = (label) => label.replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '');

const token = readFileSync(join(homedir(), '.config', 'data-kitchen', 'gate-token'), 'utf8').trim();
const H = { 'x-dk-token': token };

// fragment(label) -> manifest filename, from the repo's flat manifests.
const fragToFile = new Map();
for (const f of readdirSync(join(root, 'plugins')).sort()) {
  if (!f.endsWith('.ttl')) continue;
  const p = join(root, 'plugins', f);
  if (!statSync(p).isFile()) continue;
  const g = rdf.graph();
  try { rdf.parse(readFileSync(p, 'utf8'), g, 'http://dk.invalid/m', 'text/turtle'); } catch { continue; }
  const s = rdf.sym('http://dk.invalid/m');
  const label = (g.any(s, rdf.sym(UI + 'label')) || {}).value || f.replace(/\.ttl$/, '');
  fragToFile.set(frag(label), f);
}

const ttl = await (await fetch(CATALOG, { headers: { ...H, accept: 'text/turtle' } })).text();
const store = rdf.graph();
rdf.parse(ttl, store, CATALOG, 'text/turtle');

let added = 0; const missed = [];
const entries = [
  ...store.each(null, rdf.sym(RDF + 'type'), rdf.sym(UI + 'Link')),
  ...store.each(null, rdf.sym(RDF + 'type'), rdf.sym(UI + 'Component')),
];
for (const e of entries) {
  if (store.any(e, rdf.sym(DCT + 'source'))) continue;
  const id = e.value.split('#')[1];
  const file = fragToFile.get(id);
  if (!file) { missed.push(id); continue; }
  store.add(e, rdf.sym(DCT + 'source'), rdf.sym(`${PLUGINS}${file}`), rdf.sym(CATALOG));
  added++;
}

const out = rdf.serialize(rdf.sym(CATALOG), store, CATALOG, 'text/turtle');
// verify reparse
const s2 = rdf.graph(); rdf.parse(out, s2, CATALOG, 'text/turtle');
const links = s2.each(null, rdf.sym(RDF + 'type'), rdf.sym(UI + 'Link')).length;
const comps = s2.each(null, rdf.sym(RDF + 'type'), rdf.sym(UI + 'Component')).length;
const srcs = s2.statementsMatching(null, rdf.sym(DCT + 'source'), null).length;
console.log(`entries=${entries.length} added=${added} missed=${missed.length}`, missed.length ? missed : '');
console.log(`reparsed PUT body: links=${links} components=${comps} dct:source=${srcs}`);

if (write) {
  const r = await fetch(CATALOG, { method: 'PUT', headers: { ...H, 'content-type': 'text/turtle' }, body: out });
  console.log(`PUT ${CATALOG} -> ${r.status}`);
} else {
  console.log('(dry run — pass --write to PUT)');
}
