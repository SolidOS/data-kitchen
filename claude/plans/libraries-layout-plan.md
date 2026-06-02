# Plan: multi-library `./libraries/` layout + `index.ttl` relocation + per-release files

Status: **COMPLETE & shipped.** Phases 0–6 done; "Install on my Pod"
live-debugged to working on solidcommunity.net (CSS). Final model:
each instance manages only its own same-origin library (login makes it
writable), external libraries only via + Library, no auto-discovery.
See §6 Progress log (final entry) for the post-ship install saga.

## 1. Why

1. **`releases.ttl` will not scale.** Static today (50 releases, nothing writes
   it at runtime), but a future mp3 / Rhythmbox importer would grow it
   unbounded. This pathology already bit the project:
   `migrate-selfcontained-playlists.js` exists because PATCHing the ~470K
   monolithic `releases.ttl` on every playlist add timed out CSS locks at 500s.
   Releases need the same self-contained treatment playlists got.

2. **`ia-music.ttl` is a fossil.** The original monolith filename, kept as a
   loose sibling entry-point for back-compat it no longer needs. It belongs
   inside its library container, generically named `index.ttl`.

3. **Only one library shape, music-specific.** Spoken word, film, etc. are
   coming. A top-level `./libraries/<slug>/` of identically-structured,
   self-contained libraries generalizes cleanly and composes with the
   multi-library type-index work already shipped this session
   (`registerPodLibrary` / `syncPodLibraries`).

## 2. Target architecture

```
./libraries/                       # generic top-level container
  internet_archive_music/          # SPECIFIC per-library folder; CORE default,
                                   #   display name "Internet Archive Music"
    index.ttl                      # manifest (was ./ia-music.ttl); seeAlso → siblings
    agents.ttl                     # artists / Agents
    genres.ttl                     # genre tree
    releases.ttl                   # INDEX: rdfs:seeAlso → each release file
    releases/
      <slug>.ttl                   # one mo:Release + its mo:Tracks + downloadUrls
    playlists/
      <slug>                       # one self-contained playlist each (unchanged)
  <user_slug>/                     # e.g. spoken_word/, film/ — identical skeleton
    index.ttl
    ...
```

Decisions locked:
- The generic intermediate `ia-music-library/` is **eliminated**. Top-level
  `libraries/` is generic; each library folder is named specifically per
  library (`internet_archive_music`, not a generic name).
- Canonical manifest filename is **`index.ttl`**, used for both local and pod.
- Every catalog doc is a flat **sibling of `index.ttl`**. `libraryDocs(baseURI)`
  simplifies from `new URL('ia-music-library/', baseURI)` to
  `new URL('./', baseURI)`.
- Slug rule (generalize `uniquePlaylistSlug`): lowercase, spaces → `_`, strip
  non-alphanumerics, `_N` suffix on collision. "Internet Archive Music" →
  `internet_archive_music`.
- **Hard cutover.** Nothing real shipped; no back-compat stub at old
  `./ia-music.ttl`, no live-pod type-index repoint. User will erase/restart any
  dev pod.
- **Per-release WRITE path deferred.** Phase 2 covers read + migration into the
  index+files shape only; the runtime mint path lands with the future importer.

Preserved for free (verified): `updateTrackMeta`/`docOf` target a node's own
`.why` doc; `getLocalArtistAlbums`/`getLocalReleaseTracks` read the merged
store — both layout-agnostic, no change needed.

## 3. Phases, dependencies, estimates

Critical path: 0 → 1 → {2,3} → 4 → 5 → 6. Estimates are rough dev-days.

### Phase 0 — Recursive `seeAlso` loader  *(~0.5d, foundational)*
`loadRDF` (ia-rdf.js:103–116) follows `seeAlso` only one level. Make it
transitive: visited-set cycle guard, bounded parallelism, shared-store dedupe
(reuse `rdf.isLoaded`/`markLoaded`), per-doc graceful failure (already
`.catch`-warns). Needed for `index.ttl → releases.ttl → release files` and
future nested libraries. **Risk:** core load path, every load. Update + run all
smoke tests.

### Phase 1 — `libraryDocs()` flatten  *(~0.25d)*
Data dir = index's own container (`./`). Add `releasesIndexDoc`
(`releases.ttl`) + `releasesDirUrl` (`releases/`). Behaviour-preserving once
paths consistent.

### Phase 2 — `releases.ttl` as index, READ + migration only  *(~0.25d)*
With Phase 0, a `releases.ttl` that `seeAlso`s `releases/<slug>.ttl` loads
correctly. Verify parse + browse cascade against the new shape. **No runtime
write path** (deferred with the importer). Bulk of the actual file-splitting
work lives in Phase 4 (migration).

### Phase 3 — `./libraries/` layout + create-library UX  *(~0.75–1d)*
- Default config → name "Internet Archive Music", url
  `./libraries/internet_archive_music/index.ttl`.
- Split the "+ Source" prompt into two intents: **add remote library by URL**
  (existing) vs **create new empty library** (new: ask name → slug → write
  skeleton). Create is offered **only against a writable backend** (pod/CSS) —
  see Q1.
- Skeleton writer (generalize the pod `STARTER` template for local + pod):
  `index.ttl` + empty `agents.ttl`/`genres.ttl`/`releases.ttl`(index) +
  `releases/` `playlists/`.
- Wire created libraries into the **already-shipped** `registerPodLibrary` /
  `syncPodLibraries` (registration, pull/push, remembered enabled-state).

### Phase 4 — One-shot migration tool  *(~0.5d)*
`migrate-libraries-layout.js` (`--dry-run`/`--apply`, timestamped backups),
consistent with the `migrate-*.js` family. Repo bundled catalog only (no live
pod state — Q7):
- Move `ia-music.ttl` → `libraries/internet_archive_music/index.ttl`; move
  `ia-music-library/{agents,genres}.ttl` + `playlists/*` to siblings; split
  `ia-music-library/releases.ttl` → `releases/<slug>.ttl` + a new index
  `releases.ttl`.
- Rewrite absolute IRIs old-base → new-base across all files (precedent:
  existing `split(old).join(new)`).
- Repoint local persisted identity only: `loadLibraryConfigs` default,
  localStorage `ia-player:libraries`, `omp:pod-library*`. Check
  `build.js`/`dist`/`ia.html`/`package.json` for hardcoded paths.

### Phase 5 — REPLACED: "Install on my Pod"  *(~1.5–2d)*
The old data-only `bootstrapPodLibrary` / `migrateOldPodLibrary` are
**dropped** (delete, not patched to the new layout). Instead, a new main-menu
**"Install on my Pod"** wizard deploys a complete, self-hosted OMP onto the
user's pod. Enabled by Phase 2 (per-file releases → ~100 small PUTs, no
470 KB lock-timeout).

Form: baseURL (prefilled from profile `space:storage` via
`discoverPodStorages`) · issuer (reuse `sol-login` dropdown) · confirm
"create `<baseURL>/open_media_player/`? [cancel] [yes]".

On submit, in order:
1. Log in via the chosen issuer (need the authed fetch first).
2. Create `<baseURL>/open_media_player/`.
3. *(No clientid doc — Q9 reversed. `sol-login` already logs in via
   dynamic registration with `redirectUrl` = the deployed page's URL.)*
4. Populate the **full app root + generic libraries tree**: an
   `index.html` (jsdelivr CDN for the inrupt auth bundle; the OMP
   `ia-player.js` + CSS copied to the pod for self-containment), and the
   whole `libraries/<slug>/…` structure (copy the bundled catalog:
   agents/genres + per-file releases + playlists, raw bytes preserved).
   Sequential PUTs, progress shown, **idempotent** (skip existing → resumable).
5. Best-effort `registerPodLibrary()` → link
   `…/open_media_player/libraries/internet_archive_music/index.ttl` in the
   pod's public type index.

Risks/notes: pod must serve `text/html` as active content (CSS yes; some
ESS/NSS sanitise — "if possible", surface a clear message). Hand the user an
explicit `…/open_media_player/index.html` URL (CSS does not serve a container
index by default). A pod-flavoured `index.html` is a new `build.js` artifact
(CDN script srcs, `<ia-player src="./libraries/internet_archive_music/index.ttl">`).

### Phase 6 — Smoke tests + docs  *(~0.5d)*
Update `smoke-test-rdf*.mjs` for new layout + recursive loader; add a
libraries-layout smoke. Update the architecture comment at ia-rdf.js:28–54 and
help/`skills.md`. Mark `drafts/PLAN-rename-open-media-player.md` obsolete
(its `ia.html → omp.html` is superseded by `ia.html → index.html`, done).

**Revised total ≈ 4.5–5.5 dev-days** (Install phase is larger than the old
bootstrap-parity it replaces, but delivers a self-hosted instance).

## 4. Locked decisions (library choice)

All questions resolved — no open blockers:

- **Q1 — Create scope: RESOLVED yes.** App-driven library creation is offered
  only against a writable backend (a Solid pod or the dev CSS). A static host
  physically cannot accept the PUTs, so the CORE **"Internet Archive Music"**
  library ships as build-time files, never runtime-created.
- **Q2 — Index name:** `index.ttl`, for both local and pod.
- **Q3 — Slug rule:** lowercase, spaces → `_`, strip non-alphanumerics, `_N`
  collision suffix (generalize `uniquePlaylistSlug`). "Internet Archive Music"
  → `internet_archive_music`.
- **Q4 — Naming:** top-level `libraries/` generic; each library folder named
  specifically per library (`internet_archive_music`). The generic
  intermediate `ia-music-library/` is **removed entirely**.
- **Q5 — Cutover:** hard cutover. Nothing real shipped; no back-compat stub at
  old `./ia-music.ttl`.
- **Q6 — Release write path:** deferred to the future importer; this work does
  read + migration into the index+files shape only.
- **Q7 — Live pods:** no live-pod migration; dev pods will be erased/restarted.
- **Q8 — Dev entry file:** `ia.html` → `index.html` (DONE). Doc refs
  updated; no code imports it by name. `drafts/PLAN-rename-open-media-player.md`
  (`ia.html→omp.html`) is obsolete.
- **Q9 — Pod-install login: REVERSED — no clientid doc.** Evidence: the
  browser `sol-login` bundle calls
  `session.login({oidcIssuer, redirectUrl: location.origin+location.pathname,
  clientName:"Solid App"})` — no `clientId`, redirect derived from the page
  URL. So a pod-hosted `index.html` logs in via dynamic registration with
  the redirect coming back to itself automatically; CSS/common IdPs support
  this. `clientid.jsonld` is optional hardening only — **not written by the
  installer.** No blocking unknown remains.
- **Q10 — Install scope:** **full app root + generic libraries tree**
  (`index.html` + app bundle/CSS + whole `libraries/<slug>/…`; no clientid).

## 5. Sequencing

Land Phase 0 alone first (isolated, high-blast-radius, smoke-testable) before
anything depends on recursion. Then 1, then 2 + 3 in parallel, then 4 behind a
`--dry-run` review, then 5, then 6.

## 6. Progress log

- **2026-05-17 — Phase 0 DONE.** `loadRDF` (ia-rdf.js) now follows
  `rdfs:seeAlso` recursively: visited-set cycle guard, bounded concurrency
  (8), per-doc failures warned & skipped. New `smoke-test-rdf-recursive.mjs`
  (9/9 pass: 2-level recursion, a↔b & b→index cycles, diamond dedupe — 5
  fetches for 5 docs — and flat single-file back-compat = 1 fetch). Existing
  `smoke-test-rdf*.mjs` unchanged & passing. Bundle rebuilt.
- **2026-05-17 — Phase 1 + local relocation DONE** (combined per the
  break-app coupling; option 1). `libraryDocs()` flattened (data dir `./`,
  added `releasesIndexDoc` + `releasesDirUrl`); architecture comment updated.
  Bundled catalog physically relocated `ia-music.ttl` + `ia-music-library/*`
  → `libraries/internet_archive_music/{index,agents,genres,releases}.ttl` +
  `playlists/*`, absolute IRIs rewritten (2 base strings, verified clean).
  Repointed: `ia.html`, `build.js` example, `ia-ui.js` input default,
  `ia3.js` default config (label now "Internet Archive Music"),
  `ia-help.html`, all smoke tests. Old layout moved to
  `drafts/pre-libraries-backup-<ts>/` (reversible; hard cutover from serving
  root). All 4 smokes pass on new layout (10 genres / 152 bookmarks resolve);
  no regressions. Bundle rebuilt. **Not browser-verified yet** (smokes only).
  Remaining `ia-music-library` refs are confined to `bootstrapPodLibrary` /
  `migrateOldPodLibrary` = Phase 5 (pod parity, deferred).
- **2026-05-17 — Phase 4 (partial, pulled forward):** browser 404'd on old
  `./ia-music.ttl` from persisted `localStorage[ia-player:libraries]`. Added
  `migrateConfigUrl()` + self-heal in `loadLibraryConfigs` (rewrites old →
  new on read, persists once, idempotent, leaves remote libs untouched;
  also relabels default). Verified via unit cases. Requires browser
  hard-reload to pick up new bundle. Remaining Phase 4 (omp:pod-library*,
  the one-shot repo migration tool) still pending.
- **2026-05-17 — Phase 2 DONE.** New one-shot `migrate-releases-multifile.js`
  (rdflib, dry-run/--apply, timestamped backup) split the bundled
  `releases.ttl` → 50 `releases/<slug>.ttl` files + a `rdfs:seeAlso`
  index `releases.ttl`. 543 tracks, 0 leftover triples. New
  `smoke-test-rdf-catalog.mjs`: (1) **lossless** round-trip vs the
  pre-split monolith — 0 triples lost / 0 invented; (2) real recursive
  `loadRDF` reaches a release at depth 2, playable URLs + cross-file
  `foaf:maker`→agents.ttl joins intact, playlists still discovered. Full
  5-smoke suite green. Runtime release WRITE path still deferred (Q6).
  **Note:** CSS stores extension-less resources on disk as `Foo$.ttl`
  (content-type suffix) — playlists are `<Name>$.ttl`; new release files
  use explicit `.ttl` in both URL and disk. Relevant for Phase 5 pod
  bootstrap.
- **2026-05-17 — Phase 2 follow-ups + lazy-load.** (a) Release files now
  follow the CSS convention: extension-less seeAlso URLs, `<slug>$.ttl`
  on disk (same as playlists); `migrate-releases-multifile.js` updated &
  re-run from the monolith backup; lossless split still smoke-verified.
  General rule for the future write path: PUT/PATCH with an explicit
  Content-Type, no `.ttl` in the URL — the server maps it. (b) Startup
  selection: confirmed local-selected good. Remote-not-listed →
  **decision:** end goal is to register a created remote library in the
  LOCAL pod's public type index (read locally at startup); DEFERRED.
  INTERIM: localStorage-persisted configs + **lazy load** — `init` only
  fetches `enabled` libs; disabled (remote, unchecked) are listed from
  config but not fetched (no startup network trip); `onLibrariesToggled`
  fetches a lib on first selection. Rejected approach: a localStorage
  copy of a remote pod's type index. 5-smoke suite green; bundle rebuilt.
- **2026-05-17 — Phase 3 DONE.** New `createLibrary(baseUrl,{title})`
  export in ia-rdf.js writes the new-layout skeleton (index.ttl + empty
  agents/genres/releases-index) via the ordinary PUT path (dev CSS / pod;
  read-only host surfaces the PUT error → Q1). ia3.js: `slugifyLibrary`
  (locked rule), `createLocalLibrary` (derives the libraries/ root from
  the local catalog, `_N` on slug collision, reuses `addLibrarySource`
  for load+persist+mirrorRegister). "+ Source" button → relabelled
  "+ Library", handler now offers 1=create-new / 2=add-by-URL. New
  `smoke-test-rdf-create.mjs` (11/11: 4 PUTs, recursive reload, empty
  parses clean). 6-smoke suite green; bundle rebuilt. NOT browser-tested.
- **2026-05-17 — `ia.html` → `index.html` DONE** (Q8). File renamed;
  `ia-login-help.html` + `skills.md` refs updated; no code imports it.
- **2026-05-17 — Phase 5 redefined + bootstrap removed.** Old
  `bootstrapPodLibrary`/`migrateOldPodLibrary`/`repointPodRegistration`/
  `STARTER`/`podPut` **deleted**; `sol-login` handler simplified to
  resolve-and-load (no implicit creation). Imports fixed, 6 smokes green,
  bundle rebuilt. Q9 **reversed** (no clientid doc — `sol-login` already
  redirects via the page URL + dynamic registration; verified in the
  bundle). Blocking unknown resolved.
- **2026-05-17 — Phase 5 DONE (Install on my Pod).** ia-rdf.js:
  `libraryDocUrls` (seeAlso closure) + `installToPod` (idempotent
  HEAD-skip, sequential, progress, never throws). ia3.js: `installOnPod`
  wizard — requires login (opens issuer dropdown if not), prefills
  baseURL via `discoverPodStorages`, confirm, copies app shell
  (`index.html` with `./dist/ia-player.js`→`./ia-player.js`, the
  self-contained `ia-player.js` bundle) + full local `libraries/` tree
  (raw bytes), best-effort `registerPodLibrary` type-index link,
  `podLibRemember`. New "📡 Install on my Pod…" gear-menu item
  (ia-ui.js + ref). New `smoke-test-rdf-install.mjs` (11/11). 7-smoke
  suite green; bundle rebuilt. NOT browser/live-pod tested.
- **2026-05-17 — Install flow revised + Phase 6 DONE.** Install
  location is now ONE editable field (subfolder/elsewhere), no separate
  confirm. New `ensurePublicTypeIndex` (reuse else create+link) so the
  pod library is recorded in the type index in ALL cases if possible;
  stale-registration 404 self-heal added. `smoke-test-rdf-install.mjs`
  extended (16/16). Docs: `skills.md` (layout/run/data-model/Solid+
  install/persistence/scripts/naming), `ia-help.html` (corrected
  self-contained-playlist + per-release-index facts, added Install/
  Solid-login menu rows + listing-without-fetch note),
  `drafts/PLAN-rename-open-media-player.md` marked OBSOLETE. 7-smoke
  suite green; bundle rebuilt.
- **2026-05-17 — Install-on-Pod live-debug saga → WORKING; final
  model.** Verified end-to-end on `jeff-zucker.solidcommunity.net`
  (CSS). Sequence of real fixes (none Node-reproducible — found via
  user console output): defer resume out of OIDC-redirect stack (abort);
  always-PUT/overwrite (CSS GET-on-missing ≠ 404 broke skip); no
  container pre-PUT (CSS 409s, auto-creates); minimal install scope
  (skeleton + agents/genres + converted-artist playlists only);
  IRI-rewrite copied bodies local→pod; pod writes via direct
  `application/sparql-update` PATCH (rdflib `editable()` gate fails over
  authed Fetcher); and finally the **architecture decision**: each
  instance manages only its own same-origin library — login
  re-loads/​authenticates it in place, `loadSolidLibrary` removes the
  same-origin private duplicate, ALL auto-discovery removed
  (`syncPodLibraries` dead), external libs only via + Library. Debug
  scaffolding/`BUILD vN` markers trimmed; only failure `console.warn`s
  + one concise install line kept. 7-smoke suite green; bundle rebuilt.
- **STATUS: Phases 0–6 COMPLETE & shipped; Install-on-Pod working.**
  Known follow-ups (not blockers): no session persistence without a
  Client ID Document → a pod instance needs a fresh login per browser
  session to be writable (revisit clientid if seamless reload wanted);
  "Import playlists" for non-converted playlists + per-release catalog;
  dead `syncPodLibraries`/`libraryDocUrls`/`bootstrapPodLibrary`-era
  helpers can be garbage-collected in a later tidy.
- **2026-05-21 — Install copies now use RELATIVE IRIs (portability
  fix).** `installToPod` previously rewrote copied bodies' IRIs
  local→pod (absolute) and synthesised `index/releases/playlists.ttl`
  with absolute pod IRIs — pinning every installed copy to one URL, so
  a later move / re-mount broke it (the same failure as the dev
  library's `test/ia`→`open_media_player` rename, which hid every
  playlist). Now the caller relativises copied bodies via
  `relativizeLibraryIris` (`ia-rdf.js`) and emits relative IRIs in the
  three synthesised catalogs, so an installed library resolves wherever
  it is mounted. New `claude/migration-scripts/relativize-library-iris.mjs`
  does the same conversion for a manual move of an already-edited
  library. PATCH editing still re-absolutises a doc in place (CSS
  server-side re-serialisation) — accepted; the script is the move-time
  remedy. Also fixed `src/{bundle-entry,rdf-shared}.js` swc import
  paths (`../../../`→`../../`). Build green; relativiser verified
  byte-exact against the hand-fixed library (34/34 files).
