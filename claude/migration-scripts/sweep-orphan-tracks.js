#!/usr/bin/env node
// Find (and optionally remove) orphan Track/Release nodes in
// ia-music-library/releases.ttl — left behind by half-failed playlist
// adds before the rollback fix.
//
// A Track is REACHABLE if:
//   • some playlist dcterms:hasPart points at it, OR
//   • its parent Release foaf:makers an Agent with omp:localData true
//     (a converted "local artist" — its albums are read straight from
//     the RDF, so those Tracks/Releases must be kept).
// A Release is REACHABLE if it has ≥1 reachable Track, or it's a
// local-artist Release. Everything else is an orphan.
//
//   node sweep-orphan-tracks.js            # dry run — report only
//   node sweep-orphan-tracks.js --apply    # rewrite releases.ttl
//
// --apply rebuilds releases.ttl from the kept nodes (back up first).

import { readFileSync, writeFileSync, copyFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import rdflib from 'rdflib';

const { graph, parse, Namespace, sym } = rdflib;
const ROOT = dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');

const LIB = join(ROOT, 'ia-music-library');
const RELEASES = join(LIB, 'releases.ttl');
const AGENTS = join(LIB, 'agents.ttl');
const PLAYLISTS_DIR = join(LIB, 'playlists');

const RDF  = Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#');
const DCT  = Namespace('http://purl.org/dc/terms/');
const FOAF = Namespace('http://xmlns.com/foaf/0.1/');
const MO   = Namespace('http://purl.org/ontology/mo/');
const DCAT = Namespace('http://www.w3.org/ns/dcat#');
const OMP  = Namespace('http://open-media-player.org/ns#');

const BASE = 'http://localhost:3000/s/test/ia';
const store = graph();

function loadFile(path, baseUri) {
  try { parse(readFileSync(path, 'utf8'), store, baseUri, 'text/turtle'); }
  catch (e) { console.warn(`! parse ${path}: ${e.message}`); }
}

loadFile(RELEASES, `${BASE}/ia-music-library/releases.ttl`);
loadFile(AGENTS,   `${BASE}/ia-music-library/agents.ttl`);
for (const f of readdirSync(PLAYLISTS_DIR)) {
  // Disk name is "Slug$.ttl"; the resource URI is ".../playlists/Slug".
  const slug = f.replace(/\$\.ttl$/, '').replace(/\.ttl$/, '');
  loadFile(join(PLAYLISTS_DIR, f), `${BASE}/ia-music-library/playlists/${slug}`);
}

// Local-artist Agents (omp:localData true)
const localAgents = new Set();
for (const s of store.match(null, OMP('localData'), null)) {
  if (s.object.value === 'true' || s.object.value === '1') localAgents.add(s.subject.value);
}
// Releases that back a local artist
const localReleases = new Set();
for (const s of store.match(null, FOAF('maker'), null)) {
  if (localAgents.has(s.object.value) && store.holds(s.subject, RDF('type'), MO('Release'))) {
    localReleases.add(s.subject.value);
  }
}

// Reachable Tracks: playlist hasPart members + tracks of local Releases
const reachableTracks = new Set();
for (const s of store.match(null, DCT('hasPart'), null)) {
  if (store.holds(s.object, RDF('type'), MO('Track'))) reachableTracks.add(s.object.value);
}
for (const relUri of localReleases) {
  for (const s of store.match(sym(relUri), MO('track'), null)) reachableTracks.add(s.object.value);
}

const allTracks = store.match(null, RDF('type'), MO('Track')).map(s => s.subject);
const allReleases = store.match(null, RDF('type'), MO('Release')).map(s => s.subject);

const orphanTracks = allTracks.filter(t => !reachableTracks.has(t.value));
const orphanReleases = allReleases.filter(r => {
  if (localReleases.has(r.value)) return false;
  const tracks = store.match(r, MO('track'), null).map(s => s.object.value);
  return !tracks.some(tv => reachableTracks.has(tv));
});

const title = (n) => store.any(n, DCT('title'))?.value || n.value;

console.log(`releases.ttl inventory:`);
console.log(`  Releases: ${allReleases.length}  (local-artist: ${localReleases.size})`);
console.log(`  Tracks:   ${allTracks.length}  (reachable: ${reachableTracks.size})`);
console.log(`\nOrphans:`);
console.log(`  Orphan Releases: ${orphanReleases.length}`);
orphanReleases.slice(0, 10).forEach(r => console.log(`    - ${title(r)}`));
if (orphanReleases.length > 10) console.log(`    … +${orphanReleases.length - 10} more`);
console.log(`  Orphan Tracks:   ${orphanTracks.length}`);
orphanTracks.slice(0, 10).forEach(t => console.log(`    - ${title(t)}`));
if (orphanTracks.length > 10) console.log(`    … +${orphanTracks.length - 10} more`);

if (!APPLY) {
  console.log(`\nDry run — pass --apply to rewrite releases.ttl (backs up first).`);
  process.exit(0);
}

// --apply: rebuild releases.ttl from kept Releases + their reachable Tracks.
const ttlStr = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
const orphanRelSet = new Set(orphanReleases.map(r => r.value));
const orphanTrkSet = new Set(orphanTracks.map(t => t.value));

const lines = [
  '@prefix : <#>.',
  '@prefix mo: <http://purl.org/ontology/mo/>.',
  '@prefix foaf: <http://xmlns.com/foaf/0.1/>.',
  '@prefix dcterms: <http://purl.org/dc/terms/>.',
  '@prefix dcat: <http://www.w3.org/ns/dcat#>.',
  '@prefix schema: <http://schema.org/>.',
  '@prefix agents: <agents.ttl#>.',
  '@prefix genres: <genres.ttl#>.',
  '',
];
// Prefix map so output matches the hand-written / migration style
// (mo:, dcat:, agents:, genres:, …) instead of verbose full IRIs.
const PFX = [
  ['mo:',      'http://purl.org/ontology/mo/'],
  ['foaf:',    'http://xmlns.com/foaf/0.1/'],
  ['dcterms:', 'http://purl.org/dc/terms/'],
  ['dcat:',    'http://www.w3.org/ns/dcat#'],
  ['schema:',  'http://schema.org/'],
  ['agents:',  `${BASE}/ia-music-library/agents.ttl#`],
  ['genres:',  `${BASE}/ia-music-library/genres.ttl#`],
];
const curie = (uri) => {
  for (const [p, ns] of PFX) if (uri.startsWith(ns)) return p + uri.slice(ns.length);
  return `<${uri}>`;
};
const ref = (term) => term.termType === 'Literal' ? ttlStr(term.value) : curie(term.value);
function emit(node, keptTrackFilter) {
  const preds = store.match(node, null, null);
  const byPred = new Map();
  for (const s of preds) {
    if (s.predicate.value === MO('track').value && !keptTrackFilter(s.object.value)) continue;
    if (!byPred.has(s.predicate.value)) byPred.set(s.predicate.value, []);
    byPred.get(s.predicate.value).push(s);
  }
  if (!byPred.size) return;
  const parts = [];
  for (const [p, stmts] of byPred) {
    const objs = stmts.map(s => ref(s.object)).join(', ');
    const pname = p === RDF('type').value ? 'a' : curie(p);
    parts.push(`    ${pname} ${objs}`);
  }
  lines.push(`${curie(node.value)}`);
  lines.push(parts.join(' ;\n') + ' .');
}
for (const r of allReleases) {
  if (orphanRelSet.has(r.value)) continue;
  emit(r, (tv) => !orphanTrkSet.has(tv));
}
for (const t of allTracks) {
  if (orphanTrkSet.has(t.value)) continue;
  emit(t, () => true);
}

// Preserve the *first* pre-sweep snapshot — don't clobber it on a re-run.
const backup = RELEASES + '.pre-sweep';
if (!existsSync(backup)) copyFileSync(RELEASES, backup);
writeFileSync(RELEASES, lines.join('\n') + '\n');
console.log(`\nRewrote ${RELEASES} (backup: releases.ttl.pre-sweep${existsSync(backup) ? '' : ' [new]'}).`);
console.log(`Removed ${orphanReleases.length} releases + ${orphanTracks.length} tracks.`);
