// Smoke test for Phase 0: the recursive rdfs:seeAlso loader in loadRDF.
//
// Serves an in-memory library tree through a fake global fetch so the
// REAL loadRDF()/Fetcher path runs in Node:
//
//   index.ttl  --seeAlso-->  releases.ttl, leaf-direct.ttl
//   releases.ttl --seeAlso-> releases/a.ttl, releases/b.ttl
//   releases/a.ttl --seeAlso-> releases/b.ttl        (diamond: shared child)
//   releases/b.ttl --seeAlso-> releases/a.ttl, index.ttl  (CYCLES)
//
// Asserts: every reachable doc's triples land in the store, the loader
// terminates despite the a<->b and b->index cycles, and a flat
// single-file library still loads with no extra fetches.

globalThis.window = { location: { href: 'http://localhost:3000/lib/' } };

const B = 'http://localhost:3000/lib/';
const DOCS = {
  [B + 'index.ttl']:
    `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.
     <${B}index.ttl> rdfs:seeAlso <${B}releases.ttl>, <${B}leaf-direct.ttl>;
        <urn:test:mark> "index".`,
  [B + 'leaf-direct.ttl']:
    `<${B}leaf-direct.ttl> <urn:test:mark> "leaf-direct".`,
  [B + 'releases.ttl']:
    `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.
     <${B}releases.ttl> rdfs:seeAlso <${B}releases/a.ttl>, <${B}releases/b.ttl>;
        <urn:test:mark> "releases-index".`,
  [B + 'releases/a.ttl']:
    `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.
     <${B}releases/a.ttl> rdfs:seeAlso <${B}releases/b.ttl>;
        <urn:test:mark> "release-a".`,
  [B + 'releases/b.ttl']:
    `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.
     <${B}releases/b.ttl> rdfs:seeAlso <${B}releases/a.ttl>, <${B}index.ttl>;
        <urn:test:mark> "release-b".`,
  // A standalone flat library — no seeAlso at all.
  [B + 'flat.ttl']:
    `<${B}flat.ttl> <urn:test:mark> "flat".`,
};

let fetchCount = 0;
const served = new Set();
globalThis.fetch = async (url) => {
  const u = (typeof url === 'string' ? url : url?.url || '').split('#')[0];
  fetchCount++;
  if (DOCS[u] != null) {
    served.add(u);
    return new Response(DOCS[u], { status: 200, headers: { 'Content-Type': 'text/turtle' } });
  }
  return new Response('not found', { status: 404 });
};
globalThis.solidFetcher = globalThis.fetch;
globalThis.solidFetch = globalThis.fetch;

// Hard timeout: a broken cycle guard would hang instead of fail.
const bail = setTimeout(() => { console.error('FAIL: timed out (cycle guard?)'); process.exit(1); }, 15000);

const { loadRDF } = await import('../../src/ia-rdf.js');
const rdflib = (await import('rdflib')).default;

let failures = 0;
const check = (cond, msg) => { console.log((cond ? 'ok  ' : 'FAIL') + ' · ' + msg); if (!cond) failures++; };

// --- recursive tree ---
const { store } = await loadRDF(B + 'index.ttl');
const mark = (docUrl) =>
  store.any(rdflib.sym(docUrl), rdflib.sym('urn:test:mark'))?.value || null;

check(mark(B + 'index.ttl') === 'index',                'index.ttl loaded');
check(mark(B + 'leaf-direct.ttl') === 'leaf-direct',    'direct leaf loaded (depth 1)');
check(mark(B + 'releases.ttl') === 'releases-index',    'sub-index loaded (depth 1)');
check(mark(B + 'releases/a.ttl') === 'release-a',       'nested release a loaded (depth 2)');
check(mark(B + 'releases/b.ttl') === 'release-b',       'nested release b loaded (depth 2, via cycle)');
check([...served].length === 5,                          `each reachable doc fetched (served=${[...served].length})`);
check(fetchCount < 12,                                   `bounded refetch despite diamond+cycles (fetches=${fetchCount})`);

// --- flat single-file library: no seeAlso, no extra fetches ---
served.clear(); fetchCount = 0;
const { store: flatStore } = await loadRDF(B + 'flat.ttl');
check(flatStore.any(rdflib.sym(B + 'flat.ttl'), rdflib.sym('urn:test:mark'))?.value === 'flat',
      'flat library loads');
check(fetchCount === 1, `flat library fetches exactly itself (fetches=${fetchCount})`);

clearTimeout(bail);
console.log();
console.log(failures ? `FAILED (${failures})` : 'ALL PASS');
process.exit(failures ? 1 : 0);
