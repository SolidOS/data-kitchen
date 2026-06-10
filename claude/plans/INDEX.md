# claude/plans/ index

> **Relocated 2026-05-20:** all Claude-authored artifacts moved out of
> `drafts/` and project root into `claude/`. This file lives at
> `claude/plans/INDEX.md`. Sibling subfolders:
>
> - `claude/plans/` — this file + every `PLAN-*.md` / `*-plan.md`
> - `drafts/notes/` — user notes: `notes.md`, `notes2.md`, `thoughts.md`,
>   `rdf-how2.md`, `conversion.md`, `conversion.csv` (NOT in `claude/`
>   — these are the user's files, not Claude-authored)
> - `claude/smoke-tests/` — `smoke-test-*.mjs`
>   (run as `node claude/smoke-tests/<file>` from project root)
> - `claude/validation/` — `validate-*.mjs`, `check-triple-conservation.mjs`,
>   `analyze-shared-releases.mjs`
> - `claude/migration-scripts/` — `migrate-*.js`, `backfill-playlist-maker.js`,
>   `sweep-orphan-tracks.js` (already applied); `relativize-library-iris.mjs`
>   (reusable — run before moving a library elsewhere)
>   (the former `claude/rdf-model/` moved to top-level **`shapes/`** on
>   2026-05-31 — runtime `*.shacl(c)`, `ui-choices.ttl`, `music-example.ttl`,
>   `music-shape*.mmd`; it's app-served, no longer under `claude/`)
> - `claude/backups/` — `*.pre-*`, `pre-libraries-backup-*/`
> - `claude/scratch/` — `link2mo.js`, `munge-music.js`
>
> Plan filenames below are bare (sibling-relative). Cross-refs to
> scripts/notes use bare filenames too — find them under the appropriate
> subfolder above.

Status of every plan / note in this folder, newest themes first.
"Implemented" = shipped into the player; "Proposal" = written out &
commented, **not** built (awaiting go-ahead); "Deferred" = designed,
not built; "Superseded" = replaced by a later plan; "Reference" =
notes, not a plan.

## ⮕ Active / next (read this first)

What each item *does* and its next step. Full history is in the status
table below and in each plan. 🔴 = outstanding work (rendered red where
the viewer supports it).

**🔴 ① HTML as the source of truth** (`PLAN-html-src-of-truth.md`, **Phases 1–6
   BUILT 2026-06-02**). UI config lives in slim declarative HTML (inline tabs,
   bare toolbar actions, `<menu>` of `data-handler=` items, `<sol-default>`
   theme/fontsize/solid-kitchen). **SHIPPED entry point:** a **vanilla
   `index.html`** = `<sol-default src-of-truth="html|rdf">` (default `html`) + an
   empty `<sol-include id="omp-body" trusted>`; `omp-shell.js` reads the attr and
   includes **`html-first.html`** (inline tabs) or **`rdf-first.html`** (`<sol-tabs
   from-rdf>`) into the light DOM. No swc change. **DONE (both generator
   directions):** `bin/html-to-rdf.mjs` (`npm run gen:rdf`) generates
   tabs/⋮-menu/settings RDF FROM `html-first.html` (+ `<sol-default>` from
   index.html); `bin/rdf-to-html.mjs` (`npm run gen:html`) regenerates the HTML
   fragments FROM the RDF; shared mappings in `bin/lib/html-rdf.mjs`; the
   HTML→RDF→HTML→RDF round-trip is verified lossless. `index2.html` deleted; the
   old `<sol-default from-rdf>` one-file switch glue in swc is now dead code
   (offered for removal). Verified `claude/smoke-tests/e2e-src-of-truth.mjs`
   (12/12 both modes, 0 errors). **Next (await go):** Forms generation from HTML.
   See [[project_html_src_of_truth]].

**★ Communal favourites wall** (`PLAN-communal-favourites.md`, **BUILT +
   verified 2026-05-31**). A shared `favourites/` folder (one append-only file
   per star, `schema:BookmarkAction` + standard vocab) feeds a **5th `★` tab**:
   anyone (guest or owner) stars an item from any tab; the wall shows them
   **grouped by item** (★count + contributors), rendering only from snapshots.
   Click=A (image→lightbox, article→reader, track/film→play, collection→jump).
   Images (collections + loose) / News (articles) / Music (tracks) / Movies
   (films) all wired. **Guests can no longer create/modify playlists.** Owner
   ACL guidance in the plan. Supersedes `PLAN-favorite-images.md`. See
   [[project_communal_favourites]].

**Source adapters / provider-display split** (`PLAN-source-adapters.md`,
   **Images IMPLEMENTED + e2e-verified; the split is selective, NOT universal**).
   Reverted `sol-form`/`sol-settings`/`solid-ui`. **Images** got the full split
   (`sources/commons.js` fetcher + `contract.js` vocab; `sol-gallery` slimmed to
   `clear`/`add`/`item-opened`; `<omp-images>` owns the local catalog +
   selectors). **News did NOT split** — `sol-feed` has one non-generalizable
   fetch (RSS), so it stays a self-contained fetch+parse+edit+display component
   (the editing lives inside it; see [[feedback_dont_overgeneralize_split]]).
   **IA**: only the fetcher relocated (`sources/internet-archive.js`); the
   `ia-player` teardown is deliberately un-done (also self-contained). Rule:
   split ONLY when one display takes multiple swappable sources. `solid-ui`
   removed from omp's bundle. Supersedes [[project_settings_forms]].

**Images tab** (`PLAN-images-library.md`, **Implemented — browser e2e passed**).
   4th tab (… / **Images**): new `<sol-gallery>` over Wikimedia Commons
   categories. Left side is a **two-column Miller browser** (groups over
   sub-topics | collections); collection → **masonry** grid; **lightbox** with
   click-to-100% zoom. `libraries/wikimedia_images/images.ttl` (758
   collections; 4 sub-topics regrouped Life→Art). Reuses sol-feed's bookmark
   parse (`parseBookmarkTree`) + token bridge; `commons-fetch.js` (CORS-direct,
   no proxy). Headless e2e: `e2e-images.mjs`.

**Shell: tab order + cold start** (in `PLAN-images-library.md` update log +
   [[project_news_tab]] memory). Tabs reordered **News · Music · Images ·
   Movies**; News is the cold-start landing tab and auto-selects its first
   source (`select-first` attr on `<sol-feed>`). `e2e-coldstart.mjs` verifies.
   **Headless e2e now available generally** (puppeteer-core + system Chrome) —
   resolves the long-standing "browser e2e pending" caveat on every tab.

0. **News tab** (`news-tab-plan.md`). Third top-level tab (Music / Movies
   / **News**): a `<sol-feed>` newsstand (`view="topics"` — added to the
   web-components repo) showing topics→sources→articles, click → reader
   window. `libraries/news/feeds.ttl`; `<sol-default>` CORS proxy
   (`localhost:3002/proxy?uri=`); remembered source; A-text-size-driven
   titles. *Done on dev (code).* **Browser-verified** via `e2e-coldstart.mjs`
   (News default tab; first source selected; 40 article cards rendered; no
   console errors) — the proxy at `localhost:3002` must be running for live
   feeds. Also same session: Movies film
   click-to-play intro overlay, pause-film-on-leave-tab, and the startup
   About splash disabled — see [[project-media-type-seam]].

1. **shared-releases Ph3 — "Deleted bin"** (`shared-releases-plan.md`).
   Deleting a playlist moves its tracks into a hidden `playlists/deleted`
   collection, opened via ⋮ → "View deleted" and edited with the normal
   playlist view; removing a track there frees its release file from
   disk when no other live playlist uses it. *Done on dev (code).*
   🔴 <span style="color:red">**Needs: in-browser check.**</span>
2. **single-store convergence (S1) — SHIPPED & infrastructure
   live-confirmed; save-via-bypass NOT verified end-to-end**
   (`single-store-plan.md`). One `rdf.store`; login = Fetcher-auth
   swap + `softRedraw` (no reload, no wipe); explicit
   `solidWriteAuthed` flag replaces `runUpdate`'s `store===rdf.store`;
   ~7 duplicate scaffolds deleted. Live pod console proves the
   plumbing: `[omp] sol-login handler upgrade fired …` +
   `setSolidWriteAuthed → true` + `runUpdate path: pod-bypass ·
   isRdfStore=true solidWriteAuthed=true`. The probe gate kept
   diverting real saves no matter how it was guarded, so it was
   **removed entirely** in build `2026-05-20T14:34:54Z`. A clean
   save through the bypass on the live pod was never demonstrated
   before the session ended.

3. **Update-app-on-Pod destructive bug — DIAGNOSED + defect A FIXED &
   live-verified 2026-05-29.** Root cause (defect A): `readPodAppFiles`
   did `fetch(location.href)`, but the page is served by a Solid server
   (CSS) at a CONTAINER URL (`…/foo/`), so CSS returned a **Turtle
   directory listing** that got PUT over `index.html`. Fixed: resolve
   the explicit `index.html` file URL + validate every body is real
   HTML/JS before PUT (else throw). Also fixed: Update-app now defaults
   the target to the directory the app is running in (was hardcoded
   `open_media_player/`); logged-out menu items now tell you to click
   the toolbar login (the auto-trigger is a no-op). The live pod was
   recovered to a fresh `https://jeff-zucker.solidcommunity.net/omp/`
   (the original `…/open_media_player/` container is **WEDGED** —
   every request hangs/times out, a stale lock from the partial PUTs;
   hosted CSS, needs lock-expiry or admin to clear). See
   [[project-update-app-bug]] / [[project-pod-urls]] memories.
   **Defect B also FIXED (code, 2026-05-29):** `installToPod` now trusts
   only a real 2xx; any ambiguous response (redirect / opaque-redirect /
   3xx) is CONFIRMED by an authed read-back GET, so a PUT that didn't
   land can no longer report "written." Guard updated in
   `smoke-test-rdf-install.mjs` (incl. a masked-failure regression case);
   all install-test assertions pass. Not yet exercised on the live pod
   (the with-extension path was via Update-app to `/omp/`; the
   extension-less read-back path only runs on a full install).

4. **updatemanager-everywhere Phase A — INCONCLUSIVE; earlier
   "verdict D" RETRACTED.** Probe failed in our integration, but
   `UpdateManager` works on solidcommunity.net for other clients →
   our Fetcher wiring is the suspected bug, not UpdateManager. The
   bypass is kept *provisionally* as the known-working authed-pod
   write path. `ensureUpdater` now aligns
   `store.fetcher = rdf.storeFetcher` before UM is constructed — the
   shipped fix for the wiring hypothesis — but was **never live-tested
   cleanly** before the probe was permanently removed. See
   `single-store-plan.md` §13.

> **Ph5 pod-install + lazy-load: SHIPPED & live-verified 2026-05-19**
> (not a drafts plan — done ad hoc; canonical record in the
> `project-lazy-releases` / `project-shared-releases` memories).
> Ph5 install now copies every referenced `releases/<slug>` + ALL
> playlists (`allPlaylistDocs`/`releaseDocsForPlaylistDocs`) — no
> dangling pointers; the old "don't pod-install a migrated library"
> warning is **retired**. Startup is lazy (spine-only; releases fetched
> on open; `.meta`/`.acl` auxiliaries skipped) and single-load
> (no-login-to-view; explicit login → one authed load). New ⋮
> **"Update app on Pod"** pushes only index.html+ia-player.js.
> Wu-Tang rebuilt as a hidden playlist-backed artist
> (`migrate-wutang-as-playlist.js`). Live-verified on
> jeff-zucker.solidcommunity.net. **`installOnPod` synth converted to
> the recursive-DCAT spine** (2026-05-19, Node-verified via
> `smoke-test-pod-synth.mjs`): synthesises `index.ttl#it`
> `dcat:catalog`/`dataset`/`themeTaxonomy` + a new synthesised
> `playlists.ttl` + DCAT `releases.ttl` — pod now structurally identical
> to dev (no pod-only `rdfs:seeAlso`; loader keeps reading seeAlso as
> tolerant legacy back-compat). **DONE — live-verified 2026-05-29** on the
> fresh `…/omp/` install: zero `seeAlso` in any spine doc; full
> `dcat:catalog`/`dataset`/`themeTaxonomy` spine; `skos:ConceptScheme`
> genres; per-release `#it` datasets and playlists resolve (curl-checked).

## Probably abandon

Designed or known, but unlikely to be picked up — kept here so they
aren't silently lost.

- **`libraries-layout-plan.md` follow-ups** — dead `syncPodLibraries` /
  bootstrap-era helpers awaiting GC. (Note: "no Solid session
  persistence without a Client ID Document" turned out **false** for
  solidcommunity.net — sessions DO silently restore across reloads;
  this drove the "Decision A" no-login-to-view behaviour.)
- **Deferred pickups** — `PLAN-europeana-library.md`; imports
  (`conversion.md` + `PLAN-rhythmbox-layout.md` /
  `PLAN-file-system-support.md`).

| File | Status | Notes |
|---|---|---|
| `PLAN-tab-row-actions.md` | **PROPOSAL 2026-06-02** | General "tab-row actions": buttons on the `sol-tabs` bar whose `inline` content opens in the tab display area (transient, mutually-exclusive with the active tab). Shared `sol-tabs` work (place on bar row + scoped content region + dismiss-on-tab/highlight) then **Opt A** HTML `slot="actions"` children, and/or **Opt B** RDF buttongroup (`ui:Group ; ui:role "actions"` in `tabs.ttl`). Opt C = status quo (`sol-button inline for=…` in index.html, shipped). Background: the `sol-default region` global-default broke panel mounting — must be scoped. Builds on shipped `sol-button` `inline` + `sol-include` `if-logged-in`. |
| `PLAN-soltabs-solbuttons.md` | **SHIPPED + evolved 2026-06-01** | Tabs → `<sol-tabs from-rdf keep-alive>` from `data/tabs.ttl`; chrome floated onto the tab row; `?`Help = `<sol-button>` modal; ⋮ = `<sol-dropdown-button source="data/menu.ttl#More">` with **command items** (→`sol-command`→omp `COMMANDS`); gating is capability-based `acl:mode acl:Write`→`part="requires-write"` hidden by `.no-write` (not "owner"); `sol-modal` themed. swc committed to main (`6cac340`…`b13bfab`) incl. menu SHACL. See [[project_soltabs_solbuttons]] + [[project_menu_commands]]. |
| `PLAN-communal-favourites.md` | **BUILT + verified 2026-05-31** | Shared `favourites/` folder (one append-only `schema:BookmarkAction` file per star, standard vocab) → **5th `★` tab** wall, grouped by item (count+contributors), append-only (owner moderates), click=A. Images (collections+loose)/News (articles)/Music (tracks)/Movies (films) all wired via a `favouritable` attr + `item-favourite` router. Guests lose playlist create/modify. omp-owned + tiny swc affordances (pushed). Owner ACL guidance in the plan. Supersedes `PLAN-favorite-images.md`. [[project_communal_favourites]] |
| `PLAN-source-adapters.md` | **Images IMPLEMENTED + e2e-verified; split is SELECTIVE not universal** | Reverted `sol-form`/`sol-settings`/`solid-ui`. **Images** = full split (`sources/commons.js`+`contract.js` fetcher/vocab; `sol-gallery` slimmed to `clear`/`add`/`item-opened`; `<omp-images>` owns catalog+selectors+`+Topic`/`+Collection`). **News NOT split** — `sol-feed` has one non-generalizable fetch (RSS) so it stays self-contained (fetch+parse+**edit**+display); editing lives IN sol-feed ([[feedback_dont_overgeneralize_split]]). **IA**: only `sources/internet-archive.js` fetcher relocated; player teardown un-done. Rule: split only when one display takes multiple swappable sources. `solid-ui` gone from the bundle. Supersedes [[project_settings_forms]]. |
| `news-tab-plan.md` | **Implemented (code) 2026-05-30; browser e2e pending** | Third tab **News** = `<sol-feed>` with a NEW `view="topics"` mode (added to `../../solid-web-components/web/sol-feed.js` + its css, additive). Newsstand: topic columns → sources → article image cards → `window.open` reader. `libraries/news/feeds.ttl` (bookmark ontology, root `#Feeds`). `<sol-default proxy="http://localhost:3002/proxy?uri=">` page-wide CORS proxy. Remembered source (localStorage `sol-feed:topic-source:*`) + scroll-into-view; titles track the A text-size setter (medium 20px); theme bridge maps sol-feed tokens → `--ia-*` (`--tab-news` green). See [[project-news-tab]]. |
| `PLAN-rdf-shapes.md` | **Implemented** | The mo:Release/Track/Agent/Genre/Playlist shape + migration off the old `ui:Link` model. Foundation for everything else. |
| `PLAN-multifile-library.md` | **Implemented · extended** | Split into an index + `agents/genres/releases.ttl` + `playlists/`. Layout later relocated/renamed by `libraries-layout-plan.md` (now `libraries/<slug>/index.ttl`). |
| `PLAN-playlist-files.md` | **Superseded** | Narrower playlists-only split; replaced by `PLAN-multifile-library.md`. |
| `PLAN-playlist-artist-link.md` | **Implemented** | Convert-to-artist is now a live link (`omp:sourcePlaylist`), not a copy; `omp:hidePlaylist` + artist-kebab toggle give playlist-only / both / artist-only. Supersedes the releases.ttl-copy convert. |
| `PLAN-self-contained-playlists.md` | **Implemented** | Playlist Track/Release triples moved out of monolithic `releases.ttl` into each playlist file — fixes CSS lock-timeout 500s on add. Migration `migrate-selfcontained-playlists.js`. **`shared-releases-plan.md` proposes reversing this** now that per-release files exist. |
| `PLAN-playlist-metadata.md` | **Implemented** | Playlist `foaf:maker` / `dcterms:description`; display "name (maker)" + description hover. Backfill `backfill-playlist-maker.js`. |
| `PLAN-playlist-to-artist.md` | **Implemented** | Convert a playlist → local-catalog artist (`omp:localData`); local album/track read path. |
| `PLAN-quality-filter.md` | **Implemented** | Tiered search/track quality filter + Filters modal. (Was deferred, then built.) |
| `PLAN-edit-track-metadata.md` | **Implemented** | Per-track Edit (title/artist/album) via the row kebab. |
| `PLAN-rename-open-media-player.md` | **Superseded** | Title-only rebrand done; its `ia.html→omp.html` idea is OBSOLETE — `libraries-layout-plan.md` renamed the dev entry `ia.html→index.html` instead. |
| `PLAN-solid-login.md` | **Implemented (CSS-tested)** | Solid OIDC login + pod library via type index on the shared `rdf` singleton. Bundled `<sol-login>`, in-place swap, bootstrap seeds local agents/genres, logged-out public read-only view, reactive `requireSession` prompt, `open-media-player/` + one-time migration, `ia-login-help.html` in gear menu. All steps 1–10 done. |
| `libraries-layout-plan.md` | **Implemented · shipped** | Big refactor (Phases 0–6): recursive `seeAlso` loader → `./libraries/<slug>/index.ttl` layout → `releases.ttl` as a per-release-file index → create-library UX → **"Install on my Pod"** wizard (replaces old bootstrap) → docs. Install live-debugged to working on solidcommunity.net. Final model: each instance manages only its OWN same-origin library (login makes it writable), external libs only via + Library, no type-index auto-discovery. See its §6 progress log for the full saga + known follow-ups. |
| `shared-releases-plan.md` | **Ph1+Ph2+Ph4 SHIPPED & validated** | Reverse self-containment. **Ph1** (`migrate-shared-releases-index.js`): resolvable `dcat:landingPage` keys. **Ph4** (`migrate-shared-releases.js`): un-cloned 31 playlists → 173 new shared `releases/<slug>` (+23 reused, 1 cross-playlist), playlists **pointer-only**; backup `.pre-sharedreleases-<ts>/`. **Ph2** (ia-rdf.js): `addTracksToPlaylist` resolve-by-landingPage (reuse / append-to-release / mint new file+index), `removeTrackFromPlaylist` drops only the pointer; release→index→pointer write order (I1); `uniqueReleaseSlug` helper. Validated by `smoke-test-shared-write.mjs` (pod direct-PATCH branch, 20 assertions) + `validate-shared-releases.mjs`; full smoke suite green. **Edit-corruption gap CLOSED.** **Ph3 REDESIGNED → "Deleted-bin" model, IMPLEMENTED on dev (code only) 2026-05-18** (§4 prompt/refcount SUPERSEDED; guard `smoke-test-deleted-bin.mjs`, not on pod). **Ph5 (pod-install) SHIPPED & live-verified 2026-05-19** — `installOnPod` copies ALL playlists + every referenced `releases/<slug>` (`allPlaylistDocs`/`releaseDocsForPlaylistDocs`), synthesised `releases.ttl` seeAlsos them; no dangling pointers; the don't-pod-install warning is retired. Guard `smoke-test-rdf-install-ph5.mjs`. See plan §"Ph3 REVISED" + the Ph5/lazy callout in the Active list above. |
| `rdf-model-rework-plan.md` | **IMPLEMENTED (dev) 2026-05-19 · P1+P2+P3+P4 + DCAT-spine refactor** | **2026-05-19b follow-up: `rdfs:seeAlso` ELIMINATED** — recursive DCAT spine: `index.ttl#it` `dcat:catalog`→`releases.ttl#it`/`playlists.ttl#it`, `dcat:dataset`→`agents.ttl#it`, `dcat:themeTaxonomy`→`genres.ttl#Music` (now `skos:ConceptScheme`); new `playlists.ttl` catalog; release `dct:isPartOf`→`releases.ttl#it`; playlists `a as:OrderedCollection, dcat:Dataset`. Loader/`createLibrary`/`add|removePlaylist`/`addTracksToPlaylist`/slug-helpers all off seeAlso. All gates PASS; probe: 259 docs via DCAT spine, 0 seeAlso. See plan §Follow-up refactor. | Shipped via one combined `migrate-rdf-rework.js` (re-run from the pristine A0 backup): P1 release identity `<#it>` + `dcterms:identifier` dedup key + `releases.ttl` seeAlso-only/derived (retires the `shared-releases-plan.md` Ph1/Ph2 sync hazard); P2 `<index.ttl#it> a dcat:Catalog` + `dcat:dataset` spine target + releases `dcat:Dataset` + loader follows seeAlso *and* dcat:dataset (seeAlso kept as loader anchor — B5 drop moot); P3 `dcterms:isPartOf` spine track→release→catalog + playlists `as:OrderedCollection` with `<#eNN>` `omp:entry`/`omp:position`/`omp:track`; P4 per-track `foaf:maker` (read fallback + `updateTrackMeta` pre-existing; now in SHACL). `ia-rdf.js` read/write on new model; `validate-rdf-rework.mjs` + new `check-triple-conservation.mjs` + full smoke green; bundle rebuilt. 2 serializer bugs caught by gates (empty `foaf:maker`; dropped `omp:hidePlaylist` — 22 playlists) → fixed + conservation guard added. **Pod: installed & live-verified 2026-05-19** via Ph5 (`installOnPod` synthesises a `rdfs:seeAlso` structure the loader still honours as legacy back-compat — functionally on the new data model; moving the *synthesised pod* onto the full DCAT spine is optional polish, no longer blocking). Smoke `rdf-catalog`/`shared-write` rewritten to new model; `music.shaclc` updated again 2026-05-19 (recursive-DCAT); `music-shape-track-route.mmd` superseded. See plan §Post-implementation. |
| `single-store-plan.md` | **S1 plumbing SHIPPED & live-confirmed; bypass-save unverified end-to-end; Update-app destructive-PUT bug open** | Restore "store model A": one `rdf.store`; non-solid libs no longer get a private `graph()`; login = swap `rdf.storeFetcher` to authed, **no reload**. Root-causes the double-load / wipe-on-login / wrong-store-edit bugs and deletes ~7 duplicate-management scaffolds (`_skipLocal`/`BOOT_AUTH_PARAMS`/auth-inflight/self-hosted dedupe/Decision-A gate/etc.). Open: §4 `runUpdate` discriminator (today `store===rdf.store` → would force the pod bypass onto dev; replace with an explicit write-path flag, decided with Phase A) and §5 scope (S1 same-origin-only, recommended, vs S2 full single-source parse-once). |
| `updatemanager-everywhere-plan.md` | **Phase A inconclusive; earlier "verdict D" RETRACTED** | Probe failed in OUR integration, but UpdateManager works on solidcommunity.net for forms apps → bug is our Fetcher wiring, not UpdateManager. Bypass kept provisionally (known-working authed write path), not evidence-backed. Hypothesis: `rdf.store.fetcher !== rdf.storeFetcher` → UM probes unauthed. Phase B/C **blocked** on the wiring fix; if it works after the fix the bypass goes. |
| `curated-vs-search-artists-plan.md` | **Implemented** (2-tier curated/raw; reused existing `localData` flag; divider + muted + aria, nav-skipped) | Mark curated (playlist/RDF-backed) vs search-based artists; search-based sorted last + muted-but-accessible (with a non-colour structural cue). Lowest-risk: read-only, presentation-only, no migration. |
| `curated-artist-as-playlist-plan.md` | **Implemented + read-half widened to C** | Click curated artist → select all albums, flatten tracks; tracklist = playlist for A. Read-half now also covers catalogue (C) artists via `libraryAggregateAlbums` (split from A-only `libraryBackingPlaylist`); C stays read-only. **Wu-Tang update (2026-05-19):** it was the lone non-playlist *snapshot* artist (a prior session re-inserted it with no playlist), which broke the lazy-load curated/raw classification. `migrate-wutang-as-playlist.js` rebuilt it as a **hidden playlist-backed artist** (J_Dilla-shaped: `playlists/Wu_Tang_Clan$.ttl` 302 entries, agent `+omp:sourcePlaylist`, playlists.ttl spine edge; backups `*.pre-wutang-<ts>`). Every local artist is now playlist-backed. |
| `PLAN-topic-editing.md` | **Deferred** (designed 2026-05-30) | Editors for feed topics + topic↔library association, and make topic **Add** produce a valid concept. Root enabler: distinct tier markers (image library `schema:DefinedTermSet` vs sub-topic `schema:DefinedTerm` vs feed `taxo:topic`). swc bit: `shape-to-form` expose `sh:hasValue` (fixed/seed, not rendered) + `sol-form` Add seeds it. Open: delete-guard for in-use topics. Builds on the shipped SHACL settings work ([[project_settings_forms]]). |
| `PLAN-favorite-images.md` | **SUPERSEDED 2026-05-31** by `PLAN-communal-favourites.md` | Was: image-only favourites (mint `schema:ImageObject`, collections via `dcat:theme <#Favourites>`, guest=localStorage/owner=RDF). Replaced by the **communal favourites wall** — one shared append-only `favourites/` folder across ALL tabs, not image-only or per-device. |
| `PLAN-eliminate-system-theme.md` | **Implemented 2026-05-30** | Dropped the "System" color scheme (removed from `ui-choices.ttl`; `omp-settings-applier.js` lost the system mapping / resolve branch / matchMedia listener; binary defaults) → Light/Dark only, symmetric with the chrome toggle. Kills the "System demotion" + no-live-follow bugs. Verified (dropdown = Light/Dark, no errors). |
| `PLAN-europeana-library.md` | **Deferred** | Second source provider (Europeana). ~7.5h. |
| `PLAN-file-system-support.md` | **Deferred** | Predates this session; local-filesystem source. Not reviewed recently. |
| `PLAN-rhythmbox-layout.md` | **Deferred** | Predates this session; Rhythmbox import shape. Overlaps `conversion.md`. |
| `../../drafts/notes/conversion.md` | **Reference** | ID3 / Rhythmbox / iTunes → RDF field mapping table. Informs future imports. |
| `../../drafts/notes/notes.md` | **Reference** | Misc working notes (user-authored). |

Also in `shapes/`: `music.shaclc` (the SHACL shapes — updated
2026-05-19 to the recursive-DCAT model: Catalog sub-catalogs +
`dcat:themeTaxonomy`, `GenreSchemeShape`, Playlist as `dcat:Dataset`
+ `dcterms:isPartOf` spine, Agent `omp:localData`/`omp:sourcePlaylist`,
Entry as an untyped property-scoped shape), `music.shacl`,
`music-shape.mmd` / `music-shape-track-route.mmd` (Mermaid diagrams),
and `music-example.ttl` (sample instance data).

## Where things stand (overview)

The big recent body of work is **`libraries-layout-plan.md`** —
shipped and live-debugged to a working self-hosted pod install. It
reshaped the storage layout, replaced login-time bootstrap with an
explicit **"Install on my Pod"** wizard, and settled the model:
*each instance manages only its own same-origin library; login makes
that library writable in place; external libraries only via + Library;
no auto-discovery.* Read that plan's §6 progress log for the full
debugging story and the known follow-ups (no session persistence
without a Client ID Document; dead `syncPodLibraries`/bootstrap-era
helpers awaiting GC).

Shipped since: **`curated-vs-search-artists-plan.md`** (2-tier
curated/raw) and **`curated-artist-as-playlist-plan.md`** (curated
artist behaves like its backing playlist; `migrate-link-namematched-playlists.js`
applied — 6 stubs B→A).

Shipped 2026-05-19 (ad hoc, no drafts plan — see `project-lazy-releases`
/ `project-shared-releases` memories): **Ph5 pod-install + lazy-load +
pod single-load + Update-app-on-Pod + Wu-Tang→playlist**, live-verified
on jeff-zucker.solidcommunity.net. The pod is installable and fast; the
"don't pod-install a migrated library" warning is retired.

Open items now live in the **"Active / next"** list at the top of this
file — read that first. In brief: `shared-releases` Ph1/2/4 + the
redesigned **Ph3 "Deleted-bin"** are implemented on dev (Ph3 still
wants an in-browser check); **Ph5 is shipped & live-verified**; the
RDF-rework shipped on dev and the pod runs (on the legacy-honoured
synthesised `rdfs:seeAlso` structure — full DCAT-on-pod is optional
polish); `updatemanager-everywhere-plan.md` remains a Proposal gated on
a cheap Phase-A live-pod probe.

## Older deferred pickups

1. `PLAN-europeana-library.md` — self-contained second provider.
2. Imports (`conversion.md` + `PLAN-rhythmbox-layout.md` /
   `PLAN-file-system-support.md`) — reuse the local-catalog read path;
   note `shared-releases-plan.md`'s "Import playlists" overlaps here.
