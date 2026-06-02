#!/usr/bin/env node
// One-shot migration: split a monolithic releases.ttl into one file per
// mo:Release plus an index.
//
//   libraries/<lib>/releases.ttl   (was: all Releases + Tracks)
//      ->  releases.ttl            becomes rdfs:seeAlso index
//          releases/<slug>.ttl     one mo:Release + its mo:Tracks each
//
// Slug rule (locked): lowercase, spaces -> _, strip non-alphanumerics,
// _N suffix on collision. Derived from the Release dcterms:title (then
// landingPage basename, then the urn:uuid) .
//
// The recursive seeAlso loader (Phase 0) walks index.ttl -> releases.ttl
// -> releases/<slug>.ttl, so everything merges into one store exactly as
// before. urn:uuid subjects are location-independent; cross-file
// foaf:maker -> agents.ttl IRIs are absolute and unaffected.
//
// Usage:
//   node migrate-releases-multifile.js [libDir]            # dry run
//   node migrate-releases-multifile.js --apply [libDir]    # rewrite
//
// libDir defaults to ./libraries/internet_archive_music.
// --apply backs the original releases.ttl up first.

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import rdflib from 'rdflib';

const { graph, parse, serialize, sym, Namespace } = rdflib;
const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const libDir = resolve(__dirname, args.find(a => !a.startsWith('--')) || 'libraries/internet_archive_music');

const RDF  = Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#');
const RDFS = Namespace('http://www.w3.org/2000/01/rdf-schema#');
const DCT  = Namespace('http://purl.org/dc/terms/');
const DCAT = Namespace('http://www.w3.org/ns/dcat#');
const MO   = Namespace('http://purl.org/ontology/mo/');

// Served base for this library (subject of the seeAlso index). Read it
// off the index.ttl's own subject so we stay deployment-correct.
const indexPath = join(libDir, 'index.ttl');
const relPath   = join(libDir, 'releases.ttl');
if (!existsSync(relPath)) { console.error('no releases.ttl at', relPath); process.exit(1); }

const idxStore = graph();
parse(readFileSync(indexPath, 'utf8'), idxStore, 'urn:tmp:index', 'text/turtle');
const libBase = idxStore.match(null, RDFS('seeAlso'), null)[0]?.subject?.value
  ?.replace(/index\.ttl$/, '') || null;
if (!libBase) { console.error('could not derive library base URL from index.ttl'); process.exit(1); }
const releasesUrl = libBase + 'releases.ttl';
const releasesDir = libBase + 'releases/';

const store = graph();
parse(readFileSync(relPath, 'utf8'), store, releasesUrl, 'text/turtle');

const slugify = (s) => String(s).toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/_+/g, '_').replace(/^_|_$/g, '');
const used = new Set();
const uniqueSlug = (base) => {
  let s = base || 'release';
  if (!used.has(s)) { used.add(s); return s; }
  let n = 2;
  while (used.has(`${s}_${n}`)) n++;
  used.add(`${s}_${n}`);
  return `${s}_${n}`;
};

const releases = store.match(null, RDF('type'), MO('Release')).map(s => s.subject);
const tracksSeen = new Set();
let leftover = store.statements.length;
const files = [];   // { slug, ttl, n }

for (const rel of releases) {
  const title = store.any(rel, DCT('title'))?.value;
  const lp = store.any(rel, DCAT('landingPage'))?.value;
  const base = slugify(title) || slugify(lp ? lp.split('/').filter(Boolean).pop() : '') || slugify(rel.value.replace('urn:uuid:', ''));
  const slug = uniqueSlug(base);

  const g = graph();
  const copy = (subj) => {
    for (const st of store.statementsMatching(subj, null, null)) {
      g.add(st.subject, st.predicate, st.object);
      leftover--;
    }
  };
  copy(rel);
  for (const t of store.match(rel, MO('track'), null)) {
    if (!tracksSeen.has(t.object.value)) { tracksSeen.add(t.object.value); copy(t.object); }
  }
  // Resource URL is extension-less (CSS serves it via the on-disk
  // `<slug>$.ttl` content-type-suffix encoding, same as playlists).
  const ttl = serialize(undefined, g, releasesDir + slug, 'text/turtle');
  files.push({ slug, ttl, n: store.match(rel, MO('track'), null).length, title: title || lp || rel.value });
}

// New releases.ttl = index.
const idxLines = [
  '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.',
  '@prefix dcterms: <http://purl.org/dc/terms/>.',
  '',
  `<${releasesUrl}> dcterms:title "Internet Archive Music — releases index";`,
  '    rdfs:seeAlso ' + files.map(f => `<${releasesDir}${f.slug}>`).join(',\n                 ') + '.',
  '',
];
const indexTtl = idxLines.join('\n');

console.log(`library base : ${libBase}`);
console.log(`releases     : ${releases.length}  ->  ${files.length} files`);
console.log(`tracks moved : ${tracksSeen.size}`);
console.log(`leftover triples (should be 0): ${leftover}`);
console.log('sample slugs :', files.slice(0, 6).map(f => f.slug).join(', '), files.length > 6 ? '…' : '');
if (leftover !== 0) {
  console.error('\nABORT: non-Release/Track triples in releases.ttl — inspect before splitting.');
  process.exit(1);
}

if (!apply) {
  console.log('\n(dry run) — pass --apply to write. Would create:');
  console.log(`  ${relPath}  (rewritten as index, ${files.length} seeAlso)`);
  console.log(`  ${join(libDir, 'releases')}/<slug>.ttl  ×${files.length}`);
  process.exit(0);
}

const ts = new Date().toISOString().replace(/[:.]/g, '-');
copyFileSync(relPath, join(libDir, `releases.ttl.pre-multifile-${ts}`));
mkdirSync(join(libDir, 'releases'), { recursive: true });
// Extension-less resource URL; CSS stores it on disk as `<slug>$.ttl`
// (content-type suffix), the same encoding playlists use.
for (const f of files) writeFileSync(join(libDir, 'releases', f.slug + '$.ttl'), f.ttl);
writeFileSync(relPath, indexTtl);
console.log(`\napplied. backup: releases.ttl.pre-multifile-${ts}`);
