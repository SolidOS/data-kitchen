#!/usr/bin/env node
// Migrate to self-contained playlist files.
//
// Before: playlist files hold only `dcterms:hasPart` edges; the Track +
// parent Release triples live in the monolithic ia-music-library/
// releases.ttl. Every playlist add PATCHes that 470K+ file -> CSS lock
// timeout 500s.
//
// After: each playlist file holds its playlist resource, its hasPart
// edges, AND its own copy of the Track + parent Release triples.
// releases.ttl keeps ONLY the local-artist catalogue (Releases/Tracks
// reachable from an Agent with omp:localData true).
//
// Releases are cloned per playlist (fresh urn:uuid, deduped by
// dcat:landingPage within the one playlist) so every playlist file is
// independent. Track urn:uuid IRIs are kept (each Track belongs to
// exactly one playlist).
//
//   node migrate-selfcontained-playlists.js          # dry run — report
//   node migrate-selfcontained-playlists.js --apply   # rewrite files
//
// --apply backs up releases.ttl + every playlist file into a
// timestamped dir first, then rewrites them.

import { readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
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

// playlist disk file -> { file, slug, uri }
function playlistFiles() {
  return readdirSync(PLAYLISTS_DIR).map(f => {
    const slug = f.replace(/\$\.ttl$/, '').replace(/\.ttl$/, '');
    return {
      file: join(PLAYLISTS_DIR, f),
      slug,
      uri: `${BASE}/ia-music-library/playlists/${slug}`,
    };
  });
}

loadFile(RELEASES, `${BASE}/ia-music-library/releases.ttl`);
loadFile(AGENTS,   `${BASE}/ia-music-library/agents.ttl`);
const PLS = playlistFiles();
for (const p of PLS) loadFile(p.file, p.uri);

// --- Local-artist-reachable nodes: these STAY in releases.ttl ---------
const localAgents = new Set();
for (const s of store.match(null, OMP('localData'), null)) {
  if (s.object.value === 'true' || s.object.value === '1') localAgents.add(s.subject.value);
}
const localReleases = new Set();
for (const s of store.match(null, FOAF('maker'), null)) {
  if (localAgents.has(s.object.value) && store.holds(s.subject, RDF('type'), MO('Release'))) {
    localReleases.add(s.subject.value);
  }
}
const localTracks = new Set();
for (const relUri of localReleases) {
  for (const s of store.match(sym(relUri), MO('track'), null)) localTracks.add(s.object.value);
}

// --- Prefixed-CURIE emitter (same style as sweep-orphan-tracks.js) ----
const ttlStr = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
const PFX = [
  ['mo:',      'http://purl.org/ontology/mo/'],
  ['foaf:',    'http://xmlns.com/foaf/0.1/'],
  ['dcterms:', 'http://purl.org/dc/terms/'],
  ['dctypes:', 'http://purl.org/dc/dcmitype/'],
  ['dcat:',    'http://www.w3.org/ns/dcat#'],
  ['schema:',  'http://schema.org/'],
  ['omp:',     'http://open-media-player.org/ns#'],
  ['agents:',  `${BASE}/ia-music-library/agents.ttl#`],
  ['genres:',  `${BASE}/ia-music-library/genres.ttl#`],
];
const PRELUDE = [
  '@prefix mo: <http://purl.org/ontology/mo/>.',
  '@prefix foaf: <http://xmlns.com/foaf/0.1/>.',
  '@prefix dcterms: <http://purl.org/dc/terms/>.',
  '@prefix dctypes: <http://purl.org/dc/dcmitype/>.',
  '@prefix dcat: <http://www.w3.org/ns/dcat#>.',
  '@prefix schema: <http://schema.org/>.',
  '@prefix omp: <http://open-media-player.org/ns#>.',
  '@prefix agents: <agents.ttl#>.',
  '@prefix genres: <genres.ttl#>.',
  '',
];
const curie = (uri) => {
  for (const [p, ns] of PFX) if (uri.startsWith(ns)) return p + uri.slice(ns.length);
  return `<${uri}>`;
};
const RDF_TYPE = RDF('type').value;
const ref = (term) => term.termType === 'Literal' ? ttlStr(term.value) : curie(term.value);

function emitNode(lines, subjTerm, statements) {
  // statements: array of {predicate, object}
  const byPred = new Map();
  for (const s of statements) {
    if (!byPred.has(s.predicate.value)) byPred.set(s.predicate.value, []);
    byPred.get(s.predicate.value).push(s.object);
  }
  if (!byPred.size) return;
  const parts = [];
  for (const [p, objs] of byPred) {
    const pname = p === RDF_TYPE ? 'a' : curie(p);
    parts.push(`    ${pname} ${objs.map(ref).join(', ')}`);
  }
  lines.push(curie(subjTerm.value));
  lines.push(parts.join(' ;\n') + ' .');
  lines.push('');
}

// --- Per-playlist rewrite --------------------------------------------
let totalTracksMoved = 0;
let totalReleasesCloned = 0;
const perPlaylist = [];

for (const p of PLS) {
  const plNode = sym(p.uri);
  if (!store.holds(plNode, RDF('type'), MO('Playlist'))) {
    perPlaylist.push({ slug: p.slug, skipped: 'not a mo:Playlist', tracks: 0, releases: 0 });
    continue;
  }

  const lines = [...PRELUDE];

  // 1. Playlist resource triples (everything with subject = plNode).
  const plStmts = store.match(plNode, null, null)
    .filter(s => s.predicate.value !== DCT('hasPart').value);
  const hasPart = store.match(plNode, DCT('hasPart'), null).map(s => s.object);

  // 2. Walk hasPart -> Track -> parent Release. Clone Releases per
  //    playlist, deduped by landingPage (fall back to release URI).
  const cloneByKey = new Map();   // landingPage|relUri -> new release sym
  const trackList = [];           // {trackNode, cloneRel}
  let cloned = 0;
  for (const tn of hasPart) {
    const parentStmt = store.match(null, MO('track'), tn)[0];
    const parent = parentStmt?.subject || null;
    let cloneRel = null;
    if (parent) {
      const lp = store.any(parent, DCAT('landingPage'))?.value;
      const key = lp || parent.value;
      cloneRel = cloneByKey.get(key);
      if (!cloneRel) {
        cloneRel = sym(`urn:uuid:${crypto.randomUUID()}`);
        cloneByKey.set(key, cloneRel);
        cloned++;
      }
    }
    trackList.push({ trackNode: tn, cloneRel });
  }

  // 3. Emit. Playlist resource (with rebuilt hasPart), cloned Releases,
  //    Tracks.
  const plOut = plStmts.map(s => ({ predicate: s.predicate, object: s.object }));
  for (const { trackNode } of trackList) {
    plOut.push({ predicate: DCT('hasPart'), object: trackNode });
  }
  emitNode(lines, plNode, plOut);

  // Cloned Releases: copy the original Release's defining triples
  // (skip mo:track — re-pointed below) onto the fresh clone IRI.
  const emittedClone = new Set();
  for (const tn of hasPart) {
    const parent = store.match(null, MO('track'), tn)[0]?.subject;
    if (!parent) continue;
    const lp = store.any(parent, DCAT('landingPage'))?.value;
    const key = lp || parent.value;
    const cloneRel = cloneByKey.get(key);
    if (!cloneRel || emittedClone.has(cloneRel.value)) continue;
    emittedClone.add(cloneRel.value);
    const relOut = store.match(parent, null, null)
      .filter(s => s.predicate.value !== MO('track').value)
      .map(s => ({ predicate: s.predicate, object: s.object }));
    // mo:track edges to this playlist's tracks under this clone
    for (const { trackNode, cloneRel: cr } of trackList) {
      if (cr && cr.value === cloneRel.value) {
        relOut.push({ predicate: MO('track'), object: trackNode });
      }
    }
    emitNode(lines, cloneRel, relOut);
  }

  // Tracks (their own triples, kept as-is).
  for (const { trackNode } of trackList) {
    const trkOut = store.match(trackNode, null, null)
      .map(s => ({ predicate: s.predicate, object: s.object }));
    emitNode(lines, trackNode, trkOut);
  }

  totalTracksMoved += trackList.length;
  totalReleasesCloned += cloned;
  perPlaylist.push({
    slug: p.slug, file: p.file,
    tracks: trackList.length, releases: cloned,
    body: lines.join('\n') + '\n',
  });
}

// --- Rewritten releases.ttl: local-artist nodes ONLY ------------------
const relLines = [...PRELUDE];
const keptReleases = [...localReleases].map(sym);
const keptTracks = [...localTracks].map(sym);
for (const r of keptReleases) {
  emitNode(relLines, r, store.match(r, null, null).map(s => ({ predicate: s.predicate, object: s.object })));
}
for (const t of keptTracks) {
  emitNode(relLines, t, store.match(t, null, null).map(s => ({ predicate: s.predicate, object: s.object })));
}
const relBody = relLines.join('\n') + '\n';

// --- Report -----------------------------------------------------------
const allReleases = store.match(null, RDF('type'), MO('Release')).length;
const allTracks = store.match(null, RDF('type'), MO('Track')).length;
console.log('Self-contained playlist migration\n');
console.log(`Store inventory:`);
console.log(`  Releases: ${allReleases}  Tracks: ${allTracks}`);
console.log(`  Local-artist (stay in releases.ttl): ${localReleases.size} releases / ${localTracks.size} tracks\n`);
console.log(`Playlists: ${perPlaylist.length}`);
for (const pl of perPlaylist) {
  if (pl.skipped) { console.log(`  - ${pl.slug}: SKIPPED (${pl.skipped})`); continue; }
  console.log(`  - ${pl.slug}: ${pl.tracks} tracks, ${pl.releases} cloned release(s)`);
}
console.log(`\nTotal moved into playlist files: ${totalTracksMoved} tracks, ${totalReleasesCloned} releases.`);
console.log(`releases.ttl after: ${localReleases.size} releases + ${localTracks.size} tracks ` +
  `(${(Buffer.byteLength(relBody) / 1024).toFixed(1)}K, was ${(existsSync(RELEASES) ? (readFileSync(RELEASES).length / 1024).toFixed(1) : '?')}K).`);

if (!APPLY) {
  console.log(`\nDry run — pass --apply to back up + rewrite.`);
  process.exit(0);
}

// --- Apply: timestamped backup, then rewrite --------------------------
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = join(LIB, `.pre-selfcontained-${stamp}`);
mkdirSync(backupDir, { recursive: true });
mkdirSync(join(backupDir, 'playlists'), { recursive: true });
copyFileSync(RELEASES, join(backupDir, 'releases.ttl'));
for (const p of PLS) {
  copyFileSync(p.file, join(backupDir, 'playlists', p.file.split('/').pop()));
}
console.log(`\nBacked up to ${backupDir}`);

for (const pl of perPlaylist) {
  if (pl.skipped) continue;
  writeFileSync(pl.file, pl.body);
}
writeFileSync(RELEASES, relBody);
console.log(`Rewrote ${perPlaylist.filter(p => !p.skipped).length} playlist files + releases.ttl.`);
