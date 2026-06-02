# Solid login + pod-hosted library — plan

**Status: IMPLEMENTED (CSS-tested) — all steps done.** Decisions locked
+ built 2026-05-16. Login/resolve/bootstrap/migration verified against a
Community Solid Server pod. Steps 8–9 (reactive `requireSession` choice
dialog + non-saved banner, wired into `checkSaved`) are now implemented
too — nothing outstanding except the explicitly out-of-scope items.

Decisions (all locked):
1. Single bundle; player imports the web-components `core/rdf.js`;
   `rdflib` aliased to the player's one copy → one `rdf` singleton
   (option 1). No sol-login on the page ⇒ the singleton is just a plain
   shared store, which is the standalone fallback.
2. Bootstrap writes **data files only** (no app/dist into the pod).
3. Logged-in → pod library; logged-out → local. "Needs login" is a
   **reactive** auth-failure decision, never by-origin.
4. No `solid:publicTypeIndex` → create + link into the profile **behind
   a confirm**; any refused pod write degrades (library still created,
   remembered locally).
5. Single default `tag` for v1.

Sub-decision (resolved): **Store model A** — only the Solid/pod library
joins the shared `rdf.store`/`storeFetcher`; local/dev libraries keep
their private stores, so the multi-library feature is untouched.

Naming: the pod container is **`open-media-player/`** (standardised on
Player, not Browser). A one-time, idempotent, non-destructive migration
copies an older `open-media-browser/` library to the new path on login
and repoints the type registration.

### What's implemented

- **Build:** `build.js` aliases `rdflib` to the player's package dir
  (ESM entry). `rdf-shared.js` re-exports rdflib terms + the shared
  `rdf` singleton from `core/rdf.js`. Metafile-verified: exactly one
  rdflib, shared with `<sol-login>`.
- **`<sol-login>`** bundled from source into the toolbar; player drives
  `initialize()` (handles the OIDC redirect return); `sol-login` /
  `sol-logout` events handled. Dev page (`ia.html`) loads the Inrupt
  UMD; guarded so missing auth lib only fails an actual login.
- **`ia-rdf.js`:** `loadRDF(uri,{shared})` uses `rdf.store` +
  `rdf.storeFetcher` (the sol-login-patched authed fetcher) with
  `markLoaded`/`isLoaded`; `ensureFetcher` returns the patched fetcher
  for the shared store (authed writes). `resolvePodLibraryUrl`,
  `discoverPodStorages` (lists **all** `space:storage` + origin
  fallback), `bootstrapPodLibrary` (data-only starters + best-effort
  type-index registration, every pod write resilient/skippable),
  `migrateOldPodLibrary` + `repointPodRegistration`.
- **`ia3.js`:** login resolves via type index → remembered pointer →
  storage-picker prompt → confirmed bootstrap; old-path migration runs
  first. Library swap is **in place** (`loadSolidLibrary` /
  `unloadSolidLibrary` → `recomputeAggregates` + redraw) — never
  `host.reload()`, so `<sol-login>` and its session survive. Pod
  (`solid`) configs are **never persisted** to `localStorage`
  (stripped on read+write; self-heals stale state); the pod library URL
  is remembered per-WebID under `omp:pod-library` for pods whose type
  index can't be written.
- **Logged-out public view:** a WebID-independent `omp:pod-library:last`
  pointer lets the player attempt the pod library unauthenticated at
  startup (skipped during an OIDC redirect / when already signed in).
  If the pod allows public read it shows **read-only**; if it 401s
  `loadSolidLibrary` auto-reverts to local. A `solidAuthed` flag marks
  read-only loads so a later login **upgrades** them to read/write
  (the `sol-login` idempotency guard keys off `solidAuthed`).
- **Bootstrap seeding:** the new pod library is seeded from the local
  install's `agents.ttl` + `genres.ttl` (artists/genres), local IRIs
  rewritten to the pod base; `library.ttl` + `releases.ttl` stay empty
  starters; per-file fallback to the empty starter if a local read
  fails. `ia3.js` passes `seedFrom` = the local config URL.
- **Help:** standalone `ia-login-help.html` documenting the whole flow,
  opened from a new **gear menu → "Solid login help"** entry
  (`showAboutModal`, `useBundle:false`, large).

### Reactive requireSession (steps 8–9) — DONE

- `checkSaved` detects an auth-class failure (`looksAuthFailure`:
  401/403/forbidden/permission/credential) while a pod library is
  loaded read-only (`solidReadOnly`) and routes to `requireSession`
  instead of the bare error.
- `requireSession(what)` sets a persistent "not saved — log in to save
  / changes stay in this browser" status banner and, once per
  read-only episode, offers a Log in / browser-only choice. Log in
  opens the `<sol-login>` flow; the change is redone after sign-in
  (OIDC is a full redirect, so no in-page replay — documented).
- `solidReadOnly` / `sessionPrompted` set in `loadSolidLibrary`,
  cleared on revert/unload/logout; login upgrades the read-only load
  (`solidAuthed`) and clears the banner.

### Not done (explicitly out of scope)

- Seeding only copies the **catalog** (agents/genres). Importing the
  local **releases + playlists** into the pod is still out of scope.
- App-to-pod deploy, ACL/sharing, multi-tag (see "Out of scope").

## Goal

Add Solid OIDC login. A logged-in user's music library lives on their
pod, discovered via the public type index keyed on `mo:Release`. If
none exists, bootstrap one. The player joins the shared `rdf` singleton
used by the web-components stack, so the Inrupt authenticated fetch
(injected by `<sol-login>`) covers every pod read/write — no bespoke
auth-fetch plumbing in the player.

## Components / assumptions

- Login button: the existing `<sol-login>` web component at
  `/home/jeff/solid/solid-web-components/web/sol-login.js`.
  - API: `issuers` attr; `.fetchFor(url[,tag])` → authenticated fetch;
    `.webId`, `.isLoggedIn`; events `sol-login {webId,issuer}` /
    `sol-logout`; `.login(issuer)`, `.logout()`, `.initialize()`.
  - It expects `@inrupt/solid-client-authn-browser` as a UMD global
    (`window.solidClientAuthn`). The host page provides it (per the
    requirement "assume the user will have brought" it).
  - It has its own relative deps (`../core/*`, `./styles/*`). **Decision
    needed:** load the prebuilt `solid-web-components.bundle.js` and use
    `<sol-login>` as a custom element (recommended — keeps the
    component lib's build separate), vs. vendoring its source into the
    player's esbuild bundle (tighter coupling, fragile).

## The critical piece: use the shared `rdf` singleton (not a private Fetcher)

How the web components do it (`/home/jeff/s/solid-web-components/core/`):

- **`rdf.js`** is a singleton wrapper around rdflib. The *entire*
  component ecosystem goes through it: `rdf.store` (one lazily-created
  shared graph), `rdf.storeFetcher` (one Fetcher bound to that store),
  `rdf.graph/sym/literal/parse/serialize/UpdateManager/Fetcher`,
  `rdf.markLoaded/isLoaded` (load dedupe), and `rdf.useStore(external)`
  to adopt a store another library (solid-logic / solid-ui / mashlib)
  created first.
- **`rdf-utils.js` `loadRdfStore(endpoint, fetchFn, {shared:true})`**
  parses a doc into `rdf.store`, deduping via `rdf.isLoaded`.
- **`sol-login._integrateWithRdflib()`** (runs on init, login, logout)
  patches `rdf.Fetcher` (ctor) **and** the live `rdf._fetcher`
  instance so their `fetch`/`_fetch` becomes the per-origin Inrupt
  authenticated fetch; and calls `rdf.useStore(...)` / publishes
  `window.SolidLogic = { store, fetcher }` so everyone shares one graph.

So the auth wiring is already solved **for code that uses the shared
`rdf` singleton**. The original plan's "manually inject `authFetch`
into the player's own Fetcher" is the *wrong* approach here — it
fights the ecosystem instead of joining it.

**Revised design — the player joins the shared store/fetcher:**

`ia-rdf.js` currently does `import { graph, Fetcher, sym, st, literal,
UpdateManager, Namespace } from 'rdflib'` and `new Fetcher(graph())`.
Replace that with the shared singleton:

- Source the store + fetcher + term constructors + UpdateManager from
  the web-components `rdf` singleton instead of constructing the
  player's own. `loadRDF` becomes: ensure `rdf.storeFetcher`, then
  `fetcher.load(libraryUrl)` into `rdf.store`, then follow
  `rdfs:seeAlso` (load each into the same store), using
  `rdf.markLoaded`/`isLoaded` for dedupe.
- All the player's reads/writes (`store.match`, `st(...)` statements,
  `new UpdateManager(store)`) target `rdf.store`. The
  `ensureUpdater(store)`/`store.updater` reuse we already added handles
  the case where another component created the UpdateManager first.
- Because the player now uses `rdf.storeFetcher`, sol-login's
  `_integrateWithRdflib()` patch (ctor + instance) reaches it.
  Authenticated GET/PUT/PATCH/DELETE come automatically on login, and
  revert on logout — no `authFetch` indirection, no Fetcher rebuild.

**Single-rdflib-instance requirement.** This only works if the player
and `core/rdf.js` resolve to the **same** rdflib module instance and
the **same** `rdf` singleton (term `instanceof` checks + the
store/Fetcher identity depend on it). Delivery options:

1. **Recommended:** the player imports `rdf` from the web-components
   `core/rdf.js` and is bundled so `rdflib` resolves once (esbuild
   dedupes a single `node_modules/rdflib`). One build, one rdflib, one
   `rdf` singleton.
2. The host page loads the web-components bundle first (which publishes
   `window.SolidLogic.store`/`.fetcher`); the player, at startup,
   adopts those (`rdf.useStore`-style) instead of creating its own.
   Looser coupling but two rdflib copies unless rdflib is also a shared
   global — fragile; only if option 1 is impractical.
3. **Standalone fallback:** when no shared `rdf`/`SolidLogic` is present
   (player run without the component stack / no auth), keep today's
   private store + Fetcher so the player still works offline/dev.

Plan targets option 1 with the option-3 fallback.

## Login → resolve the library via the type index

On `sol-login` (and on page-load re-init after the OIDC redirect, which
`<sol-login>.initialize()` handles via `handleIncomingRedirect`):

1. `webId = solLogin.webId`. Fetch the WebID profile document.
2. Read `solid:publicTypeIndex` (ns `http://www.w3.org/ns/solid/terms#`)
   from the profile.
3. Fetch the public type index. Look for a `solid:TypeRegistration`
   with `solid:forClass mo:Release`
   (`mo:` = `http://purl.org/ontology/mo/`).
4. **If found** — read its `solid:instance` (the `library.ttl` URL) (or
   `solid:instanceContainer` + a known filename). Point the player at
   that URL and run the existing multi-file load
   (`loadRDF` → follow `rdfs:seeAlso`). Done.
5. **If not found** — bootstrap (next section).

## Bootstrap (no `mo:Release` registration yet)

1. Discover the user's storage root: `space:storage`
   (`http://www.w3.org/ns/pim/space#`) or `pim:storage` from the
   profile. If absent, prompt the user to type a container URL.
2. **Ask the user where to store the library** (default = the storage
   root; let them pick/confirm a path).
3. In that location create an **`open-media-player/`** container, then
   PUT the core files into it (auth fetch, reuse the existing
   `putResource` helper):
   - `library.ttl` (the index with `rdfs:seeAlso` to the catalog files)
   - `ia-music-library/agents.ttl`, `genres.ttl`, `releases.ttl`
     (empty starters)
   - `ia-music-library/playlists/` container
   - **Decision needed:** "core files needed to run the player" — does
     this mean only the RDF data files (above), *or* also the app
     itself (the `dist/` bundle + an `index.html`) so the pod is a
     self-contained deployment the user can open directly? Recommend
     starting with **data files only**; treat app-deployment-to-pod as
     a follow-on (it's a distinct feature with its own questions —
     versioning, CORS, updates).
4. Create a `solid:TypeRegistration` in the public type index:
   `[] a solid:TypeRegistration ; solid:forClass mo:Release ;
   solid:instance <…/open-media-player/library.ttl> .`
   (PATCH the type index doc; create the type index + link it from the
   profile if the profile has no `solid:publicTypeIndex` — flag this
   sub-case, some pods ship one by default, some don't.)
5. Point the player at the new `library.ttl` and run the normal load.

## Not logged in + an action needs login

"Requires login" = a write to a pod that rejected the unauthenticated
request (the existing `checkSaved` already catches PATCH/PUT failures).
When that happens (or proactively, when the configured library URL is a
pod origin and there's no session), offer a choice dialog:

- **Log in** — open the `<sol-login>` flow; after redirect+resolve,
  retry the action against the pod.
- **Save in browser memory only** — keep running with the in-memory
  rdflib store; persistence is disabled. Show a persistent status-bar
  banner ("Not saved to your pod — changes are in this browser only").
  This is the current `checkSaved`-fails behavior, but *explicit and
  opt-in* rather than a silent error.

A small `requireSession()` gate wraps the write helpers' entry points
(addPlaylist, addTracksToPlaylist, updateTrackMeta, …): if the target
is a pod and no session, raise the choice dialog instead of letting the
PATCH fail.

## UI placement

`<sol-login>` button in the toolbar (top bar), right of the gear menu,
or as a gear-menu entry. Recommend the toolbar — login state should be
visible at a glance, not buried. It renders its own button + issuer
dropdown; pass a sensible default `issuers="https://solidcommunity.net,https://login.inrupt.com"`
(configurable).

## Open decisions — RESOLVED (see Status block for the locked answers)

The questions below are kept for context; all five plus the store-model
sub-decision were answered and implemented (single bundle / data-only /
reactive auth / create-index-behind-confirm / single tag / store model
A). Original text follows.

### (historical) Open decisions

1. **Build/delivery & the single-rdflib constraint** — the recommended
   path is one bundle where the player imports the web-components
   `core/rdf.js` and `<sol-login>`, with `rdflib` deduped to one
   instance (option 1 in "the critical piece"). Alternative: host page
   loads the prebuilt `solid-web-components.bundle.js`, player adopts
   `window.SolidLogic.store/.fetcher` at startup (option 2, looser but
   risks two rdflib copies). Which delivery model?
2. **"Core files"** — data-only bootstrap (recommended) vs. also copy
   the app (`dist` + html) into the pod folder?
3. **Login-state precedence** — when both a localStorage library config
   *and* a pod library (via type index) exist, which wins? Recommend:
   logged-in → pod library always; logged-out → localStorage/in-memory.
4. **Type index creation** — if the profile has no
   `solid:publicTypeIndex`, do we create one and link it into the
   profile (writes the WebID doc), or just refuse and ask the user to
   set one up? Recommend: create it (best UX), behind a confirm.
5. **`tag` usage** — `sol-login.fetchFor(url, tag)` supports multi-pod
   sessions by tag; do we need more than the default tag? Recommend:
   single default tag for v1.

## Store model (sub-decision) — RESOLVED: **A, implemented**

`core/rdf.js` exposes ONE global `rdf.store`. The player's multi-library
aggregation gives each enabled library its own store
(`libs[i].store`). Two ways to reconcile:

- **A. Shared store for the pod library only.** The pod/Solid library
  uses `rdf.store` + `rdf.storeFetcher` (so sol-login's auth patch
  covers it). Local/dev/extra libraries keep their own private
  `graph()` + `Fetcher` as today. Multi-library feature unchanged; only
  the pod library joins the singleton. Lower risk. **Recommended.**
- **B. Everything on the shared store.** Collapse all libraries onto
  `rdf.store`; rework the aggregation to namespace by library within one
  graph. Larger refactor, regression risk to a working feature, not
  required by the auth goal.

**Chosen: A, and implemented.** The shim resolves the shared `rdf`
(single rdflib via build alias); the Solid library path uses
`rdf.store`/`rdf.storeFetcher`; non-Solid libraries keep private stores.

## Steps + time estimates

| # | Step | Time | Status |
|---|---|---|---|
| 1 | Build integration: single rdflib + shared `rdf` shim; standalone fallback | 2h | ✅ done |
| 2 | `ia-rdf.js` Solid library on shared store/fetcher (model A); `loadRDF({shared})`; `ensureFetcher` authed; `ensureUpdater` reuse; `seeAlso` follow | 2.5h | ✅ done |
| 3 | `<sol-login>` bundled from source into the toolbar; events; player-driven `initialize()` incl. redirect return | 1h | ✅ done |
| 4 | Profile → `publicTypeIndex` → `forClass mo:Release` → `instance`; load from it | 2h | ✅ done |
| 5 | Bootstrap: list all storages + picker prompt; data-only starters via authed fetcher | 2.5h | ✅ done |
| 6 | Create/patch `solid:TypeRegistration` (+ create type index & link, behind confirm); resilient skip | 1.5h | ✅ done |
| 7 | OIDC redirect re-init (sol-login `initialize()`/`handleIncomingRedirect`) before resolving | 1h | ✅ done |
| 8 | `requireSession()` gate + "Log in / browser-memory-only" dialog + non-saved banner | 1.5h | ✅ done |
| 9 | Wire choice into `checkSaved` failure path; redo-after-login | 1h | ✅ done |
| 10 | Manual end-to-end against a real pod + fixes | 3h | ✅ done (CSS) |
| + | **Not in original plan:** in-place library swap (no `host.reload`, preserves sol-login session); never-persist `solid` config; `open-media-browser/`→`open-media-player/` rename + one-time migration + registration repoint; logged-out public read-only view (`omp:pod-library:last` + `solidAuthed` upgrade-on-login); bootstrap seeds `agents.ttl`/`genres.ttl` from local; `ia-login-help.html` + gear-menu entry | — | ✅ done |

All steps 1–10 implemented; 1–7 + 10 CSS-tested end-to-end, 8–9
implemented (reactive prompt — exercise by writing to a read-only pod).
The extra row covers fixes/standardisation discovered during testing.

## Risks

- **Single rdflib / single `rdf` singleton** is now the make-or-break
  item. If the player's rdflib and `core/rdf.js`'s rdflib are two
  module instances, the store/Fetcher aren't actually shared and
  sol-login's patch misses the player (back to square one), plus
  cross-instance term `instanceof` bugs. Mitigation: option-1 single
  bundle; a startup assertion that `rdf.store === window.SolidLogic?.store`
  (or that the player's Fetcher is the patched one) before trusting
  auth; standalone fallback otherwise.
- **Shared-store interop** — joining the global graph means other
  libraries (solid-logic/solid-ui) on the page share it. Fine for our
  subjects, but `UpdateManager` is per-store: rely on the existing
  `ensureUpdater(store)` reuse so we don't double-construct it.
- **OIDC redirect lifecycle** — the app reloads mid-login; library
  resolution must wait for `handleIncomingRedirect` to settle, else it
  loads unauthenticated and 401s.
- **Pod heterogeneity** — type index presence, storage discovery,
  container auto-creation, PATCH dialects all vary across NSS / CSS /
  ESS. Needs defensive fallbacks + clear errors (the `checkSaved`
  strictness already helps).
- **Profile writes** — creating a type index means PATCHing the WebID
  document; some users/pods restrict that. Behind a confirm; degrade to
  "pick a library URL manually" if it fails.
- **CORS / cross-origin** — pod origin ≠ app origin; the Inrupt fetch
  handles auth headers but the pod must allow the app origin. Document
  the requirement.

## Out of scope (future)

- Deploying the player app itself into the pod (self-hosting).
- Private type index / sharing / ACL management.
- Multi-pod (multi-`tag`) libraries.
- Importing the local **releases + playlists** into the pod. (Partial:
  bootstrap now seeds the **catalog** — `agents.ttl` + `genres.ttl` —
  from the local install; releases/playlists are not copied.)
