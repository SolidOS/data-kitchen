// Ph5: a pod install that copies a (pointer-only) playlist MUST also
// copy the shared releases/<slug> files it points into, or every
// omp:track on the pod dangles. releaseDocsForPlaylistDocs() resolves
// exactly that set, restricted to the playlist docs being installed.

globalThis.window = { location: { href: 'http://localhost:3000/s/test/ia/' } };

const ia = await import('../../src/ia-rdf.js');
const rdflib = (await import('rdflib')).default;
const { graph, parse } = rdflib;

let fails = 0;
const check = (c, m) => { console.log((c ? 'ok  ' : 'FAIL') + ' · ' + m); if (!c) fails++; };

const L = 'http://localhost:3000/s/test/ia/libraries/internet_archive_music/';
const store = graph();

// Playlist A — installed (backs a converted artist). Points into two
// shared release files.
const plA = L + 'playlists/bonobo';
parse(`@prefix omp: <http://open-media-player.org/ns#>.
@prefix as:  <https://www.w3.org/ns/activitystreams#>.
<${plA}#it> a as:OrderedCollection ;
    omp:entry <${plA}#e1>, <${plA}#e2> .
<${plA}#e1> omp:position 1 ; omp:track <${L}releases/bonobo_black_sands_2010#t01> .
<${plA}#e2> omp:position 2 ; omp:track <${L}releases/bonobo_dial_m_2006#t03> .`,
  store, plA, 'text/turtle');

// Playlist B — a PLAIN (non-converted) playlist, e.g. "Penguin Cafe".
// Must be carried by allPlaylistDocs even with no omp:sourcePlaylist.
const plB = L + 'playlists/other';
parse(`@prefix omp: <http://open-media-player.org/ns#>.
@prefix as:  <https://www.w3.org/ns/activitystreams#>.
<${plB}#it> a as:OrderedCollection ; omp:entry <${plB}#e1> .
<${plB}#e1> omp:position 1 ; omp:track <${L}releases/should_not_appear#t01> .`,
  store, plB, 'text/turtle');

// The reserved Deleted bin — must NEVER be installed.
const bin = L + 'playlists/deleted';
parse(`@prefix as: <https://www.w3.org/ns/activitystreams#>.
<${bin}#it> a as:OrderedCollection .`, store, bin, 'text/turtle');

const got = ia.releaseDocsForPlaylistDocs(store, [plA]).sort();
check(got.length === 2, `2 release docs for the one installed playlist (got ${got.length})`);
check(got.includes(L + 'releases/bonobo_black_sands_2010') &&
      got.includes(L + 'releases/bonobo_dial_m_2006'),
      'returns exactly the release docs playlist A points into');
check(!got.includes(L + 'releases/should_not_appear'),
      'release of a NON-installed playlist is excluded (why-filtered)');
check(got.every(u => u.indexOf('#') === -1),
      'fragment stripped → doc URLs (uploadable / seeAlso-able)');

// Both playlists installed → union, still de-duplicated by doc.
const both = ia.releaseDocsForPlaylistDocs(store, [plA, plB]);
check(both.length === 3 && new Set(both).size === 3,
      'union across playlists, unique by doc');

// No playlists / empty input → empty (no accidental whole-catalogue pull).
check(ia.releaseDocsForPlaylistDocs(store, []).length === 0, 'empty input → no release docs');

// --- allPlaylistDocs: every playlist incl. plain ones, minus the bin ---
const allp = ia.allPlaylistDocs(store, L + 'index.ttl').sort();
check(allp.length === 2, `all real playlists (got ${allp.length}: ${allp.map(u=>u.split('/').pop())})`);
check(allp.includes(plA) && allp.includes(plB),
      'includes BOTH the converted-artist AND the plain (Penguin-Cafe-like) playlist');
check(!allp.includes(bin), 'the reserved Deleted bin is excluded');
check(allp.every(u => u.indexOf('#') === -1), 'playlist doc URLs are fragment-stripped');
// Their release files all come along (no dangling), bin contributes none.
const allRel = ia.releaseDocsForPlaylistDocs(store, allp).sort();
check(allRel.length === 3, `release docs for all playlists (got ${allRel.length})`);

console.log();
console.log(fails ? `FAILED (${fails})` : 'ALL PASS');
process.exit(fails ? 1 : 0);
