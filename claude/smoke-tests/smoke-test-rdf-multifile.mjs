// Smoke test for the multi-file layout. Loads index.ttl + all the
// seeAlso targets (siblings) into one store manually (bypassing Fetcher), then
// runs parseBookmarks / parsePlaylists against it.

globalThis.window = { location: { href: 'http://localhost:3000/s/test/ia/' } };

const block = async () => new Response('blocked', { status: 404 });
globalThis.fetch = block;
globalThis.solidFetcher = block;
globalThis.solidFetch = block;

const { readFileSync } = await import('node:fs');
const { resolve, dirname, join } = await import('node:path');
const rdflib = (await import('rdflib')).default;
const { graph, parse, Namespace } = rdflib;

const ia = await import('../../src/ia-rdf.js');

const BASE = 'http://localhost:3000/s/test/ia/libraries/internet_archive_music/index.ttl';
const store = graph();

function loadInto(filePath, asUri) {
  const ttl = readFileSync(filePath, 'utf8');
  parse(ttl, store, asUri, 'text/turtle');
}

loadInto('./libraries/internet_archive_music/index.ttl', BASE);
loadInto('./libraries/internet_archive_music/agents.ttl',   'http://localhost:3000/s/test/ia/libraries/internet_archive_music/agents.ttl');
loadInto('./libraries/internet_archive_music/genres.ttl',   'http://localhost:3000/s/test/ia/libraries/internet_archive_music/genres.ttl');
loadInto('./libraries/internet_archive_music/releases.ttl', 'http://localhost:3000/s/test/ia/libraries/internet_archive_music/releases.ttl');

const { genres, bookmarks } = ia.parseBookmarks(store, BASE);
const playlists = ia.parsePlaylists(store, BASE);

console.log('genres   :', genres.length, '·', genres.map(g => g.label).join(', '));
console.log('playlists:', playlists.length);
console.log('bookmarks:', bookmarks.length);
console.log();
const byTopic = new Map();
for (const b of bookmarks) {
  const k = b.topic ? b.topic.replace(/^.*[\/#]/, '') : '(no-topic)';
  byTopic.set(k, (byTopic.get(k) || 0) + 1);
}
console.log('by topic:');
for (const [t, n] of [...byTopic.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${t}`);
}

console.log('\nseeAlso refs in library.ttl:');
const seeAlso = store.match(rdflib.sym(BASE), rdflib.Namespace('http://www.w3.org/2000/01/rdf-schema#')('seeAlso'), null);
for (const s of seeAlso) console.log('  ' + s.object.value);
