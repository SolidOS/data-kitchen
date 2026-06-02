// Phase 3: createLibrary() writes a well-formed, recursively-loadable
// skeleton. An in-memory store-backed fetch captures PUTs and serves
// them back for GET, so the round-trip is: createLibrary -> 4 PUTs ->
// loadRDF(index.ttl) follows seeAlso -> clean parse, no errors.

globalThis.window = { location: { href: 'http://localhost:3000/s/test/ia/' } };
const BASE = 'http://localhost:3000/s/test/ia/libraries/spoken_word/';

const docs = new Map();
let puts = 0;
globalThis.fetch = async (url, opts = {}) => {
  const u = (typeof url === 'string' ? url : url?.url || '').split('#')[0];
  const method = (opts.method || 'GET').toUpperCase();
  if (method === 'PUT') {
    docs.set(u, String(opts.body ?? ''));
    puts++;
    return new Response('', { status: 201 });
  }
  if (docs.has(u)) {
    return new Response(docs.get(u), { status: 200, headers: { 'Content-Type': 'text/turtle' } });
  }
  return new Response('nf', { status: 404 });
};
globalThis.solidFetcher = globalThis.fetch;
globalThis.solidFetch = globalThis.fetch;

const bail = setTimeout(() => { console.error('FAIL: timed out'); process.exit(1); }, 15000);
const ia = await import('../../src/ia-rdf.js');
const rdflib = (await import('rdflib')).default;
const { sym, Namespace } = rdflib;
const RDF  = Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#');
const DCT  = Namespace('http://purl.org/dc/terms/');

let fails = 0;
const check = (c, m) => { console.log((c ? 'ok  ' : 'FAIL') + ' · ' + m); if (!c) fails++; };

const res = await ia.createLibrary(BASE, { title: 'Spoken Word' });
check(res.ok, `createLibrary ok (${res.err || ''})`);
check(res.url === BASE + 'index.ttl', 'returns index.ttl url');
check(puts === 5, `wrote 5 skeleton files (got ${puts})`);
for (const f of ['index.ttl', 'agents.ttl', 'genres.ttl', 'releases.ttl', 'playlists.ttl'])
  check(docs.has(BASE + f), `PUT ${f}`);

// Recursively load it back through the real loader.
const { store, baseURI } = await ia.loadRDF(BASE + 'index.ttl');
check(baseURI === BASE + 'index.ttl', 'loadRDF baseURI');
check(store.any(sym(BASE + 'index.ttl'), DCT('title'))?.value === 'Spoken Word',
      'index.ttl carries the title');
// New model: index.ttl#it is a dcat:Catalog whose recursive DCAT
// spine (dcat:catalog → releases/playlists indexes, dcat:dataset →
// agents, dcat:themeTaxonomy → genres scheme) is what the loader
// follows — no rdfs:seeAlso anywhere.
const DCAT = Namespace('http://www.w3.org/ns/dcat#');
const it = sym(BASE + 'index.ttl#it');
check(store.holds(it, RDF('type'), DCAT('Catalog')), 'index.ttl#it a dcat:Catalog');
const subCats = store.match(it, DCAT('catalog'), null).map(s => s.object.value);
check(subCats.length === 2
      && subCats.some(v => v.endsWith('releases.ttl#it'))
      && subCats.some(v => v.endsWith('playlists.ttl#it')),
      `index dcat:catalog → releases+playlists indexes (${subCats.length})`);
check(store.match(it, DCAT('dataset'), null)[0]?.object.value.endsWith('agents.ttl#it'),
      'index dcat:dataset → agents.ttl#it');
check(store.match(it, DCAT('themeTaxonomy'), null)[0]?.object.value.endsWith('genres.ttl#Music'),
      'index dcat:themeTaxonomy → genres.ttl#Music');
check(['agents.ttl', 'genres.ttl', 'releases.ttl', 'playlists.ttl']
      .every(f => docs.has(BASE + f)),
      'all sibling docs fetched via the DCAT spine (no seeAlso)');

// Parse layer: a fresh library is empty but must not throw.
const { genres, bookmarks } = ia.parseBookmarks(store, baseURI);
const playlists = ia.parsePlaylists(store, baseURI);
check(genres.length === 0 && bookmarks.length === 0 && playlists.length === 0,
      'empty library parses cleanly (0 genres/bookmarks/playlists)');

clearTimeout(bail);
console.log();
console.log(fails ? `FAILED (${fails})` : 'ALL PASS');
process.exit(fails ? 1 : 0);
