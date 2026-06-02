// Phase 5: libraryDocUrls() enumerates a library's seeAlso closure;
// installToPod() copies a file set to a pod idempotently (always
// overwrite — no skip), reports progress, collects per-file failures,
// never throws. Success = a real 2xx, else CONFIRM by reading the
// resource back (an ambiguous redirect/opaque response is never trusted
// blindly — that masked failures; defect B).

globalThis.window = { location: { href: 'http://localhost:3000/s/test/ia/' } };

const ia = await import('../../src/ia-rdf.js');
const rdflib = (await import('rdflib')).default;
const { graph, parse } = rdflib;

let fails = 0;
const check = (c, m) => { console.log((c ? 'ok  ' : 'FAIL') + ' · ' + m); if (!c) fails++; };

// --- libraryDocUrls: transitive seeAlso closure incl. base ---
const B = 'http://x/lib/';
const store = graph();
parse(`@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.
<${B}index.ttl> rdfs:seeAlso <${B}a.ttl>, <${B}releases.ttl>.
<${B}releases.ttl> rdfs:seeAlso <${B}releases/one>, <${B}releases/two>.`,
  store, B + 'index.ttl', 'text/turtle');
const urls = ia.libraryDocUrls(store, B + 'index.ttl').sort();
check(urls.length === 5, `closure = base + 4 (got ${urls.length})`);
check(urls.includes(B + 'releases/one') && urls.includes(B + 'releases/two'),
      'descends sub-index releases.ttl → per-release docs');
check(urls[0] === B + 'a.ttl' && urls.includes(B + 'index.ttl'),
      'includes the base index itself');

// --- installToPod: always-overwrite, no skip, no container PUT ---
const pod = new Map();
pod.set('https://pod/omp/libraries/x/agents.ttl', 'STALE-EMPTY');  // botched prior run
const methods = [];
const authedFetch = async (url, opts = {}) => {
  const m = (opts.method || 'GET').toUpperCase();
  methods.push(m);
  if (m === 'PUT') {
    if (url.includes('/fail/')) return new Response('denied', { status: 403 });
    pod.set(url, String(opts.body)); return new Response('', { status: 201 });
  }
  return new Response('', { status: 404 });
};

const files = [
  { relPath: 'index.html',            body: '<html>',    contentType: 'text/html' },
  { relPath: 'ia-player.js',          body: 'console;',  contentType: 'text/javascript' },
  { relPath: 'libraries/x/index.ttl', body: '@prefix',   contentType: 'text/turtle' },
  { relPath: 'libraries/x/agents.ttl',body: 'REAL',      contentType: 'text/turtle' }, // must overwrite
  { relPath: 'fail/bad',              body: 'x',          contentType: 'text/turtle' }, // 403
];
const seen = [];
const r = await ia.installToPod(authedFetch, 'https://pod/omp/', files,
  (i, n, label) => seen.push(`${i}/${n}:${label}`));

check(r.put === 4, `wrote all 4 writable files (got ${r.put})`);
check(r.skipped === 0, `never skips (got ${r.skipped})`);
check(r.failed.length === 1 && /fail\/bad → 403/.test(r.failed[0]),
      `failure captured WITH status (${r.failed[0]})`);
check(r.ok === false, 'ok=false when something failed');
check(methods.filter(x => x === 'PUT').length === 5,
      'every file PUT — no pre-write existence skip');
check(!methods.includes('HEAD'), 'no HEAD probe');
check(methods.filter(x => x === 'GET').length === 1,
      'a GET only to verify the one ambiguous (403) write, not before PUT');
check(pod.get('https://pod/omp/libraries/x/agents.ttl') === 'REAL',
      'OVERWRITES a botched/empty pre-existing resource (the index.ttl bug)');
check(seen.length === 5 && seen[4] === '5/5:fail/bad', 'progress per file, in order');

// Re-run overwrites everything again (idempotent by overwrite).
const r2 = await ia.installToPod(authedFetch, 'https://pod/omp/',
  files.filter(f => !f.relPath.startsWith('fail/')), () => {});
check(r2.put === 4 && r2.skipped === 0 && r2.ok, 're-run rewrites all (idempotent overwrite)');

// --- success detection (defect B): trust a real 2xx; verify ANYTHING
//     ambiguous by reading the resource back. An opaque-redirect is
//     success ONLY if the resource actually resolves afterwards — a
//     redirect/opaque PUT whose write didn't land must FAIL (the bug:
//     it used to count as "written"). ---
const rfFiles = [
  { relPath: 'a', body: '1', contentType: 'text/turtle' },  // opaque PUT, written → GET 200 → success
  { relPath: 'b', body: '2', contentType: 'text/turtle' },  // 205 → 2xx fast-path success
  { relPath: 'c', body: '3', contentType: 'text/turtle' },  // genuine 401 → GET 401 → fail
  { relPath: 'd', body: '4', contentType: 'text/turtle' },  // opaque PUT, NOT written → GET 404 → fail (the masked-failure regression)
];
const opaque = { ok: false, status: 0, type: 'opaqueredirect', text: () => Promise.reject(new Error('opaque')) };
const rfFetch = async (url, opts = {}) => {
  const m = (opts.method || 'GET').toUpperCase();
  if (url.endsWith('/a')) return m === 'PUT' ? opaque : { ok: true,  status: 200, type: 'basic', text: async () => '1' };
  if (url.endsWith('/b')) return { ok: true,  status: 205, type: 'basic', text: async () => '' };
  if (url.endsWith('/d')) return m === 'PUT' ? opaque : { ok: false, status: 404, type: 'basic', text: async () => 'Not Found' };
  return { ok: false, status: 401, type: 'basic', text: async () => 'Unauthorized' }; // 'c', any method
};
const rf = await ia.installToPod(rfFetch, 'https://pod/omp/', rfFiles, () => {});
check(rf.put === 2, `verified opaque (a) + real 2xx (b) written; NOT the unverifiable ones (got ${rf.put})`);
check(rf.failed.length === 2, `both unverifiable writes failed (got ${rf.failed.length})`);
check(rf.failed.some(x => /(^|[^0-9])401/.test(x)), 'genuine 401 (c) failed');
check(rf.failed.some(x => /verified-get\(404\)/.test(x)),
      'masked-failure (d) now CAUGHT: opaque PUT that did not land → fail');
check(rf.ok === false, 'ok=false because c and d fail');

// --- ensurePublicTypeIndex: reuse existing, else create + link ---
const WEBID = 'https://alice.example/profile/card#me';
// (a) profile already advertises one → returned as-is, no writes.
let wrote = [];
const fetchHasTI = async (url, opts = {}) => {
  const m = (opts.method || 'GET').toUpperCase();
  if (m === 'GET' && url.startsWith('https://alice.example/profile/card'))
    return new Response(
      `@prefix solid:<http://www.w3.org/ns/solid/terms#>.
       <${WEBID}> solid:publicTypeIndex <https://alice.example/settings/pti.ttl>.`,
      { status: 200, headers: { 'Content-Type': 'text/turtle' } });
  wrote.push(`${m} ${url}`);
  return new Response('', { status: 200 });
};
const ti1 = await ia.ensurePublicTypeIndex(fetchHasTI, WEBID);
check(ti1 === 'https://alice.example/settings/pti.ttl', 'reuses existing publicTypeIndex');
check(wrote.length === 0, 'no writes when one already exists');

// (b) no publicTypeIndex + a pim:storage → PUT index doc + PATCH profile.
const store2 = new Map();
const fetchNoTI = async (url, opts = {}) => {
  const m = (opts.method || 'GET').toUpperCase();
  if (m === 'GET' && url.startsWith('https://bob.example/profile/card'))
    return new Response(
      `@prefix space:<http://www.w3.org/ns/pim/space#>.
       <https://bob.example/profile/card#me> space:storage <https://bob.example/>.`,
      { status: 200, headers: { 'Content-Type': 'text/turtle' } });
  store2.set(`${m} ${url.split('#')[0]}`, opts.body || '');
  return new Response('', { status: 201 });
};
const BWID = 'https://bob.example/profile/card#me';
const ti2 = await ia.ensurePublicTypeIndex(fetchNoTI, BWID);
check(ti2 === 'https://bob.example/settings/publicTypeIndex.ttl',
      'creates a type index under pim:storage');
check([...store2.keys()].some(k => k.startsWith('PUT https://bob.example/settings/publicTypeIndex.ttl')),
      'PUT the new type-index doc');
check([...store2.keys()].some(k => k.startsWith('PATCH https://bob.example/profile/card')),
      'PATCH the profile to link publicTypeIndex');

console.log();
console.log(fails ? `FAILED (${fails})` : 'ALL PASS');
process.exit(fails ? 1 : 0);
