// Quick smoke test for ia-rdf.js read path against the migrated TTL.
// Shims `window` so the module loads under Node, then bypasses loadRDF
// (which uses Fetcher) by parsing the file directly. Read-only by design,
// but blocks fetch defensively in case any helper acquires network access.

globalThis.window = { location: { href: 'http://localhost/' } };

// Stub fetch before rdflib loads (static imports are hoisted otherwise).
const LIVE = process.argv.includes('--live');
if (!LIVE) {
  const block = async () => new Response('blocked: in-memory only', {
    status: 404, statusText: 'Not Found',
    headers: { 'content-type': 'text/plain' }
  });
  globalThis.fetch = block;
  globalThis.solidFetcher = block;
  globalThis.solidFetch = block;
  process.on('unhandledRejection', (reason) => {
    const s = String(reason);
    if (s.includes("Can't get updatability status") || s.includes('blocked: in-memory only')) return;
    console.error('Unexpected rejection:', reason);
  });
}

const { readFileSync } = await import('node:fs');
const rdflib = (await import('rdflib')).default;
const { graph, parse } = rdflib;

const { parseBookmarks, parsePlaylists, getFavoritesUri, isFavorited } =
  await import('../../src/ia-rdf.js');

const BASE = 'http://localhost:3000/s/test/ia/libraries/internet_archive_music/index.ttl';
const ttl = readFileSync('./libraries/internet_archive_music/index.ttl', 'utf8');
const store = graph();
parse(ttl, store, BASE, 'text/turtle');

const { genres, bookmarks } = parseBookmarks(store, BASE);
const playlists = parsePlaylists(store, BASE);

console.log('genres   :', genres.length, genres.map(g => g.label).join(', '));
console.log('playlists:', playlists.length, playlists.map(p => p.label).join(', '));
console.log('bookmarks:', bookmarks.length);

const byTopic = new Map();
for (const b of bookmarks) {
  const k = b.topic || '(no-topic)';
  byTopic.set(k, (byTopic.get(k) || 0) + 1);
}
console.log('\nby topic:');
for (const [t, n] of [...byTopic.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${n.toString().padStart(3)}  ${t}`);
}

const favUri = getFavoritesUri(BASE);
const favs = bookmarks.filter(b => b.topic === favUri);
console.log(`\nfavorites: ${favs.length} (first 3 urls):`);
favs.slice(0, 3).forEach(b => console.log(`  ${b.url}`));

if (favs[0]?.url) {
  console.log(`\nisFavorited("${favs[0].url}") = ${isFavorited(store, BASE, favs[0].url)}`);
}
console.log(`isFavorited("https://example.com/nope.mp3") = ${isFavorited(store, BASE, 'https://example.com/nope.mp3')}`);
