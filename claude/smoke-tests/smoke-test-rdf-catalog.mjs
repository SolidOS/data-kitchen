// RDF-rework (P1+P2+P3) catalog verification, two independent angles:
//
// (1) NEW-MODEL CATALOG INTEGRITY — every release file is a single
//     `<#it> a mo:Release, dcat:Dataset` with exactly one
//     dct:identifier and the dct:isPartOf spine to <releases.ttl#it>;
//     tracks are <#tNN> a mo:Track with dct:isPartOf <#it>; no
//     urn:uuid: subjects, no mo:Playlist, no absolute in-library
//     IRIs. (Deep content conservation vs the pre-migration backup is
//     a separate gate: check-triple-conservation.mjs.)
//
// (2) RECURSIVE REACHABILITY — the real recursive loadRDF() walking
//     index.ttl -> releases.ttl/dcat:dataset -> releases/<slug> pulls
//     a known release's tracks (with playable URL) into the store,
//     the cross-file foaf:maker -> agents.ttl join still cascades,
//     and playlists are still discovered. Served through a
//     CSS-faithful filesystem fetch ($.ttl suffix).

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(__dirname, '../../libraries/internet_archive_music');
const ORIGIN = 'http://localhost:3000';
const ROOT = 'http://localhost:3000/s/test/ia/';
const LIBURL = ROOT + 'libraries/internet_archive_music/';
globalThis.window = { location: { href: ROOT, origin: ORIGIN } };

const rdflib = (await import('rdflib')).default;
const { graph, parse, sym, Namespace } = rdflib;
const RDF  = Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#');
const DCT  = Namespace('http://purl.org/dc/terms/');
const MO   = Namespace('http://purl.org/ontology/mo/');
const FOAF = Namespace('http://xmlns.com/foaf/0.1/');
const DCAT = Namespace('http://www.w3.org/ns/dcat#');

let fails = 0;
const check = (c, m) => { console.log((c ? 'ok  ' : 'FAIL') + ' · ' + m); if (!c) fails++; };

// ---- (1) new-model catalog integrity -----------------------------------
const union = graph();
const relFiles = readdirSync(join(LIB, 'releases')).filter(f => f.endsWith('.ttl'));
let badSubj = 0, badId = 0, badSpine = 0, badTrack = 0, absIRI = 0, trackN = 0;
for (const f of relFiles) {
  const slug = f.replace(/\$?\.ttl$/, '');
  const base = LIBURL + 'releases/' + slug;
  const g = graph();
  const txt = readFileSync(join(LIB, 'releases', f), 'utf8');
  parse(txt, g, base, 'text/turtle');
  parse(txt, union, base, 'text/turtle');
  if (txt.includes(LIBURL)) absIRI++;
  const rels = g.match(null, RDF('type'), MO('Release'));
  const rel = rels[0]?.subject;
  if (rels.length !== 1 || !rel.value.endsWith('#it')) badSubj++;
  else {
    if (g.match(rel, DCT('identifier'), null).length !== 1) badId++;
    if (!g.holds(rel, RDF('type'), DCAT('Dataset'))) badId++;
    const sp = g.any(rel, DCT('isPartOf'));
    if (!sp || !sp.value.endsWith('releases.ttl#it')) badSpine++;
  }
  for (const ts of g.match(null, RDF('type'), MO('Track'))) {
    trackN++;
    if (!/#t\d+$/.test(ts.subject.value)) badTrack++;
    const sp = g.any(ts.subject, DCT('isPartOf'));
    if (!sp || sp.value !== rel?.value) badTrack++;
  }
}
check(relFiles.length >= 223, `release files present (${relFiles.length} ≥ 223)`);
check(badSubj === 0, `every release is exactly one <#it> a mo:Release (bad=${badSubj})`);
check(badId === 0, `every release has 1 dct:identifier + is a dcat:Dataset (bad=${badId})`);
check(badSpine === 0, `every release dct:isPartOf <releases.ttl#it> (bad=${badSpine})`);
check(trackN >= 1700 && badTrack === 0, `tracks are <#tNN> with dct:isPartOf spine (${trackN}, bad=${badTrack})`);
check(absIRI === 0, `no absolute in-library IRIs in release files (bad=${absIRI})`);
// Only real .ttl resources (ignore editor autosave/lock files like
// #foo$.ttl# — the migration, validator and loader all do the same).
const noUuid = !relFiles.some(f =>
  /\burn:uuid:[^>]*>\s*\n?\s*a\s+mo:(Release|Track)/.test(readFileSync(join(LIB, 'releases', f), 'utf8')));
check(noUuid, 'no urn:uuid: Release/Track subjects remain (P1)');

// ---- (2) recursive reachability through real loadRDF -------------------
let fetchCount = 0;
globalThis.fetch = async (url) => {
  const u = (typeof url === 'string' ? url : url?.url || '').split('#')[0].split('?')[0];
  fetchCount++;
  if (u.startsWith(ROOT)) {
    const base = resolve(__dirname, u.slice(ROOT.length));
    const path = existsSync(base) ? base
               : existsSync(base + '$.ttl') ? base + '$.ttl' : null;
    if (path) return new Response(readFileSync(path, 'utf8'),
      { status: 200, headers: { 'Content-Type': 'text/turtle' } });
  }
  return new Response('nf', { status: 404 });
};
globalThis.solidFetcher = globalThis.fetch;
globalThis.solidFetch = globalThis.fetch;
const bail = setTimeout(() => { console.error('FAIL: timed out'); process.exit(1); }, 20000);

const ia = await import('../../src/ia-rdf.js');
const { store, baseURI } = await ia.loadRDF(LIBURL + 'index.ttl');

// New-model release identity = the doc IRI #it (P1). "928 (Full Album)".
const sampleRel = sym(LIBURL + 'releases/928_full_album#it');
check(store.holds(sampleRel, RDF('type'), MO('Release')),
      'sample release reached via recursive seeAlso/dcat:dataset');
check(store.any(sampleRel, DCT('identifier'))?.value === '928-Full-Album',
      'release resolves by dct:identifier (P1 dedup key)');
const relTracks = ia.getLocalReleaseTracks(store, sampleRel);
check(relTracks.length === 2 && relTracks.every(t => t.url),
      `its tracks + playable URLs resolved from the split file (${relTracks.length})`);
const maker = store.match(sampleRel, FOAF('maker'), null).map(s => s.object)
  .find(o => o.termType === 'NamedNode');
check(!!maker && ia.getLocalArtistAlbums(store, maker).length > 0,
      'cross-file foaf:maker -> agents.ttl still joins (browse cascade)');

// P2 spine: release isPartOf target is a real dcat:Catalog node.
const cat = store.any(sampleRel, DCT('isPartOf'));
check(!!cat && store.holds(cat, RDF('type'), DCAT('Catalog')),
      'release dct:isPartOf resolves to the dcat:Catalog (P2 spine)');

const { genres } = ia.parseBookmarks(store, baseURI);
check(genres.length === 10, `genres intact (${genres.length})`);
check(ia.parsePlaylists(store, baseURI).length >= 15,
      `playlists still discovered (as:OrderedCollection) via recursive load`);

clearTimeout(bail);
console.log(`\nfetches: ${fetchCount}`);
console.log(fails ? `FAILED (${fails})` : 'ALL PASS');
process.exit(fails ? 1 : 0);
