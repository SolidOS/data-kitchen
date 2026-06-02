import { Namespace, graph, Fetcher, sym, st, literal, UpdateManager, parse, rdf, getAuthFetch } from './rdf-shared.js';

const SKOS    = Namespace('http://www.w3.org/2004/02/skos/core#');
const RDFS    = Namespace('http://www.w3.org/2000/01/rdf-schema#');
const RDF     = Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#');
const XSD     = Namespace('http://www.w3.org/2001/XMLSchema#');
const DCT     = Namespace('http://purl.org/dc/terms/');
const FOAF    = Namespace('http://xmlns.com/foaf/0.1/');
const MO      = Namespace('http://purl.org/ontology/mo/');
const DCAT    = Namespace('http://www.w3.org/ns/dcat#');
const SCHEMA  = Namespace('http://schema.org/');
const OA      = Namespace('http://www.w3.org/ns/oa#');
const SOLID   = Namespace('http://www.w3.org/ns/solid/terms#');
const DCTYPE  = Namespace('http://purl.org/dc/dcmitype/');

const MUSIC_ARTIST = MO('MusicArtist');
const RELEASE      = MO('Release');
const TRACK        = MO('Track');
// A Playlist document is typed schema:ItemList + schema:MusicPlaylist
// (+ dcat:Dataset). PLAYLIST is the MusicPlaylist facet — the
// playlist-specific type used to find and seed playlists. Members are
// the ordered schema:itemListElement → schema:ListItem nodes, each
// { schema:position (1-based int) ; schema:item → canonical
// .../releases/<slug>#tNN }. The parent Release of a playlist track
// is one hop away via dct:isPartOf (the structural spine).
const PLAYLIST     = SCHEMA('MusicPlaylist');
const GENRE        = MO('Genre');

// ----------------------------------------------------------------------
// Multi-file library layout
// ----------------------------------------------------------------------
//
// A "library" is a self-contained container under ./libraries/<slug>/.
// Its index document is `index.ttl` (the URL the app loads), which fans
// out via rdfs:seeAlso to SIBLING files in the same container:
//   agents.ttl            — all catalog Agents
//   genres.ttl            — all Genres + the #Music root
//   releases.ttl          — index of per-release files (see releases/)
//   releases/<slug>.ttl   — one mo:Release + its mo:Tracks
//   playlists/<slug>      — one self-contained playlist resource
//
// Each playlist/release resource uses `<>` as its self-reference (its
// URI IS the document URI; no fragment). Cross-file references stay
// correct because we use absolute URIs (urn:uuid:… for Agents/Tracks/
// Releases, `<agents.ttl#X>`-style refs for Genres).
//
// libraryDocs(baseURI) derives the catalog document URIs from the
// library's index URL — every file is a sibling of index.ttl.

function libraryDocs(baseURI) {
  const dir = new URL('./', baseURI);   // the library container itself
  return {
    libraryDoc:       sym(baseURI),
    agentsDoc:        sym(new URL('agents.ttl',   dir).href),
    genresDoc:        sym(new URL('genres.ttl',   dir).href),
    // releases.ttl is the per-release-file index; releasesDirUrl is
    // where individual release files live (Phase 2 onward).
    releasesDoc:      sym(new URL('releases.ttl', dir).href),
    releasesIndexDoc: sym(new URL('releases.ttl', dir).href),
    // The DCAT catalog NODES (the #it on each index doc). Releases /
    // playlists are linked from their index's <#it> via dcat:dataset;
    // the release dct:isPartOf spine points at releasesCatalog.
    releasesCatalog:  sym(new URL('releases.ttl',  dir).href + '#it'),
    playlistsDoc:     sym(new URL('playlists.ttl', dir).href),
    playlistsCatalog: sym(new URL('playlists.ttl', dir).href + '#it'),
    releasesDirUrl:   new URL('releases/',        dir).href,
    playlistsDirUrl:  new URL('playlists/',       dir).href,
    musicRootUri:     new URL('genres.ttl',       dir).href + '#Music',
  };
}

// Title → URL-safe slug for new playlist files.
function slugifyForFile(label) {
  return String(label).trim()
    .replace(/[^\w]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'Playlist';
}

// Find an unused slug for a new playlist. Suffix `_N` if collisions exist.
function uniquePlaylistSlug(store, baseURI, label) {
  const docs = libraryDocs(baseURI);
  const libraryDoc = docs.libraryDoc;
  const existing = new Set();
  for (const stmt of store.match(docs.playlistsCatalog, DCAT('dataset'), null))
    existing.add(stmt.object.value.split('#')[0]);
  for (const stmt of store.match(libraryDoc, RDFS('seeAlso'), null))
    existing.add(stmt.object.value);   // back-compat: flat/pre-rework libs
  let slug = slugifyForFile(label);
  let candidate = docs.playlistsDirUrl + slug;
  let n = 1;
  while (existing.has(candidate)) {
    candidate = docs.playlistsDirUrl + slug + '_' + n;
    n++;
  }
  return candidate.slice(docs.playlistsDirUrl.length);
}

// Find an unused releases/<slug> URL for a new shared release file.
// Deduped against releases.ttl's seeAlso index plus `reserved` (slugs
// minted earlier in the same addTracksToPlaylist call, not yet PUT).
// Lowercased to match the migrated catalogue's slug style.
function uniqueReleaseSlug(store, docs, label, reserved) {
  const existing = new Set(reserved || []);
  for (const stmt of store.match(docs.releasesCatalog, DCAT('dataset'), null))
    existing.add(stmt.object.value.split('#')[0]);   // strip #it → doc URL
  for (const stmt of store.match(docs.releasesDoc, RDFS('seeAlso'), null))
    existing.add(stmt.object.value);   // back-compat: pre-rework index
  const base = slugifyForFile(label).toLowerCase() || 'release';
  let candidate = docs.releasesDirUrl + base;
  let n = 1;
  while (existing.has(candidate)) candidate = docs.releasesDirUrl + base + '_' + n++;
  return candidate;
}

// Rewrite absolute IRIs pointing INSIDE a library to file-relative form
// so the library is portable — it resolves wherever it is mounted
// instead of being pinned to the URL it was last written at. (Every
// PATCH edit re-serialises a doc with absolute IRIs; left as-is they
// break the moment the library moves — see the omp-library memory.)
// `relPath` is the file's path within the library ('agents.ttl',
// 'playlists/Foo'); `containerSeg` is the library folder name. An IRI
// is treated as in-library iff it contains the `/<containerSeg>/`
// path segment; urn:, archive.org and other-origin IRIs lack it and
// are left untouched. Already-relative bodies have no matching
// <http…> tokens, so this is a safe no-op on them.
export function relativizeLibraryIris(body, containerSeg, relPath) {
  const marker = '/' + String(containerSeg) + '/';
  const depth = (String(relPath).match(/\//g) || []).length;
  const up = depth ? '../'.repeat(depth) : './';
  return String(body).replace(/<(https?:\/\/[^>\s]+)>/g, (token, iri) => {
    const at = iri.indexOf(marker);
    if (at < 0) return token;
    const tail = iri.slice(at + marker.length);
    return tail ? `<${up}${tail}>` : token;
  });
}

// ----------------------------------------------------------------------
// Load — follow rdfs:seeAlso from the library index
// ----------------------------------------------------------------------

// ----------------------------------------------------------------------
// Spine cache (Cache API). The OIDC login flow is a full-page redirect,
// so the spine (~index + playlists.ttl + every playlist + agents/genres)
// is fetched once for the guest view, then AGAIN after the redirect
// reload. Caching the fetched spine docs lets the post-redirect load —
// and every reload / returning guest — hydrate instantly with no
// network. Correctness: a cold load populates the cache through the real
// Fetcher (so rdflib knows the docs ⇒ local-dev edits work immediately);
// a successful write invalidates the edited doc (write-through) so the
// owner never sees their own stale edit; entries older than TTL are
// treated as a miss so external changes eventually refresh. Release
// files are NOT cached here (they're lazy/per-album). No-ops where the
// Cache API is absent (Node smoke tests, old browsers).
// ----------------------------------------------------------------------
const SPINE_CACHE = 'omp-spine-v1';
const SPINE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const cacheAvailable = () => typeof caches !== 'undefined';

async function spineCacheGet(url) {
  if (!cacheAvailable()) return null;
  try {
    const c = await caches.open(SPINE_CACHE);
    const res = await c.match(url);
    if (!res) return null;
    const at = Number(res.headers.get('x-omp-cached-at') || 0);
    if (at && Date.now() - at > SPINE_CACHE_TTL_MS) { c.delete(url); return null; }
    return await res.text();
  } catch { return null; }
}

async function spineCachePut(url, text, contentType = 'text/turtle') {
  if (!cacheAvailable() || text == null) return;
  try {
    const c = await caches.open(SPINE_CACHE);
    await c.put(url, new Response(text, {
      headers: { 'Content-Type': contentType, 'x-omp-cached-at': String(Date.now()) },
    }));
  } catch { /* quota / opaque — ignore, just lose the cache benefit */ }
}

// Write-through invalidation: drop cached doc(s) after a successful edit
// so the next load re-fetches the changed file fresh. Fire-and-forget.
function spineCacheInvalidate(...urls) {
  if (!cacheAvailable()) return;
  caches.open(SPINE_CACHE).then(c => {
    for (const u of urls) { if (u) c.delete(String(u).split('#')[0]).catch(() => {}); }
  }).catch(() => {});
}

// `shared:true` (a Solid/pod library) loads into the shared `rdf`
// singleton store using its Fetcher — the one sol-login's
// _integrateWithRdflib() patched with the Inrupt authenticated fetch,
// so authed GET/PATCH/PUT/DELETE happen automatically. Non-shared
// (local/dev) libraries keep their own private store + Fetcher
// (multi-library aggregation unchanged) — plan store model A.
// `lazyReleases:true` makes the recursive loader skip the per-release
// files (the releases.ttl index's dcat:dataset members) at startup —
// the bulk of the docs. index/agents/genres/releases.ttl(index)/
// playlists.ttl + every playlist file still load (the spine), so the
// Sources/Artist/Genre columns are complete. Each releases/<slug> is
// fetched on demand via the returned `loadDocs` when its playlist /
// artist / album is opened. Returns { store, baseURI, fetcher,
// loadDocs } — loadDocs(urls) loads missing docs into the SAME store.
export async function loadRDF(uri, { shared = false, lazyReleases = false, lazyPlaylists = false } = {}) {
  const store = shared ? rdf.store : graph();
  const fetcher = shared ? rdf.storeFetcher : new Fetcher(store);
  const absoluteUri = new URL(uri, window.location.href).href;
  const lazyDocUrls = (() => {
    try { const d = libraryDocs(absoluteUri); return { releases: d.releasesDoc.value, playlists: d.playlistsDoc.value }; }
    catch { return {}; }
  })();
  const releasesDocUrl = lazyDocUrls.releases || null;
  // Only the app's own (shared) library spine is cached. Cache HIT →
  // parse text straight into the store (no network); rdflib won't know
  // the doc is "loaded", so a later local-dev UpdateManager edit force-
  // loads it once via runUpdate's existing uneditable-retry. Cache MISS
  // → real Fetcher load (rdflib-aware ⇒ edits work immediately), then
  // serialise the doc back into the cache for next time.
  const useCache = shared && cacheAvailable();
  async function loadSpineDoc(u) {
    const key = String(u).split('#')[0];
    if (shared && rdf.isLoaded(key)) return;
    if (useCache) {
      const text = await spineCacheGet(key);
      if (text != null) {
        try { parse(text, store, key, 'text/turtle'); rdf.markLoaded(key); return; }
        catch { /* corrupt entry → fall through to network */ }
      }
    }
    await fetcher.load(key);
    if (shared) rdf.markLoaded(key);
    if (useCache) {
      try {
        const t = rdf.serialize(sym(key), store, key, 'text/turtle');
        if (typeof t === 'string' && t.length) await spineCachePut(key, t);
      } catch { /* serialize unavailable → skip caching this doc */ }
    }
  }
  try {
    await loadSpineDoc(absoluteUri);
    // Follow rdfs:seeAlso from the library index, RECURSIVELY, so an
    // index can fan out through sub-indexes (e.g. index.ttl →
    // releases.ttl → releases/<slug>.ttl, and future nested libraries).
    // Cycle-safe (visited set), bounded concurrency, per-doc failures
    // warned and skipped. Back-compatible: a flat single-file library
    // (no seeAlso) fetches nothing extra; a one-level library behaves
    // exactly as before.
    const SEEALSO_CONCURRENCY = 8;
    const visited = new Set([absoluteUri]);
    // Forward-load edges form one recursive DCAT/SKOS spine — every
    // edge is a typed semantic relation that is ALSO what the loader
    // follows (the old rdfs:seeAlso / semantic split is gone):
    //   dcat:catalog       catalog → sub-catalog (index → releases/
    //                       playlists indexes)
    //   dcat:dataset       catalog → dataset (index → agents.ttl;
    //                       releases/playlists index → each member)
    //   dcat:themeTaxonomy catalog → SKOS scheme (index → genres.ttl)
    //   rdfs:seeAlso        legacy/back-compat (flat or pre-rework
    //                       libraries; still honoured)
    // These live on the <#it> node, so probe both the doc IRI and
    // doc#it; objects are normalised to absolute doc URLs (frag
    // stripped) so a #it target loads its document.
    const seeAlsoOf = (docUrl) => {
      const subs = [sym(docUrl), sym(docUrl.split('#')[0] + '#it')];
      // Lazy: when expanding the releases.ttl index, do NOT follow its
      // links to the per-release files — they load on demand. That
      // doc's ONLY outgoing edges are release files, via EITHER
      // dcat:dataset (dev's migrated DCAT spine) OR rdfs:seeAlso (the
      // pod library synthesised by installOnPod) — so skip BOTH there.
      // The spine reaches agents/genres/playlists via index.ttl's own
      // edges, which are followed normally, so it stays complete.
      const base = docUrl.split('#')[0];
      // Lazy: when expanding the releases.ttl OR playlists.ttl index, do
      // NOT follow its dcat:dataset links to the per-release / per-playlist
      // files — they load on demand / in the two-phase background pass.
      const skipDatasetLinks =
        (lazyReleases && releasesDocUrl && base === releasesDocUrl) ||
        (lazyPlaylists && lazyDocUrls.playlists && base === lazyDocUrls.playlists);
      const preds = skipDatasetLinks
        ? [DCAT('catalog'), DCAT('themeTaxonomy')]
        : [RDFS('seeAlso'), DCAT('dataset'),
           DCAT('catalog'), DCAT('themeTaxonomy')];
      const out = [];
      for (const su of subs)
        for (const p of preds)
          for (const s of store.match(su, p, null)) {
            try { out.push(new URL(s.object.value, docUrl).href.split('#')[0]); }
            catch { /* skip malformed */ }
          }
      // Never traverse LDP/CSS auxiliary resources. A pod serves every
      // resource with `Link: rel="describedby"` → <name>.meta (and
      // .acl); rdflib's Fetcher records that as rdfs:seeAlso, so the
      // spine would otherwise fetch a `.meta` for EVERY playlist — 2×
      // the requests, all extra authed round-trips. They never hold
      // library content.
      return out.filter(u =>
        u && !visited.has(u) && !/\.(meta|acl)$/i.test(u));
    };

    let frontier = seeAlsoOf(absoluteUri);
    while (frontier.length) {
      const nextFrontier = [];
      for (let i = 0; i < frontier.length; i += SEEALSO_CONCURRENCY) {
        // Mark visited as we slice so duplicates across the level are
        // fetched once (the load itself dedupes via rdf.isLoaded too).
        const batch = frontier.slice(i, i + SEEALSO_CONCURRENCY).filter(u => {
          if (visited.has(u)) return false;
          visited.add(u);
          return true;
        });
        await Promise.all(batch.map(async (u) => {
          try {
            await loadSpineDoc(u);            // cache-first, else network
            nextFrontier.push(...seeAlsoOf(u));
          } catch (err) {
            console.warn('seeAlso load failed:', u, err);
          }
        }));
      }
      frontier = nextFrontier.filter(u => !visited.has(u));
    }
    // On-demand loader for docs skipped above (release files). Loads
    // missing docs into the SAME store/fetcher, deduped against the
    // spine's visited set (shared store also via rdf.isLoaded). Release
    // files have no forward spine edges, so no recursion needed.
    // Returns the number of docs actually fetched (0 ⇒ all were
    // already loaded — caller can skip any re-parse).
    const loadDocs = async (urls) => {
      const todo = [...new Set((urls || []).map(u => u && u.split('#')[0]))]
        .filter(u => u && (shared ? !rdf.isLoaded(u) : !visited.has(u)));
      let loaded = 0;
      for (let i = 0; i < todo.length; i += SEEALSO_CONCURRENCY) {
        const batch = todo.slice(i, i + SEEALSO_CONCURRENCY).filter(u => {
          if (visited.has(u)) return false;
          visited.add(u);
          return true;
        });
        await Promise.all(batch.map(async (u) => {
          try {
            if (shared && rdf.isLoaded(u)) { /* already parsed */ }
            else { await fetcher.load(u); if (shared) rdf.markLoaded(u); }
            loaded++;
          } catch (err) { console.warn('lazy doc load failed:', u, err); }
        }));
      }
      return loaded;
    };
    return { store, baseURI: absoluteUri, fetcher, loadDocs };
  } catch (error) {
    console.error('Error loading RDF:', error);
    throw error;
  }
}

// Resolve the user's Open Media library on their pod via the public
// type index. Parses the WebID profile + type index into a throwaway
// graph (not the shared store) using the authenticated fetch.
// Returns { url, typeIndex, reason }:
//   - url set            → load the player from it
//   - url null, typeIndex → profile has an index but no mo:Release reg
//                           (→ bootstrap-into-it later)
//   - url & typeIndex null→ no publicTypeIndex (→ create-behind-confirm)
export async function resolvePodLibraryUrl(authedFetch, webId) {
  const g = graph();
  const loadDoc = async (url) => {
    const res = await authedFetch(url, { headers: { Accept: 'text/turtle' } });
    if (!res || res.ok === false) throw new Error(`fetch ${url} → ${res && res.status}`);
    const text = await res.text();
    const ct = (res.headers?.get?.('Content-Type') || 'text/turtle').split(';')[0].trim();
    parse(text, g, url.split('#')[0], ct || 'text/turtle');
  };

  await loadDoc(webId);
  const tindex =
       g.any(sym(webId), SOLID('publicTypeIndex'))?.value
    || g.match(null, SOLID('publicTypeIndex'), null)[0]?.object?.value
    || null;
  if (!tindex) return { url: null, typeIndex: null, reason: 'no solid:publicTypeIndex on profile' };

  await loadDoc(tindex);
  for (const reg of g.match(null, SOLID('forClass'), MO('Release'))) {
    const inst = g.any(reg.subject, SOLID('instance'))?.value;
    if (inst) return { url: inst, typeIndex: tindex };
    const cont = g.any(reg.subject, SOLID('instanceContainer'))?.value;
    if (cont) return { url: new URL('index.ttl', cont).href, typeIndex: tindex };
  }
  return { url: null, typeIndex: tindex, reason: 'no mo:Release TypeRegistration' };
}

// ALL storage candidates declared on the profile (space:storage —
// a profile can list several), newest-API first, deduped, each with a
// trailing slash. The WebID origin root is appended as a last-resort
// fallback so the list is never empty. The caller lets the user pick
// (a profile may advertise storages unrelated to this app).
export async function discoverPodStorages(authedFetch, webId) {
  const g = graph();
  const res = await authedFetch(webId, { headers: { Accept: 'text/turtle' } });
  if (res && res.ok !== false) {
    const ct = (res.headers?.get?.('Content-Type') || 'text/turtle').split(';')[0].trim();
    parse(await res.text(), g, webId.split('#')[0], ct || 'text/turtle');
  }
  const SPACE = Namespace('http://www.w3.org/ns/pim/space#');
  const out = [];
  const add = (v) => {
    if (!v) return;
    const u = v.endsWith('/') ? v : v + '/';
    if (!out.includes(u)) out.push(u);
  };
  for (const s of g.match(sym(webId), SPACE('storage'), null)) add(s.object?.value);
  for (const s of g.match(null, SPACE('storage'), null)) add(s.object?.value);
  add(new URL('/', webId).href);
  return out;
}

async function podPatchInsert(authedFetch, url, sparql) {
  const res = await authedFetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/sparql-update' },
    body: sparql,
  });
  if (!res || res.ok === false) throw new Error(`PATCH ${url} → ${res && res.status}`);
}

// Return the WebID's public type index URL, creating + linking one if
// the profile has none (so a library can ALWAYS be recorded, "if
// possible"). Best-effort: returns null if the profile/type-index
// writes are refused. Reuses an existing index when present.
export async function ensurePublicTypeIndex(authedFetch, webId) {
  const SOLIDNS = 'http://www.w3.org/ns/solid/terms#';
  const SPACE = Namespace('http://www.w3.org/ns/pim/space#');
  const g = graph();
  try {
    const r = await authedFetch(webId, { headers: { Accept: 'text/turtle' } });
    if (r && r.ok !== false) {
      const ct = (r.headers?.get?.('Content-Type') || 'text/turtle').split(';')[0].trim();
      parse(await r.text(), g, webId.split('#')[0], ct || 'text/turtle');
    }
  } catch { /* unreadable profile → try to create below */ }

  const existing =
       g.any(sym(webId), SOLID('publicTypeIndex'))?.value
    || g.match(null, SOLID('publicTypeIndex'), null)[0]?.object?.value
    || null;
  if (existing) return existing;

  const storage =
       g.any(sym(webId), SPACE('storage'))?.value
    || g.match(null, SPACE('storage'), null)[0]?.object?.value
    || new URL('/', webId).href;
  const base = storage.endsWith('/') ? storage : storage + '/';
  const url = new URL('settings/publicTypeIndex.ttl', base).href;
  try {
    const put = await authedFetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/turtle' },
      body: `@prefix solid: <${SOLIDNS}>.\n<${url}> a solid:TypeIndex, solid:ListedDocument.\n`,
    });
    if (!put || put.ok === false) return null;
    await podPatchInsert(authedFetch, webId.split('#')[0],
      `INSERT DATA { <${webId}> <${SOLIDNS}publicTypeIndex> <${url}> . }`);
    return url;
  } catch { return null; }
}

// ----------------------------------------------------------------------
// Multi-library type-index registry
//
// The pod's public type index can hold MANY mo:Release TypeRegistrations
// — one per library the user owns or has added (their pod library, the
// local default catalog, and any remote "+ Source" libraries). Each
// registration carries an rdfs:label so the Libraries column can name it
// without fetching every instance. This is the discovery backbone: any
// device that logs in re-derives the full library list from here.
// ----------------------------------------------------------------------

// Stable type-index fragment for a library config id, so registering the
// same library twice updates one node instead of duplicating it.
function libRegNode(typeIndex, id) {
  const slug = String(id || '').replace(/[^A-Za-z0-9_-]/g, '-') || 'lib';
  return `${typeIndex.split('#')[0]}#omp-lib-${slug}`;
}

// Every mo:Release library registered in the user's public type index.
// Returns { typeIndex, libraries: [{ url, label, reg }] }. typeIndex is
// null when the profile advertises none (nothing to discover yet).
// Parses into a throwaway graph with the authenticated fetch.
export async function listRegisteredLibraries(authedFetch, webId) {
  const g = graph();
  const loadDoc = async (url) => {
    const res = await authedFetch(url, { headers: { Accept: 'text/turtle' } });
    if (!res || res.ok === false) throw new Error(`fetch ${url} → ${res && res.status}`);
    const ct = (res.headers?.get?.('Content-Type') || 'text/turtle').split(';')[0].trim();
    parse(await res.text(), g, url.split('#')[0], ct || 'text/turtle');
  };

  await loadDoc(webId);
  const tindex =
       g.any(sym(webId), SOLID('publicTypeIndex'))?.value
    || g.match(null, SOLID('publicTypeIndex'), null)[0]?.object?.value
    || null;
  if (!tindex) return { typeIndex: null, libraries: [] };

  await loadDoc(tindex);
  const libraries = [];
  const seen = new Set();
  for (const reg of g.match(null, SOLID('forClass'), MO('Release'))) {
    const url = g.any(reg.subject, SOLID('instance'))?.value;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const label =
         g.any(reg.subject, RDFS('label'))?.value
      || g.any(reg.subject, DCT('title'))?.value
      || '';
    libraries.push({ url, label, reg: reg.subject.value });
  }
  return { typeIndex: tindex, libraries };
}

// Register (or relabel) a library in the public type index. Idempotent
// per config id: the registration node is derived from the id, so the
// same library re-registers in place. Best-effort — a pod that refuses
// the PATCH throws; callers treat that as non-fatal (the library still
// works, it just isn't discoverable elsewhere).
export async function registerPodLibrary(authedFetch, typeIndex, { id, url, label }) {
  if (!typeIndex || !url) throw new Error('registerPodLibrary: typeIndex and url required');
  const S = 'http://www.w3.org/ns/solid/terms#';
  const reg = libRegNode(typeIndex, id);
  const lbl = (label || '').replace(/[\\"]/g, '\\$&');
  // Replace any prior triples on this node (id-keyed) so a renamed or
  // repointed library updates cleanly instead of accreting stale values.
  await podPatchInsert(authedFetch, typeIndex,
    `DELETE { <${reg}> ?p ?o } ` +
    `INSERT { <${reg}> a <${S}TypeRegistration> ; ` +
    `<${S}forClass> <http://purl.org/ontology/mo/Release> ; ` +
    `<${S}instance> <${url}> ; ` +
    `<http://www.w3.org/2000/01/rdf-schema#label> "${lbl}" . } ` +
    `WHERE { OPTIONAL { <${reg}> ?p ?o } }`);
}

// Drop a library's registration from the public type index (by config
// id; falls back to matching the instance URL for nodes written before
// id-keyed nodes existed). Best-effort.
export async function unregisterPodLibrary(authedFetch, typeIndex, { id, url }) {
  if (!typeIndex) throw new Error('unregisterPodLibrary: typeIndex required');
  const S = 'http://www.w3.org/ns/solid/terms#';
  const reg = libRegNode(typeIndex, id);
  await podPatchInsert(authedFetch, typeIndex,
    `DELETE { <${reg}> ?p ?o } WHERE { <${reg}> ?p ?o }`);
  if (url) {
    await podPatchInsert(authedFetch, typeIndex,
      `DELETE { ?r ?p ?o } ` +
      `WHERE { ?r <${S}forClass> <http://purl.org/ontology/mo/Release> ; ` +
      `<${S}instance> <${url}> ; ?p ?o . }`);
  }
}

// ----------------------------------------------------------------------
// Favorites — placeholder API (Favorites was removed in the multi-file
// migration; the parked UI still imports these names).
// ----------------------------------------------------------------------

export function getFavoritesUri(baseURI) {
  return baseURI + '#Favorites';
}
export function isFavorited(_store, _baseURI, _trackUrl) {
  return false;
}
export async function addFavorite(_store, _baseURI, _fav) {
  return { ok: false, err: 'Favorites not initialised. Create a Favorites playlist via + Playlist.' };
}
export async function removeFavorite(_store, _baseURI, _trackUrl) {
  return { ok: true };
}

// ----------------------------------------------------------------------
// Read path
// ----------------------------------------------------------------------

const AGENT_TYPES = [
  MUSIC_ARTIST,
  MO('MusicGroup'),
  MO('SoloMusicArtist'),
  MO('Label'),
  FOAF('Agent'),
  FOAF('Organization'),
  FOAF('Person'),
  FOAF('Group'),
];

// Per-media-type vocab profile (the read half of the media-type seam):
// which node types are "browse rows", and which predicates carry their
// name and genre link. Audio = music's mo:/foaf: terms (unchanged);
// video = schema.org film terms (schema:Collection / name / genre).
const VOCAB_PROFILES = {
  audio: { nodeTypes: AGENT_TYPES, nameProp: FOAF('name'), genreProp: MO('genre') },
  video: { nodeTypes: [SCHEMA('Collection')], nameProp: SCHEMA('name'), genreProp: SCHEMA('genre') },
};
const vocabProfile = (mediaType) => VOCAB_PROFILES[mediaType] || VOCAB_PROFILES.audio;

// The library's media type, declared on the catalog node via
// `<index#it> dct:type` (DCMI Type vocab). MovingImage → video; absent
// or Sound → audio (the default, so music is unchanged).
export function libraryMediaType(store, baseURI) {
  const it = sym(baseURI.split('#')[0] + '#it');
  const t = store.any(it, DCT('type')) || store.any(sym(baseURI), DCT('type'));
  return (t && t.value === DCTYPE('MovingImage').value) ? 'video' : 'audio';
}

function allAgents(store, nodeTypes = AGENT_TYPES) {
  const seen = new Set();
  const result = [];
  for (const t of nodeTypes) {
    for (const stmt of store.match(null, RDF('type'), t)) {
      const u = stmt.subject.value;
      if (seen.has(u)) continue;
      seen.add(u);
      result.push(stmt.subject);
    }
  }
  return result;
}

export function parseBookmarks(store, baseURI, mediaType = 'audio') {
  const docs = libraryDocs(baseURI);
  const profile = vocabProfile(mediaType);
  // The SKOS scheme root is whatever the catalog's dcat:themeTaxonomy
  // points at (so it isn't hardcoded to genres.ttl#Music); fall back to
  // the legacy #Music root for music libraries that predate the edge.
  const it = sym(baseURI.split('#')[0] + '#it');
  const themeRoot = store.any(it, DCAT('themeTaxonomy'))
    || store.any(sym(baseURI), DCAT('themeTaxonomy'));
  const musicRoot = themeRoot || sym(docs.musicRootUri);

  // Genres = SKOS concepts that point at the scheme root via topConceptOf.
  const genres = store.match(null, SKOS('topConceptOf'), musicRoot).map(stmt => ({
    id: stmt.subject.value,
    label: store.any(stmt.subject, SKOS('prefLabel'))?.value || 'Unnamed Genre',
  }));

  const bookmarks = [];

  // Catalog Agents / Collections — each one is one row in the
  // Artists/Collections column (terms per the media-type vocab profile).
  for (const node of allAgents(store, profile.nodeTypes)) {
    const genre = store.any(node, profile.genreProp)?.value;
    if (!genre) continue;
    const srcPlaylist = store.any(node, DCT('source'));
    bookmarks.push({
      node,
      label: store.any(node, profile.nameProp)?.value || 'Untitled',
      topic: genre,
      url: store.any(node, DCAT('landingPage'))?.value || null,
      source: null,
      // dcterms:source → the playlist this artist is a live link to
      // (convert-to-artist). Its presence is ALSO the "local data"
      // signal: the UI then reads albums/tracks straight from the RDF
      // instead of doing an archive.org search.
      sourcePlaylist: srcPlaylist ? srcPlaylist.value : null,
      localData: !!srcPlaylist,
    });
  }

  // Playlist tracks — for each playlist, walk its schema:itemListElement
  // → schema:ListItem members in schema:position order. Each ListItem's
  // schema:item is the canonical Track IRI in a releases/<slug> file;
  // its parent Release is one hop away via dct:isPartOf (the spine).
  for (const stmt of store.match(null, RDF('type'), PLAYLIST)) {
    const playlistNode = stmt.subject;
    const entries = store.match(playlistNode, SCHEMA('itemListElement'), null)
      .map(e => {
        const pos = parseInt(store.any(e.object, SCHEMA('position'))?.value, 10);
        return {
          track: store.any(e.object, SCHEMA('item')),
          pos: Number.isFinite(pos) ? pos : Number.MAX_SAFE_INTEGER,
        };
      })
      .filter(e => e.track)
      .sort((a, b) => a.pos - b.pos);
    for (const { track: trackNode } of entries) {
      const parentRelease = store.any(trackNode, DCT('isPartOf')) || null;

      const trackTitle = store.any(trackNode, DCT('title'))?.value || '';
      const albumTitle = parentRelease ? (store.any(parentRelease, DCT('title'))?.value || '') : '';
      const makerNode = store.any(trackNode, FOAF('maker'))
        || (parentRelease ? store.any(parentRelease, FOAF('maker')) : null);
      // maker may be an Agent node (read foaf:name) OR a plain literal
      // (use it directly — addTracksToPlaylist / track-edit store
      // literals when there's no Agent match).
      const artistName = makerNode
        ? (makerNode.termType === 'Literal'
            ? makerNode.value
            : (store.any(makerNode, FOAF('name'))?.value || ''))
        : '';
      const downloadUrl = store.any(trackNode, MO('item'))?.value;
      const albumUrl = parentRelease ? (store.any(parentRelease, DCAT('landingPage'))?.value || null) : null;

      // Backward-compatible label format so existing UI parsers keep working
      // until we wire structured fields all the way through.
      const parts = [artistName, albumTitle, trackTitle].filter(Boolean);
      const label = parts.length ? parts.join(' — ') : trackTitle || 'Untitled';

      bookmarks.push({
        node: trackNode,
        label,
        topic: playlistNode.value,
        url: downloadUrl || null,
        source: albumUrl,
        artist: artistName,
        album: albumTitle,
        name: trackTitle,
      });
    }
  }

  return { genres, bookmarks };
}

export function parsePlaylists(store, baseURI) {
  // Single-store S1: every same-origin library (Music, Movies) loads into
  // the ONE shared rdf store, so a bare `?p a schema:MusicPlaylist` scan
  // returns EVERY library's playlists — which leaked music playlists into
  // the Movies view. Scope to playlist resources under this library's own
  // directory so the Sources column lists only the active library's.
  const dir = baseURI ? new URL('./', baseURI).href : null;
  const seen = new Set();
  const out = [];
  for (const stmt of store.match(null, RDF('type'), PLAYLIST)) {
    const node = stmt.subject;
    if (dir && !node.value.startsWith(dir)) continue;
    if (seen.has(node.value)) continue;
    seen.add(node.value);
    const name = store.any(node, DCT('title'))?.value
        || store.any(node, RDFS('label'))?.value
        || node.value.replace(/^.*\//, '')
        || 'Untitled playlist';
    const maker = store.any(node, FOAF('maker'))?.value || '';
    const description = store.any(node, DCT('description'))?.value || '';
    const styleClass = store.any(node, OA('styleClass'));
    const artist = store.match(null, DCT('source'), node)[0]?.subject;
    out.push({
      id: node.value,
      name,
      maker,
      description,
      // Hidden playlists are linked-artist-only: kept in memory for
      // editing/linking but filtered out of the Sources display.
      hidden: styleClass ? styleClass.value === 'hidden' : false,
      // The Agent node this playlist is linked to as an artist (if any).
      artistNode: artist || null,
      // Composed display string for the Sources column.
      label: maker ? `${name} (${maker})` : name,
    });
  }
  return out;
}

// ----------------------------------------------------------------------
// Update plumbing
// ----------------------------------------------------------------------

// Explicit write-path flag (single-store §4). Replaces the old
// `store === rdf.store` discriminator: under single-store the
// same-origin/dev library AND the pod library both live in rdf.store,
// so store identity can no longer tell "authed pod write" (needs the
// sparql-update bypass — UpdateManager.editable() is false over the
// Inrupt-authenticated Fetcher on CSS) from "local/unauth write"
// (UpdateManager works). ia3.js sets this true while a Solid session
// is active, false otherwise. Default false → dev/local & logged-out
// take the UpdateManager path (today's working behaviour); only an
// authed pod write takes the bypass. Phase A later decides whether to
// flip even the authed case to UpdateManager — this flag is the one
// place that lives.
let solidWriteAuthed = false;
export function setSolidWriteAuthed(v) {
  solidWriteAuthed = !!v;
  try { console.info('[omp] setSolidWriteAuthed →', solidWriteAuthed); } catch {}
}
// Console-pokable getter so you can verify the live flag value:
//   __OMP.writeAuthed()  → true|false
try {
  if (typeof globalThis !== 'undefined') {
    globalThis.__OMP = globalThis.__OMP || {};
    globalThis.__OMP.writeAuthed = () => solidWriteAuthed;
    globalThis.__OMP.isRdfStore = (s) => s === rdf.store;
  }
} catch {}

function ensureUpdater(store) {
  // Fetcher-wiring fix (single-store-plan §13 hypothesis): rdflib's
  // UpdateManager does its editability probe and PATCH through
  // `store.fetcher`. `<sol-login>._integrateWithRdflib()` patches the
  // AUTHED Fetcher onto `rdf.storeFetcher` (a sibling property on the
  // singleton), but does NOT reassign `rdf.store.fetcher` — which can
  // remain a default unauth Fetcher rdflib auto-created. Result:
  // UM's probe goes unauthed → `editable()` false → "Can't make
  // changes in uneditable …" even though our bypass (which calls
  // `rdf.storeFetcher` directly) works. Align them here so UM sees
  // the authed Fetcher. Idempotent; cheap.
  if (store === rdf.store && rdf.storeFetcher && store.fetcher !== rdf.storeFetcher) {
    store.fetcher = rdf.storeFetcher;
  }
  // rdflib stashes the single UpdateManager on store.updater after first
  // construction and throws if you try to create a second one. Reuse it
  // across the lifetime of the store rather than newing it per call.
  if (!store.updater) {
    try { new UpdateManager(store); } catch (_) { /* race or already set */ }
  }
  return store.updater;
}

// updatemanager-everywhere Phase A — a NON-Node, opt-in live-pod probe
// (plan §7). OFF by default; no behaviour change. Enable in the pod
// console then do ONE pod write (rename/add/delete a playlist):
//   localStorage.setItem('omp:um-probe','1')   // or window.__OMP_UM_PROBE=true
// It routes that write through rdflib's UpdateManager (+ the v6
// force-load-then-retry) INSTEAD of the hand-rolled DELETE/INSERT
// bypass, logging `[omp][probeA]` — does UpdateManager.update succeed
// against the AUTHED shared store? if "uneditable", does force-load+
// retry fix it? what PATCH dialect/status does CSS get? This produces
// the evidence the bypass currently lacks. The bypass is NOT removed.
// One-shot: auto-clears the flag the moment the probe fires, so a
// stale flag can never repeatedly hijack real saves. Re-arm with
// `localStorage.setItem('omp:um-probe','1')` (or `window.__OMP_UM_PROBE=true`)
// each time you want a single write routed through UpdateManager.
function probeAEnabled() {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.__OMP_UM_PROBE) {
      try { globalThis.__OMP_UM_PROBE = false; } catch {}
      return true;
    }
    if (typeof localStorage !== 'undefined'
        && localStorage.getItem('omp:um-probe') === '1') {
      try { localStorage.removeItem('omp:um-probe'); } catch {}
      return true;
    }
    return false;
  } catch { return false; }
}

async function probeUpdateManager(store, deletes, inserts) {
  const tag = '[omp][probeA]';
  const updater = ensureUpdater(store);
  if (!updater) { console.warn(tag, 'no UpdateManager available'); return { ok: false, err: 'no UpdateManager' }; }
  const fetcher = ensureFetcher(store);
  // Observe the PATCH(es) UpdateManager itself issues (dialect + status).
  const origWeb = fetcher.webOperation && fetcher.webOperation.bind(fetcher);
  if (origWeb) fetcher.webOperation = async (method, uri, opts = {}) => {
    if (method === 'PATCH') console.info(tag, 'PATCH →', uri, 'contentType=', opts.contentType);
    try {
      const r = await origWeb(method, uri, opts);
      if (method === 'PATCH') console.info(tag, 'PATCH result', uri, 'status=', r && r.status, 'ok=', r && r.ok);
      return r;
    } catch (e) { if (method === 'PATCH') console.warn(tag, 'PATCH threw', uri, e?.message || e); throw e; }
  };
  const once = () => new Promise(resolve => {
    try { updater.update(deletes, inserts, (u, ok, errm) => resolve({ ok, err: ok ? null : errm })); }
    catch (err) { resolve({ ok: false, err: err.message }); }
  });
  try {
    console.info(tag, 'attempt 1: UpdateManager.update on the AUTHED shared store',
      { deletes: deletes.length, inserts: inserts.length });
    let r = await once();
    console.info(tag, 'attempt 1 →', r);
    if (!r.ok && /uneditable|editing protocol|make changes/i.test(String(r.err))) {
      const docs = new Set();
      for (const s of [...deletes, ...inserts]) { const d = s && s.why; if (d && d.value) docs.add(d.value); }
      console.info(tag, '"uneditable" → force-loading then retry (v6 remedy):', [...docs]);
      for (const d of docs) {
        try { await fetcher.load(d, { force: true }); }
        catch (e) { console.warn(tag, 'force-load failed', d, e?.message || e); }
      }
      r = await once();
      console.info(tag, 'attempt 2 (after force-load) →', r);
    }
    console.info(tag, r.ok
      ? '✅ UpdateManager WORKS on the authed pod store — the bypass is removable (Phase C/B)'
      : '❌ UpdateManager still fails on the authed store — the bypass is justified (Phase D)',
      r.err || '');
    return r;
  } finally {
    if (origWeb) fetcher.webOperation = origWeb;   // always restore
  }
}

async function runUpdate(store, _baseURI, deletes, inserts) {
  deletes = deletes || [];
  inserts = inserts || [];

  // Authed pod write: rdflib's UpdateManager.editable() gate returns
  // false over the Inrupt-authenticated Fetcher on CSS ("Can't make
  // changes in uneditable …") even though CSS *does* accept the PATCH.
  // So bypass UpdateManager: send the sparql-update PATCH ourselves via
  // the (authed) Fetcher — the same mechanism putResource/podPatchInsert
  // use successfully here — grouped per document, then mirror the change
  // into the in-memory store. Strict: the store is only updated if the
  // PATCH succeeded. Gated on the explicit session flag (NOT store
  // identity) so dev/local & logged-out keep the UpdateManager path.
  try {
    console.info('[omp] runUpdate path:',
      (store === rdf.store && solidWriteAuthed) ? 'pod-bypass'
        : (store === rdf.store ? 'UpdateManager (rdf.store but NOT authed-flag)'
                               : 'UpdateManager (private store)'),
      '· isRdfStore=' + (store === rdf.store) + ' solidWriteAuthed=' + solidWriteAuthed);
  } catch {}
  if (store === rdf.store && solidWriteAuthed) {
    // Authed pod write goes via the sparql-update bypass. The PATCH MUST
    // use the live session fetch — `rdf.storeFetcher` is a vanilla rdflib
    // Fetcher (unauthenticated), so PATCHing through it 401s on the pod
    // even with a real session. `getAuthFetch(doc)` reuses the same
    // page-wide authed-fetch lookup that installToPod uses successfully
    // (finds <sol-login>'s session.fetch covering the doc's origin).
    const byDoc = new Map();
    const grp = (s, k) => {
      const d = s && s.why && s.why.value;
      if (!d) return;
      if (!byDoc.has(d)) byDoc.set(d, { del: [], ins: [] });
      byDoc.get(d)[k].push(s);
    };
    for (const s of deletes) grp(s, 'del');
    for (const s of inserts) grp(s, 'ins');
    if (!byDoc.size) return { ok: true, err: null };
    const nt = (s) => `${s.subject.toNT()} ${s.predicate.toNT()} ${s.object.toNT()} .`;
    for (const [doc, g] of byDoc) {
      const parts = [];
      if (g.del.length) parts.push(`DELETE DATA {\n${g.del.map(nt).join('\n')}\n}`);
      if (g.ins.length) parts.push(`INSERT DATA {\n${g.ins.map(nt).join('\n')}\n}`);
      const body = parts.join(' ;\n');
      try {
        const authedFetch = getAuthFetch(doc);
        const res = await authedFetch(doc, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/sparql-update' },
          body,
        });
        if (!res || res.ok === false) {
          const msg = `PATCH ${doc} → ${res && res.status}`;
          console.warn('Persistence failed (store NOT updated):', msg);
          return { ok: false, err: msg };
        }
      } catch (e) {
        const msg = e && (e.message || String(e));
        console.warn('Persistence failed (store NOT updated):', msg);
        return { ok: false, err: msg };
      }
      // PATCH landed — reflect it in the in-memory store, and drop the
      // cached copy of this doc so the next load re-fetches it fresh.
      spineCacheInvalidate(doc);
      for (const s of g.del) store.remove(s);
      for (const s of g.ins) store.add(s.subject, s.predicate, s.object, s.why);
    }
    return { ok: true, err: null };
  }

  // Local / private store: rdflib's UpdateManager works fine here.
  const updater = ensureUpdater(store);
  if (!updater) return { ok: false, err: 'no UpdateManager available' };
  const once = () => new Promise(resolve => {
    try {
      updater.update(deletes, inserts, (uri, ok, errm) => {
        resolve({ ok, err: ok ? null : errm });
      });
    } catch (err) { resolve({ ok: false, err: err.message }); }
  });
  let r = await once();
  if (!r.ok && /uneditable|editing protocol|make changes/i.test(String(r.err))) {
    // Brand-new / indirectly-loaded file: force-load so UpdateManager
    // learns the PATCH protocol, then retry once.
    const fetcher = ensureFetcher(store);
    const docs = new Set();
    for (const s of [...deletes, ...inserts]) {
      const d = s && s.why; if (d && d.value) docs.add(d.value);
    }
    for (const d of docs) {
      try { await fetcher.load(d, { force: true }); }
      catch (e) { console.warn('force-load failed', d, e?.message || e); }
    }
    r = await once();
  }
  if (r.ok) {
    // Drop cached copies of the edited docs (no-op unless they're in the
    // shared-library spine cache — e.g. localhost dev via UpdateManager).
    const docs = new Set();
    for (const s of [...deletes, ...inserts]) {
      const d = s && s.why && s.why.value; if (d) docs.add(d);
    }
    spineCacheInvalidate(...docs);
  } else {
    console.warn('Persistence failed (store NOT updated):', r.err);
  }
  return r;
}

function ensureFetcher(store) {
  // Shared/pod store → the singleton's (sol-login-patched, authed)
  // Fetcher so writes to the pod carry credentials.
  if (store === rdf.store) return rdf.storeFetcher;
  if (!store.fetcher) store.fetcher = new Fetcher(store);
  return store.fetcher;
}

// PUT/DELETE primitive. Authed pod writes go through the live session
// fetch (getAuthFetch) — `rdf.storeFetcher` is a vanilla, unauthenticated
// Fetcher that 401s on the pod even with a session; this reuses the same
// page-wide authed-fetch lookup as the runUpdate bypass + installToPod.
// Local/dev (private store) keeps the rdflib Fetcher path unchanged.
async function webWrite(store, method, url, { body, contentType } = {}) {
  try {
    let res;
    if (store === rdf.store && solidWriteAuthed) {
      const init = { method };
      if (body != null) init.body = body;
      if (contentType) init.headers = { 'Content-Type': contentType };
      res = await getAuthFetch(url)(url, init);
    } else {
      const opts = body != null ? { body, contentType } : {};
      res = await ensureFetcher(store).webOperation(method, url, opts);
    }
    const ok = res.ok !== false;
    // A PUT/DELETE changes the doc (e.g. a playlist file) — invalidate any
    // cached copy so the next load re-fetches it (no-op if uncached).
    if (ok) spineCacheInvalidate(url);
    return { ok, err: ok ? null : `${method} ${res.status}` };
  } catch (err) {
    return { ok: false, err: err.message || String(err) };
  }
}

async function putResource(store, url, body, contentType = 'text/turtle') {
  return webWrite(store, 'PUT', url, { body, contentType });
}

async function deleteResource(store, url) {
  return webWrite(store, 'DELETE', url);
}

function ttlStr(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

// Create a fresh, empty library skeleton in the ./libraries/<slug>/
// layout at `baseUrl` (must be a writable container — the dev CSS or a
// pod; Q1). Writes index.ttl + empty agents/genres/releases(index)
// siblings via the ordinary PUT path. releases.ttl starts as an empty
// index (no seeAlso); playlists/ + releases/ containers materialise when
// their first child is written. Returns { ok, url(index.ttl), err }.
export async function createLibrary(baseUrl, { title = 'New library' } = {}) {
  const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  const store = graph();   // private store → its own Fetcher
  // Recursive DCAT catalog skeleton (no rdfs:seeAlso): index.ttl#it
  // dcat:catalog → empty releases.ttl#it / playlists.ttl#it catalogs,
  // dcat:dataset → agents.ttl#it (Artists dataset), dcat:themeTaxonomy
  // → genres.ttl#Music (empty SKOS scheme). Relative URLs (house
  // style). Children gain dcat:dataset members as they're written.
  const files = {
    'index.ttl':
`@prefix dct: <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .

<>
    a <#Library>, dcat:Catalog ;
    dct:title ${ttlStr(title)} .

<#it>
    a dcat:Catalog ;
    dct:title ${ttlStr(title)} ;
    dcat:catalog <./releases.ttl#it>, <./playlists.ttl#it> ;
    dcat:dataset <./agents.ttl#it> ;
    dcat:themeTaxonomy <./genres.ttl#Music> .
`,
    'agents.ttl':
`@prefix dct: <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .

<#it>
    a dcat:Dataset ;
    dct:title "Artists" .
`,
    'genres.ttl':
`@prefix skos: <http://www.w3.org/2004/02/skos/core#> .

<#Music>
    a skos:ConceptScheme ;
    skos:prefLabel "Music" .
`,
    'releases.ttl':
`@prefix dct: <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .

<#it>
    a dcat:Catalog ;
    dct:title ${ttlStr(title + ' — releases')} .
`,
    'playlists.ttl':
`@prefix dct: <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .

<#it>
    a dcat:Catalog ;
    dct:title ${ttlStr(title + ' — playlists')} .
`,
  };
  for (const [rel, body] of Object.entries(files)) {
    const r = await putResource(store, base + rel, body);
    if (!r.ok) return { ok: false, err: `PUT ${rel}: ${r.err}`, url: base + 'index.ttl' };
  }
  return { ok: true, url: base + 'index.ttl' };
}

// Transitive rdfs:seeAlso closure (incl. baseURI) of an already-loaded
// library store — i.e. every document the library is made of. Used by
// the pod installer to enumerate the files to copy.
export function libraryDocUrls(store, baseURI) {
  const visited = new Set([baseURI]);
  const out = [baseURI];
  let frontier = [baseURI];
  while (frontier.length) {
    const next = [];
    for (const d of frontier) {
      for (const s of store.match(sym(d), RDFS('seeAlso'), null)) {
        let u; try { u = new URL(s.object.value, d).href; } catch { continue; }
        if (!visited.has(u)) { visited.add(u); out.push(u); next.push(u); }
      }
    }
    frontier = next;
  }
  return out;
}

// Playlist documents that back a local-catalogue artist (an Agent with
// dcterms:source → <playlist>). These are the only playlist files a
// minimal pod install needs so converted-to-artist entries aren't empty.
// Returns unique absolute doc URLs.
export function playlistSourceDocs(store) {
  const seen = new Set();
  for (const s of store.match(null, DCT('source'), null)) {
    const v = s.object?.value;
    if (v) seen.add(v.split('#')[0]);
  }
  return [...seen];
}

// Every playlist document in the library (each schema:ItemList's
// doc, fragment stripped) EXCEPT the reserved Deleted bin — the full
// set a pod install should carry so non-converted playlists (e.g.
// "Penguin Cafe", "Kronos") come along, not just converted-artist
// ones. Converted-artist playlists are a subset and dedupe naturally.
export function allPlaylistDocs(store, baseURI) {
  const bin = baseURI ? deletedBinUri(baseURI) : null;
  const seen = new Set();
  for (const stmt of store.match(null, RDF('type'), PLAYLIST)) {
    const doc = stmt.subject.value.split('#')[0];
    if (doc && doc !== bin) seen.add(doc);
  }
  return [...seen];
}

// The shared releases/<slug> documents that the given playlist files
// point into. Post-shared-releases playlists are pointer-only
// (schema:itemListElement → schema:item → <…/releases/<slug>#tNN>), so a pod install
// that copies a playlist MUST also copy these files or every pointer
// dangles. Restricted to schema:item statements parsed FROM one of the
// playlist docs (statement.why) so an install only carries the release
// files its playlists actually reference. Returns unique absolute doc
// URLs (fragment stripped).
export function releaseDocsForPlaylistDocs(store, playlistDocUrls) {
  const want = new Set((playlistDocUrls || []).map(u => u.split('#')[0]));
  const out = new Set();
  for (const s of store.match(null, SCHEMA('item'), null)) {
    const doc = s.why && s.why.value;
    if (!doc || !want.has(doc.split('#')[0])) continue;
    const t = s.object && s.object.value;
    if (t) out.add(t.split('#')[0]);
  }
  return [...out];
}

// Every per-release document the releases.ttl index points at
// (releases.ttl#it dcat:dataset members + back-compat rdfs:seeAlso),
// fragment stripped. The releases.ttl index is part of the startup
// spine, so this resolves WITHOUT the release files themselves being
// loaded — used to lazily fetch a no-playlist catalogue artist's
// albums (the Wu-Tang case) and for the idle background prefetch.
export function allReleaseDocs(store, baseURI) {
  const docs = libraryDocs(baseURI);
  const out = new Set();
  for (const s of store.match(docs.releasesCatalog, DCAT('dataset'), null))
    if (s.object?.value) out.add(s.object.value.split('#')[0]);
  for (const s of store.match(docs.releasesDoc, RDFS('seeAlso'), null))
    if (s.object?.value) out.add(s.object.value.split('#')[0]);
  return [...out];
}

// Every per-playlist document the playlists.ttl index points at
// (playlists.ttl#it dcat:dataset members + back-compat rdfs:seeAlso),
// fragment stripped. Resolves from the startup spine WITHOUT the playlist
// files loaded — used by the two-phase load to fetch them in the
// background (`lazyPlaylists`) after the browse columns have painted.
export function allPlaylistDocsFromIndex(store, baseURI) {
  const docs = libraryDocs(baseURI);
  const out = new Set();
  for (const s of store.match(docs.playlistsCatalog, DCAT('dataset'), null))
    if (s.object?.value) out.add(s.object.value.split('#')[0]);
  for (const s of store.match(docs.playlistsDoc, RDFS('seeAlso'), null))
    if (s.object?.value) out.add(s.object.value.split('#')[0]);
  return [...out];
}



// Copy a prepared file set to <podRoot>. Every file is PUT
// (overwrite) — PUT is idempotent, so a re-run converges and repairs a
// botched/empty resource from a prior partial run. `files` =
// [{ relPath, body, contentType }]. Sequential — kind to pod locks.
// onProgress(i, total, relPath) per file. Never throws; collects
// per-file failures. Returns { ok, put, skipped:0, failed[] }.
export async function installToPod(authedFetch, podRoot, files, onProgress) {
  const root = podRoot.endsWith('/') ? podRoot : podRoot + '/';
  let put = 0; let skipped = 0;
  const failed = [];

  // CSS auto-creates intermediate containers when a resource is PUT,
  // and rejects PUT *to* a container URL with 409 — so we do NOT
  // pre-create containers; we just PUT the files.
  let i = 0;
  for (const f of files) {
    i++;
    onProgress?.(i, files.length, f.relPath);
    const url = root + f.relPath;
    // Selective skip: content files (playlist / release bodies) marked
    // `skipIfExists` are left alone if already on the pod — faster
    // re-installs, and it preserves any edits made directly on the pod.
    // Structural files (app shell + catalog spine) are NEVER skipped, so
    // updates and catalog changes always land. Skip only on a CONFIRMED
    // 200 HEAD (a flaky non-404 won't cause a phantom skip → still PUTs).
    if (f.skipIfExists) {
      try {
        const head = await authedFetch(url, { method: 'HEAD' });
        if (head && head.status === 200) { skipped++; continue; }
      } catch { /* HEAD failed → fall through and PUT */ }
    }
    try {
      // Always PUT (overwrite). PUT is idempotent, so re-running
      // converges and repairs a botched/empty resource from a prior
      // partial run. (An existence-skip is unreliable: some servers
      // answer GET on a missing nested resource with non-404.)
      const res = await authedFetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': f.contentType || 'text/turtle' },
        body: f.body,
      });
      // Success detection. A real 2xx (`res.ok`, incl. 201/204/205) is
      // trusted directly. ANYTHING else — a redirect, an opaque-redirect
      // (status 0, e.g. CSS canonicalising an extension-less URL), a bare
      // 3xx, a 4xx/5xx — is AMBIGUOUS and must NOT be assumed written:
      // inferring success from `redirected`/`opaqueredirect`/3xx is what
      // let failed PUTs report "written" while clobbering files. So for
      // the non-2xx case we CONFIRM empirically — read the resource back
      // over the authed fetch; success only if it now resolves 2xx.
      let ok = !!res && res.ok === true;
      let how = ok ? '2xx' : '';
      if (!ok && res) {
        try {
          const chk = await authedFetch(url, { method: 'GET', headers: { Accept: '*/*' } });
          ok = !!chk && (chk.ok === true || chk.status === 304);
          how = `verified-get(${chk ? chk.status : 'no-resp'})`;
        } catch (e) { how = `verify-threw(${e.message || e})`; }
      }
      if (!ok) {
        let detail = '';
        try { detail = (await res.text()).slice(0, 120); } catch {}
        const msg = `${f.relPath} → ${res ? `${res.status} ${res.type || ''}` : 'no response'} [${how}] ${detail}`.trim();
        failed.push(msg); console.warn('[install] PUT FAIL', msg);
      } else { put++; }
    } catch (e) {
      const msg = `${f.relPath}: ${e.message || e}`;
      failed.push(msg); console.warn('[install] PUT THREW', msg);
    }
  }
  return { ok: failed.length === 0, put, skipped, failed };
}

// Which document a node's triples live in (the rdflib statement `.why`
// graph). Used so writes target the right file: a playlist Track lives
// in its playlist file; a local-artist Track lives in releases.ttl.
function docOf(store, node, fallback) {
  const s = store.statementsMatching(node, null, null)[0]
        || store.statementsMatching(null, null, node)[0];
  return s?.why || fallback;
}

// Look up an Agent (any subclass of foaf:Agent) by its foaf:name. Returns
// the existing node or null.
function findAgentByName(store, name) {
  if (!name) return null;
  for (const stmt of store.match(null, FOAF('name'), literal(name))) {
    for (const t of AGENT_TYPES) {
      if (store.holds(stmt.subject, RDF('type'), t)) return stmt.subject;
    }
  }
  return null;
}

// ----------------------------------------------------------------------
// Genres — live in genres.ttl
// ----------------------------------------------------------------------

export async function addGenre(store, baseURI, label) {
  const docs = libraryDocs(baseURI);
  const genresDoc = docs.genresDoc;
  // Slug from the label, deduped against existing genre fragments in genres.ttl.
  let slug = slugifyForFile(label);
  let id = genresDoc.value + '#' + slug;
  let n = 1;
  while (store.any(sym(id), null, null)) {
    id = genresDoc.value + '#' + slug + '_' + n; n++;
  }
  const node = sym(id);
  const musicNode = sym(docs.musicRootUri);
  const inserts = [
    st(node, RDF('type'), SKOS('Concept'), genresDoc),
    st(node, RDF('type'), GENRE, genresDoc),
    st(node, SKOS('prefLabel'), literal(label), genresDoc),
    st(node, SKOS('topConceptOf'), musicNode, genresDoc),
  ];
  const r = await runUpdate(store, genresDoc.value, [], inserts);
  return { ...r, id, label };
}

export async function removeGenre(store, baseURI, genreId) {
  const docs = libraryDocs(baseURI);
  const genresDoc = docs.genresDoc;
  const agentsDoc = docs.agentsDoc;
  const node = sym(genreId);

  // Delete the genre itself from genres.ttl.
  const genresDeletes = store.match(node, null, null)
    .map(s => st(s.subject, s.predicate, s.object, genresDoc));
  const r1 = await runUpdate(store, genresDoc.value, genresDeletes, []);
  if (!r1.ok) return r1;

  // Delete any Agents pointing at this genre — they live in agents.ttl.
  const agentsToRemove = store.match(null, MO('genre'), node).map(s => s.subject);
  if (agentsToRemove.length) {
    const agentsDeletes = [];
    for (const a of agentsToRemove) {
      for (const t of store.match(a, null, null)) {
        agentsDeletes.push(st(t.subject, t.predicate, t.object, agentsDoc));
      }
    }
    const r2 = await runUpdate(store, agentsDoc.value, agentsDeletes, []);
    if (!r2.ok) return r2;
  }
  return { ok: true };
}

export async function renameGenre(store, baseURI, genreId, newLabel) {
  const docs = libraryDocs(baseURI);
  const genresDoc = docs.genresDoc;
  const node = sym(genreId);
  const old = store.any(node, SKOS('prefLabel'));
  const deletes = old ? [st(node, SKOS('prefLabel'), old, genresDoc)] : [];
  const inserts = [st(node, SKOS('prefLabel'), literal(newLabel), genresDoc)];
  return runUpdate(store, genresDoc.value, deletes, inserts);
}

// ----------------------------------------------------------------------
// Catalog Agents — live in agents.ttl
// ----------------------------------------------------------------------

export async function addArtist(store, baseURI, genreId, label, url) {
  const docs = libraryDocs(baseURI);
  const agentsDoc = docs.agentsDoc;
  const uuid = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const node = sym(`urn:uuid:${uuid}`);
  const inserts = [
    st(node, RDF('type'), MUSIC_ARTIST, agentsDoc),
    st(node, FOAF('name'), literal(label), agentsDoc),
    st(node, MO('genre'), sym(genreId), agentsDoc),
  ];
  if (url) inserts.push(st(node, DCAT('landingPage'), sym(url), agentsDoc));
  const r = await runUpdate(store, agentsDoc.value, [], inserts);
  return { ...r, node };
}

export async function removeArtist(store, baseURI, artistNode) {
  const docs = libraryDocs(baseURI);
  const agentsDoc = docs.agentsDoc;
  const deletes = store.match(artistNode, null, null)
    .map(s => st(s.subject, s.predicate, s.object, agentsDoc));
  // We don't sweep foaf:maker references from releases.ttl — Releases would
  // dangle but harmlessly; the in-memory store still holds the now-deleted
  // Agent node referenced from those Releases.
  return runUpdate(store, agentsDoc.value, deletes, []);
}

export async function renameArtist(store, baseURI, artistNode, newLabel) {
  const docs = libraryDocs(baseURI);
  const agentsDoc = docs.agentsDoc;
  const old = store.any(artistNode, FOAF('name'));
  const deletes = old ? [st(artistNode, FOAF('name'), old, agentsDoc)] : [];
  const inserts = [st(artistNode, FOAF('name'), literal(newLabel), agentsDoc)];
  return runUpdate(store, agentsDoc.value, deletes, inserts);
}

export async function moveArtist(store, baseURI, artistNode, newGenreId) {
  const docs = libraryDocs(baseURI);
  const agentsDoc = docs.agentsDoc;
  const deletes = store.match(artistNode, MO('genre'), null)
    .map(s => st(s.subject, s.predicate, s.object, agentsDoc));
  const inserts = [st(artistNode, MO('genre'), sym(newGenreId), agentsDoc)];
  return runUpdate(store, agentsDoc.value, deletes, inserts);
}

// ----------------------------------------------------------------------
// Playlists — one resource per playlist
// ----------------------------------------------------------------------

export async function addPlaylist(store, baseURI, opts) {
  // Back-compat: a bare string arg used to mean the name.
  if (typeof opts === 'string') opts = { name: opts };
  const { name = 'Untitled playlist', maker = '', description = '' } = opts || {};
  const docs = libraryDocs(baseURI);
  const slug = uniquePlaylistSlug(store, baseURI, name);
  const playlistUrl = docs.playlistsDirUrl + slug;

  // Step 1 — PUT the new playlist resource with initial content.
  // A playlist is typed schema:ItemList + schema:MusicPlaylist (the
  // ordered track collection) AND dcat:Dataset (member of the
  // playlists.ttl catalog), with the dct:isPartOf back-edge to that
  // catalog. A fresh playlist has no items yet.
  const lines = [
    '@prefix dct: <http://purl.org/dc/terms/> .',
    '@prefix dcat: <http://www.w3.org/ns/dcat#> .',
    '@prefix foaf: <http://xmlns.com/foaf/0.1/> .',
    '@prefix schema: <http://schema.org/> .',
    '',
    `<>`,
    `    a schema:ItemList, schema:MusicPlaylist, dcat:Dataset ;`,
    `    dct:isPartOf <../playlists.ttl#it> ;`,
    `    schema:itemListOrder schema:ItemListOrderAscending ;`,
    `    dct:title ${ttlStr(name)}`,
  ];
  if (maker)       lines.push(`    ; foaf:maker ${ttlStr(maker)}`);
  if (description) lines.push(`    ; dct:description ${ttlStr(description)}`);
  lines.push('    .', '');
  const body = lines.join('\n');
  const label = maker ? `${name} (${maker})` : name;
  const put = await putResource(store, playlistUrl, body);
  if (!put.ok) return { ok: false, err: put.err, id: playlistUrl, label };

  // Step 2 — PATCH playlists.ttl so its catalog dcat:datasets the new
  // file (the loader's forward edge — no more index.ttl rdfs:seeAlso).
  const datasetStmt = st(docs.playlistsCatalog, DCAT('dataset'),
                         sym(playlistUrl), docs.playlistsDoc);
  const r = await runUpdate(store, docs.playlistsDoc.value, [], [datasetStmt]);
  if (!r.ok) {
    // Best-effort rollback so the orphan file doesn't sit on disk.
    await deleteResource(store, playlistUrl);
    return { ...r, id: playlistUrl, label };
  }

  // Load the freshly-created file so UpdateManager has the doc's
  // editing-protocol metadata (Link/Updates-Via headers). Without this
  // the next PATCH to this resource — e.g. addTracksToPlaylist's
  // schema:itemListElement write — can silently fail to persist: UpdateManager
  // tries to lazy-load, but the lazy-load on a brand-new file sometimes
  // doesn't recover the protocol info and the PATCH never reaches disk.
  try {
    await ensureFetcher(store).load(playlistUrl, { force: true });
  } catch (err) {
    console.warn('Could not reload new playlist file for protocol detection:', err);
  }

  // Hand-seed the in-memory store (PUT body isn't fed back into it).
  const pd = sym(playlistUrl);
  store.add(pd, RDF('type'), SCHEMA('ItemList'), pd);
  store.add(pd, RDF('type'), PLAYLIST, pd);
  store.add(pd, RDF('type'), DCAT('Dataset'), pd);
  store.add(pd, SCHEMA('itemListOrder'), SCHEMA('ItemListOrderAscending'), pd);
  store.add(pd, DCT('isPartOf'), docs.playlistsCatalog, pd);
  store.add(pd, DCT('title'), literal(name), pd);
  if (maker) store.add(pd, FOAF('maker'), literal(maker), pd);
  if (description) store.add(pd, DCT('description'), literal(description), pd);

  return { ok: true, id: playlistUrl, label, name, maker, description };
}

// ----------------------------------------------------------------------
// The "Deleted" bin — a reserved playlist (fixed slug) that deleted
// playlists' tracks are moved into instead of being lost. It is a
// normal schema:ItemList in every respect (parsed, viewed, edited
// with the ordinary playlist machinery); the UI just hides it from the
// Sources column and exposes it via the ⋮ menu. Removing a track *from*
// the bin is the only place that reclaims a release file from disk
// (removeTrackFromPlaylist, guarded by an I1 refcount).
// ----------------------------------------------------------------------

// Stable id of the bin for this library (node URI === doc URL; like
// every other playlist file it self-refs as <>). No fragment.
export function deletedBinUri(baseURI) {
  return libraryDocs(baseURI).playlistsDirUrl + 'deleted';
}

// Find-or-create the bin. Idempotent: returns the existing bin if it's
// already in the store, else creates it (mirrors addPlaylist's
// PUT → PATCH playlists.ttl dcat:dataset → reload → seed flow).
export async function ensureDeletedBin(store, baseURI) {
  const docs = libraryDocs(baseURI);
  const binUrl = deletedBinUri(baseURI);
  const bd = sym(binUrl);
  if (store.holds(bd, RDF('type'), PLAYLIST)) return { ok: true, id: binUrl };

  const body = [
    '@prefix dct: <http://purl.org/dc/terms/> .',
    '@prefix dcat: <http://www.w3.org/ns/dcat#> .',
    '@prefix schema: <http://schema.org/> .',
    '',
    '<>',
    '    a schema:ItemList, schema:MusicPlaylist, dcat:Dataset ;',
    '    dct:isPartOf <../playlists.ttl#it> ;',
    '    schema:itemListOrder schema:ItemListOrderAscending ;',
    '    dct:title "Deleted" .',
    '',
  ].join('\n');
  const put = await putResource(store, binUrl, body);
  if (!put.ok) return { ok: false, err: put.err, id: binUrl };

  const datasetStmt = st(docs.playlistsCatalog, DCAT('dataset'), bd, docs.playlistsDoc);
  const r = await runUpdate(store, docs.playlistsDoc.value, [], [datasetStmt]);
  if (!r.ok) {
    await deleteResource(store, binUrl).catch(() => {});
    return { ...r, id: binUrl };
  }

  try {
    await ensureFetcher(store).load(binUrl, { force: true });
  } catch (err) {
    console.warn('Could not reload Deleted-bin file for protocol detection:', err);
  }
  store.add(bd, RDF('type'), SCHEMA('ItemList'), bd);
  store.add(bd, RDF('type'), PLAYLIST, bd);
  store.add(bd, RDF('type'), DCAT('Dataset'), bd);
  store.add(bd, SCHEMA('itemListOrder'), SCHEMA('ItemListOrderAscending'), bd);
  store.add(bd, DCT('isPartOf'), docs.playlistsCatalog, bd);
  store.add(bd, DCT('title'), literal('Deleted'), bd);
  return { ok: true, id: binUrl };
}

// Update any of name / maker / description on a playlist. Only the keys
// present in `meta` are touched; each is replaced (delete-then-insert).
export async function updatePlaylistMeta(store, _baseURI, playlistId, meta = {}) {
  const playlistDoc = sym(playlistId);
  const deletes = [];
  const inserts = [];

  if (meta.name != null) {
    for (const p of [DCT('title'), RDFS('label'), SKOS('prefLabel')]) {
      const old = store.any(playlistDoc, p);
      if (old) deletes.push(st(playlistDoc, p, old, playlistDoc));
    }
    inserts.push(st(playlistDoc, DCT('title'), literal(meta.name), playlistDoc));
  }
  if (meta.maker != null) {
    for (const old of store.match(playlistDoc, FOAF('maker'), null)) {
      deletes.push(st(old.subject, old.predicate, old.object, playlistDoc));
    }
    if (meta.maker) inserts.push(st(playlistDoc, FOAF('maker'), literal(meta.maker), playlistDoc));
  }
  if (meta.description != null) {
    for (const old of store.match(playlistDoc, DCT('description'), null)) {
      deletes.push(st(old.subject, old.predicate, old.object, playlistDoc));
    }
    if (meta.description) inserts.push(st(playlistDoc, DCT('description'), literal(meta.description), playlistDoc));
  }
  if (!deletes.length && !inserts.length) return { ok: true };
  return runUpdate(store, playlistDoc.value, deletes, inserts);
}

// Name-only wrapper kept for any caller that just renames.
export async function renamePlaylist(store, baseURI, playlistId, newName) {
  return updatePlaylistMeta(store, baseURI, playlistId, { name: newName });
}

export async function removePlaylist(store, baseURI, playlistId) {
  const docs = libraryDocs(baseURI);
  const playlistDoc = sym(playlistId);
  const binUrl = deletedBinUri(baseURI);

  // Step 0 — re-point this playlist's tracks into the reserved
  // "Deleted" bin BEFORE detaching the playlist (so a crash here leaves
  // the source playlist intact + idempotent bin pointers, never lost
  // tracks). Skipped when the target IS the bin (nothing to move into
  // itself) — bin cleanup is removeTrackFromPlaylist's job.
  if (playlistId !== binUrl) {
    const payloads = [];
    for (const e of store.match(playlistDoc, SCHEMA('itemListElement'), null)) {
      const trk = store.any(e.object, SCHEMA('item'));
      if (!trk) continue;
      const dl = store.any(trk, MO('item'))?.value;
      if (!dl) continue;
      const rel = store.any(trk, DCT('isPartOf'))
        || store.match(null, MO('track'), trk)[0]?.subject;
      payloads.push({
        url: dl,
        // addTracksToPlaylist resolves the canonical Track by
        // (landingPage, mo:item); passing the parent release's
        // landingPage makes it reuse the existing shared release —
        // pointer-only, no new/append release file.
        source: rel ? (store.any(rel, DCAT('landingPage'))?.value || null) : null,
        name: store.any(trk, DCT('title'))?.value || '',
        album: rel ? (store.any(rel, DCT('title'))?.value || '') : '',
      });
    }
    if (payloads.length) {
      const eb = await ensureDeletedBin(store, baseURI);
      if (!eb.ok) return eb;
      const moved = await addTracksToPlaylist(store, baseURI, binUrl, payloads);
      if (!moved.ok) return moved;
    }
  }

  // Step 1 — PATCH playlists.ttl to drop the catalog's dcat:dataset
  // edge to this playlist (was index.ttl rdfs:seeAlso pre-rework).
  const datasetStmt = st(docs.playlistsCatalog, DCAT('dataset'),
                         playlistDoc, docs.playlistsDoc);
  const r = await runUpdate(store, docs.playlistsDoc.value, [datasetStmt], []);
  if (!r.ok) return r;

  // Step 2 — DELETE the playlist file. Best-effort: some servers reject
  // DELETE. The dcat:dataset edge is already gone so it won't reappear.
  await deleteResource(store, playlistId).catch(() => {});

  // Step 3 — drop all in-memory triples for this playlist.
  for (const stmt of store.match(playlistDoc, null, null)) store.remove(stmt);
  for (const stmt of store.match(null, null, playlistDoc)) store.remove(stmt);

  return { ok: true };
}

// ----------------------------------------------------------------------
// Tracks in playlists — SHARED-RELEASES + RDF-rework model.
//
// Releases + Tracks live ONCE in releases/<slug> files, deduped by
// dcat:landingPage (release identity = the doc IRI <#it>; tracks
// <#tNN>; the P3 spine dct:isPartOf links track→release→catalog). A
// playlist (schema:ItemList) holds ONLY ordered pointer edges:
// schema:itemListElement → [ schema:position N ; schema:item <…/releases/slug#tNN> ].
// Adding a track:
//   1. resolve the release by landingPage in the loaded store;
//   2. reuse the canonical Track if present; else append a <#tNN>
//      Track to the release file (existing album) OR mint a new
//      releases/<slug> file (+ releases.ttl seeAlso) for a new album;
//   3. PATCH the playlist file with the schema:itemListElement pointer(s) LAST.
// Write order is release-data → index → pointer so a mid-failure leaves
// an unreferenced (harmless) release, never a dangling entry (I1).
// Removing a track drops ONLY that playlist's schema:itemListElement (and renumbers
// survivors for contiguous schema:position); the shared release/track
// triples are never deleted here (other playlists / the catalogue may
// use them; orphan cleanup is the deferred shared-releases Phase 3).
// ----------------------------------------------------------------------

export async function addTracksToPlaylist(store, baseURI, playlistId, tracks, opts = {}) {
  if (!tracks || !tracks.length) return { ok: true, nodes: [], skipped: 0 };
  const docs = libraryDocs(baseURI);
  const playlistDoc = sym(playlistId);
  const inlineTracks = !!opts.inlineTracks;
  const pad = n => String(n).padStart(2, '0');

  // Dedup: skip incoming whose download URL is already a member of this
  // playlist (store-global read — independent of the UI cache).
  const already = new Set();
  for (const e of store.match(playlistDoc, SCHEMA('itemListElement'), null)) {
    const trk = store.any(e.object, SCHEMA('item'));
    const u = trk && store.any(trk, MO('item'))?.value;
    if (u) already.add(u);
  }
  const seenInBatch = new Set();
  const incoming = tracks.filter(t => {
    if (!t || !t.url) return false;
    if (already.has(t.url) || seenInBatch.has(t.url)) return false;
    seenInBatch.add(t.url);
    return true;
  });
  const skipped = tracks.length - incoming.length;
  if (!incoming.length) return { ok: true, nodes: [], added: [], skipped };

  // ── inline-tracks (guest write path) ──────────────────────────────────
  // Guests on a pod where only ./playlists is writable can't create or
  // PATCH release files. So when called with { inlineTracks: true } we
  // emit every Track inline in the playlist file (<#tNN>), each pointed
  // at a sibling <#aNN> "album" node that carries dct:title + the
  // archive.org landingPage. The data model still satisfies the read
  // path: parseBookmarks (~line 540) only walks schema:itemListElement → schema:item →
  // (dct:isPartOf → album), and an <#aNN> in the playlist file is
  // indistinguishable from a release-file Release at read time.
  //
  // Within a single call, tracks sharing a landingPage share one new
  // <#aNN>. Across calls, we look up local <#aNN> nodes already in the
  // playlist by their landingPage so a re-add of the same album reuses
  // the existing node (no duplicate <#aNN> with the same title).
  if (inlineTracks) {
    let maxTrack = 0, maxAlbum = 0;
    const localAlbumByLp = new Map();
    const isLocal = (n) => n && n.value && n.value.startsWith(playlistDoc.value + '#');
    for (const e of store.match(playlistDoc, SCHEMA('itemListElement'), null)) {
      const trk = store.any(e.object, SCHEMA('item'));
      if (isLocal(trk)) {
        const tm = trk.value.match(/#t(\d+)$/);
        if (tm) maxTrack = Math.max(maxTrack, parseInt(tm[1], 10));
      }
      const parent = trk && store.any(trk, DCT('isPartOf'));
      if (isLocal(parent)) {
        const am = parent.value.match(/#a(\d+)$/);
        if (am) maxAlbum = Math.max(maxAlbum, parseInt(am[1], 10));
        const lp = store.any(parent, DCAT('landingPage'))?.value;
        if (lp) localAlbumByLp.set(lp, parent);
      }
    }

    // Group new tracks by landingPage so multi-track album adds share
    // one new <#aNN>. Album triples emitted ONCE per distinct lp.
    const newAlbums = new Map();   // lp (or sentinel) → { node, inserts[] }
    function ensureAlbumNode(lp, album, artist) {
      if (!lp && !album) return null;
      if (lp && localAlbumByLp.has(lp)) return localAlbumByLp.get(lp);
      if (lp && newAlbums.has(lp))      return newAlbums.get(lp).node;
      maxAlbum += 1;
      const node = sym(`${playlistDoc.value}#a${pad(maxAlbum)}`);
      // Typed mo:Release so the read path (parent dct:title / landingPage
      // lookups) treats it like any other Release — see parseBookmarks.
      const inserts = [st(node, RDF('type'), RELEASE, playlistDoc)];
      if (album)  inserts.push(st(node, DCT('title'),        literal(album),  playlistDoc));
      if (lp)     inserts.push(st(node, DCAT('landingPage'), sym(lp),         playlistDoc));
      if (artist) inserts.push(st(node, FOAF('maker'),       literal(artist), playlistDoc));
      newAlbums.set(lp || `__nolp:${node.value}`, { node, inserts });
      return node;
    }

    // Continue the existing entry numbering so positions stay contiguous.
    let maxPos = 0, maxEnt = 0;
    for (const e of store.match(playlistDoc, SCHEMA('itemListElement'), null)) {
      const p = parseInt(store.any(e.object, SCHEMA('position'))?.value, 10);
      if (Number.isFinite(p)) maxPos = Math.max(maxPos, p);
      const mm = e.object.value.match(/#e(\d+)$/);
      if (mm) maxEnt = Math.max(maxEnt, parseInt(mm[1], 10));
    }

    const inserts = [];
    const resultNodes = [];
    const addedOk = [];
    incoming.forEach((t, i) => {
      const album  = t.album  || '';
      const artist = t.artist || '';
      const lp     = t.source || null;
      const albumNode = ensureAlbumNode(lp, album, artist);

      maxTrack += 1;
      const trackNode = sym(`${playlistDoc.value}#t${pad(maxTrack)}`);
      inserts.push(st(trackNode, RDF('type'), TRACK, playlistDoc));
      if (t.name)  inserts.push(st(trackNode, DCT('title'),       literal(t.name), playlistDoc));
      if (artist)  inserts.push(st(trackNode, FOAF('maker'),       literal(artist), playlistDoc));
      inserts.push(st(trackNode, MO('item'), sym(t.url), playlistDoc));
      const dur = parseDurationToSecs(t.time);
      if (Number.isFinite(dur) && dur > 0)
        inserts.push(st(trackNode, MO('duration'),
          literal(String(dur), undefined, XSD('decimal')), playlistDoc));
      if (albumNode)
        inserts.push(st(trackNode, DCT('isPartOf'), albumNode, playlistDoc));

      // List item — schema:ListItem { position ; item }.
      const ent = sym(`${playlistDoc.value}#e${pad(maxEnt + i + 1)}`);
      inserts.push(
        st(playlistDoc, SCHEMA('itemListElement'), ent, playlistDoc),
        st(ent, RDF('type'), SCHEMA('ListItem'), playlistDoc),
        st(ent, SCHEMA('position'), literal(String(maxPos + i + 1), undefined, XSD('integer')), playlistDoc),
        st(ent, SCHEMA('item'), trackNode, playlistDoc));

      resultNodes.push(trackNode);
      addedOk.push(t);
    });

    // Album triples lead so each <#aNN> is defined before any <#tNN>
    // references it. (PATCH order doesn't strictly matter, but reads
    // through partial-fail snapshots are friendlier this way.)
    const albumInserts = [];
    for (const v of newAlbums.values()) albumInserts.push(...v.inserts);
    const all = [...albumInserts, ...inserts];

    // Single-doc PATCH chunked the same way as the normal branch.
    const CHUNK = 120;
    for (let i = 0; i < all.length; i += CHUNK) {
      const r = await runUpdate(store, playlistDoc.value, [], all.slice(i, i + CHUNK));
      if (!r.ok) return { ...r, nodes: resultNodes, added: addedOk, skipped };
    }
    return { ok: true, nodes: resultNodes, added: addedOk, skipped };
  }
  // ── /inline-tracks ────────────────────────────────────────────────────

  // Resolvers from the shared store: lp → release file, and
  // (lp,mo:item) → canonical Track. Only real mo:Release nodes
  // (skip the releases.ttl index's <file> dcat:landingPage entries).
  const relByLp = new Map();
  for (const s of store.match(null, DCAT('landingPage'), null)) {
    if (!store.holds(s.subject, RDF('type'), RELEASE)) continue;
    const why = docOf(store, s.subject, docs.releasesDoc);
    relByLp.set(s.object.value, { releaseNode: s.subject, fileDoc: sym(why.value) });
  }
  const trackByKey = new Map();
  for (const [lp, info] of relByLp)
    for (const tm of store.match(info.releaseNode, MO('track'), null)) {
      const dl = store.any(tm.object, MO('item'))?.value;
      if (dl) trackByKey.set(`${lp}\n${dl}`, tm.object);
    }

  const reservedSlugs = new Set();
  // `pad` already declared at the top of the function.
  // IA identifier from a details URL; fall back to the file slug so the
  // P1 invariant (every Release has exactly one dct:identifier) holds
  // even for a non-archive landing page.
  const idFromLp = (lp, fileUrl) => {
    const m = lp && lp.match(/archive\.org\/details\/(.+?)\/?$/);
    return m ? decodeURIComponent(m[1])
             : fileUrl.split('/').pop().replace(/\$?\.ttl$/, '');
  };
  // Next #tNN for an existing release file (max of its current tracks).
  const relTrackNext = new Map();   // fileDocVal → next int
  const nextTrackFrag = (info) => {
    let n = relTrackNext.get(info.fileDoc.value);
    if (n == null) {
      n = 0;
      for (const tm of store.match(info.releaseNode, MO('track'), null)) {
        const mm = tm.object.value.match(/#t(\d+)$/);
        if (mm) n = Math.max(n, parseInt(mm[1], 10));
      }
    }
    n += 1; relTrackNext.set(info.fileDoc.value, n);
    return info.fileDoc.value + '#t' + pad(n);
  };

  const newFiles = new Map();      // groupKey → { fileUrl, lp, ident, releaseNode, title, artist, tracks[] }
  const appendToFile = new Map();  // fileDocVal → { fileDoc, inserts[] }
  const resultNodes = [];
  const addedOk = [];

  for (const t of incoming) {
    const lp = t.source || null;
    const dl = t.url;
    const key = lp ? `${lp}\n${dl}` : null;
    let canonical = key ? trackByKey.get(key) : null;

    if (!canonical && lp && relByLp.has(lp)) {
      // Album file exists, this track isn't in it → append the Track
      // (new-model: release-relative #tNN IRI + dct:isPartOf spine).
      const info = relByLp.get(lp);
      canonical = sym(nextTrackFrag(info));
      const g = appendToFile.get(info.fileDoc.value)
        || { fileDoc: info.fileDoc, inserts: [] };
      g.inserts.push(st(canonical, RDF('type'), TRACK, info.fileDoc));
      if (t.name) g.inserts.push(st(canonical, DCT('title'), literal(t.name), info.fileDoc));
      g.inserts.push(st(canonical, MO('item'), sym(dl), info.fileDoc));
      const ds = parseDurationToSecs(t.time);
      if (Number.isFinite(ds) && ds > 0)
        g.inserts.push(st(canonical, MO('duration'), literal(String(ds), undefined, XSD('decimal')), info.fileDoc));
      g.inserts.push(st(canonical, DCT('isPartOf'), info.releaseNode, info.fileDoc));
      g.inserts.push(st(info.releaseNode, MO('track'), canonical, info.fileDoc));
      appendToFile.set(info.fileDoc.value, g);
      if (key) trackByKey.set(key, canonical);
    }

    if (!canonical) {
      // Brand-new release file. Group by landingPage so several tracks
      // of the same new album share one file (a later same-lp track in
      // this batch reuses it).
      const groupKey = lp || `urn:nolp:${dl}`;
      let nf = newFiles.get(groupKey);
      if (!nf) {
        const fileUrl = uniqueReleaseSlug(store, docs, t.album || t.name || 'release', reservedSlugs);
        reservedSlugs.add(fileUrl);
        nf = { fileUrl, lp, ident: idFromLp(lp, fileUrl),
               releaseNode: sym(fileUrl + '#it'),
               title: t.album || '(untitled album)', artist: t.artist || '', tracks: [] };
        newFiles.set(groupKey, nf);
        // Do NOT register in relByLp — that map is only pre-existing
        // releases. Same-album tracks in this batch regroup via
        // newFiles.get(groupKey), so they all land in this one file.
      }
      canonical = sym(`${nf.fileUrl}#t${pad(nf.tracks.length + 1)}`);
      nf.tracks.push({ node: canonical, name: t.name, dl, dur: parseDurationToSecs(t.time) });
      if (key) trackByKey.set(key, canonical);
    }

    resultNodes.push(canonical);
    addedOk.push(t);
  }

  const fail = (r) => ({ ...r, nodes: resultNodes, added: addedOk, skipped });

  // (a) New release files: PUT body → PATCH releases.ttl index → reload
  //     for protocol → hand-seed the store (PUT body isn't parsed back).
  for (const nf of newFiles.values()) {
    const agent = nf.artist ? findAgentByName(store, nf.artist) : null;
    const makerTtl = nf.artist ? (agent ? `<${agent.value}>` : ttlStr(nf.artist)) : null;
    // New-model release file, house style: <#it> a mo:Release with
    // dct:identifier + the dct:isPartOf spine; tracks <#tNN> carry
    // dct:isPartOf <#it>; mo:track retained for release↔track nav.
    const po = [
      'a mo:Release, dcat:Dataset',
      `dct:title ${ttlStr(nf.title)}`,
      `dct:identifier ${ttlStr(nf.ident)}`,
      'dct:isPartOf <../releases.ttl#it>',
    ];
    if (nf.lp)   po.push(`dcat:landingPage <${nf.lp}>`);
    po.push('mo:track ' + nf.tracks.map(x => `<#t${pad(nf.tracks.indexOf(x) + 1)}>`).join(', '));
    if (makerTtl) po.push(`foaf:maker ${makerTtl}`);
    const lines = [
      '@prefix dct: <http://purl.org/dc/terms/> .',
      '@prefix mo: <http://purl.org/ontology/mo/> .',
      '@prefix dcat: <http://www.w3.org/ns/dcat#> .',
      '@prefix foaf: <http://xmlns.com/foaf/0.1/> .',
      '',
      '<#it>\n    ' + po.join(' ;\n    ') + ' .',
      '',
    ];
    nf.tracks.forEach((x, i) => {
      const tp = ['a mo:Track', `dct:title ${ttlStr(x.name || '')}`];
      if (Number.isFinite(x.dur) && x.dur > 0) tp.push(`mo:duration ${ttlStr(String(x.dur))}`);
      tp.push(`mo:item <${x.dl}>`);
      tp.push('dct:isPartOf <#it>');
      lines.push(`<#t${pad(i + 1)}>\n    ` + tp.join(' ;\n    ') + ' .', '');
    });
    const put = await putResource(store, nf.fileUrl, lines.join('\n'));
    if (!put.ok) return fail(put);

    // releases.ttl#it is a dcat:Catalog; link the new release entity
    // (#it) as one of its dcat:datasets — the loader's forward edge
    // (no rdfs:seeAlso, no landingPage block; dedup key is the
    // release file's dct:identifier).
    const idxIns = [st(docs.releasesCatalog, DCAT('dataset'), nf.releaseNode, docs.releasesDoc)];
    const ri = await runUpdate(store, docs.releasesDoc.value, [], idxIns);
    if (!ri.ok) { await deleteResource(store, nf.fileUrl).catch(() => {}); return fail(ri); }

    try { await ensureFetcher(store).load(nf.fileUrl, { force: true }); }
    catch (e) { console.warn('reload new release file failed:', e?.message || e); }
    const fd = sym(nf.fileUrl);
    store.add(nf.releaseNode, RDF('type'), RELEASE, fd);
    store.add(nf.releaseNode, RDF('type'), DCAT('Dataset'), fd);
    store.add(nf.releaseNode, DCT('title'), literal(nf.title), fd);
    store.add(nf.releaseNode, DCT('identifier'), literal(nf.ident), fd);
    store.add(nf.releaseNode, DCT('isPartOf'), docs.releasesCatalog, fd);
    if (nf.lp) store.add(nf.releaseNode, DCAT('landingPage'), sym(nf.lp), fd);
    if (nf.artist) store.add(nf.releaseNode, FOAF('maker'), agent || literal(nf.artist), fd);
    for (const x of nf.tracks) {
      store.add(x.node, RDF('type'), TRACK, fd);
      if (x.name) store.add(x.node, DCT('title'), literal(x.name), fd);
      store.add(x.node, MO('item'), sym(x.dl), fd);
      if (Number.isFinite(x.dur) && x.dur > 0)
        store.add(x.node, MO('duration'), literal(String(x.dur), undefined, XSD('decimal')), fd);
      store.add(x.node, DCT('isPartOf'), nf.releaseNode, fd);
      store.add(nf.releaseNode, MO('track'), x.node, fd);
    }
  }

  // (b) Existing release files gaining a new Track.
  for (const g of appendToFile.values()) {
    const r = await runUpdate(store, g.fileDoc.value, [], g.inserts);
    if (!r.ok) return fail(r);
  }

  // (c) Playlist pointers LAST (release→index→pointer order = crash
  //     safety: a mid-failure leaves an unreferenced release, never a
  //     dangling list item). Append ordered schema:itemListElement →
  //     schema:ListItem [ schema:position N ; schema:item <canonical> ]
  //     after the playlist's current tail.
  let maxPos = 0, maxEnt = 0;
  for (const e of store.match(playlistDoc, SCHEMA('itemListElement'), null)) {
    const p = parseInt(store.any(e.object, SCHEMA('position'))?.value, 10);
    if (Number.isFinite(p)) maxPos = Math.max(maxPos, p);
    const mm = e.object.value.match(/#e(\d+)$/);
    if (mm) maxEnt = Math.max(maxEnt, parseInt(mm[1], 10));
  }
  const entryInserts = [];
  resultNodes.forEach((canonical, i) => {
    const ent = sym(`${playlistDoc.value}#e${pad(maxEnt + i + 1)}`);
    entryInserts.push(
      st(playlistDoc, SCHEMA('itemListElement'), ent, playlistDoc),
      st(ent, RDF('type'), SCHEMA('ListItem'), playlistDoc),
      st(ent, SCHEMA('position'), literal(String(maxPos + i + 1), undefined, XSD('integer')), playlistDoc),
      st(ent, SCHEMA('item'), canonical, playlistDoc));
  });
  const CHUNK = 160;   // 4 triples/item → 40 items per PATCH body
  for (let i = 0; i < entryInserts.length; i += CHUNK) {
    const r = await runUpdate(store, playlistDoc.value, [], entryInserts.slice(i, i + CHUNK));
    if (!r.ok) return fail(r);
  }
  return { ok: true, nodes: resultNodes, added: addedOk, skipped };
}

export async function addTrackToPlaylist(store, baseURI, playlistId, track, opts = {}) {
  const res = await addTracksToPlaylist(store, baseURI, playlistId, [track], opts);
  return { ...res, node: res.nodes?.[0] };
}

export async function removeTrackFromPlaylist(store, baseURI, playlistId, trackUrl) {
  const playlistDoc = sym(playlistId);
  // Snapshot this playlist's list items (ListItem, pos, trackNode),
  // skipping the one whose Track has the given file URL. The
  // skipped item is dropped; survivors are renumbered 1..N so the
  // contiguous schema:position invariant holds.
  const rows = [];
  let victim = null;
  for (const e of store.match(playlistDoc, SCHEMA('itemListElement'), null)) {
    const ent = e.object;
    const trk = store.any(ent, SCHEMA('item'));
    const pos = parseInt(store.any(ent, SCHEMA('position'))?.value, 10);
    const dl  = trk && store.any(trk, MO('item'))?.value;
    if (dl === trackUrl && !victim) { victim = { ent, trk, pos }; continue; }
    rows.push({ ent, trk, pos: Number.isFinite(pos) ? pos : Number.MAX_SAFE_INTEGER });
  }
  if (!victim) return { ok: true };

  // Shared model: only the playlist's own entry triples are touched —
  // the Track + Release live in a shared releases/<slug> file used by
  // the catalogue and other playlists (orphan cleanup is Phase 3).
  const deletes = [
    st(playlistDoc, SCHEMA('itemListElement'), victim.ent, playlistDoc),
    st(victim.ent, RDF('type'), SCHEMA('ListItem'), playlistDoc),
    st(victim.ent, SCHEMA('position'), literal(String(victim.pos), undefined, XSD('integer')), playlistDoc),
    st(victim.ent, SCHEMA('item'), victim.trk, playlistDoc),
  ];
  const inserts = [];
  rows.sort((a, b) => a.pos - b.pos).forEach((r, i) => {
    const want = i + 1;
    if (r.pos !== want) {
      deletes.push(st(r.ent, SCHEMA('position'), literal(String(r.pos), undefined, XSD('integer')), playlistDoc));
      inserts.push(st(r.ent, SCHEMA('position'), literal(String(want), undefined, XSD('integer')), playlistDoc));
    }
  });
  const r = await runUpdate(store, playlistDoc.value, deletes, inserts);
  if (!r.ok) return r;

  // Bin disk-GC: removing a track FROM the "Deleted" bin reclaims its
  // release file — but only if no OTHER (non-bin) playlist still points
  // at any track of that release (the I1 safety line; a catalog
  // artist/genre losing an album degrades gracefully, not corruption).
  // Best-effort: the pointer is already gone (user intent met), so a
  // failed file delete just leaves a harmless orphan for the sweep.
  if (baseURI && playlistId === deletedBinUri(baseURI)) {
    try {
      const docs = libraryDocs(baseURI);
      const binNode = playlistDoc;
      const release = store.any(victim.trk, DCT('isPartOf'))
        || store.match(null, MO('track'), victim.trk)[0]?.subject;
      if (release && store.holds(release, RDF('type'), RELEASE)) {
        const relTracks = store.match(release, MO('track'), null).map(s => s.object);
        let referencedElsewhere = false;
        outer:
        for (const T of relTracks)
          for (const em of store.match(null, SCHEMA('item'), T)) {
            const owner = store.match(null, SCHEMA('itemListElement'), em.subject)[0]?.subject;
            if (owner && owner.value !== binNode.value) { referencedElsewhere = true; break outer; }
          }
        if (!referencedElsewhere) {
          const relDoc = docOf(store, release, docs.releasesDoc);
          // De-index first (drop releases.ttl forward edges), then
          // DELETE the file: a crash between leaves a de-indexed,
          // unreferenced orphan file — harmless, never a dangling ref.
          const idxDel = [];
          for (const s of store.match(docs.releasesCatalog, DCAT('dataset'), release))
            idxDel.push(st(s.subject, s.predicate, s.object, docs.releasesDoc));
          for (const s of store.match(docs.releasesDoc, RDFS('seeAlso'), null))
            if (s.object.value === relDoc.value)
              idxDel.push(st(s.subject, s.predicate, s.object, docs.releasesDoc));
          if (idxDel.length) await runUpdate(store, docs.releasesDoc.value, idxDel, []);
          await deleteResource(store, relDoc.value).catch(() => {});
          // Purge the release file's triples from the in-memory store.
          for (const T of relTracks) {
            for (const s of store.match(T, null, null)) store.remove(s);
            for (const s of store.match(null, null, T)) store.remove(s);
          }
          for (const s of store.match(release, null, null)) store.remove(s);
          for (const s of store.match(null, null, release)) store.remove(s);
        }
      }
    } catch (err) {
      console.warn('Deleted-bin release GC failed (orphan left for sweep):', err?.message || err);
    }
  }
  return { ok: true };
}

// Edit a playlist track's title / artist / album. All three live in
// releases.ttl (title + maker on the Track, album = parent Release's
// dcterms:title), so this is one batched single-file PATCH. `meta` keys
// that are present are replaced; absent keys are left alone. Pass the
// Track node directly (the bookmark carries it) — resolving by URL is
// ambiguous across playlists.
//   - title  → Track dcterms:title
//   - artist → Track foaf:maker (literal, per-track override)
//   - album  → parent Release dcterms:title (one triple; every track
//              that resolves through that Release re-displays with it)
export async function updateTrackMeta(store, baseURI, trackNode, meta = {}) {
  const docs = libraryDocs(baseURI);
  // The Track may live in a playlist file (playlist track) or in
  // releases.ttl (local-artist track) — write back to wherever it is.
  const trackDoc = docOf(store, trackNode, docs.releasesDoc);
  const deletes = [];
  const inserts = [];

  if (meta.title != null) {
    for (const old of store.match(trackNode, DCT('title'), null)) {
      deletes.push(st(old.subject, old.predicate, old.object, trackDoc));
    }
    if (meta.title) inserts.push(st(trackNode, DCT('title'), literal(meta.title), trackDoc));
  }
  if (meta.artist != null) {
    for (const old of store.match(trackNode, FOAF('maker'), null)) {
      deletes.push(st(old.subject, old.predicate, old.object, trackDoc));
    }
    if (meta.artist) inserts.push(st(trackNode, FOAF('maker'), literal(meta.artist), trackDoc));
  }
  if (meta.album != null) {
    const parent = store.match(null, MO('track'), trackNode)[0]?.subject;
    if (parent) {
      const parentDoc = docOf(store, parent, trackDoc);
      for (const old of store.match(parent, DCT('title'), null)) {
        deletes.push(st(old.subject, old.predicate, old.object, parentDoc));
      }
      if (meta.album) inserts.push(st(parent, DCT('title'), literal(meta.album), parentDoc));
    }
  }
  if (!deletes.length && !inserts.length) return { ok: true };
  return runUpdate(store, trackDoc.value, deletes, inserts);
}

// How many other Tracks share this Track's parent Release (used to warn
// the user that an album-title edit is visible on siblings too).
export function releaseSiblingCount(store, trackNode) {
  const parent = store.match(null, MO('track'), trackNode)[0]?.subject;
  if (!parent) return 0;
  const sibs = store.match(parent, MO('track'), null).length;
  return Math.max(0, sibs - 1);
}

// ----------------------------------------------------------------------
// Local-catalog artists (converted playlists / future imports)
// ----------------------------------------------------------------------

// Albums for a local-catalog artist = the Releases it foaf:makers.
// Returns [{ name, url, _local, _releaseNode }]. `url` is a stable id
// for the album row (the Release node URI); the UI never network-fetches
// it because _local is set.
export function getLocalArtistAlbums(store, artistNode) {
  const out = [];
  const seen = new Set();
  const pushRelease = (rel) => {
    if (!store.holds(rel, RDF('type'), RELEASE)) return;
    if (seen.has(rel.value)) return;
    seen.add(rel.value);
    out.push({
      name: store.any(rel, DCT('title'))?.value
          || store.any(rel, DCAT('landingPage'))?.value
          || rel.value,
      url: rel.value,
      _local: true,
      _releaseNode: rel,
    });
  };

  // Playlist-linked artist: albums are the distinct parent Releases of
  // the source playlist's entry Tracks (read live from the playlist
  // file — the playlist is the single source of truth, no copies).
  const srcPlaylist = store.any(artistNode, DCT('source'));
  if (srcPlaylist) {
    for (const e of store.match(srcPlaylist, SCHEMA('itemListElement'), null)) {
      const trk = store.any(e.object, SCHEMA('item'));
      const parent = trk && store.any(trk, DCT('isPartOf'));
      if (parent) pushRelease(parent);
    }
    return out;
  }

  // Legacy snapshot artist (pre-link copy approach): Releases it makes.
  for (const s of store.match(null, FOAF('maker'), artistNode)) {
    pushRelease(s.subject);
  }
  return out;
}

// Tracks of a local Release, read straight from mo:track. Shapes each
// like the live getTracks() output so the player code is path-agnostic.
export function getLocalReleaseTracks(store, releaseNode) {
  const out = [];
  for (const s of store.match(releaseNode, MO('track'), null)) {
    const tn = s.object;
    const url = store.any(tn, MO('item'))?.value;
    if (!url) continue;
    const durRaw = store.any(tn, MO('duration'))?.value;
    out.push({
      url,
      name: store.any(tn, DCT('title'))?.value || tn.value,
      time: formatSecs(durRaw),
      node: tn,   // the Track node — lets library-view rows edit/act like playlist rows
      _lengthSec: durRaw != null ? parseFloat(durRaw) : NaN,
      _bitrate: NaN,
    });
  }
  return out;
}

function formatSecs(v) {
  const n = parseFloat(v);
  if (!Number.isFinite(n) || n <= 0) return '';
  const m = Math.floor(n / 60);
  const s = Math.floor(n % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Link a playlist so it ALSO appears as a local-catalog artist. The
// playlist stays the single source of truth — nothing is copied. One
// PATCH to agents.ttl creates (or relinks) an Agent with
// dcterms:source <playlist>; getLocalArtistAlbums reads its albums
// live from the playlist's schema:itemListElement → schema:item → dct:isPartOf.
//
// Name collision: if an Agent is already linked to this playlist, or an
// Agent with the same foaf:name exists, that Agent is REPLACED (its
// agents.ttl triples are cleared and rewritten) rather than duplicated.
export async function convertPlaylistToArtist(store, baseURI, playlistId, opts = {}) {
  const docs = libraryDocs(baseURI);
  const agentsDoc = docs.agentsDoc;
  const playlistDoc = sym(playlistId);

  const name = (opts.name || store.any(playlistDoc, DCT('title'))?.value || 'Untitled Artist').trim();
  const genreId = opts.genreId;
  if (!genreId) return { ok: false, err: 'a genre is required' };

  // Distinct parent Releases of the playlist's Tracks (for albumCount).
  const releaseSet = new Set();
  for (const e of store.match(playlistDoc, SCHEMA('itemListElement'), null)) {
    const trk = store.any(e.object, SCHEMA('item'));
    const parent = trk && store.any(trk, DCT('isPartOf'));
    if (parent && store.holds(parent, RDF('type'), RELEASE)) releaseSet.add(parent.value);
  }

  // Target Agent: one already linked to this playlist, else one with the
  // same name, else a fresh node.
  const existing =
    store.match(null, DCT('source'), playlistDoc)[0]?.subject
    || findAgentByName(store, name);
  const agentNode = existing
    || sym(`urn:uuid:${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`);

  // Replace: clear the existing Agent's agents.ttl triples (delete the
  // real statements so UpdateManager's store sync matches exactly).
  const deletes = existing
    ? store.statementsMatching(existing, null, null)
        .filter(s => (s.why?.value || agentsDoc.value) === agentsDoc.value)
    : [];
  const inserts = [
    st(agentNode, RDF('type'), MUSIC_ARTIST, agentsDoc),
    st(agentNode, FOAF('name'), literal(name), agentsDoc),
    st(agentNode, MO('genre'), sym(genreId), agentsDoc),
    st(agentNode, DCT('source'), playlistDoc, agentsDoc),
  ];
  const r = await runUpdate(store, agentsDoc.value, deletes, inserts);
  if (!r.ok) return { ...r, node: null };

  return {
    ok: true, node: agentNode, name, genreId,
    albumCount: releaseSet.size, relinked: !!existing,
  };
}

// Remove a playlist's artist link ("convert back to plain playlist").
// Deletes the linked Agent's agents.ttl triples and clears the
// playlist's hide flag. The playlist + its tracks are untouched.
export async function unlinkPlaylistArtist(store, baseURI, playlistId) {
  const docs = libraryDocs(baseURI);
  const agentsDoc = docs.agentsDoc;
  const playlistDoc = sym(playlistId);
  const agent = store.match(null, DCT('source'), playlistDoc)[0]?.subject;
  if (!agent) return { ok: true, node: null };
  const deletes = store.statementsMatching(agent, null, null)
    .filter(s => (s.why?.value || agentsDoc.value) === agentsDoc.value);
  const r = await runUpdate(store, agentsDoc.value, deletes, []);
  if (!r.ok) return { ...r, node: agent };
  await setPlaylistHidden(store, baseURI, playlistId, false).catch(() => {});
  return { ok: true, node: agent };
}

// Toggle whether the playlist row shows in the Sources list. Stored as
// oa:styleClass "hidden" on the playlist resource (in the playlist
// file) — the app reads class `hidden` as "show only as linked artist".
export async function setPlaylistHidden(store, _baseURI, playlistId, hidden) {
  const playlistDoc = sym(playlistId);
  const deletes = store.statementsMatching(playlistDoc, OA('styleClass'), null);
  const inserts = hidden
    ? [st(playlistDoc, OA('styleClass'), literal('hidden'), playlistDoc)]
    : [];
  if (!deletes.length && !inserts.length) return { ok: true };
  return runUpdate(store, playlistDoc.value, deletes, inserts);
}

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

function parseDurationToSecs(t) {
  if (!t) return NaN;
  const str = String(t).trim();
  if (!str) return NaN;
  if (/^[0-9.]+$/.test(str)) return parseFloat(str);
  const parts = str.split(':').map(Number);
  if (parts.some(n => !Number.isFinite(n))) return NaN;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

export function parseIaUrl(text) {
  const t = String(text).trim();
  if (!t) return null;
  const m = t.match(/archive\.org\/details\/([^\/?\s#]+)/);
  if (m) return { id: m[1], url: `https://archive.org/details/${m[1]}` };
  if (/^[a-zA-Z0-9._-]+$/.test(t)) {
    return { id: t, url: `https://archive.org/details/${t}` };
  }
  return null;
}
