#!/usr/bin/env node
// One-shot: link name-matched search-stub artists to their curated
// playlists (the "B → A" normalisation).
//
// A "B" artist is a mo:MusicArtist with a foaf:name that matches a
// curated playlist's dcterms:title or foaf:maker, but which has NO
// omp:sourcePlaylist yet (its dcat:landingPage is just an archive.org
// search). After this it behaves exactly like a converted-playlist
// artist: we add `omp:localData true` + `omp:sourcePlaylist <playlist>`
// to the SAME agent (its mo:genre and dcat:landingPage are kept —
// carried over, not rewritten). No new agents, no playlist changes.
//
//   node migrate-link-namematched-playlists.js [libDir]           # dry run
//   node migrate-link-namematched-playlists.js --apply [libDir]   # write
//
// libDir defaults to ./libraries/internet_archive_music.
// --apply backs up agents.ttl first; only agents.ttl is appended to
// (plain absolute-IRI stanzas — no reserialise, minimal diff).

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import rdflib from 'rdflib';

const { graph, parse, sym, Namespace } = rdflib;
const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const libDir = resolve(__dirname, args.find(a => !a.startsWith('--')) || 'libraries/internet_archive_music');

const RDF  = Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#');
const FOAF = Namespace('http://xmlns.com/foaf/0.1/');
const DCT  = Namespace('http://purl.org/dc/terms/');
const RDFS = Namespace('http://www.w3.org/2000/01/rdf-schema#');
const MO   = Namespace('http://purl.org/ontology/mo/');
const OMP  = Namespace('http://open-media-player.org/ns#');
const DCAT = Namespace('http://www.w3.org/ns/dcat#');

const norm = (s) => (s || '').trim().toLowerCase();

// Library base URL (from index.ttl's own subject).
const idxPath = join(libDir, 'index.ttl');
if (!existsSync(idxPath)) { console.error('no index.ttl at', idxPath); process.exit(1); }
const idxStore = graph();
parse(readFileSync(idxPath, 'utf8'), idxStore, 'urn:tmp:idx', 'text/turtle');
const seeAlso = idxStore.match(null, RDFS('seeAlso'), null).map(s => s.object.value);
const libBase = idxStore.match(null, RDFS('seeAlso'), null)[0]?.subject?.value
  ?.replace(/index\.ttl$/, '');
if (!libBase) { console.error('could not derive library base from index.ttl'); process.exit(1); }
const agentsUrl = libBase + 'agents.ttl';
const plUrls = seeAlso.filter(u => u.includes('/playlists/'));

// playlist title/maker -> playlist resource URL
const onDisk = (u) => {
  const rel = u.slice(libBase.length);                 // playlists/Foo
  for (const c of [rel + '$.ttl', rel, rel + '.ttl'])  // CSS $.ttl encoding
    if (existsSync(join(libDir, c))) return join(libDir, c);
  return null;
};
const nameToPlaylist = new Map();
for (const u of plUrls) {
  const f = onDisk(u);
  if (!f) { console.warn('playlist file missing on disk:', u); continue; }
  const g = graph();
  try { parse(readFileSync(f, 'utf8'), g, u, 'text/turtle'); } catch (e) { console.warn('parse failed', u, e.message); continue; }
  const pl = g.match(null, RDF('type'), MO('Playlist'))[0]?.subject || sym(u);
  for (const v of [g.any(pl, DCT('title'))?.value, g.any(pl, RDFS('label'))?.value, g.any(pl, FOAF('maker'))?.value]) {
    if (v && !nameToPlaylist.has(norm(v))) nameToPlaylist.set(norm(v), u);
  }
}

// Find B stubs in agents.ttl.
const aStore = graph();
parse(readFileSync(join(libDir, 'agents.ttl'), 'utf8'), aStore, agentsUrl, 'text/turtle');
const matches = [];
for (const s of aStore.match(null, RDF('type'), MO('MusicArtist'))) {
  const agent = s.subject;
  if (aStore.any(agent, OMP('sourcePlaylist'))) continue;         // already A
  const name = aStore.any(agent, FOAF('name'))?.value;
  const pl = name && nameToPlaylist.get(norm(name));
  if (!pl) continue;
  matches.push({
    iri: agent.value, name, playlist: pl,
    genre: aStore.any(agent, MO('genre'))?.value || '(none)',
    landingPage: aStore.any(agent, DCAT('landingPage'))?.value || '(none)',
  });
}

console.log(`library base : ${libBase}`);
console.log(`playlists    : ${plUrls.length}  · name keys: ${nameToPlaylist.size}`);
console.log(`B stubs → link: ${matches.length}`);
for (const m of matches.slice(0, 40))
  console.log(`  ${m.name}  →  ${m.playlist.slice(libBase.length)}   [genre+landingPage kept]`);
if (matches.length > 40) console.log(`  …and ${matches.length - 40} more`);

if (!matches.length) { console.log('\nnothing to do.'); process.exit(0); }
if (!apply) { console.log('\n(dry run) — pass --apply to append the links to agents.ttl'); process.exit(0); }

const ts = new Date().toISOString().replace(/[:.]/g, '-');
copyFileSync(join(libDir, 'agents.ttl'), join(libDir, `agents.ttl.pre-namematch-${ts}`));
const O = 'http://open-media-player.org/ns#';
let appendix = `\n# --- linked name-matched playlists (migrate-link-namematched-playlists) ---\n`;
for (const m of matches) {
  appendix += `<${m.iri}> <${O}localData> true ; <${O}sourcePlaylist> <${m.playlist}> .\n`;
}
writeFileSync(join(libDir, 'agents.ttl'), readFileSync(join(libDir, 'agents.ttl'), 'utf8') + appendix);
console.log(`\napplied: appended ${matches.length} links. backup: agents.ttl.pre-namematch-${ts}`);
