#!/usr/bin/env node
// Post-migration invariant check for RDF rework Chunk A (P1+P3).
//   node validate-rdf-rework.mjs [libDir]
// Exit non-zero on any violation. Reads the migrated tree on disk.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import rdflib from 'rdflib';

const { graph, parse, sym, Namespace } = rdflib;
const __dirname = dirname(fileURLToPath(import.meta.url));
const libDir = resolve(__dirname,
  process.argv[2] || '../../libraries/internet_archive_music');

const RDF  = Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#');
const RDFS = Namespace('http://www.w3.org/2000/01/rdf-schema#');
const DCT  = Namespace('http://purl.org/dc/terms/');
const MO   = Namespace('http://purl.org/ontology/mo/');
const AS   = Namespace('https://www.w3.org/ns/activitystreams#');
const OMP  = Namespace('http://open-media-player.org/ns#');
const DCAT = Namespace('http://www.w3.org/ns/dcat#');

const ROOT = 'http://localhost:3000/s/test/ia/libraries/internet_archive_music/';
const slugOf = f => basename(f).replace(/\$?\.ttl$/, '');

let fail = 0;
const bad = (m) => { console.error('  ✗', m); fail++; };
const ok  = (m) => console.log('  ✓', m);

// ---- releases ------------------------------------------------------
const relDir = join(libDir, 'releases');
const relFiles = readdirSync(relDir).filter(f => f.endsWith('.ttl'));
const idents = new Map();
const trackRefs = new Set();      // resolvable .../releases/slug#tNN
let trackCount = 0;

for (const f of relFiles) {
  const slug = slugOf(f);
  const base = ROOT + 'releases/' + slug;
  const g = graph();
  try { parse(readFileSync(join(relDir, f), 'utf8'), g, base, 'text/turtle'); }
  catch (e) { bad(`${f}: parse ${e.message}`); continue; }

  const txt = readFileSync(join(relDir, f), 'utf8');
  if (/urn:uuid:[^>]*>\s*\n?\s*a\s+mo:(Release|Track)/.test(txt) ||
      /\burn:uuid:.*\ba mo:Release/.test(txt))
    bad(`${f}: urn:uuid: still used as Release/Track subject`);
  if (txt.includes(ROOT))
    bad(`${f}: absolute ${ROOT} IRI in stored data`);
  if (/\bmo:Playlist\b/.test(txt)) bad(`${f}: mo:Playlist present`);

  const rel = g.statementsMatching(null, RDF('type'), MO('Release'))[0]?.subject;
  if (!rel) { bad(`${f}: no mo:Release`); continue; }
  if (!rel.value.endsWith('#it')) bad(`${f}: release subject ${rel.value} != #it`);

  const id = g.statementsMatching(rel, DCT('identifier'), null);
  if (id.length !== 1) bad(`${f}: ${id.length} dct:identifier (want 1)`);
  else {
    const v = id[0].object.value;
    if (idents.has(v)) bad(`dup dct:identifier "${v}" (${f}, ${idents.get(v)})`);
    idents.set(v, f);
  }
  const rpart = g.statementsMatching(rel, DCT('isPartOf'), null);
  if (rpart.length !== 1 || !/releases\.ttl#it$/.test(rpart[0].object.value))
    bad(`${f}: release dct:isPartOf must be 1 → ../releases.ttl#it`);
  if (!g.holds(rel, RDF('type'), DCAT('Dataset')))
    bad(`${f}: release not also a dcat:Dataset (P2)`);

  const tracks = g.statementsMatching(null, RDF('type'), MO('Track'))
                  .map(s => s.subject);
  if (!tracks.length) bad(`${f}: no tracks`);
  for (const t of tracks) {
    trackCount++;
    if (!/#t\d+$/.test(t.value)) bad(`${f}: track ${t.value} not #tNN`);
    const tp = g.statementsMatching(t, DCT('isPartOf'), null);
    if (tp.length !== 1 || tp[0].object.value !== rel.value)
      bad(`${f}: track ${t.value} dct:isPartOf must be 1 → ${rel.value}`);
    trackRefs.add(base + (t.value.startsWith('#') ? t.value
                  : '#' + t.value.split('#')[1]));
  }
}
fail === 0 ? ok(`${relFiles.length} releases, ${trackCount} tracks, ` +
  `${idents.size} unique identifiers, spine intact`) : null;

// ---- playlists -----------------------------------------------------
const plDir = join(libDir, 'playlists');
const plFiles = readdirSync(plDir).filter(f => /\$?\.ttl$/.test(f) && !f.startsWith('#'));
let entryCount = 0, dangling = 0;

for (const f of plFiles) {
  const name = slugOf(f);
  const base = ROOT + 'playlists/' + name;
  const g = graph();
  try { parse(readFileSync(join(plDir, f), 'utf8'), g, base, 'text/turtle'); }
  catch (e) { bad(`${f}: parse ${e.message}`); continue; }

  const txt = readFileSync(join(plDir, f), 'utf8');
  if (/\bmo:Playlist\b/.test(txt)) bad(`${f}: mo:Playlist present`);
  if (/dcterms:hasPart|dct:hasPart/.test(txt)) bad(`${f}: hasPart still present`);
  if (txt.includes(ROOT)) bad(`${f}: absolute ${ROOT} IRI`);

  const col = g.statementsMatching(null, RDF('type'), AS('OrderedCollection'))[0]?.subject;
  if (!col) { bad(`${f}: not an as:OrderedCollection`); continue; }
  if (!g.holds(col, RDF('type'), DCAT('Dataset')))
    bad(`${f}: playlist not also a dcat:Dataset`);
  const pp = g.statementsMatching(col, DCT('isPartOf'), null);
  if (pp.length !== 1 || !/playlists\.ttl#it$/.test(pp[0].object.value))
    bad(`${f}: playlist dct:isPartOf must be 1 → ../playlists.ttl#it`);

  const entries = g.statementsMatching(col, OMP('entry'), null).map(s => s.object);
  const positions = new Set();
  for (const e of entries) {
    entryCount++;
    const pos = g.any(e, OMP('position'));
    const trk = g.any(e, OMP('track'));
    if (!pos || !/^\d+$/.test(pos.value)) bad(`${f}: entry missing int omp:position`);
    else if (positions.has(pos.value)) bad(`${f}: dup omp:position ${pos.value}`);
    else positions.add(pos.value);
    if (!trk) { bad(`${f}: entry missing omp:track`); continue; }
    if (!trackRefs.has(trk.value)) { dangling++; bad(`${f}: dangling omp:track ${trk.value}`); }
  }
  const want = entries.length;
  for (let i = 1; i <= want; i++)
    if (!positions.has(String(i))) bad(`${f}: positions not 1..${want} (missing ${i})`);
}
if (dangling === 0 && fail === 0)
  ok(`${plFiles.length} playlists, ${entryCount} entries, contiguous order, 0 dangling`);

// ---- recursive DCAT catalog spine (no rdfs:seeAlso anywhere) -------
const parseDoc = (name) => {
  const g = graph();
  parse(readFileSync(join(libDir, name), 'utf8'), g, ROOT + name, 'text/turtle');
  if (readFileSync(join(libDir, name), 'utf8').includes('rdfs:seeAlso')
   || g.statementsMatching(null, RDFS('seeAlso'), null).length)
    bad(`${name}: rdfs:seeAlso present (should be pure DCAT spine)`);
  return g;
};
// releases.ttl#it — catalog of release datasets
try {
  const g = parseDoc('releases.ttl');
  const cat = sym(ROOT + 'releases.ttl#it');
  if (!g.holds(cat, RDF('type'), DCAT('Catalog'))) bad('releases.ttl#it not a dcat:Catalog');
  const ds = g.statementsMatching(cat, DCAT('dataset'), null);
  if (ds.length !== relFiles.length)
    bad(`releases.ttl: ${ds.length} dcat:dataset vs ${relFiles.length} releases`);
  if (g.statementsMatching(null, null, null).some(s => s.object.value.includes('landingPage')))
    bad('releases.ttl: stale landingPage');
  else if (!fail) ok(`releases.ttl: dcat:Catalog #it + ${ds.length} dcat:dataset`);
} catch (e) { bad(`releases.ttl parse: ${e.message}`); }
// playlists.ttl#it — catalog of playlist datasets (NEW)
try {
  const g = parseDoc('playlists.ttl');
  const cat = sym(ROOT + 'playlists.ttl#it');
  if (!g.holds(cat, RDF('type'), DCAT('Catalog'))) bad('playlists.ttl#it not a dcat:Catalog');
  const ds = g.statementsMatching(cat, DCAT('dataset'), null).length;
  if (ds !== plFiles.length)
    bad(`playlists.ttl: ${ds} dcat:dataset vs ${plFiles.length} playlists`);
  else if (!fail) ok(`playlists.ttl: dcat:Catalog #it + ${ds} dcat:dataset`);
} catch (e) { bad(`playlists.ttl parse: ${e.message}`); }
// agents.ttl#it — the Artists dataset
try {
  const g = parseDoc('agents.ttl');
  if (!g.holds(sym(ROOT + 'agents.ttl#it'), RDF('type'), DCAT('Dataset')))
    bad('agents.ttl#it not a dcat:Dataset');
  else if (!fail) ok('agents.ttl#it a dcat:Dataset');
} catch (e) { bad(`agents.ttl parse: ${e.message}`); }
// genres.ttl#Music — a SKOS ConceptScheme (was skos:Concept)
try {
  const g = parseDoc('genres.ttl');
  const SKOS = Namespace('http://www.w3.org/2004/02/skos/core#');
  const mus = sym(ROOT + 'genres.ttl#Music');
  if (!g.holds(mus, RDF('type'), SKOS('ConceptScheme')))
    bad('genres.ttl#Music not a skos:ConceptScheme');
  if (g.holds(mus, RDF('type'), SKOS('Concept')))
    bad('genres.ttl#Music still typed skos:Concept');
  if (!fail) ok('genres.ttl#Music a skos:ConceptScheme');
} catch (e) { bad(`genres.ttl parse: ${e.message}`); }
// index.ttl#it — top catalog: dcat:catalog ×2, dataset, themeTaxonomy
try {
  const g = parseDoc('index.ttl');
  const cat = sym(ROOT + 'index.ttl#it');
  if (!g.holds(cat, RDF('type'), DCAT('Catalog'))) bad('index.ttl#it not a dcat:Catalog');
  const subs = g.statementsMatching(cat, DCAT('catalog'), null).map(s => s.object.value);
  if (subs.length !== 2 || !subs.some(v => v.endsWith('releases.ttl#it'))
      || !subs.some(v => v.endsWith('playlists.ttl#it')))
    bad(`index.ttl#it dcat:catalog must be {releases,playlists}.ttl#it (got ${subs.length})`);
  const ads = g.statementsMatching(cat, DCAT('dataset'), null)[0]?.object.value;
  if (!ads || !ads.endsWith('agents.ttl#it')) bad('index.ttl#it dcat:dataset must be agents.ttl#it');
  const tax = g.statementsMatching(cat, DCAT('themeTaxonomy'), null)[0]?.object.value;
  if (!tax || !tax.endsWith('genres.ttl#Music')) bad('index.ttl#it dcat:themeTaxonomy must be genres.ttl#Music');
  if (!fail) ok('index.ttl#it: dcat:catalog×2 + dataset(agents) + themeTaxonomy(genres)');
} catch (e) { bad(`index.ttl parse: ${e.message}`); }

console.log(fail ? `\nFAIL — ${fail} violation(s)` : '\nPASS — all invariants hold');
process.exit(fail ? 1 : 0);
