#!/usr/bin/env node
// shared-releases Phase 4 — THE one-shot migration (irreversible).
//
// Un-clones every self-contained playlist into shared releases/<slug>
// files, deduped by dcat:landingPage, reconciled against the existing
// catalog release files, and rewrites each playlist to pointer-only
// (dcterms:hasPart → canonical Track IRIs that live in releases/<slug>).
//
//   node migrate-shared-releases.js [libDir]          # dry run (default)
//   node migrate-shared-releases.js --apply [libDir]  # write + backup
//
// --apply backs up playlists/, releases/ and releases.ttl into
// .pre-sharedreleases-<ts>/ under libDir, then:
//   • writes new releases/<slug>$.ttl for each new landingPage
//   • appends missing Tracks to reused catalog release files
//   • appends seeAlso + landingPage for new releases to releases.ttl
//   • rewrites each playlist file to pointer-only
// Invariant I1 (every playlist hasPart Track is defined in some release
// file) is asserted before any write; the run aborts if it fails.

import { readFileSync, writeFileSync, copyFileSync, existsSync,
         readdirSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import rdflib from 'rdflib';

const { graph, parse, sym, Namespace } = rdflib;
const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const libDir = resolve(__dirname, args.find(a => !a.startsWith('--')) || 'libraries/internet_archive_music');

const RDF  = Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#');
const RDFS = Namespace('http://www.w3.org/2000/01/rdf-schema#');
const DCT  = Namespace('http://purl.org/dc/terms/');
const DCAT = Namespace('http://www.w3.org/ns/dcat#');
const MO   = Namespace('http://purl.org/ontology/mo/');
const FOAF = Namespace('http://xmlns.com/foaf/0.1/');

const idxPath = join(libDir, 'releases.ttl');
const idxText = readFileSync(idxPath, 'utf8');
const idxStore = graph();
parse(idxText, idxStore, 'urn:tmp:idx', 'text/turtle');
const idxSubj = idxStore.match(null, RDFS('seeAlso'), null)[0]?.subject?.value;
const libBase = idxSubj?.replace(/releases\.ttl$/, '');
if (!libBase) { console.error('no library base'); process.exit(1); }
const releasesDir = libBase + 'releases/';
const playlistsDir = libBase + 'playlists/';

// ---- Turtle term helpers (manual serialise → minimal, predictable diff)
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  .replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
const term = (t) => {
  if (t.termType === 'NamedNode') return `<${t.value}>`;
  if (t.termType === 'Literal') {
    let s = `"${esc(t.value)}"`;
    if (t.language) s += `@${t.language}`;
    else if (t.datatype && t.datatype.value !== 'http://www.w3.org/2001/XMLSchema#string')
      s += `^^<${t.datatype.value}>`;
    return s;
  }
  return `<${t.value}>`;
};
const slugify = (label) => String(label).trim()
  .replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80).toLowerCase() || 'release';

const onDisk = (u) => {
  const rel = u.slice(libBase.length);
  for (const c of [rel + '$.ttl', rel, rel + '.ttl'])
    if (existsSync(join(libDir, c))) return join(libDir, c);
  return null;
};

// ---- 1. Catalog: lp → { fileUrl, path, relNode, store, trackByDl }
const catalog = new Map();
for (const s of idxStore.match(null, DCAT('landingPage'), null)) {
  const fileUrl = s.subject.value, lp = s.object.value;
  const p = onDisk(fileUrl);
  if (!p) { console.warn('catalog file missing:', fileUrl); continue; }
  const g = graph();
  parse(readFileSync(p, 'utf8'), g, fileUrl, 'text/turtle');
  const relNode = g.match(null, RDF('type'), MO('Release'))[0]?.subject;
  const trackByDl = new Map();
  for (const ts of g.match(null, RDF('type'), MO('Track'))) {
    const dl = g.any(ts.subject, DCAT('downloadUrl'))?.value;
    if (dl) trackByDl.set(dl, ts.subject.value);
  }
  catalog.set(lp, { fileUrl, path: p, relNode, store: g, trackByDl, addTracks: [] });
}

// ---- 2. Plan structures
// canonical: key `${lp}\n${dl}` → { iri }
const canonical = new Map();
for (const [lp, c] of catalog)
  for (const [dl, iri] of c.trackByDl) canonical.set(`${lp}\n${dl}`, { iri });

const newReleases = new Map();   // lp → { slug, fileUrl, relIRI, title, makers[], tracks: Map(dl→{iri,title,dur}) }
const usedSlugs = new Set();
for (const f of readdirSync(join(libDir, 'releases'))) usedSlugs.add(f.replace(/\$?\.ttl$/, ''));
const catalogAppends = [];       // { lp, dl, iri, title, dur }
const playlistPlans = [];        // { file, plNode, metaTriples[], hasPartOrder[ canonicalIRI ] }
const lpToPlaylists = new Map();

const plFiles = readdirSync(join(libDir, 'playlists')).filter(f => f.endsWith('.ttl')).sort();

for (const f of plFiles) {
  const fileUrl = playlistsDir + f.replace(/\$?\.ttl$/, '');
  const g = graph();
  parse(readFileSync(join(libDir, 'playlists', f), 'utf8'), g, fileUrl, 'text/turtle');
  const plNode = g.match(null, RDF('type'), MO('Playlist'))[0]?.subject;
  if (!plNode) { console.warn('no mo:Playlist in', f, '— skipped'); continue; }

  // playlist Track node → (lp, dl) via its owning Release
  const relOf = new Map();
  for (const rs of g.match(null, RDF('type'), MO('Release'))) {
    const r = rs.subject;
    const lp = g.any(r, DCAT('landingPage'))?.value;
    if (!lp) { console.error('FATAL: release without landingPage in', f, r.value); process.exit(1); }
    if (!lpToPlaylists.has(lp)) lpToPlaylists.set(lp, new Set());
    lpToPlaylists.get(lp).add(f);
    for (const tt of g.match(r, MO('track'), null)) relOf.set(tt.object.value, { lp, relNode: r });
  }

  // resolve every cloned Track to a canonical IRI
  const trkMap = new Map();   // playlistTrackIRI → canonicalIRI
  for (const ts of g.match(null, RDF('type'), MO('Track'))) {
    const tIRI = ts.subject.value;
    const dl = g.any(ts.subject, DCAT('downloadUrl'))?.value;
    const title = g.any(ts.subject, DCT('title'))?.value || '(untitled)';
    const dur = g.any(ts.subject, MO('duration'))?.value || '';
    const owner = relOf.get(tIRI);
    if (!dl || !owner) { console.error('FATAL: track w/o downloadUrl or release in', f, tIRI); process.exit(1); }
    const lp = owner.lp, key = `${lp}\n${dl}`;

    if (canonical.has(key)) { trkMap.set(tIRI, canonical.get(key).iri); continue; }

    if (catalog.has(lp)) {
      // album exists in catalog but this track isn't in that file → append it
      canonical.set(key, { iri: tIRI });
      trkMap.set(tIRI, tIRI);
      const c = catalog.get(lp);
      c.addTracks.push({ iri: tIRI, title, dur, dl });
      catalogAppends.push({ lp, file: c.fileUrl });
      continue;
    }

    // brand-new release
    if (!newReleases.has(lp)) {
      const relG = owner.relNode;
      const rTitle = g.any(relG, DCT('title'))?.value || '(untitled album)';
      const makers = g.match(relG, FOAF('maker'), null).map(s => s.object);
      let slug = slugify(rTitle), n = 1;
      while (usedSlugs.has(slug)) slug = slugify(rTitle) + '_' + n++;
      usedSlugs.add(slug);
      newReleases.set(lp, {
        slug, fileUrl: releasesDir + slug, relIRI: relG.value,
        title: rTitle, makers, lp, tracks: new Map(),
      });
    }
    const nr = newReleases.get(lp);
    if (!nr.tracks.has(dl)) nr.tracks.set(dl, { iri: tIRI, title, dur });
    canonical.set(key, { iri: nr.tracks.get(dl).iri });
    trkMap.set(tIRI, nr.tracks.get(dl).iri);
  }

  // playlist metadata = every triple on plNode except hasPart
  const metaTriples = g.match(plNode, null, null)
    .filter(s => s.predicate.value !== DCT('hasPart').value);
  const hasPartOrder = g.match(plNode, DCT('hasPart'), null)
    .map(s => trkMap.get(s.object.value) || s.object.value);
  playlistPlans.push({ file: f, fileUrl, plNode: plNode.value, metaTriples, hasPartOrder });
}

// ---- 3. Invariant I1: every hasPart canonical IRI is defined somewhere
const defined = new Set();
for (const [, c] of catalog) for (const [, iri] of c.trackByDl) defined.add(iri);
for (const a of catalogAppends) {} // appended IRIs:
for (const [, c] of catalog) for (const t of c.addTracks) defined.add(t.iri);
for (const [, nr] of newReleases) for (const [, t] of nr.tracks) defined.add(t.iri);
let dangling = 0;
for (const p of playlistPlans)
  for (const iri of p.hasPartOrder) if (!defined.has(iri)) {
    dangling++; if (dangling <= 5) console.error('  DANGLING hasPart:', p.file, iri);
  }

// ---- 4. Report
const shared = [...lpToPlaylists].filter(([, s]) => s.size > 1);
console.log(`library base        : ${libBase}`);
console.log(`playlists to migrate: ${playlistPlans.length}`);
console.log(`catalog releases    : ${catalog.size}`);
console.log(`NEW release files   : ${newReleases.size}`);
console.log(`tracks appended to catalog files : ${catalogAppends.length} (across ${new Set(catalogAppends.map(a=>a.lp)).size} albums)`);
console.log(`distinct canonical tracks        : ${canonical.size}`);
console.log(`landingPages shared >1 playlist  : ${shared.length}`);
for (const [lp, s] of shared) console.log(`   ${lp.replace('https://archive.org/details/','det:')}  [${[...s].map(x=>x.replace('$.ttl','')).join(', ')}]`);
console.log(`INVARIANT I1 (no dangling hasPart): ${dangling === 0 ? 'OK' : 'FAIL ('+dangling+')'}`);
console.log('sample new releases:');
for (const [lp, nr] of [...newReleases].slice(0, 6))
  console.log(`   ${nr.slug}  (${nr.tracks.size} trk)  ${lp.replace('https://archive.org/details/','det:')}`);

if (dangling) { console.error('\nABORT: invariant I1 failed — no writes.'); process.exit(1); }

// ---- 5. Serialise outputs
const PL_PREFIX =
`@prefix mo: <http://purl.org/ontology/mo/>.
@prefix foaf: <http://xmlns.com/foaf/0.1/>.
@prefix dcterms: <http://purl.org/dc/terms/>.
@prefix dctypes: <http://purl.org/dc/dcmitype/>.
@prefix dcat: <http://www.w3.org/ns/dcat#>.
@prefix omp: <http://open-media-player.org/ns#>.
`;
function playlistBody(p) {
  let b = PL_PREFIX + `\n<${p.plNode}> a dctypes:Collection, mo:Playlist`;
  for (const s of p.metaTriples) {
    if (s.predicate.value === RDF('type').value) continue;
    b += `;\n    <${s.predicate.value}> ${term(s.object)}`;
  }
  b += `;\n    dcterms:hasPart ${p.hasPartOrder.map(i => `<${i}>`).join(', ')}.\n`;
  return b;
}
function newReleaseBody(nr) {
  let b =
`@prefix mo: <http://purl.org/ontology/mo/>.
@prefix foaf: <http://xmlns.com/foaf/0.1/>.
@prefix dcterms: <http://purl.org/dc/terms/>.
@prefix dcat: <http://www.w3.org/ns/dcat#>.

<${nr.relIRI}> a mo:Release;
    dcterms:title "${esc(nr.title)}";
`;
  if (nr.makers.length)
    b += `    foaf:maker ${nr.makers.map(term).join(', ')};\n`;
  b += `    dcat:landingPage <${nr.lp}>;\n`;
  b += `    mo:track ${[...nr.tracks.values()].map(t => `<${t.iri}>`).join(', ')}.\n`;
  for (const t of nr.tracks.values()) {
    b += `<${t.iri}> a mo:Track; dcterms:title "${esc(t.title)}"`;
    if (t.dur) b += `; mo:duration "${esc(t.dur)}"`;
    b += `; dcat:downloadUrl <${t.dl ?? [...nr.tracks].find(([dl,v])=>v===t)?.[0]}>.\n`;
  }
  return b;
}
// fix: ensure each new-release track carries its downloadUrl
for (const [, nr] of newReleases)
  for (const [dl, t] of nr.tracks) t.dl = dl;

if (!apply) {
  const sample = [...newReleases.values()][0];
  console.log('\n(dry run) — pass --apply to write. Preview of one new release file:');
  console.log('--- ' + sample.slug + '$.ttl (head) ---');
  console.log(newReleaseBody(sample).split('\n').slice(0, 8).join('\n'));
  const pp = playlistPlans[0];
  console.log('\n--- ' + pp.file + ' rewritten (head) ---');
  console.log(playlistBody(pp).split('\n').slice(0, 6).join('\n'));
  process.exit(0);
}

// ---- 6. Apply: backup then write
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const bak = join(libDir, `.pre-sharedreleases-${ts}`);
mkdirSync(join(bak, 'playlists'), { recursive: true });
mkdirSync(join(bak, 'releases'), { recursive: true });
for (const f of readdirSync(join(libDir, 'playlists')))
  copyFileSync(join(libDir, 'playlists', f), join(bak, 'playlists', f));
for (const f of readdirSync(join(libDir, 'releases')))
  copyFileSync(join(libDir, 'releases', f), join(bak, 'releases', f));
copyFileSync(idxPath, join(bak, 'releases.ttl'));

// new release files
for (const [, nr] of newReleases)
  writeFileSync(join(libDir, 'releases', nr.slug + '$.ttl'), newReleaseBody(nr));

// append missing tracks to reused catalog files
const byFile = new Map();
for (const [, c] of catalog) if (c.addTracks.length) byFile.set(c, c.addTracks);
for (const [c, adds] of byFile) {
  let ap = `\n# --- shared-releases: tracks merged from playlists ---\n`;
  for (const t of adds) {
    ap += `<${t.iri}> a mo:Track; dcterms:title "${esc(t.title)}"`;
    if (t.dur) ap += `; mo:duration "${esc(t.dur)}"`;
    ap += `; dcat:downloadUrl <${t.dl}>.\n`;
    ap += `<${c.relNode.value}> mo:track <${t.iri}>.\n`;
  }
  writeFileSync(c.path, readFileSync(c.path, 'utf8') + ap);
}

// releases.ttl: seeAlso + landingPage for new releases
let idxAp = `\n# --- shared-releases: migrated playlist releases ---\n`;
for (const [lp, nr] of newReleases) {
  idxAp += `<${idxSubj}> <http://www.w3.org/2000/01/rdf-schema#seeAlso> <${nr.fileUrl}>.\n`;
  idxAp += `<${nr.fileUrl}> <http://www.w3.org/ns/dcat#landingPage> <${lp}>.\n`;
}
writeFileSync(idxPath, idxText + idxAp);

// rewrite playlists pointer-only
for (const p of playlistPlans)
  writeFileSync(join(libDir, 'playlists', p.file), playlistBody(p));

console.log(`\napplied. backup: ${bak.slice(libDir.length + 1)}`);
console.log(`  new release files : ${newReleases.size}`);
console.log(`  catalog files merged into : ${byFile.size}`);
console.log(`  playlists rewritten : ${playlistPlans.length}`);
