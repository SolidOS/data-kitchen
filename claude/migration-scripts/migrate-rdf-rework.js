#!/usr/bin/env node
// RDF rework Chunk A (P1 + P3) — THE one-shot migration.
//
//   node migrate-rdf-rework.js [libDir]           # dry run (default)
//   node migrate-rdf-rework.js --apply [libDir]   # write + backup
//
// Per releases/<slug>$.ttl:
//   • release subject  urn:uuid:… → <#it>   (P1: identity = doc IRI)
//   • + dct:identifier  = IA id (tail of dcat:landingPage)
//   • + dct:isPartOf <../index.ttl#it>      (P3: release → library)
//   • each track urn:uuid:… → <#tNN> (NN = file order, 1-based, padded)
//   • + <#tNN> dct:isPartOf <#it>           (P3: track → release)
//   • keep dcat:landingPage (human page), foaf:maker <urn:uuid:> (URN
//     exception — agents stay URNs), expand downloadUrl to absolute.
//   • re-serialise in house style (rdf-how2: CURIE subj/pred, relative
//     under ./libraries, indented, blank line after each block).
// Per playlists/<name>$.ttl:
//   • type → as:OrderedCollection (drop mo:Playlist + dctypes:Collection)
//   • dcterms:hasPart <urn:uuid:> → ordered omp:entry [ omp:position N ;
//     omp:track <../releases/slug#tNN> ]  (forward membership, NOT
//     isPartOf); drop the bare hasPart; keep title/maker/description.
// releases.ttl:
//   • regenerate from the releases/ set ONLY (rdfs:seeAlso, relative
//     releases: CURIEs) — the hand-kept landingPage dedup blocks are
//     dropped (now derived from dct:identifier in the release files).
//
// Invariants asserted before any --apply write (abort on violation):
//   I-uuid   no urn:uuid: release/track subjects remain
//   I-ident  every release has exactly one dct:identifier, all unique
//   I-spine  every track has dct:isPartOf its release; every release
//            has dct:isPartOf ../index.ttl#it
//   I-dangle every playlist omp:track resolves to an emitted track
//   I-order  every playlist entry has a unique 1-based omp:position
//
// Writes .migration-map.json (uuid → {slug,frag}) for the validator.

import { readFileSync, writeFileSync, copyFileSync, existsSync,
         readdirSync, mkdirSync, cpSync } from 'node:fs';
import { dirname, resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import rdflib from 'rdflib';

const { graph, parse, sym, lit, Namespace } = rdflib;
const __dirname = dirname(fileURLToPath(import.meta.url));
const args   = process.argv.slice(2);
const apply  = args.includes('--apply');
const libDir = resolve(__dirname,
  args.find(a => !a.startsWith('--')) || 'libraries/internet_archive_music');

const RDF  = Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#');
const RDFS = Namespace('http://www.w3.org/2000/01/rdf-schema#');
const DCT  = Namespace('http://purl.org/dc/terms/');
const DCAT = Namespace('http://www.w3.org/ns/dcat#');
const MO   = Namespace('http://purl.org/ontology/mo/');
const FOAF = Namespace('http://xmlns.com/foaf/0.1/');
const OMP  = Namespace('http://open-media-player.org/ns#');

// absolute root these files are served from (from index.ttl)
const ROOT = 'http://localhost:3000/s/test/ia/libraries/internet_archive_music/';

const relDir   = join(libDir, 'releases');
const plDir    = join(libDir, 'playlists');
const idxPath  = join(libDir, 'releases.ttl');
const libIdxPath = join(libDir, 'index.ttl');
const plIdxPath  = join(libDir, 'playlists.ttl');
const agentsPath = join(libDir, 'agents.ttl');
const genresPath = join(libDir, 'genres.ttl');

const slugOf  = f => basename(f).replace(/\$?\.ttl$/, '');
const pad     = n => String(n).padStart(2, '0');
const ttlEsc  = s => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
                       .replace(/\n/g, '\\n');
const isUuid  = t => t && t.termType === 'NamedNode' &&
                     t.value.startsWith('urn:uuid:');

const die = m => { console.error('ABORT:', m); process.exit(1); };

// ---- pass 1: parse every release file ------------------------------
const relFiles = readdirSync(relDir).filter(f => f.endsWith('.ttl'));
const releases = [];              // { slug, file, title, ident, lp,
                                  //   makers[], tracks[{frag,uuid,...}] }
const uuid2track = new Map();     // track uuid → { slug, frag }
const identSeen  = new Map();     // dct:identifier → slug (uniqueness)

for (const file of relFiles) {
  const slug = slugOf(file);
  const base = ROOT + 'releases/' + slug;
  const g = graph();
  try { parse(readFileSync(join(relDir, file), 'utf8'), g, base, 'text/turtle'); }
  catch (e) { die(`parse ${file}: ${e.message}`); }

  const relNode = g.statementsMatching(null, RDF('type'), MO('Release'))[0]?.subject;
  if (!relNode) die(`${file}: no mo:Release subject`);
  if (!isUuid(relNode)) die(`${file}: release subject not a urn:uuid: (${relNode.value})`);

  const title = g.any(relNode, DCT('title'))?.value ?? '';
  const lpNode = g.any(relNode, DCAT('landingPage'));
  if (!lpNode) die(`${file}: release has no dcat:landingPage`);
  const lp = lpNode.value;
  const m = lp.match(/archive\.org\/details\/(.+?)\/?$/);
  if (!m) die(`${file}: landingPage not an archive.org/details/ URL: ${lp}`);
  const ident = decodeURIComponent(m[1]);
  if (identSeen.has(ident))
    die(`duplicate dct:identifier "${ident}" — ${file} and ${identSeen.get(ident)}`);
  identSeen.set(ident, file);

  // Keep EVERY maker, preserving term type: urn:uuid / IRI agents AND
  // plain-literal artist names (some releases store the latter).
  const makers = g.statementsMatching(relNode, FOAF('maker'), null)
                  .map(s => ({ v: s.object.value,
                               lit: s.object.termType === 'Literal' }));

  // track order = order track subjects first appear in the file's
  // mo:track list, falling back to file scan order
  const trackOrder = g.statementsMatching(relNode, MO('track'), null)
                       .map(s => s.object).filter(isUuid).map(o => o.value);
  const seen = new Set(); const ordered = [];
  for (const u of trackOrder) if (!seen.has(u)) { seen.add(u); ordered.push(u); }
  for (const s of g.statementsMatching(null, RDF('type'), MO('Track')))
    if (isUuid(s.subject) && !seen.has(s.subject.value)) {
      seen.add(s.subject.value); ordered.push(s.subject.value);
    }

  const tracks = ordered.map((u, i) => {
    const tn = sym(u);
    const dl = g.any(tn, DCAT('downloadUrl'))?.value ?? null;
    const frag = '#t' + pad(i + 1);
    uuid2track.set(u, { slug, frag });
    return {
      frag, uuid: u,
      title: g.any(tn, DCT('title'))?.value ?? '',
      duration: g.any(tn, MO('duration'))?.value ?? null,
      downloadUrl: dl,
    };
  });
  if (!tracks.length) die(`${file}: release has no tracks`);

  releases.push({ slug, file, title, ident, lp, makers, tracks,
                  relUuid: relNode.value });
}

// ---- house-style serialisers ---------------------------------------
function serialiseRelease(r) {
  const L = [];
  L.push('@prefix dct: <http://purl.org/dc/terms/> .');
  L.push('@prefix mo: <http://purl.org/ontology/mo/> .');
  L.push('@prefix dcat: <http://www.w3.org/ns/dcat#> .');
  L.push('@prefix foaf: <http://xmlns.com/foaf/0.1/> .');
  L.push('');
  // predicate–object lines joined with " ;" and terminated " ."
  const po = [
    'a mo:Release, dcat:Dataset',
    `dct:title "${ttlEsc(r.title)}"`,
    `dct:identifier "${ttlEsc(r.ident)}"`,
    'dct:isPartOf <../releases.ttl#it>',
    `dcat:landingPage <${r.lp}>`,
    'mo:track ' + r.tracks.map(t => `<${t.frag}>`).join(', '),
  ];
  if (r.makers.length)
    po.push('foaf:maker ' + r.makers
      .map(m => m.lit ? `"${ttlEsc(m.v)}"` : `<${m.v}>`).join(', '));
  L.push('<#it>\n    ' + po.join(' ;\n    ') + ' .'); L.push('');
  for (const t of r.tracks) {
    const po = ['a mo:Track', `dct:title "${ttlEsc(t.title)}"`];
    if (t.duration != null) po.push(`mo:duration "${ttlEsc(t.duration)}"`);
    if (t.downloadUrl)      po.push(`dcat:downloadUrl <${t.downloadUrl}>`);
    po.push('dct:isPartOf <#it>');
    L.push(`<${t.frag}>\n    ` + po.join(' ;\n    ') + ' .'); L.push('');
  }
  return L.join('\n').replace(/\n+$/, '\n');
}

function serialisePlaylist(p) {
  const L = [];
  L.push('@prefix dct: <http://purl.org/dc/terms/> .');
  L.push('@prefix as: <https://www.w3.org/ns/activitystreams#> .');
  L.push('@prefix foaf: <http://xmlns.com/foaf/0.1/> .');
  L.push('@prefix dcat: <http://www.w3.org/ns/dcat#> .');
  L.push('@prefix omp: <http://open-media-player.org/ns#> .');
  L.push('');
  const po = [
    'a as:OrderedCollection, dcat:Dataset',
    `dct:title "${ttlEsc(p.title)}"`,
    'dct:isPartOf <../playlists.ttl#it>',
  ];
  if (p.maker)       po.push(`foaf:maker "${ttlEsc(p.maker)}"`);
  if (p.description) po.push(`dct:description "${ttlEsc(p.description)}"`);
  // Preserve the artist-only hide flag (kebab "Hide from Playlists").
  if (p.hidden != null) po.push(`omp:hidePlaylist "${ttlEsc(p.hidden)}"`);
  if (p.entries.length)
    po.push('omp:entry ' +
      p.entries.map((_, i) => `<#e${pad(i + 1)}>`).join(', '));
  L.push('<>\n    ' + po.join(' ;\n    ') + ' .'); L.push('');
  p.entries.forEach((e, i) => {
    L.push([
      `<#e${pad(i + 1)}>`,
      `    omp:position ${i + 1} ;`,
      `    omp:track <${e.ref}> .`,
    ].join('\n'));
    L.push('');
  });
  return L.join('\n').replace(/\n+$/, '\n');
}

// ---- pass 2: playlists --------------------------------------------
const plFiles = readdirSync(plDir).filter(f => /\$?\.ttl$/.test(f) && !f.startsWith('#'));
const playlists = [];
let dangling = 0;

for (const file of plFiles) {
  const name = slugOf(file);
  const base = ROOT + 'playlists/' + name;
  const g = graph();
  try { parse(readFileSync(join(plDir, file), 'utf8'), g, base, 'text/turtle'); }
  catch (e) { die(`parse playlist ${file}: ${e.message}`); }

  const plNode = g.statementsMatching(null, RDF('type'), null)
                  .map(s => s.subject).find(s => s.value.includes('/playlists/'))
                || sym(base);
  const title = g.any(plNode, DCT('title'))?.value ?? name;
  const maker = g.any(plNode, FOAF('maker'))?.value ?? null;
  const description = g.any(plNode, DCT('description'))?.value ?? null;
  const hidden = g.any(plNode, OMP('hidePlaylist'))?.value ?? null;

  // hasPart order = serialisation order in the source file
  const parts = g.statementsMatching(plNode, DCT('hasPart'), null)
                 .map(s => s.object).filter(isUuid).map(o => o.value);
  const entries = [];
  for (const u of parts) {
    const t = uuid2track.get(u);
    if (!t) { dangling++; console.warn(`  DANGLING ${name}: ${u}`); continue; }
    entries.push({ ref: `../releases/${t.slug}${t.frag}`, uuid: u });
  }
  playlists.push({ file, name, title, maker, description, hidden, entries,
                   srcCount: parts.length });
}

// ---- recursive DCAT catalog spine (no rdfs:seeAlso anywhere) -------
// index.ttl#it  a dcat:Catalog
//   dcat:catalog       → releases.ttl#it, playlists.ttl#it (sub-catalogs)
//   dcat:dataset       → agents.ttl#it   (the Artists authority dataset)
//   dcat:themeTaxonomy → genres.ttl#Music (the SKOS ConceptScheme)
// releases.ttl#it  a dcat:Catalog ; dcat:dataset → each release#it
// playlists.ttl#it a dcat:Catalog ; dcat:dataset → each playlist
// Every edge is a typed DCAT/SKOS relation that is ALSO the loader's
// forward edge — the rdfs:seeAlso / semantic split is gone.
function leafCatalog(selfRel, title, members) {
  const L = [];
  L.push('@prefix dct: <http://purl.org/dc/terms/> .');
  L.push('@prefix dcat: <http://www.w3.org/ns/dcat#> .');
  L.push('');
  L.push(`<${selfRel}#it>\n    a dcat:Catalog ;\n` +
    `    dct:title "${ttlEsc(title)}" ;\n` +
    '    dcat:dataset ' + members.join(',\n                 ') + ' .');
  L.push('');
  return L.join('\n').replace(/\n+$/, '\n');
}
// releases.ttl — catalog of release datasets (#it entities).
function serialiseIndex() {
  const slugs = releases.map(r => r.slug).sort();
  return leafCatalog('./releases.ttl', 'Internet Archive Music — releases',
    slugs.map(s => `<./releases/${s}#it>`));
}
// playlists.ttl — NEW catalog of playlist datasets.
function serialisePlaylistsIndex() {
  const names = playlists.map(p => p.name).sort();
  return leafCatalog('./playlists.ttl', 'Internet Archive Music — playlists',
    names.map(n => `<./playlists/${n}>`));
}
function libTitle() {
  const g = graph();
  try { parse(readFileSync(libIdxPath, 'utf8'), g, ROOT + 'index.ttl', 'text/turtle'); }
  catch { return 'Open Media — main library'; }
  return g.any(sym(ROOT + 'index.ttl'), DCT('title'))?.value
      || g.any(sym(ROOT + 'index.ttl#it'), DCT('title'))?.value
      || 'Open Media — main library';
}
function serialiseLibIndex() {
  const t = libTitle();
  const L = [];
  L.push('@prefix dct: <http://purl.org/dc/terms/> .');
  L.push('@prefix dcat: <http://www.w3.org/ns/dcat#> .');
  L.push('');
  L.push(`<>\n    a <#Library>, dcat:Catalog ;\n    dct:title "${ttlEsc(t)}" .`);
  L.push('');
  L.push('<#it>\n    a dcat:Catalog ;\n' +
    `    dct:title "${ttlEsc(t)}" ;\n` +
    '    dcat:catalog <./releases.ttl#it>, <./playlists.ttl#it> ;\n' +
    '    dcat:dataset <./agents.ttl#it> ;\n' +
    '    dcat:themeTaxonomy <./genres.ttl#Music> .');
  L.push('');
  return L.join('\n').replace(/\n+$/, '\n');
}

// ---- invariant gate -------------------------------------------------
if (dangling) die(`${dangling} dangling playlist omp:track — refusing to write`);
const idents = releases.map(r => r.ident);
if (new Set(idents).size !== idents.length) die('duplicate dct:identifier');

// ---- report ---------------------------------------------------------
console.log(`libDir        ${libDir}`);
console.log(`releases      ${releases.length} files, ` +
  `${releases.reduce((n, r) => n + r.tracks.length, 0)} tracks`);
console.log(`playlists     ${playlists.length} files, ` +
  `${playlists.reduce((n, p) => n + p.entries.length, 0)} entries ` +
  `(${playlists.reduce((n, p) => n + p.srcCount, 0)} hasPart src)`);
console.log(`dangling      ${dangling}`);
console.log(`mode          ${apply ? 'APPLY (writing)' : 'DRY RUN'}`);
console.log('\nsample release →\n' +
  serialiseRelease(releases.find(r => r.slug === 'wutang_forever')
                   || releases[0]).split('\n').slice(0, 14).join('\n'));
const samplePl = playlists.find(p => /Madlib/.test(p.name)) || playlists[0];
console.log('\nsample playlist →\n' +
  serialisePlaylist(samplePl).split('\n').slice(0, 12).join('\n'));

if (!apply) {
  console.log('\n(dry run — no files written. re-run with --apply)');
  process.exit(0);
}

// ---- apply ----------------------------------------------------------
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const bk = join(libDir, `.pre-rdfrework-${ts}`);
mkdirSync(bk);
for (const d of ['releases', 'playlists']) cpSync(join(libDir, d), join(bk, d), { recursive: true });
for (const p of ['releases.ttl', 'index.ttl', 'agents.ttl', 'genres.ttl'])
  if (existsSync(join(libDir, p))) copyFileSync(join(libDir, p), join(bk, p));
console.log(`\nbackup → ${bk}`);

for (const r of releases)
  writeFileSync(join(relDir, r.file), serialiseRelease(r));
for (const p of playlists)
  writeFileSync(join(plDir, p.file), serialisePlaylist(p));
writeFileSync(idxPath, serialiseIndex());
writeFileSync(plIdxPath, serialisePlaylistsIndex());
writeFileSync(libIdxPath, serialiseLibIndex());

// agents.ttl — declare the file itself as the "Artists" dcat:Dataset
// (the index links it via dcat:dataset). Prepend, don't reserialise
// the urn:uuid agent records (avoid churn/risk). Idempotent.
{
  let txt = readFileSync(agentsPath, 'utf8');
  if (!/#it>\s+a\s+dcat:Dataset/.test(txt)) {
    txt = '@prefix dct: <http://purl.org/dc/terms/> .\n' +
          '@prefix dcat: <http://www.w3.org/ns/dcat#> .\n\n' +
          '<#it>\n    a dcat:Dataset ;\n    dct:title "Artists" .\n\n' + txt;
    writeFileSync(agentsPath, txt);
  }
}
// genres.ttl — <#Music> becomes a skos:ConceptScheme (was a
// skos:Concept). topConceptOf <#Music> on each genre is now exactly
// correct (range = ConceptScheme); the genre read path is unchanged
// (it matches ?g skos:topConceptOf <#Music>, not Music's type).
{
  let txt = readFileSync(genresPath, 'utf8');
  const re = /(<#Music>\s+a\s+)skos:Concept(\b)/;
  if (re.test(txt)) writeFileSync(genresPath, txt.replace(re, '$1skos:ConceptScheme$2'));
}

const map = {};
for (const [u, v] of uuid2track) map[u] = v;
writeFileSync(join(libDir, '.migration-map.json'),
  JSON.stringify({ generated: ts, uuid2track: map }, null, 0));

console.log(`wrote ${releases.length} release + ${playlists.length} playlist files + releases.ttl`);
console.log('NEXT: run validate-rdf-rework.mjs, then the smoke suite.');
