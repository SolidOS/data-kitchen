# dokieli: in-app, and shared auth via the ci capability broker

AS BUILT (2026-06-15). Two stacked pieces. Design notes live in
`~/.claude/plans/dokieli-in-app-shared-auth.md`.

## 1. dokieli runs in-app (drop the external dokie.li tab)

Before: `plugins/dokieli.ttl` was a `ui:Link` → `https://dokie.li/`, which in the
desktop app opens as a separate native `WebContentsView` (own login, own store).

Now: dokieli is a `ui:Component` mounting **`dk-dokieli`**, a subclass of
`dk-solidos` (`plugins/solidos/dk-dokieli.js`). It reuses the isolated, authed
SolidOS host (same-origin iframe → `solidos-host.html` → mashlib), lands on
`<origin>/dk-pod/dokieli/`, and adds a "New dokieli document" button. Creation
goes through mashlib's bundled **dokieli pane** (`solid-panes/dist/dokieli/`,
`window.panes.byName('Dokieli').mintNew`), which PUTs the HTML through the
shared authed fetcher — so create/open ride dk's login + store. `solidos-host.html`
gained `window.newDokieli(folder, name)` (mint → `gotoSubject`) and a `?new=`
param. `dk-solidos` gained subclass hooks `_landingSubject()` / `_mountExtras()`.

- Differentiation is a **separate element**, NOT a `source=`/`mode=` attribute —
  the tab-shell already reads a panel's `source` for plugin-id/help/settings
  (`src/dk-tabs-shell.js`), so `source` can't double as a mode/landing signal.
- The dokieli **editor runtime** (`dokieli.js` + CSS) still loads from the
  dokie.li CDN; only the pod reads/writes share auth. (User decision.)
- `humanReadablePane` shows the dokieli doc in a **same-origin iframe**
  (`sandbox="allow-scripts allow-same-origin allow-forms"`), nested:
  main → solidos-host iframe → doc iframe.

Files: `plugins/dokieli.ttl` (Link→Component), `plugins/solidos/dk-dokieli.js`
(new), `plugins/solidos/dk-solidos.js` (hooks + export + comment fix),
`plugins/solidos/solidos-host.html` (`newDokieli`), `src/dk-shell.js` (import),
`src/dk-styles.css`, `ui-data/data-kitchen-plugins-catalog.ttl` (regen).

## 2. Shared auth, declaratively, via component-interop

Goal: make dokieli treat you as the owner **without its own login prompt**, the
way SolidOS does (SolidOS works because `solidos-host` overlays mashlib's own
session object; dokieli is third-party CDN code with its own OIDC, so it prompts).

Done through **component-interop's capability broker** (it's a manifest-driven
broker, not just a loader — `node_modules/component-interop` →
`~/Dropbox/Web/solid/component-interop`; vocab `ci:` =
`jeff-zucker.github.io/component-interop/ns#`). A library `provides` an object
(`service`/`respondTo` + `sendValue`); another `consumes` it (`call` a handler a
module registered via `registerConsumer`); the page opts in per channel via
`data-objects="key:provider"`. `objects` are explicitly for sharing an
`authenticatedFetch`/`store` (see `component-interop/examples/auth.html`).

The contract:
- `dk.manifest.json` → `provides: { webid: { respondTo:"sol-login",
  sendValue:"detail.webId" } }` — sourced (no new code) from the `sol-login`
  event `src/dk-owner-session.js` already fires with the owner WebID.
- `dokieli.manifest.json` (new) → `consumes: { webid: { call:"adoptDokieliUser",
  module:"/dk-pod/dk/plugins/solidos/dokieli-adapter.js", from:"data-kitchen" } }`.
  (Provider and consumer must be **different** manifests — the broker excludes a
  library's own provides.)
- `index.html` → `data-objects="webid:data-kitchen"` + the new manifest in
  `data-manifest`.
- `plugins/solidos/dokieli-adapter.js` (new) — the only code. The broker hands
  it the owner WebID; it sweeps the same-origin frame tree and sets
  `window.DO.C.User.IRI = webId` **only when unset** (so a real login still wins).
  dokieli keeps its user there and only prompts when it's empty, so pre-seeding it
  makes dokieli adopt the identity and skip login; writes ride dk's gate cookie
  (allow-all pod), so no OIDC token is needed.

The adapter is the irreducible bit (dokieli isn't ci-aware). Its core —
"adopt a host-provided WebID" — is what could later be a `DO.U.setUser()` **PR to
dokieli**, after which the adapter swaps the `DO.C.User.IRI` poke for that public
call (kills the CDN-drift fragility).

Files (in **both** pod `~/solid/dk-pod/dk/…` + `~/solid/index.html` AND repo):
`dk.manifest.json`, `dokieli.manifest.json` (new), `index.html`,
`plugins/solidos/dokieli-adapter.js` (new), `electron-config/seed.cjs` (seed list).

## Status / open

- **Built, not yet verified in the live app.** v1 adapter is a 150 ms poll that
  pre-seeds the WebID in the gap between dokieli publishing `window.DO` and its
  load-time auth init. If a login prompt still flashes (timing miss) or editing
  isn't enabled until reload, upgrade to a `defineProperty` trap on the iframe's
  `DO` (set the instant dokieli publishes it) and/or a safe UI-refresh nudge.
- No build needed (adapter loads at runtime via the broker; manifests +
  `index.html` are pod-served) — **reload the app window** to pick it up.
- Cosmetic: the pod plugins **catalog** still lists `<#dokieli>` as `ui:Link`
  (stale derived index); the live `dokieli.ttl` manifest is already `ui:Component`,
  which is what mounts it. Regenerate the catalog for palette consistency.
