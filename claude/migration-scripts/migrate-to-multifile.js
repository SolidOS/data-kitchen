#!/usr/bin/env node
// One-shot migration: ia-music.ttl → multi-file library layout.
//
//   ia-music.ttl                     ← becomes the library index file
//                                       (rdfs:seeAlso to the others)
//   ia-music-library/
//     ├── agents.ttl                 ← all catalog Agents
//     ├── genres.ttl                 ← all genre concepts + <#Music>
//     ├── releases.ttl               ← empty; future Releases + Tracks
//     └── playlists/                 ← empty; future playlist resources
//
// Drops the existing <#Favorites> concept + its 13 Release members,
// and the empty <#Wu-Tang_Clan_…> playlist. Both were test artefacts.
//
// Usage:
//   node migrate-to-multifile.js               # dry run — prints summary
//   node migrate-to-multifile.js --apply       # actually writes files

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import rdflib from 'rdflib';

const { graph, parse, Namespace, sym } = rdflib;
const __dirname = dirname(fileURLToPath(import.meta.url));

const APPLY = process.argv.includes('--apply');
const SRC = resolve(__dirname, 'ia-music.ttl');
const BACKUP = SRC + '.pre-multifile';
const LIB_DIR = resolve(__dirname, 'ia-music-library');
const AGENTS_FILE   = join(LIB_DIR, 'agents.ttl');
const GENRES_FILE   = join(LIB_DIR, 'genres.ttl');
const RELEASES_FILE = join(LIB_DIR, 'releases.ttl');
const PLAYLISTS_DIR = join(LIB_DIR, 'playlists');

const BASE = 'http://localhost:3000/s/test/ia/ia-music.ttl';
const HASH = BASE + '#';

const RDF      = Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#');
const RDFS     = Namespace('http://www.w3.org/2000/01/rdf-schema#');
const SKOS     = Namespace('http://www.w3.org/2004/02/skos/core#');
const DCT      = Namespace('http://purl.org/dc/terms/');
const FOAF     = Namespace('http://xmlns.com/foaf/0.1/');
const MO       = Namespace('http://purl.org/ontology/mo/');
const DCAT     = Namespace('http://www.w3.org/ns/dcat#');

const src = readFileSync(SRC, 'utf8');
const store = graph();
parse(src, store, BASE, 'text/turtle');

const localPart = (uri) => uri.startsWith(HASH) ? uri.slice(HASH.length) : null;
const ttlStr = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

// --- Classify subjects ------------------------------------------------

const FAVORITES = HASH + 'Favorites';
const MUSIC     = HASH + 'Music';

// Skip these and anything that points at them as the only context.
const droppedConcepts = new Set([FAVORITES]);
// Find playlists to drop too — every existing mo:Playlist is a test
// artefact per the user's instruction.
for (const stmt of store.match(null, RDF('type'), MO('Playlist'))) {
  droppedConcepts.add(stmt.subject.value);
}
// And every existing Release (they're all test-favorites members).
const droppedReleases = new Set();
for (const stmt of store.match(null, RDF('type'), MO('Release'))) {
  droppedReleases.add(stmt.subject.value);
}

// Genres: skos:Concept that's NOT in droppedConcepts and not Music root.
const genreUris = new Set();
for (const stmt of store.match(null, RDF('type'), SKOS('Concept'))) {
  const u = stmt.subject.value;
  if (u === MUSIC) continue;
  if (droppedConcepts.has(u)) continue;
  genreUris.add(u);
}

// Catalog Agents (mo:MusicArtist + foaf:Agent subclasses).
const AGENT_TYPES = [
  MO('MusicArtist'), MO('MusicGroup'), MO('SoloMusicArtist'), MO('Label'),
  FOAF('Agent'), FOAF('Organization'), FOAF('Person'), FOAF('Group'),
];
const agentUris = new Set();
for (const t of AGENT_TYPES) {
  for (const stmt of store.match(null, RDF('type'), t)) agentUris.add(stmt.subject.value);
}

// --- Emit files ------------------------------------------------------

function genresTtl() {
  const lines = [];
  lines.push('@prefix : <#>.');
  lines.push('@prefix skos: <http://www.w3.org/2004/02/skos/core#>.');
  lines.push('@prefix mo: <http://purl.org/ontology/mo/>.');
  lines.push('');

  // Music root concept (lives in genres.ttl)
  const musicLabel = store.any(sym(MUSIC), SKOS('prefLabel'))?.value || 'Music';
  lines.push(`<#Music> a skos:Concept ;`);
  lines.push(`    skos:prefLabel ${ttlStr(musicLabel)} .`);
  lines.push('');

  for (const uri of genreUris) {
    const local = localPart(uri);
    if (!local) continue;
    const node = sym(uri);
    const prefLabel = store.any(node, SKOS('prefLabel'))?.value || local;
    const top = store.any(node, SKOS('topConceptOf'))?.value;
    const topLocal = top ? localPart(top) : null;
    lines.push(`<#${local}> a skos:Concept, mo:Genre ;`);
    lines.push(`    skos:prefLabel ${ttlStr(prefLabel)}${topLocal ? ' ;' : ' .'}`);
    if (topLocal) lines.push(`    skos:topConceptOf <#${topLocal}> .`);
  }
  return lines.join('\n') + '\n';
}

function agentsTtl() {
  const lines = [];
  lines.push('@prefix : <#>.');
  lines.push('@prefix foaf: <http://xmlns.com/foaf/0.1/>.');
  lines.push('@prefix mo: <http://purl.org/ontology/mo/>.');
  lines.push('@prefix dcat: <http://www.w3.org/ns/dcat#>.');
  lines.push('@prefix genres: <genres.ttl#>.');
  lines.push('');

  for (const uri of agentUris) {
    const node = sym(uri);
    const name = store.any(node, FOAF('name'))?.value;
    const lp = store.any(node, DCAT('landingPage'))?.value;
    const genres = store.match(node, MO('genre'), null).map(s => s.object.value);

    // Use the original URN for the agent (cross-file safe).
    const subj = `<${uri}>`;
    const parts = [`${subj} a mo:MusicArtist`];
    if (name) parts.push(`    foaf:name ${ttlStr(name)}`);
    if (lp) parts.push(`    dcat:landingPage <${lp}>`);
    for (const g of genres) {
      const local = localPart(g);
      if (local) parts.push(`    mo:genre genres:${local}`);
      else parts.push(`    mo:genre <${g}>`);
    }
    lines.push(parts.join(' ;\n') + ' .');
  }
  return lines.join('\n') + '\n';
}

function releasesTtl() {
  // Empty starter file; new Releases + Tracks will be appended at runtime.
  return [
    '@prefix : <#>.',
    '@prefix mo: <http://purl.org/ontology/mo/>.',
    '@prefix foaf: <http://xmlns.com/foaf/0.1/>.',
    '@prefix dcterms: <http://purl.org/dc/terms/>.',
    '@prefix dcat: <http://www.w3.org/ns/dcat#>.',
    '@prefix schema: <http://schema.org/>.',
    '@prefix agents: <agents.ttl#>.',
    '@prefix genres: <genres.ttl#>.',
    '',
    '# Releases (albums) and their member Tracks will be added here as',
    '# the user drops tracks into playlists.',
    '',
  ].join('\n');
}

function libraryTtl() {
  // The index file. Keeps its URL (ia-music.ttl) so existing localStorage
  // library configs continue to work.
  return [
    '@prefix : <#>.',
    '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.',
    '@prefix dcterms: <http://purl.org/dc/terms/>.',
    '',
    '<> a :Library ;',
    '    dcterms:title "Open Media — main library" ;',
    '    rdfs:seeAlso <ia-music-library/agents.ttl> ,',
    '                 <ia-music-library/genres.ttl> ,',
    '                 <ia-music-library/releases.ttl> .',
    '',
    '# Playlist files appear below as additional rdfs:seeAlso entries,',
    '# one per <ia-music-library/playlists/SlugName>.',
    '',
  ].join('\n');
}

// --- Run --------------------------------------------------------------

const counts = {
  genres: genreUris.size,
  agents: agentUris.size,
  droppedReleases: droppedReleases.size,
  droppedConcepts: droppedConcepts.size,
};

console.log(`Migration summary (${APPLY ? 'WRITE' : 'dry-run'}):`);
console.log(`  Genres:       ${counts.genres}  → ia-music-library/genres.ttl`);
console.log(`  Agents:       ${counts.agents}  → ia-music-library/agents.ttl`);
console.log(`  Releases:     0   → ia-music-library/releases.ttl (empty)`);
console.log(`  Playlists:    0   → ia-music-library/playlists/ (empty dir)`);
console.log(`  Dropped Releases:  ${counts.droppedReleases}  (test-favorites + Wu-Tang members)`);
console.log(`  Dropped Playlists/Favorites: ${counts.droppedConcepts}`);

if (!APPLY) {
  console.log('\nDry run — pass --apply to write files.');
  console.log('Will also back up ia-music.ttl → ia-music.ttl.pre-multifile');
  process.exit(0);
}

if (!existsSync(LIB_DIR)) mkdirSync(LIB_DIR, { recursive: true });
if (!existsSync(PLAYLISTS_DIR)) mkdirSync(PLAYLISTS_DIR, { recursive: true });

copyFileSync(SRC, BACKUP);
writeFileSync(AGENTS_FILE, agentsTtl());
writeFileSync(GENRES_FILE, genresTtl());
writeFileSync(RELEASES_FILE, releasesTtl());
writeFileSync(SRC, libraryTtl());

console.log('\nWrote:');
console.log(`  ${SRC}`);
console.log(`  ${AGENTS_FILE}`);
console.log(`  ${GENRES_FILE}`);
console.log(`  ${RELEASES_FILE}`);
console.log(`  ${PLAYLISTS_DIR}/  (directory)`);
console.log(`Backup: ${BACKUP}`);
