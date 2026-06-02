#!/usr/bin/env node
// shared-releases Phase 1 (ADDITIVE, non-destructive).
//
// Backfill releases.ttl so the dedup key is resolvable without fetching
// every release file: for each release file the index rdfs:seeAlsos,
// add `<releaseFileURL> dcat:landingPage <lp>` (the archive.org item =
// the shared-releases dedup identity, plan §3). Nothing reads these
// triples yet (Phase 2 will), so this is safe to land alone and is
// trivially reversible (drop the appended block).
//
//   node migrate-shared-releases-index.js [libDir]          # dry run
//   node migrate-shared-releases-index.js --apply [libDir]  # write
//
// libDir defaults to ./libraries/internet_archive_music.
// --apply backs up releases.ttl first, then appends one absolute-IRI
// stanza per release (no reserialise → minimal diff). Idempotent:
// release files already carrying a landingPage triple in the index are
// skipped, so re-running is safe.

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import rdflib from 'rdflib';

const { graph, parse, sym, Namespace } = rdflib;
const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const libDir = resolve(__dirname, args.find(a => !a.startsWith('--')) || 'libraries/internet_archive_music');

const RDFS = Namespace('http://www.w3.org/2000/01/rdf-schema#');
const DCAT = Namespace('http://www.w3.org/ns/dcat#');
const MO   = Namespace('http://purl.org/ontology/mo/');
const RDF  = Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#');

const idxPath = join(libDir, 'releases.ttl');
if (!existsSync(idxPath)) { console.error('no releases.ttl at', idxPath); process.exit(1); }

const idxStore = graph();
const idxText = readFileSync(idxPath, 'utf8');
parse(idxText, idxStore, 'urn:tmp:rel-idx', 'text/turtle');

const idxSubj = idxStore.match(null, RDFS('seeAlso'), null)[0]?.subject?.value;
const libBase = idxSubj?.replace(/releases\.ttl$/, '');
if (!libBase) { console.error('could not derive library base from releases.ttl'); process.exit(1); }

const seeAlso = idxStore.match(null, RDFS('seeAlso'), null).map(s => s.object.value);
// landingPage triples already present in the index (idempotency guard).
const haveLp = new Set(
  idxStore.match(null, DCAT('landingPage'), null).map(s => s.subject.value)
);

const onDisk = (u) => {
  const rel = u.slice(libBase.length);                  // releases/foo
  for (const c of [rel + '$.ttl', rel, rel + '.ttl'])   // CSS $.ttl encoding
    if (existsSync(join(libDir, c))) return join(libDir, c);
  return null;
};

const rows = [];      // { file, lp }
const missingFile = [];
const noLanding = [];
const already = [];

for (const u of seeAlso) {
  if (haveLp.has(u)) { already.push(u); continue; }
  const f = onDisk(u);
  if (!f) { missingFile.push(u); continue; }
  const g = graph();
  try { parse(readFileSync(f, 'utf8'), g, u, 'text/turtle'); }
  catch (e) { console.warn('parse failed', u, e.message); missingFile.push(u); continue; }
  // The release's landingPage. Prefer the mo:Release subject's; fall
  // back to any landingPage in the file (single-release files).
  const rel = g.match(null, RDF('type'), MO('Release'))[0]?.subject;
  const lp = (rel && g.any(rel, DCAT('landingPage'))?.value)
          || g.match(null, DCAT('landingPage'), null)[0]?.object?.value;
  if (!lp) { noLanding.push(u); continue; }
  rows.push({ file: u, lp });
}

console.log(`library base   : ${libBase}`);
console.log(`index seeAlsos : ${seeAlso.length}`);
console.log(`already have lp: ${already.length}`);
console.log(`to add         : ${rows.length}`);
if (noLanding.length)   console.log(`no landingPage : ${noLanding.length}  (skipped) e.g. ${noLanding.slice(0,3).map(u=>u.slice(libBase.length)).join(', ')}`);
if (missingFile.length) console.log(`file missing   : ${missingFile.length}  (skipped) e.g. ${missingFile.slice(0,3).map(u=>u.slice(libBase.length)).join(', ')}`);
for (const r of rows.slice(0, 8))
  console.log(`  ${r.file.slice(libBase.length)}  →  ${r.lp}`);
if (rows.length > 8) console.log(`  …and ${rows.length - 8} more`);

if (!rows.length) { console.log('\nnothing to add — index already complete.'); process.exit(0); }

let appendix = `\n# --- shared-releases Phase 1: resolvable dedup keys (migrate-shared-releases-index) ---\n`;
for (const r of rows) appendix += `<${r.file}> <http://www.w3.org/ns/dcat#landingPage> <${r.lp}> .\n`;

if (!apply) {
  console.log('\n(dry run) — pass --apply to append the landingPage triples to releases.ttl');
  console.log('--- appendix preview (first 4) ---');
  console.log(appendix.split('\n').slice(0, 6).join('\n'));
  process.exit(0);
}

const ts = new Date().toISOString().replace(/[:.]/g, '-');
copyFileSync(idxPath, join(libDir, `releases.ttl.pre-sharedidx-${ts}`));
writeFileSync(idxPath, idxText + appendix);
console.log(`\napplied: appended ${rows.length} landingPage triples. backup: releases.ttl.pre-sharedidx-${ts}`);
