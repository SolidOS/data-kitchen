# Open Media Player (omp) — project guide

A single-file, embeddable **`<ia-player>` web component** that browses and
plays audio from the Internet Archive (and a user's Solid pod), backed by
an RDF library (genres / artists / playlists). Pure browser JS bundled
with esbuild; the only runtime dependency is **rdflib**.

> Naming: the project standardised on **Player** (`omp`). Libraries live
> under a generic `libraries/<slug>/` tree; a pod install lands in
> `open_media_player/` (underscore). The `.ia-*` prefixes and `ia-*.js`
> filenames are legacy and intentionally left as-is.

---

## Requirements

- **Node** + `npm install` (dev/build only). Deps: `rdflib` (runtime),
  `esbuild` (dev).
- **Build:** `npm run build` → `dist/ia-player.js` (IIFE, minified) and
  `dist/ia-player.esm.js`. `npm run watch` rebuilds the IIFE on change.
- **Run:** open `index.html` (loads `./dist/ia-player.js` and mounts
  `<ia-player src="./libraries/internet_archive_music/index.ttl">`).
  Served over HTTP (RDF + audio are fetched); the bundled CSS/About HTML
  are inlined at build time.
- **Solid login (optional):** the page must provide
  `@inrupt/solid-client-authn-browser` as a global
  (`window.solidClientAuthn`). `index.html` loads it from a CDN; an
  embedding host supplies its own. Without it the player still works
  fully on the local/in-memory library.
- **`sol-components` must be resolvable at build time** as an npm dependency
  (bare `sol-components/...` specifiers). In dev, `npm link sol-components`
  symlinks `node_modules/sol-components` → the `../sol-components` sibling so
  edits show up on the next build; a published install resolves the same
  specifiers. Only `core/rdf.js`, `core/auth-fetch.js`, and
  `web/utils/contract.js` (the shared image vocab, also read by `<sol-gallery>`)
  are bundled in; omp's own fetchers (`sources/internet-archive.js`,
  `sources/commons.js`, `sources/commons-fetch.js`) are local under `src/`.
  `bin/build.js` externalizes `rdflib`; at runtime component-interop's
  injected importmap maps it to the shared instance, so there is exactly
  one rdflib instance and one shared `rdf` singleton. The `sol-*`
  components (`sol-login`, `sol-default`, `sol-feed`, `sol-gallery`,
  `sol-tabs`, …) are NOT bundled — component-interop loads them from
  `sol-components` (see `index.html`).

---

## Folder layout

```
index.html               dev page / shell: 3 tabs — Music + Movies
                         (<ia-player> panels) + News (<sol-feed>); loads
                         dist bundle + inrupt UMD; <sol-default> CORS proxy

assets/                  HTML/CSS assets (bundled or runtime-fetched)
  ia-about.html          About modal content (bundled at build time)
  ia-help.html           full user-action reference (gear ▸ Help) — runtime fetch
  ia-login-help.html     Solid login walkthrough — runtime fetch
  ia-quick-help.{html,md} short reference
  ia.css                 all styles (bundled as text)

bin/build.js             esbuild config: rdflib alias, IIFE + ESM outputs
                         (invoked via `npm run build` from project root)

src/bundle-entry.js      bundle root: bundle-init → <sol-login> → <sol-default> + <sol-feed> → ia3.js
src/bundle-init.js       injects bundled CSS + About HTML before define()
src/ia3.js      (~2.5k)  the component: state, UI wiring, playback, Solid
src/ia-ui.js    (~1.3k)  DOM/markup factory, listbox, modals, track list
src/ia-rdf.js   (~1.3k)  RDF data layer: load/parse + all pod/playlist I/O
src/ia-utils.js (~240)   Internet Archive search/metadata (no RDF)
src/rdf-shared.js (~25)  re-exports rdflib terms + the shared rdf singleton

libraries/<slug>/        ONE self-contained library per folder
  internet_archive_music/  the CORE shipped library (default)
    index.ttl            library INDEX (rdfs:seeAlso → siblings)
    agents.ttl           catalog artists (foaf:Agent / mo:MusicArtist)
    genres.ttl           SKOS genre concepts (topConceptOf <#Music>)
    releases.ttl         INDEX of per-release files (rdfs:seeAlso)
    releases/<slug>       ONE file per mo:Release + its mo:Tracks
    playlists/<Slug>      ONE self-contained file per playlist
  internet_archive_movies/ movies library (dct:type dctype:MovingImage)
  news/
    feeds.ttl            News tab feed catalog (bk:Topic + ui:Link sources;
                         consumed by <sol-feed view="topics">)
dist/                    build output (bundle + example.html)
shapes/                  SHACL shapes served to the app (fetched at runtime by sol-form):
                         *.shacl + .shaclc twins + ui-choices.ttl; plus the music model
                         (music.shacl(c), music-example.ttl, music-shape*.mmd)
drafts/                  user-owned scratch + legacy pre-Claude files
  notes/                 user notes: notes.md, notes2.md, thoughts.md, rdf-how2.md, conversion.{md,csv}
                         (NOT Claude-authored — read but don't treat as Claude artifacts)
claude/                  ALL Claude-authored artifacts (see claude/plans/INDEX.md)
  plans/                 PLAN-*.md, *-plan.md, INDEX.md (authoritative status)
  smoke-tests/           smoke-test-*.mjs (run from project root: `node claude/smoke-tests/<file>`)
  validation/            validate-*.mjs, check-triple-conservation.mjs, analyze-*.mjs
  migration-scripts/     migrate-*.js, backfill-playlist-maker.js, sweep-orphan-tracks.js (applied); relativize-library-iris.mjs (reusable)
  backups/               *.pre-* + pre-libraries-backup-*
  scratch/               link2mo.js, munge-music.js (early ad-hoc converters)
```

---

## Architecture

### Layers / what calls what

```
index.html
  ├─ component-interop → sol-components: <sol-login>, <sol-feed>, <sol-gallery>,
  │                      sol-basic tier (<sol-tabs>/<sol-default>/<sol-button>/…)
  └─ dist/ia-player.js  (built from src/bundle-entry.js)
       ├─ src/bundle-init.js → ia-ui.js setBundledAssets(css, aboutHtml)
       └─ ia3.js  ── defines <ia-player>; orchestrates everything
            ├─ ia-ui.js     createPlayerUI / listboxes / modals / track list
            ├─ ia-rdf.js    load + parse + every RDF read/write
            │     └─ rdf-shared.js → rdflib  +  core/rdf.js  (one `rdf` singleton)
            └─ ia-utils.js  archive.org advancedsearch + metadata
```

- **`ia3.js`** is the only module that defines the custom element and
  owns runtime state. `IaPlayerElement.connectedCallback` →
  `_loadFromConfig` → `init(host, libraryConfigs)` →
  `loadOneLibrary` (per library) → `createPlayer({libs})` →
  `mountPlayer`. `createPlayer` is one big closure holding all state
  (`libs`, aggregated `genres/bookmarks/playlists`, playback, Solid).
- **`ia-ui.js`** is pure DOM: `createPlayerUI()` returns the markup +
  refs; `createListbox`, `setupTrackList`, `renderTrackList`,
  `showAboutModal`, `showPlaylistEditModal`, `showTrackEditModal`,
  `showLibraryEditModal`, `showFloatingMenu`. No RDF, no archive.org.
- **`ia-rdf.js`** is the only module that touches rdflib/the store.
  Everything goes through `rdf-shared.js` so the player, `core/rdf.js`
  and `<sol-login>` share one rdflib + one `rdf` singleton (so
  sol-login's authenticated-fetch patch reaches the player).
- **`ia-utils.js`** is network-only Internet Archive helpers
  (`buildArchiveQuery`, `getAlbums`, `getTracks`) — no RDF.

### Data model (RDF)

- **Multi-file:** `libraries/<slug>/index.ttl` is the library index; its
  `rdfs:seeAlso` points at the sibling `agents/genres/releases.ttl` +
  every `playlists/<Slug>`. `releases.ttl` is itself an index whose
  `rdfs:seeAlso` points at one `releases/<slug>` file per `mo:Release`.
  `loadRDF(uri,{shared})` loads the index then follows seeAlso
  **recursively** (bounded concurrency, visited-set cycle guard, dedup
  via `rdf.markLoaded/isLoaded`) — so index→releases.ttl→per-release
  files all merge into one store.
- **Pointer-only playlists:** a playlist file is typed `schema:ItemList`
  + `schema:MusicPlaylist`; its ordered `schema:itemListElement` →
  `schema:ListItem` members hold only `schema:position` + `schema:item`
  → the canonical Track IRI in a shared `releases/<slug>` file. A
  playlist add/remove PATCHes only that small file (this fixed CSS
  lock-timeout 500s); the Track/Release live once, in the release file.
  Per-release files give catalog releases the same small-PATCH
  property; a pod install is ~100 small PUTs.
- **CSS storage:** an extension-less resource (URL `.../Foo`) is stored
  on disk as `Foo$.ttl`. Release files use extension-less URLs; PUT with
  `Content-Type: text/turtle` and let the server name the file.
- **Vocab:** `mo:` (Music Ontology — `mo:Release`, `mo:Track`), `foaf:`,
  `dcterms:`/`dctypes:`, `dcat:` (landingPage + the catalog spine),
  `mo:item` (a track → its audio file[s], multi-valued), `skos:`
  (genres), `schema:` (a playlist is `schema:ItemList` +
  `schema:MusicPlaylist`, ordered via `schema:itemListElement` →
  `schema:ListItem` { `schema:position` ; `schema:item` } and
  `schema:itemListOrder`), and `oa:styleClass "hidden"` (hide the
  playlist row, show only as its linked artist). An artist linked to a
  source playlist carries `dcterms:source` → that playlist; that link's
  presence is also the "read from RDF, not archive.org" signal. The
  former app-internal `omp:` RDF namespace is fully retired (the
  `omp:`-prefixed `localStorage` keys are unrelated and remain).
- Writes use rdflib `UpdateManager` (`ensureUpdater` reuses
  `store.updater`); `runUpdate` is **strict** (no in-memory fallback) so
  the store never diverges from disk; `checkSaved(res, what)` gates
  every caller.

### Solid login + pod library (see `assets/ia-login-help.html`, `claude/plans/PLAN-solid-login.md`)

- `<sol-login>` (toolbar) bundled from source → shares the one `rdf`
  singleton; its `_integrateWithRdflib()` patches the shared Fetcher
  with the Inrupt authenticated fetch.
- **Each instance manages ONLY its own library.** No type-index
  auto-discovery, no `syncPodLibraries` pull, no remembered-pointer
  auto-load (all removed; `syncPodLibraries`/`bootstrapPodLibrary`/
  `migrateOldPodLibrary` are dead/deleted). On login the `sol-login`
  handler does one thing: if the WebID origin == the app's origin
  (a self-hosted pod instance), **re-load that same same-origin library
  *authenticated*** so it becomes writable; otherwise just sign in.
  External libraries are added **only** via **+ Library**.
- `loadSolidLibrary` also **removes the same-origin private duplicate**
  (the unauth copy loaded at startup) so every playlist/agent/track
  lookup resolves to the one authed shared store — without this the pod
  instance edits the unauth copy ("Can't make changes in uneditable").
- **Install on my Pod** (gear menu): logs in, creates
  `<base>/open_media_player/` (location is one editable field), copies a
  **minimal** set — CDN-prereq `index.html` + self-contained
  `ia-player.js` + skeleton `index.ttl` + the real `agents.ttl`/
  `genres.ttl` (in-library IRIs rewritten to relative form) + an empty `releases.ttl`
  index + **only the playlist files converted to artists**
  (`dcterms:source`). Albums/tracks otherwise resolve dynamically;
  bulk playlists/per-release export is a future "Import" feature.
  `installToPod` always PUTs (overwrite/idempotent), no container
  pre-PUT (CSS auto-creates), best-effort `registerPodLibrary`. No
  clientid doc — `sol-login` logs in via dynamic registration with
  `redirectUrl` = the page URL (⇒ a pod instance needs a fresh login
  per browser session to be writable).
- Pod-library writes (shared store) bypass rdflib's `UpdateManager`
  (its `editable()` gate fails over the authed Fetcher on CSS) and send
  the `application/sparql-update` PATCH directly via the authed Fetcher,
  then mirror into the store — `runUpdate`'s `store === rdf.store`
  branch. Local/private libraries still use `UpdateManager`.
- **Store model A:** only the Solid library uses the shared
  `rdf.store`/`storeFetcher`; local/dev libraries keep private stores
  (multi-library aggregation unchanged).
- Library swaps are **in place** (`loadSolidLibrary` /
  `unloadSolidLibrary` → `recomputeAggregates` + redraw) — never
  `host.reload()`, so the `<sol-login>` session survives. Pod (`solid`)
  configs are never persisted to `localStorage`.
- Logged-out + public-readable pod ⇒ shown **read-only**; login
  upgrades it to read/write (`solidAuthed`). A reactive
  `requireSession` prompt fires only when a write is actually rejected
  on a read-only pod (banner + Log in / browser-only choice).

### News tab (`<sol-feed>`, not `<ia-player>`)

The third tab is a `<sol-feed>` element (from the `sol-components` repo),
NOT an `<ia-player>`. It runs a **`view="topics"` newsstand** (a mode
added to `../../sol-components/web/sol-feed.js`): topic columns
(News / Sci-Tech / Culture) → click a source → its articles as image
cards → click a card → a shared `window.open` reader. Catalog =
`libraries/news/feeds.ttl`. Cross-origin RSS needs the CORS proxy in
`<sol-default proxy="…">` (dev: `http://localhost:3002/proxy?uri=`).
`#panel-news` bridges sol-feed's CSS tokens onto `--ia-*` (+ `--tab-news`
accent) and drives its `--font-size` from the A text-size setter. The
host rule must NOT set `display` (it would break `:host`'s flex chain /
the article-grid scroll). See `claude/plans/news-tab-plan.md` +
[[project-news-tab]]. Also recent (Movies): a click-to-play film intro
overlay, pause-film-when-you-leave-its-tab, and the startup About splash
is commented out.

### Persistence (localStorage keys)

- `ia-player:libraries` — library configs (pod/`solid` entries stripped;
  old `./ia-music.ttl` paths self-heal to the new layout on read).
- `ia-player:state` — playback/UI state (queue, selections, sizes).
- `omp:lib-enabled` — per-library-URL on/off memory (remote/discovered
  libraries are listed but unchecked at startup; only same-origin
  "local" libraries auto-select; disabled libs are listed but **not
  fetched** until selected — no startup network trip).
- `omp:pod-library` (per-WebID) / `omp:pod-library:last` — pod library
  URL pointers for re-discovery + logged-out view (forgotten on 404).
- `omp:active-panel` — which tab (music/movies/news) was last shown.
- `sol-feed:topic-source:<source>` — News tab's last-selected source
  (restored + scrolled into view on reload; set by sol-feed itself).

---

## Build internals

`bin/build.js` bundles `src/bundle-entry.js` with esbuild:
`bundle:true`, `format` iife+esm, `minify`, `.css`/`.html` as `text`,
and `alias: { rdflib: <this repo's rdflib pkg dir> }` — the make-or-break
step guaranteeing one rdflib / one `rdf` singleton shared with
`core/rdf.js` and `<sol-login>`. Verify with an esbuild metafile if the
single-instance invariant is ever in doubt.

## One-shot scripts (Node, run from project root)

All Claude-authored scripts now live under `claude/`. Smoke tests and
validation scripts have `../../` import/path prefixes so they resolve
correctly when invoked as `node claude/smoke-tests/<file>` from the
project root.

- `claude/migration-scripts/migrate-releases-multifile.js` — split a monolithic
  `releases.ttl` into per-release files + index (dry-run; `--apply` backs up first).
- `claude/migration-scripts/migrate-to-multifile.js`, `migrate-music-ttl.js`,
  `migrate-selfcontained-playlists.js` — older data migrations (already
  applied; historical).
- `claude/migration-scripts/sweep-orphan-tracks.js` — GC unreachable Track/Release.
- `claude/migration-scripts/relativize-library-iris.mjs` — rewrite a
  library's absolute in-library IRIs to file-relative form so it stays
  portable; run before moving / re-mounting a library elsewhere
  (dry-run; `--apply`; `--seg=NAME`). Reusable — not a one-shot.
- `claude/smoke-tests/smoke-test-rdf*.mjs` — RDF checks: base, multifile,
  writes, `-recursive` (seeAlso loader), `-catalog` (lossless split + reach),
  `-create` (createLibrary), `-install` (installToPod).
- `claude/validation/` — `validate-rdf-rework.mjs`, `validate-shared-releases.mjs`,
  `check-triple-conservation.mjs`, `analyze-shared-releases.mjs` (post-migration guards).
Always dry-run / inspect backups (`claude/backups/*.pre-*`) before `--apply`.

## Conventions

- Plans live in `claude/plans/`; `claude/plans/INDEX.md` is the
  authoritative status table — update it when a plan ships.
- Don't persist pod libraries; don't put playlist tracks back in
  `releases.ttl`; keep `runUpdate` strict + always gate writes through
  `checkSaved`.
- Touching rdflib usage? It must stay one instance — change `bin/build.js`'s
  alias and `rdf-shared.js` together, never `import 'rdflib'` directly
  in app code.
- Library RDF files use **relative** in-library IRIs so a library is
  portable — it resolves wherever it is mounted. A PATCH edit
  re-serialises a doc with absolute IRIs (CSS, server-side); fine while
  the library stays put, but it breaks on a move. `installToPod`
  re-relativises on copy (`relativizeLibraryIris` in `ia-rdf.js`);
  `claude/migration-scripts/relativize-library-iris.mjs` does it for a
  manual move.
