// READ-ONLY analysis for shared-releases Phase 4 migration design.
// No writes. Reports clone/catalog overlap by dcat:landingPage,
// cross-playlist sharing, and edge cases (release w/o landingPage,
// track w/o downloadUrl, same landingPage w/ differing track sets).
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import rdflib from 'rdflib';

const { graph, parse, sym, Namespace } = rdflib;
const libDir = 'libraries/internet_archive_music';
const RDF  = Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#');
const RDFS = Namespace('http://www.w3.org/2000/01/rdf-schema#');
const DCAT = Namespace('http://www.w3.org/ns/dcat#');
const MO   = Namespace('http://purl.org/ontology/mo/');

// 1. Catalog landingPage -> release file (from Ph1-backfilled index).
const idx = graph();
parse(readFileSync(join(libDir, 'releases.ttl'), 'utf8'), idx, 'urn:i', 'text/turtle');
const catalogByLp = new Map();
for (const s of idx.match(null, DCAT('landingPage'), null))
  catalogByLp.set(s.object.value, s.subject.value);
console.log(`catalog release files (indexed) : ${catalogByLp.size}`);

// 2. Walk every playlist file.
const plFiles = readdirSync(join(libDir, 'playlists')).filter(f => f.endsWith('.ttl'));
let totRel = 0, totTrk = 0, relNoLp = 0, trkNoDl = 0;
const lpToPlaylists = new Map();    // landingPage -> Set(playlist)
const lpInCatalog = new Set();
const lpNewOnly = new Set();
const nonSelfContained = [];

for (const f of plFiles) {
  const txt = readFileSync(join(libDir, 'playlists', f), 'utf8');
  const g = graph();
  try { parse(txt, g, `urn:pl:${f}`, 'text/turtle'); }
  catch (e) { console.log(`  PARSE FAIL ${f}: ${e.message}`); continue; }
  const rels = g.match(null, RDF('type'), MO('Release')).map(s => s.subject);
  const trks = g.match(null, RDF('type'), MO('Track')).map(s => s.subject);
  if (rels.length === 0 && trks.length === 0) { nonSelfContained.push(f + ' (pointer/empty already)'); continue; }
  totRel += rels.length; totTrk += trks.length;
  for (const r of rels) {
    const lp = g.any(r, DCAT('landingPage'))?.value;
    if (!lp) { relNoLp++; continue; }
    if (!lpToPlaylists.has(lp)) lpToPlaylists.set(lp, new Set());
    lpToPlaylists.get(lp).add(f);
    (catalogByLp.has(lp) ? lpInCatalog : lpNewOnly).add(lp);
  }
  for (const t of trks) if (!g.any(t, DCAT('downloadUrl'))) trkNoDl++;
}

const shared = [...lpToPlaylists].filter(([, set]) => set.size > 1);
console.log(`\nplaylist files                  : ${plFiles.length}`);
console.log(`  self-contained (to migrate)   : ${plFiles.length - nonSelfContained.length}`);
console.log(`  already pointer/empty         : ${nonSelfContained.length}`);
nonSelfContained.forEach(s => console.log(`     - ${s}`));
console.log(`cloned mo:Release total         : ${totRel}`);
console.log(`cloned mo:Track total           : ${totTrk}`);
console.log(`distinct landingPages in pls    : ${lpToPlaylists.size}`);
console.log(`  ALREADY in catalog (reuse)    : ${lpInCatalog.size}`);
console.log(`  NEW (mint release file)       : ${lpNewOnly.size}`);
console.log(`releases w/o landingPage (edge) : ${relNoLp}`);
console.log(`tracks  w/o downloadUrl  (edge) : ${trkNoDl}`);
console.log(`landingPages in >1 playlist     : ${shared.length}`);
for (const [lp, set] of shared.slice(0, 12))
  console.log(`   ${lp.replace('https://archive.org/details/','det:')}  ×${set.size}  [${[...set].map(x=>x.replace('$.ttl','')).join(', ')}]`);
if (shared.length > 12) console.log(`   …and ${shared.length - 12} more`);
