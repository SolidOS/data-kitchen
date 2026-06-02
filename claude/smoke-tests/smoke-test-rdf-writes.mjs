// Smoke test for ia-rdf.js write path. By default runs in-memory ONLY —
// every HTTP/PATCH attempt by rdflib's UpdateManager is short-circuited so
// the script can never mutate a real backing file on a live Solid server.
// Pass --live to allow real PATCH calls (use only against a disposable
// store; baseURI points at the same file the app uses).

globalThis.window = { location: { href: 'http://localhost/' } };

// Stub fetch BEFORE rdflib loads — static imports are hoisted, so if we used
// `import rdflib from 'rdflib'` the module would capture the real fetch
// reference before this code runs. Dynamic import (below) defers the load
// until after we've installed the stub.
const LIVE = process.argv.includes('--live');
if (!LIVE) {
  // rdflib's Fetcher prefers `global.solidFetcher` / `global.solidFetch`
  // over the global `fetch` and otherwise falls back to a *bundled*
  // `cross-fetch` (which `globalThis.fetch` can't intercept). Stub all
  // three so UpdateManager can never reach a real server. 404 is the
  // friendliest stub status: UpdateManager's "doc may not exist yet"
  // path retries instead of throwing, the retry's PATCH also gets a 404,
  // and runUpdate in ia-rdf.js falls back to in-memory mutation.
  const block = async () => new Response('blocked: in-memory only', {
    status: 404, statusText: 'Not Found',
    headers: { 'content-type': 'text/plain' }
  });
  globalThis.fetch = block;
  globalThis.solidFetcher = block;
  globalThis.solidFetch = block;
  // Belt-and-braces: rdflib's update path can still surface async
  // rejections that aren't caught by ia-rdf.js's runUpdate. We don't care
  // about persistence failures here — the in-memory store is the source
  // of truth for the test.
  process.on('unhandledRejection', (reason) => {
    const s = String(reason);
    if (s.includes("Can't get updatability status") || s.includes('blocked: in-memory only')) return;
    console.error('Unexpected rejection:', reason);
  });
  console.error('[in-memory mode] PATCH calls will fail; store is mutated locally only. Pass --live to write to a Solid server.');
} else {
  console.error('[LIVE mode] PATCH calls will hit the real Solid server at baseURI. Data WILL be modified.');
}

const { readFileSync } = await import('node:fs');
const rdflib = (await import('rdflib')).default;
const { graph, parse, sym, Namespace } = rdflib;

const ia = await import('../../src/ia-rdf.js');
const BASE = 'http://localhost:3000/s/test/ia/libraries/internet_archive_music/index.ttl';
const ttl = readFileSync('./libraries/internet_archive_music/index.ttl', 'utf8');
const store = graph();
parse(ttl, store, BASE, 'text/turtle');

const RDF = Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#');
const FOAF = Namespace('http://xmlns.com/foaf/0.1/');
const MO = Namespace('http://purl.org/ontology/mo/');
const DCT = Namespace('http://purl.org/dc/terms/');
const DCAT = Namespace('http://www.w3.org/ns/dcat#');

function dump(n, label) {
  console.log(`\n${label}:`);
  for (const s of store.match(n, null, null)) {
    console.log(`  ${s.predicate.value.replace(/^.*[\/#]/, '')}  ->  ${s.object.value}`);
  }
}

// --- addArtist
let r = await ia.addArtist(store, BASE, BASE + '#Jazz', 'Test Artist', 'https://archive.org/details/TestArtist');
console.log('addArtist  ok=' + r.ok + ' node=' + r.node?.value);
dump(r.node, 'new artist');

// --- addPlaylist
r = await ia.addPlaylist(store, BASE, 'Test Playlist');
const newPlaylistId = r.id;
console.log('\naddPlaylist  ok=' + r.ok + ' id=' + r.id);
dump(sym(r.id), 'new playlist');

// --- addTracksToPlaylist — one match, one mint
r = await ia.addTracksToPlaylist(store, BASE, newPlaylistId, [
  { label: 'Bernie Worrell — Live at X — Funky Tune',
    url: 'https://example.com/tune1.mp3',
    source: 'https://example.com/album1' },
  { label: 'Some New Artist — Live at Y — Other Tune',
    url: 'https://example.com/tune2.mp3',
    source: 'https://example.com/album2' },
]);
console.log('\naddTracksToPlaylist  ok=' + r.ok + ' nodes=' + r.nodes.length);
for (const n of r.nodes) dump(n, 'new release ' + n.value.slice(-8));

// Show what foaf:maker resolved to
for (const n of r.nodes) {
  const maker = store.any(n, FOAF('maker'));
  if (maker) {
    console.log(`\nmaker of ${n.value.slice(-8)} = ${maker.value}`);
    dump(maker, '  agent');
  }
}

// hasPart inverse on playlist
const pl = sym(newPlaylistId);
console.log('\nplaylist members (hasPart):');
for (const s of store.match(pl, DCT('hasPart'), null)) console.log('  ' + s.object.value);

// --- addFavorite
r = await ia.addFavorite(store, BASE, {
  label: 'Bernie Worrell — Live at Z — Cool Track',
  trackUrl: 'https://example.com/cool.mp3',
  albumUrl: 'https://example.com/cool-album'
});
console.log('\naddFavorite  ok=' + r.ok + ' node=' + r.node?.value);
console.log('isFavorited("cool.mp3") = ' + ia.isFavorited(store, BASE, 'https://example.com/cool.mp3'));

// --- removeFavorite
r = await ia.removeFavorite(store, BASE, 'https://example.com/cool.mp3');
console.log('removeFavorite  ok=' + r.ok);
console.log('isFavorited("cool.mp3") after = ' + ia.isFavorited(store, BASE, 'https://example.com/cool.mp3'));

// --- renameArtist + moveArtist + removeArtist
const testArtist = store.any(null, FOAF('name'), rdflib.literal('Test Artist'));
await ia.renameArtist(store, BASE, testArtist, 'Test Artist 2');
console.log('\nafter renameArtist: foaf:name = ' + store.any(testArtist, FOAF('name'))?.value);
await ia.moveArtist(store, BASE, testArtist, BASE + '#Funk');
console.log('after moveArtist:   mo:genre  = ' + store.any(testArtist, MO('genre'))?.value);
await ia.removeArtist(store, BASE, testArtist);
console.log('after removeArtist: triples   = ' + store.match(testArtist, null, null).length);
