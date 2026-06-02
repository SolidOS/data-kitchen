// Lazy-release loader: loadRDF({lazyReleases:true}) loads the spine
// (index/agents/genres/releases.ttl-index/playlists.ttl + playlist
// files) but SKIPS the per-release files (releases.ttl#it dcat:dataset
// members). The returned loadDocs() fetches them on demand into the
// SAME store, idempotently. lazyReleases:false keeps the old behaviour.

globalThis.window = { location: { href: 'http://localhost:3000/lib/internet_archive_music/' } };

const B = 'http://localhost:3000/lib/internet_archive_music/';
const DOCS = {
  [B + 'index.ttl']:
    `@prefix dcat: <http://www.w3.org/ns/dcat#>.
     <${B}index.ttl#it> a dcat:Catalog ;
        dcat:catalog <${B}releases.ttl#it>, <${B}playlists.ttl#it> ;
        dcat:dataset <${B}agents.ttl> ;
        dcat:themeTaxonomy <${B}genres.ttl> .
     <${B}index.ttl> <urn:test:mark> "index".`,
  [B + 'agents.ttl']:  `<${B}agents.ttl> <urn:test:mark> "agents".`,
  [B + 'genres.ttl']:  `<${B}genres.ttl> <urn:test:mark> "genres".`,
  [B + 'releases.ttl']:
    `@prefix dcat: <http://www.w3.org/ns/dcat#>.
     <${B}releases.ttl#it> a dcat:Catalog ;
        dcat:dataset <${B}releases/a#it>, <${B}releases/b#it> .
     <${B}releases.ttl> <urn:test:mark> "releases-index".`,
  [B + 'releases/a']:  `<${B}releases/a> <urn:test:mark> "rel-a".`,
  [B + 'releases/b']:  `<${B}releases/b> <urn:test:mark> "rel-b".`,
  [B + 'playlists.ttl']:
    `@prefix dcat: <http://www.w3.org/ns/dcat#>.
     <${B}playlists.ttl#it> a dcat:Catalog ;
        dcat:dataset <${B}playlists/p1#it> .
     <${B}playlists.ttl> <urn:test:mark> "playlists-index".`,
  [B + 'playlists/p1']: `<${B}playlists/p1> <urn:test:mark> "pl-1".`,
};

let fetchCount = 0;
const served = new Set();
globalThis.fetch = async (url) => {
  const u = (typeof url === 'string' ? url : url?.url || '').split('#')[0];
  fetchCount++;
  if (DOCS[u] != null) { served.add(u); return new Response(DOCS[u], { status: 200, headers: { 'Content-Type': 'text/turtle' } }); }
  return new Response('not found', { status: 404 });
};
globalThis.solidFetcher = globalThis.fetch;
globalThis.solidFetch = globalThis.fetch;

const bail = setTimeout(() => { console.error('FAIL: timed out'); process.exit(1); }, 15000);
const { loadRDF } = await import('../../src/ia-rdf.js');
const rdflib = (await import('rdflib')).default;
let failures = 0;
const check = (c, m) => { console.log((c ? 'ok  ' : 'FAIL') + ' · ' + m); if (!c) failures++; };

// --- lazy: spine loads, release files skipped ---
const { store, loadDocs } = await loadRDF(B + 'index.ttl', { lazyReleases: true });
const mark = (d) => store.any(rdflib.sym(d), rdflib.sym('urn:test:mark'))?.value || null;

check(mark(B + 'index.ttl') === 'index', 'index loaded');
check(mark(B + 'agents.ttl') === 'agents', 'agents loaded (index dcat:dataset)');
check(mark(B + 'genres.ttl') === 'genres', 'genres loaded (themeTaxonomy)');
check(mark(B + 'releases.ttl') === 'releases-index', 'releases.ttl INDEX loaded');
check(mark(B + 'playlists.ttl') === 'playlists-index', 'playlists.ttl loaded (index dcat:catalog)');
check(mark(B + 'playlists/p1') === 'pl-1', 'playlist file loaded (playlists.ttl dcat:dataset still followed)');
check(mark(B + 'releases/a') === null && mark(B + 'releases/b') === null,
      'per-release files SKIPPED at startup');
check(!served.has(B + 'releases/a') && !served.has(B + 'releases/b'),
      'no network fetch for skipped release files');
check(served.size === 6, `spine = 6 docs (got ${served.size}: no release files)`);
check(typeof loadDocs === 'function', 'loadDocs closure returned');

// --- on demand: loadDocs fetches a release file into the same store ---
const n1 = await loadDocs([B + 'releases/a#it']);
check(mark(B + 'releases/a') === 'rel-a', 'loadDocs fetched releases/a on demand');
check(n1 === 1, `loadDocs returns fetched count (got ${n1})`);
check(served.has(B + 'releases/a'), 'releases/a now fetched');
check(mark(B + 'releases/b') === null, 'unrequested release b still NOT loaded');

const before = fetchCount;
const n2 = await loadDocs([B + 'releases/a#it', B + 'releases/a']);
check(fetchCount === before && n2 === 0,
      'loadDocs idempotent — no refetch, returns 0 when all already loaded');

// --- lazyReleases:false → full back-compat load ---
served.clear(); fetchCount = 0;
const { store: full } = await loadRDF(B + 'index.ttl', { lazyReleases: false });
const fmark = (d) => full.any(rdflib.sym(d), rdflib.sym('urn:test:mark'))?.value || null;
check(fmark(B + 'releases/a') === 'rel-a' && fmark(B + 'releases/b') === 'rel-b',
      'non-lazy still loads every release file (back-compat)');
check(served.size === 8, `non-lazy = all 8 docs (got ${served.size})`);

// --- POD shape: installOnPod synthesises rdfs:seeAlso, NOT DCAT.
//     Lazy must skip release files linked via seeAlso too (the bug
//     that made the pod still load ~all releases). ---
const P = 'http://pod.example/omp/libraries/internet_archive_music/';
Object.assign(DOCS, {
  [P + 'index.ttl']:
    `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.
     <${P}index.ttl> rdfs:seeAlso <${P}agents.ttl>, <${P}genres.ttl>,
        <${P}releases.ttl>, <${P}playlists/p1> ;
        <urn:test:mark> "pod-index".`,
  [P + 'agents.ttl']:  `<${P}agents.ttl> <urn:test:mark> "pod-agents".`,
  [P + 'genres.ttl']:  `<${P}genres.ttl> <urn:test:mark> "pod-genres".`,
  [P + 'releases.ttl']:
    `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.
     <${P}releases.ttl> rdfs:seeAlso <${P}releases/x>, <${P}releases/y> ;
        <urn:test:mark> "pod-rel-index".`,
  [P + 'releases/x']:  `<${P}releases/x> <urn:test:mark> "pod-rel-x".`,
  [P + 'releases/y']:  `<${P}releases/y> <urn:test:mark> "pod-rel-y".`,
  // CSS serves each resource with Link: rel="describedby" → <name>.meta;
  // rdflib records that as rdfs:seeAlso. The loader must NOT follow it.
  [P + 'playlists/p1']:
    `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.
     <${P}playlists/p1> rdfs:seeAlso <${P}playlists/p1.meta> ;
        <urn:test:mark> "pod-pl-1".`,
  [P + 'playlists/p1.meta']: `<${P}playlists/p1.meta> <urn:test:mark> "META".`,
});
globalThis.window.location.href = P;        // libraryDocs() derives from here
served.clear(); fetchCount = 0;
const { store: pod } = await loadRDF(P + 'index.ttl', { lazyReleases: true });
const pmark = (d) => pod.any(rdflib.sym(d), rdflib.sym('urn:test:mark'))?.value || null;
check(pmark(P + 'releases.ttl') === 'pod-rel-index', 'pod: releases.ttl index loaded');
check(pmark(P + 'playlists/p1') === 'pod-pl-1', 'pod: playlist file loaded (index seeAlso)');
check(pmark(P + 'agents.ttl') === 'pod-agents', 'pod: agents loaded (index seeAlso)');
check(pmark(P + 'releases/x') === null && pmark(P + 'releases/y') === null,
      'pod: release files behind releases.ttl rdfs:seeAlso are SKIPPED (the bug)');
check(!served.has(P + 'releases/x') && !served.has(P + 'releases/y'),
      'pod: no eager fetch of seeAlso-linked release files');
check(pmark(P + 'playlists/p1.meta') === null && !served.has(P + 'playlists/p1.meta'),
      'pod: .meta auxiliary resource is NOT followed (the 2× playlists bug)');

clearTimeout(bail);
console.log();
console.log(failures ? `FAILED (${failures})` : 'ALL PASS');
process.exit(failures ? 1 : 0);
