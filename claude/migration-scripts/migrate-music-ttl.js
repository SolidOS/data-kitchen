#!/usr/bin/env node
// One-shot migration: rewrite ia-music.ttl from the flat ui:Link shape to the
// foaf:Agent / mo:Release / mo:Track / dctypes:Collection shape defined in
// drafts/music.shaclc. Backs up the original to ia-music.ttl.pre-migration.
//
// Behavior:
//   - Catalog ui:Link rows (dct:subject points at a regular genre) become
//     mo:MusicArtist Agents with foaf:name + dcat:landingPage + mo:genre.
//   - Favorites / Playlist ui:Link rows become mo:Release with foaf:maker
//     pointing at an Agent IRI. The Agent is resolved eagerly: the artist
//     name is parsed from the label prefix and matched against catalog
//     Agents by foaf:name; on a miss we mint a new <#Agent_Slug> typed
//     mo:MusicArtist with that foaf:name.
//   - Inverse dcterms:hasPart on each playlist.
//
// Usage:
//   node migrate-music-ttl.js [path]             # write in place, with backup
//   node migrate-music-ttl.js --dry-run [path]   # print to stdout, no write

import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import rdflib from 'rdflib';

const { graph, parse, Namespace, sym } = rdflib;
const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const SRC = resolve(args.find(a => !a.startsWith('--')) || `${__dirname}/ia-music.ttl`);
const BACKUP = `${SRC}.pre-migration`;

const RDF  = Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#');
const RDFS = Namespace('http://www.w3.org/2000/01/rdf-schema#');
const SKOS = Namespace('http://www.w3.org/2004/02/skos/core#');
const UI   = Namespace('http://www.w3.org/ns/ui#');
const DCT  = Namespace('http://purl.org/dc/terms/');

const BASE = 'http://localhost:3000/s/test/ia/ia-music.ttl';
const HASH = BASE + '#';

const src = readFileSync(SRC, 'utf8');
const store = graph();
parse(src, store, BASE, 'text/turtle');

const isLocal = (uri) => uri.startsWith(HASH);
const localName = (uri) => uri.slice(HASH.length);
const ref = (uri) => isLocal(uri) ? `<#${localName(uri)}>` : `<${uri}>`;
const ttlStr = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

// --- Classify subjects ------------------------------------------------

const genreUris = new Set(
  store.match(null, RDF('type'), SKOS('Concept')).map(s => s.subject.value)
);
const playlistClassUri = HASH + 'Playlist';
const playlistUris = new Set(
  store.match(null, RDF('type'), sym(playlistClassUri)).map(s => s.subject.value)
);
const favoritesUri = HASH + 'Favorites';

// A ui:Link becomes a Release iff its dct:subject is an explicit playlist
// (Favorites or one of the <#Playlist> instances). Everything else becomes
// an Agent (catalog) — preserves typos and undefined refs as dangling genre
// pointers rather than silently reclassifying them.
const isPlaylistSubject = (uri) =>
  uri === favoritesUri || playlistUris.has(uri);

// --- Build catalog name -> Agent URN map (for eager IRI resolution) ----

const links = store.match(null, RDF('type'), UI('Link'));
const nameToAgent = new Map();  // foaf:name -> Agent IRI
const catalogLinks = [];        // [{subj, label, href, subjectUri}]
const releaseLinks = [];        // [{subj, label, href, source, subjectUri}]

for (const stmt of links) {
  const subj = stmt.subject;
  const subjectOfLink = store.any(subj, DCT('subject'));
  if (!subjectOfLink) continue;
  const label = store.any(subj, UI('label'))?.value;
  const href = store.any(subj, UI('href'))?.value;
  const source = store.any(subj, DCT('source'))?.value;
  const subjUri = subjectOfLink.value;

  if (isPlaylistSubject(subjUri)) {
    releaseLinks.push({ subj, label, href, source, subjectUri: subjUri });
  } else {
    catalogLinks.push({ subj, label, href, subjectUri: subjUri });
    if (label && !nameToAgent.has(label)) nameToAgent.set(label, subj.value);
  }
}

// Parse "Artist Name — anything" or "Artist Name - anything" from a label.
function extractArtistName(label) {
  if (!label) return null;
  const m = String(label).match(/^(.+?)\s+[—-]\s+/);
  return m ? m[1].trim() : null;
}

function slugify(name) {
  return String(name).trim().replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'Agent';
}

// Mint Agent IRIs for any release publishers that don't match a catalog row.
const mintedAgents = new Map(); // foaf:name -> <#Agent_Slug> IRI
function resolveAgent(name) {
  if (!name) return null;
  if (nameToAgent.has(name)) return nameToAgent.get(name);
  if (mintedAgents.has(name)) return mintedAgents.get(name);
  // Mint
  let slug = 'Agent_' + slugify(name);
  let candidate = HASH + slug;
  let n = 1;
  // dedupe against existing IRIs in store and previously minted
  while (
    nameToAgent.has(candidate) ||
    [...mintedAgents.values()].includes(candidate) ||
    store.any(sym(candidate), null, null)
  ) {
    candidate = HASH + slug + n;
    n++;
  }
  mintedAgents.set(name, candidate);
  return candidate;
}

// --- Emit new TTL ------------------------------------------------------

const lines = [];
lines.push('@prefix : <' + HASH + '>.');
lines.push('@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.');
lines.push('@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.');
lines.push('@prefix skos: <http://www.w3.org/2004/02/skos/core#>.');
lines.push('@prefix dcterms: <http://purl.org/dc/terms/>.');
lines.push('@prefix dctypes: <http://purl.org/dc/dcmitype/>.');
lines.push('@prefix foaf: <http://xmlns.com/foaf/0.1/>.');
lines.push('@prefix mo: <http://purl.org/ontology/mo/>.');
lines.push('@prefix dcat: <http://www.w3.org/ns/dcat#>.');
lines.push('@prefix schema: <http://schema.org/>.');
lines.push('');

// Root concept
const musicNode = sym(HASH + 'Music');
const musicLabel = store.any(musicNode, SKOS('prefLabel'))?.value || 'Music';
lines.push('<#Music> a skos:Concept ;');
lines.push(`    skos:prefLabel ${ttlStr(musicLabel)} .`);
lines.push('');

// Other genres
for (const uri of genreUris) {
  if (uri === HASH + 'Music' || uri === favoritesUri) continue;
  const n = sym(uri);
  const prefLabel = store.any(n, SKOS('prefLabel'))?.value || localName(uri);
  const top = store.any(n, SKOS('topConceptOf'))?.value;
  const parts = [`${ref(uri)} a skos:Concept, mo:Genre`];
  parts.push(`    skos:prefLabel ${ttlStr(prefLabel)}`);
  if (top) parts.push(`    skos:topConceptOf ${ref(top)}`);
  lines.push(parts.join(' ;\n') + ' .');
}
lines.push('');

// Favorites — both a Concept (for the browse UI) and a Playlist (Collection)
lines.push('<#Favorites> a dctypes:Collection, mo:Playlist, skos:Concept ;');
lines.push('    dcterms:title "Favorites" ;');
lines.push('    skos:prefLabel "Favorites" ;');
lines.push('    skos:topConceptOf <#Music> .');
lines.push('');

// Playlists from old <#Playlist> class
for (const uri of playlistUris) {
  const label = store.any(sym(uri), RDFS('label'))?.value || localName(uri);
  lines.push(`${ref(uri)} a dctypes:Collection, mo:Playlist ;`);
  lines.push(`    dcterms:title ${ttlStr(label)} .`);
  lines.push('');
}

// Catalog Agents (mo:MusicArtist)
for (const { subj, label, href, subjectUri } of catalogLinks) {
  const id = `<${subj.value}>`;
  const parts = [`${id} a mo:MusicArtist`];
  if (label) parts.push(`    foaf:name ${ttlStr(label)}`);
  if (href) parts.push(`    dcat:landingPage <${href}>`);
  parts.push(`    mo:genre ${ref(subjectUri)}`);
  lines.push(parts.join(' ;\n') + ' .');
}
lines.push('');

// Releases
const hasPart = new Map();  // playlistUri -> [releaseUri]
for (const { subj, label, href, source, subjectUri } of releaseLinks) {
  const id = `<${subj.value}>`;
  const artistName = extractArtistName(label);
  const agentIri = resolveAgent(artistName);

  const parts = [`${id} a mo:Release`];
  if (label) parts.push(`    dcterms:title ${ttlStr(label)}`);
  if (agentIri) parts.push(`    foaf:maker ${ref(agentIri)}`);
  if (source) parts.push(`    dcat:landingPage <${source}>`);
  if (href) parts.push(`    dcat:downloadUrl <${href}>`);
  parts.push(`    dcterms:isPartOf ${ref(subjectUri)}`);
  if (artistName && nameToAgent.has(artistName)) {
    // Look up the catalog row's genre from its dct:subject (old shape).
    const catalogUri = nameToAgent.get(artistName);
    const g = store.any(sym(catalogUri), DCT('subject'));
    if (g) parts.push(`    mo:genre ${ref(g.value)}`);
  }
  lines.push(parts.join(' ;\n') + ' .');

  if (!hasPart.has(subjectUri)) hasPart.set(subjectUri, []);
  hasPart.get(subjectUri).push(subj.value);
}
lines.push('');

// Minted Agents (publishers that didn't match a catalog row)
for (const [name, iri] of mintedAgents) {
  lines.push(`${ref(iri)} a mo:MusicArtist ;`);
  lines.push(`    foaf:name ${ttlStr(name)} .`);
}
if (mintedAgents.size) lines.push('');

// Inverse hasPart edges
for (const [pUri, members] of hasPart) {
  if (!members.length) continue;
  lines.push(`${ref(pUri)} dcterms:hasPart ${members.map(u => `<${u}>`).join(', ')} .`);
}

const out = lines.join('\n') + '\n';

if (dryRun) {
  process.stdout.write(out);
  console.error(`\n[dry-run] would write ${SRC}`);
  console.error(`[dry-run] artists=${catalogLinks.length} releases=${releaseLinks.length} minted-agents=${mintedAgents.size} playlists=${playlistUris.size} genres=${genreUris.size}`);
} else {
  copyFileSync(SRC, BACKUP);
  writeFileSync(SRC, out);
  console.error(`Backup: ${BACKUP}`);
  console.error(`Wrote:  ${SRC}`);
  console.error(`artists=${catalogLinks.length} releases=${releaseLinks.length} minted-agents=${mintedAgents.size} playlists=${playlistUris.size} genres=${genreUris.size}`);
}
