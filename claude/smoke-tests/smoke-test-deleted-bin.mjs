// Ph3 (REVISED) "Deleted bin" WRITE-PATH test. Drives the real pod
// direct-sparql-update-PATCH branch of runUpdate (store === rdf.store)
// against an in-memory CSS-faithful fetcher, asserting:
//  D. removePlaylist re-points the playlist's tracks into the reserved
//     playlists/deleted bin (find-or-created), THEN detaches+DELETEs the
//     playlist. Crash order: bin write precedes playlist teardown. No
//     release file is created/written (pure pointer move).
//  E. Deleting a 2nd playlist that shares a track does NOT duplicate the
//     bin pointer (addTracksToPlaylist dedups by downloadUrl).
//  F. removeTrackFromPlaylist FROM the bin reclaims the release file
//     (DELETE + releases.ttl de-index) when no other playlist uses it.
//  G. Safety: a release still referenced by a LIVE playlist is NOT
//     deleted on bin-remove (file kept, no dangling pointer).
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(__dirname, '../../libraries/internet_archive_music');
const ROOT = 'http://localhost:3000/s/test/ia/';
const LIBURL = ROOT + 'libraries/internet_archive_music/';
const IDX = LIBURL + 'index.ttl';
globalThis.window = { location: { href: ROOT, origin: 'http://localhost:3000' } };

let fails = 0;
const check = (c, m) => { console.log((c ? 'ok  ' : 'FAIL') + ' · ' + m); if (!c) fails++; };

// ---- in-memory file store (CSS $.ttl convention) ----------------------
const files = new Map();
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
for (const n of ['agents.ttl', 'genres.ttl', 'releases.ttl', 'playlists.ttl']) seed(LIBURL + n);
for (const f of readdirSync(join(LIB, 'releases'))) files.set(LIBURL + 'releases/' + f.replace(/\$?\.ttl$/, ''), readFileSync(join(LIB, 'releases', f), 'utf8'));
for (const f of readdirSync(join(LIB, 'playlists'))) files.set(LIBURL + 'playlists/' + f.replace(/\$?\.ttl$/, ''), readFileSync(join(LIB, 'playlists', f), 'utf8'));

const rdflib = (await import('rdflib')).default;
const { sym, Namespace } = rdflib;
const RDF = Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#');
const DCAT = Namespace('http://www.w3.org/ns/dcat#');
const OMP = Namespace('http://open-media-player.org/ns#');

const { rdf } = await import('../../src/rdf-shared.js');
const store = rdf.store;
const parseInto = (text, url) => rdflib.parse(text, store, url, 'text/turtle');

const ops = [];
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
    if (method === 'PATCH') { if (!files.has(u)) files.set(u, ''); return { ok: true, status: 205 }; }
    if (method === 'DELETE') { files.delete(u); return { ok: true, status: 205 }; }
    return { ok: true, status: 200 };
  },
};
store.fetcher = stubFetcher;

const ia = await import('../../src/ia-rdf.js');
// Single-store S1: the pod sparql-update bypass is gated on an explicit
// authed-session flag now, not store identity. Simulate the authed pod.
ia.setSolidWriteAuthed(true);
await ia.loadRDF(IDX, { shared: true });

const BIN = ia.deletedBinUri(IDX);
const binDoc = sym(BIN);
const plDoc = sym;
const binEntries = () => store.match(binDoc, OMP('entry'), null);
const binHasDl = (dl) => binEntries().some(e => {
  const t = store.any(e.object, OMP('track'));
  return t && store.any(t, DCAT('downloadUrl'))?.value === dl;
});
const binCountDl = (dl) => binEntries().filter(e => {
  const t = store.any(e.object, OMP('track'));
  return t && store.any(t, DCAT('downloadUrl'))?.value === dl;
}).length;

// ---- setup: 3 playlists + 2 brand-new albums -------------------------
const Psolo = (await ia.addPlaylist(store, IDX, { name: 'BinTest Solo' })).id;
const PsA   = (await ia.addPlaylist(store, IDX, { name: 'BinTest SharedA' })).id;
const PsB   = (await ia.addPlaylist(store, IDX, { name: 'BinTest SharedB' })).id;

const Lsolo = 'https://archive.org/details/zzz-bin-solo';
const Dsolo = 'https://archive.org/download/zzz-bin-solo/01.mp3';
const Lshare = 'https://archive.org/details/zzz-bin-shared';
const Dshare = 'https://archive.org/download/zzz-bin-shared/01.mp3';

await ia.addTracksToPlaylist(store, IDX, Psolo,
  [{ url: Dsolo, name: 'Solo One', source: Lsolo, album: 'Bin Solo Album', artist: 'BT', time: '60' }]);
const soloRelPut = [...ops].reverse().find(o => o.method === 'PUT' && o.url.includes('/releases/'));
const soloRelUrl = soloRelPut.url;
for (const p of [PsA, PsB])
  await ia.addTracksToPlaylist(store, IDX, p,
    [{ url: Dshare, name: 'Shared One', source: Lshare, album: 'Bin Shared Album', artist: 'BT', time: '90' }]);
const shareRelUrl = [...ops].reverse().find(o => o.method === 'PUT' && o.url.includes('/releases/') && o.url !== soloRelUrl).url;

// ---- D. delete Psolo → tracks land in the bin, crash-safe order ------
const opsD0 = ops.length;
const rD = await ia.removePlaylist(store, IDX, Psolo);
check(rD.ok, 'D: removePlaylist ok');
check(binHasDl(Dsolo), 'D: bin gained an omp:entry pointing at the deleted track');
const opsD = ops.slice(opsD0);
const binPut = opsD.find(o => o.method === 'PUT' && o.url === BIN);
check(!!binPut, 'D: the Deleted bin file was find-or-created (PUT playlists/deleted)');
const binWriteI = opsD.findIndex(o => o.url === BIN && (o.method === 'PUT' || o.method === 'PATCH'));
const plDeleteI = opsD.findIndex(o => o.method === 'DELETE' && o.url === Psolo);
check(binWriteI >= 0 && plDeleteI >= 0 && binWriteI < plDeleteI,
      'D: bin written BEFORE the source playlist is deleted (crash-safe)');
check(opsD.some(o => o.method === 'DELETE' && o.url === Psolo), 'D: source playlist file DELETEd');
const plsPatchD = opsD.find(o => o.method === 'PATCH' && o.url === LIBURL + 'playlists.ttl' && /DELETE DATA/.test(o.body) && o.body.includes(Psolo));
check(!!plsPatchD, 'D: playlists.ttl dcat:dataset edge for the playlist dropped');
check(!opsD.some(o => o.method === 'PUT' && o.url.includes('/releases/')),
      'D: no release file created/written (pure pointer move)');

// ---- E. delete PsA then NOT duplicate the shared pointer -------------
await ia.removePlaylist(store, IDX, PsA);
check(binCountDl(Dshare) === 1, `E: shared track has exactly ONE bin entry (${binCountDl(Dshare)})`);
// PsB still alive and still references the shared release.
check(store.match(sym(PsB), OMP('entry'), null).length === 1, 'E: the other playlist (PsB) is intact');

// ---- G. bin-remove keeps a release still used by a live playlist -----
const opsG0 = ops.length;
const rG = await ia.removeTrackFromPlaylist(store, IDX, BIN, Dshare);
check(rG.ok, 'G: removeTrackFromPlaylist (bin) ok');
check(!binHasDl(Dshare), 'G: bin pointer for the shared track is gone');
check(files.has(shareRelUrl), 'G: shared release file KEPT (still in live PsB) — no dangling');
check(!ops.slice(opsG0).some(o => o.method === 'DELETE' && o.url === shareRelUrl),
      'G: no DELETE of the still-referenced release file');
check(store.match(sym(PsB), OMP('entry'), null).length === 1, 'G: PsB still resolves its track (intact)');

// ---- F. bin-remove reclaims a truly-orphaned release file ------------
const relCat = sym(LIBURL + 'releases.ttl#it');
const soloRelNode = sym(soloRelUrl + '#it');
check(files.has(soloRelUrl), 'F: (pre) orphan release file present');
check(store.holds(relCat, DCAT('dataset'), soloRelNode), 'F: (pre) release is indexed in releases.ttl');
const opsF0 = ops.length;
const rF = await ia.removeTrackFromPlaylist(store, IDX, BIN, Dsolo);
check(rF.ok, 'F: removeTrackFromPlaylist (bin) ok');
check(!binHasDl(Dsolo), 'F: bin pointer gone');
check(!files.has(soloRelUrl), 'F: orphan release file DELETEd from disk');
check(ops.slice(opsF0).some(o => o.method === 'DELETE' && o.url === soloRelUrl), 'F: a DELETE was issued for the release file');
const relIdxPatchF = ops.slice(opsF0).find(o => o.method === 'PATCH' && o.url === LIBURL + 'releases.ttl' && /DELETE DATA/.test(o.body));
check(!!relIdxPatchF && relIdxPatchF.body.includes(soloRelUrl),
      'F: releases.ttl de-indexed (dcat:dataset DELETE DATA for the release)');
check(!store.holds(relCat, DCAT('dataset'), soloRelNode), 'F: in-store index edge dropped');

console.log('\n' + (fails ? `FAILED (${fails})` : 'ALL PASS'));
process.exit(fails ? 1 : 0);
