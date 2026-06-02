#!/usr/bin/env node
// Phase A of the vocab migration — convert playlists + agents.ttl from
// the omp: namespace to the unified schema.org / Web Annotation vocab.
// See claude/plans/vocab-migration-plan.md and rdf-model/music.new.shaclc.
//
//   node claude/migration-scripts/convert-playlist-vocab.mjs [--apply]
//
// Playlists (libraries/internet_archive_music/playlists/*.ttl) — each
// file is parsed and re-emitted in the canonical new shape:
//   as:OrderedCollection      -> schema:ItemList, schema:MusicPlaylist
//   omp:entry                 -> schema:itemListElement
//   (entry node)              -> a schema:ListItem
//   omp:position "N"|N        -> schema:position N   (normalised to int)
//   omp:track                 -> schema:item
//   omp:hidePlaylist <truthy> -> oa:styleClass "hidden"
//   + schema:itemListOrder schema:ItemListOrderAscending
// agents.ttl:
//   omp:sourcePlaylist        -> dct:source
//   omp:localData             -> dropped (after asserting it is a
//                                subset of omp:sourcePlaylist)
//
// Dry-run by default; --apply writes, backing every file up under
// claude/backups/ first. Idempotent: already-converted files are
// skipped.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { graph, parse, sym } from 'rdflib';

const apply = process.argv.includes('--apply');
const LIB = 'libraries/internet_archive_music';
const PLDIR = join(LIB, 'playlists');
const AGENTS = join(LIB, 'agents.ttl');

const RDF  = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const AS   = 'https://www.w3.org/ns/activitystreams#';
const OMP  = 'http://open-media-player.org/ns#';
const DCT  = 'http://purl.org/dc/terms/';
const FOAF = 'http://xmlns.com/foaf/0.1/';
const MARKER = '/internet_archive_music/';

const ttl = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
const pad = (n) => String(n).padStart(2, '0');
// Absolute in-library IRI -> path relative to a playlists/ file.
const toRel = (iri) => {
  const i = iri.indexOf(MARKER);
  return i < 0 ? iri : '../' + iri.slice(i + MARKER.length);
};

const tstamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = join('claude', 'backups', `convert-playlist-vocab-${tstamp}`);
const backup = (file) => {
  const bk = join(backupDir, file);
  mkdirSync(dirname(bk), { recursive: true });
  copyFileSync(file, bk);
};

let converted = 0, skipped = 0;

// ---- playlists ----------------------------------------------------
const plFiles = existsSync(PLDIR)
  ? readdirSync(PLDIR).filter(n =>
      n.endsWith('.ttl') && !n.startsWith('#') && !n.endsWith('~') && !n.includes('.pre-'))
  : [];

for (const name of plFiles) {
  const file = join(PLDIR, name);
  const slug = name.replace(/\$?\.ttl$/, '');
  const base = `http://omp.local${MARKER}playlists/${slug}`;
  const text = readFileSync(file, 'utf8');
  const store = graph();
  try { parse(text, store, base, 'text/turtle'); }
  catch (e) { console.error(`PARSE FAILED ${name}: ${e.message}`); process.exit(1); }

  const pl = store.any(null, sym(RDF + 'type'), sym(AS + 'OrderedCollection'));
  if (!pl) { console.log(`skip     ${name}  (no as:OrderedCollection — already converted?)`); skipped++; continue; }

  const get = (p) => store.any(pl, sym(p))?.value;
  const title = get(DCT + 'title') || slug;
  const maker = get(FOAF + 'maker');
  const description = get(DCT + 'description');
  const hidden = !!store.any(pl, sym(OMP + 'hidePlaylist'));

  const entries = store.each(pl, sym(OMP + 'entry')).map(e => ({
    position: parseInt(store.any(e, sym(OMP + 'position'))?.value, 10),
    track: store.any(e, sym(OMP + 'track'))?.value,
  }));
  for (const e of entries) {
    if (!Number.isInteger(e.position) || !e.track) {
      console.error(`ABORT ${name}: an entry is missing omp:position or omp:track.`);
      process.exit(1);
    }
  }
  entries.sort((a, b) => a.position - b.position);

  const ids = entries.map((_, i) => `<#e${pad(i + 1)}>`);
  const props = [
    'a schema:ItemList, schema:MusicPlaylist, dcat:Dataset',
    `dct:title ${ttl(title)}`,
    'dct:isPartOf <../playlists.ttl#it>',
    'schema:itemListOrder schema:ItemListOrderAscending',
  ];
  if (maker) props.push(`foaf:maker ${ttl(maker)}`);
  if (description) props.push(`dct:description ${ttl(description)}`);
  if (hidden) props.push('oa:styleClass "hidden"');
  if (ids.length) props.push(`schema:itemListElement ${ids.join(', ')}`);

  let out =
`@prefix dct: <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix schema: <http://schema.org/> .
@prefix oa: <http://www.w3.org/ns/oa#> .

<>
    ${props.join(' ;\n    ')} .
`;
  entries.forEach((e, i) => {
    out += `\n<#e${pad(i + 1)}>\n    a schema:ListItem ;\n    schema:position ${i + 1} ;\n    schema:item <${toRel(e.track)}> .\n`;
  });

  console.log(`${apply ? 'convert ' : 'would   '} ${name}  (${entries.length} items${hidden ? ', hidden' : ''})`);
  if (apply) { backup(file); writeFileSync(file, out); }
  converted++;
}

// ---- agents.ttl ---------------------------------------------------
if (existsSync(AGENTS)) {
  const text = readFileSync(AGENTS, 'utf8');
  const store = graph();
  parse(text, store, `http://omp.local${MARKER}agents.ttl`, 'text/turtle');

  const ld = new Set(store.match(null, sym(OMP + 'localData'), null).map(s => s.subject.value));
  const sp = new Set(store.match(null, sym(OMP + 'sourcePlaylist'), null).map(s => s.subject.value));
  const orphan = [...ld].filter(s => !sp.has(s));
  if (orphan.length) {
    console.error(`ABORT: ${orphan.length} agent(s) have omp:localData but no omp:sourcePlaylist:`);
    orphan.forEach(s => console.error('  ' + s));
    process.exit(1);
  }
  // Each omp:localData line must end with ';' (an omp:sourcePlaylist
  // line follows) so deleting it leaves valid Turtle.
  const badLd = text.split('\n').filter(l => l.includes(OMP + 'localData') && !/;\s*$/.test(l));
  if (badLd.length) {
    console.error('ABORT: an omp:localData line does not end with ";" — manual review needed:');
    badLd.forEach(l => console.error('  ' + l.trim()));
    process.exit(1);
  }

  const ompRe = OMP.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const out = text
    .replace(new RegExp(`^[^\\n]*<${ompRe}localData>[^\\n]*\\n`, 'gm'), '')
    .split(`<${OMP}sourcePlaylist>`).join('dct:source');

  console.log(`${apply ? 'convert ' : 'would   '} agents.ttl  (${ld.size} agents: omp:sourcePlaylist→dct:source, omp:localData dropped)`);
  if (apply && out !== text) { backup(AGENTS); writeFileSync(AGENTS, out); }
}

console.log(`\n${converted} playlists ${apply ? 'converted' : 'to convert'}, ${skipped} skipped.`);
if (apply) console.log(`backups: ${backupDir}`);
else console.log('dry-run — re-run with --apply to write.');
