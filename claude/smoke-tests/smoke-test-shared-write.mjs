// Phase-2 shared-releases WRITE-PATH test. Drives the real pod
// direct-sparql-update-PATCH branch of runUpdate (store === rdf.store)
// against an in-memory CSS-faithful fetcher, asserting:
//  A. add a track from an album ALREADY in the catalogue → no new
//     release file, no release write; playlist gets a pointer to the
//     existing canonical Track (dedup by landingPage+downloadUrl).
//  B. add tracks from a BRAND-NEW album → one new releases/<slug> file
//     (Release + Tracks), releases.ttl gains seeAlso + landingPage,
//     playlist gets pointer hasPart only (no cloned Track/Release in
//     the playlist file).
//  C. removeTrackFromPlaylist drops ONLY the playlist hasPart edge —
//     the shared release file is untouched.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(__dirname, '../../libraries/internet_archive_music');
const ROOT = 'http://localhost:3000/s/test/ia/';
const LIBURL = ROOT + 'libraries/internet_archive_music/';
globalThis.window = { location: { href: ROOT, origin: 'http://localhost:3000' } };

let fails = 0;
const check = (c, m) => { console.log((c ? 'ok  ' : 'FAIL') + ' · ' + m); if (!c) fails++; };

// ---- in-memory file store (CSS $.ttl convention) ----------------------
const files = new Map();   // http url (no #) → turtle text
const diskFor = (u) => {
  const rel = u.slice(ROOT.length);
  for (const c of [rel, rel + '$.ttl', rel + '.ttl']) {
    const p = resolve(__dirname, c);
    if (existsSync(p)) return p;
  }
  return null;
};
const seed = (u) => { const p = diskFor(u); if (p) files.set(u, readFileSync(p, 'utf8')); };
seed(LIBURL + 'index.ttl');
for (const n of ['agents.ttl', 'genres.ttl', 'releases.ttl']) seed(LIBURL + n);
for (const f of readdirSync(join(LIB, 'releases'))) files.set(LIBURL + 'releases/' + f.replace(/\$?\.ttl$/, ''), readFileSync(join(LIB, 'releases', f), 'utf8'));
for (const f of readdirSync(join(LIB, 'playlists'))) files.set(LIBURL + 'playlists/' + f.replace(/\$?\.ttl$/, ''), readFileSync(join(LIB, 'playlists', f), 'utf8'));

const rdflib = (await import('rdflib')).default;
const { sym, Namespace } = rdflib;
const RDF = Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#');
const DCT = Namespace('http://purl.org/dc/terms/');
const DCAT = Namespace('http://www.w3.org/ns/dcat#');
const MO = Namespace('http://purl.org/ontology/mo/');
const RDFS = Namespace('http://www.w3.org/2000/01/rdf-schema#');
const OMP = Namespace('http://open-media-player.org/ns#');

const { rdf } = await import('../../src/rdf-shared.js');
const store = rdf.store;
const parseInto = (text, url) => rdflib.parse(text, store, url, 'text/turtle');

const ops = [];   // recorded webOperation calls
const stubFetcher = {
  async load(u) {
    const url = String(u).split('#')[0];
    if (rdf.isLoaded?.(url)) return;
    if (!files.has(url)) throw new Error('Not Found ' + url);
    parseInto(files.get(url), url);
    rdf.markLoaded?.(url);
  },
  async webOperation(method, url, { body, contentType } = {}) {
    const u = String(url).split('#')[0];
    ops.push({ method, url: u, body, contentType });
    if (method === 'PUT') { files.set(u, body); return { ok: true, status: 201 }; }
    if (method === 'PATCH') {
      if (!files.has(u)) files.set(u, '');
      return { ok: true, status: 205 };       // runUpdate mirrors into store itself
    }
    if (method === 'DELETE') { files.delete(u); return { ok: true, status: 205 }; }
    return { ok: true, status: 200 };
  },
};
store.fetcher = stubFetcher;   // rdf.storeFetcher getter picks this up

const ia = await import('../../src/ia-rdf.js');
// Single-store S1: runUpdate's pod sparql-update bypass is gated on an
// explicit "authed Solid session" flag, NOT store identity (store ===
// rdf.store is now true for dev too). Simulate the authed pod session
// so this test exercises the direct-PATCH branch it asserts.
ia.setSolidWriteAuthed(true);
await ia.loadRDF(LIBURL + 'index.ttl', { shared: true });

const PL = LIBURL + 'playlists/Tupac_Shakur';
const playlistDoc = sym(PL);
const releasesDoc = sym(LIBURL + 'releases.ttl');
const entryCount = () => store.match(playlistDoc, OMP('entry'), null).length;
const trackPointed = (trk) => store.match(playlistDoc, OMP('entry'), null)
  .some(e => store.holds(e.object, OMP('track'), trk));
const before = entryCount();

// ---- A. add a track from an album already in the catalogue -----------
// Pick a real catalogue release + one of its tracks.
const aRelLp = store.match(null, RDF('type'), MO('Release'))
  .map(s => s.subject).map(r => store.any(r, DCAT('landingPage'))?.value)
  .find(lp => lp && lp.includes('archive.org/details/'));
const aRel = store.match(null, DCAT('landingPage'), sym(aRelLp))
  .find(s => store.holds(s.subject, RDF('type'), MO('Release')))?.subject;
const aTrk = store.any(aRel, MO('track'));
const aDl = store.any(aTrk, DCAT('downloadUrl'))?.value;
const relFilesBeforeA = new Set([...files.keys()].filter(k => k.includes('/releases/')));
const opsA0 = ops.length;
const rA = await ia.addTracksToPlaylist(store, LIBURL + 'index.ttl', PL,
  [{ url: aDl, name: 'reuse me', source: aRelLp, album: 'x', time: '60' }]);
check(rA.ok, 'A: addTracksToPlaylist ok');
check(entryCount() === before + 1, `A: playlist gained exactly 1 omp:entry (${before}→${entryCount()})`);
check(trackPointed(aTrk),
      'A: entry omp:track is the EXISTING canonical Track (no clone)');
const relFilesAfterA = new Set([...files.keys()].filter(k => k.includes('/releases/')));
check(relFilesAfterA.size === relFilesBeforeA.size, 'A: no new release file created');
const aWroteRelease = ops.slice(opsA0).some(o => o.url.includes('/releases/') && o.url !== releasesDoc.value);
check(!aWroteRelease, 'A: no write to any release file (pure pointer add)');
const aPlPatch = ops.slice(opsA0).find(o => o.method === 'PATCH' && o.url === PL);
check(!!aPlPatch && /INSERT DATA/.test(aPlPatch.body)
      && /entry/.test(aPlPatch.body) && /position/.test(aPlPatch.body) && /track/.test(aPlPatch.body),
      'A: playlist file PATCHed with the omp:entry/position/track pointer');

// ---- B. add tracks from a brand-new album ----------------------------
const newLp = 'https://archive.org/details/zzz-phase2-smoke-album';
const opsB0 = ops.length;
const rB = await ia.addTracksToPlaylist(store, LIBURL + 'index.ttl', PL, [
  { url: 'https://archive.org/download/zzz/01.mp3', name: 'New One', source: newLp, album: 'Phase2 Smoke', artist: '2Pac', time: '100' },
  { url: 'https://archive.org/download/zzz/02.mp3', name: 'New Two', source: newLp, album: 'Phase2 Smoke', artist: '2Pac', time: '200' },
]);
check(rB.ok, 'B: addTracksToPlaylist ok');
const putNew = ops.slice(opsB0).find(o => o.method === 'PUT' && o.url.includes('/releases/'));
check(!!putNew, `B: a new releases/<slug> file was PUT (${putNew?.url.split('/releases/')[1]})`);
const newRelG = rdflib.graph();
rdflib.parse(files.get(putNew.url), newRelG, putNew.url, 'text/turtle');
check(newRelG.match(null, RDF('type'), MO('Release')).length === 1, 'B: new file has exactly 1 mo:Release');
check(newRelG.match(null, RDF('type'), MO('Track')).length === 2, 'B: new file has 2 mo:Track');
check(newRelG.match(null, DCAT('landingPage'), sym(newLp)).length >= 1, 'B: new Release carries the landingPage');
const releasesCat = sym(releasesDoc.value + '#it');
const idxPatch = ops.slice(opsB0).find(o => o.method === 'PATCH' && o.url === releasesDoc.value);
check(!!idxPatch && /dataset/.test(idxPatch.body) && idxPatch.body.includes(putNew.url)
      && !/seeAlso|landingPage/.test(idxPatch.body),
      'B: releases.ttl#it PATCHed with dcat:dataset ONLY (no seeAlso/landingPage)');
check(store.holds(releasesCat, sym('http://www.w3.org/ns/dcat#dataset'), sym(putNew.url + '#it')),
      'B: releases.ttl catalog now dcat:datasets the new release#it (in store)');
// new release file is new-model: identity + dcat:Dataset + spine
check(newRelG.match(null, DCT('identifier'), null).length === 1
      && newRelG.match(null, RDF('type'), sym('http://www.w3.org/ns/dcat#Dataset')).length === 1,
      'B: new release has 1 dct:identifier and is a dcat:Dataset (P1/P2)');
// playlist file must stay pointer-only — no Track/Release written to it
const plPatchesB = ops.slice(opsB0).filter(o => o.url === PL);
const plBodyB = plPatchesB.map(o => o.body).join('\n');
check(plPatchesB.length > 0 && !/mo:Release|a +<?http[^>]*Release|mo:track\b/.test(plBodyB),
      'B: playlist PATCH carries ONLY omp:entry pointers (no cloned Release/Track)');
check(entryCount() === before + 3, `B: playlist now has +3 entries total (${entryCount()})`);

// ---- C. remove a track → only the hasPart edge goes ------------------
const relFileText0 = files.get(putNew.url);
const opsC0 = ops.length;
const rC = await ia.removeTrackFromPlaylist(store, LIBURL + 'index.ttl', PL,
  'https://archive.org/download/zzz/01.mp3');
check(rC.ok, 'C: removeTrackFromPlaylist ok');
check(entryCount() === before + 2, `C: exactly one omp:entry removed (${entryCount()})`);
const cTouchedRelease = ops.slice(opsC0).some(o => o.url.includes('/releases/'));
check(!cTouchedRelease, 'C: NO write to any release file (shared data preserved)');
check(files.get(putNew.url) === relFileText0, 'C: the shared release file is byte-identical (untouched)');
const cPlPatch = ops.slice(opsC0).find(o => o.url === PL);
// remove drops the entry triples; it MAY also INSERT renumbered
// omp:position for survivors (contiguity invariant) — both allowed,
// the release/track triples must never appear.
check(!!cPlPatch && /DELETE DATA/.test(cPlPatch.body) && /entry|track|position/.test(cPlPatch.body)
      && !/mo:Release|mo:track\b/.test(cPlPatch.body),
      'C: playlist PATCH deletes the omp:entry (renumber INSERT allowed; no release/track touched)');

// (The explicit write-path flag is proven by construction: this test
// and smoke-test-deleted-bin FAIL without the `setSolidWriteAuthed(true)`
// opt-in above and PASS with it — i.e. the sparql-update bypass is now
// gated on the flag, not store identity.)

console.log('\n' + (fails ? `FAILED (${fails})` : 'ALL PASS'));
process.exit(fails ? 1 : 0);
