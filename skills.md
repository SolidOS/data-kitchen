# Data Kitchen — project skills

What a future Claude session needs to know about Data Kitchen (dk) and its two
key dependencies, sol-components (sc) and component-interop (ci). Current state,
not history. Pairs with the (gitignored) `jeff-skills.md` for how to work with
the user.

## What dk is

An Electron "pod-in-a-box": it bundles a Solid server (Pivot/CSS, mashlib 2.2.2),
a CORS proxy, and an **RDF-first shell** for Solid & federated apps. v2.0.0, ESM.
Consolidated from three former repos (electron, old data-kitchen,
open_media_player). The UI is fully customizable through forms — menus, buttons,
and plugins are described in RDF, not hard-coded.

## The three layers & where they live

- **dk** — `/home/jeff/Dropbox/Web/solid/data-kitchen` (also `~/s`, a symlink).
  Remote: `github.com/SolidOS/data-kitchen` (push needs an explicit per-task go).
- **sc — sol-components** (v2.4.3 in `../sol-components`; npm latest 2.4.1 until republished) — `../sol-components`,
  symlinked into `node_modules/`. ~40 `sol-*` web components (web/), Node tools
  (node/), shared core (core/). **dk loads the raw `web/*.js`** — a component
  edit needs only a reload, no build. dk's own `src/` does need `npm run build`.
- **ci — component-interop** (v0.3.0, NOT on npm) — `../component-interop`,
  symlinked into `node_modules/`. Single-file zero-dep broker + loader.

> Solid stack order is always foundational → higher-level:
> **rdflib → solid-logic → solid-ui**. Never reverse it.

## RDF-first shell

The UI renders from `.ttl` in `ui-data/`:
- `data-kitchen-main-menu.ttl#Tabs` — the tabs/menu tree (also `#Bar`, `#Chrome`)
- `data-kitchen-hamburger-menu.ttl` — Help / Settings / Customize actions
- `data-kitchen-plugins-catalog.ttl` — every available plugin (Customize source)
- `data-kitchen-settings.ttl`, `data-kitchen-startup-config.shacl`

Flow: `src/dk-tabs-rdf.js` builds Bar/Chrome launchers from the RDF at load and
re-renders on Customize save. The Customize page PUTs RDF back to the pod
(**single-write invariant — RDF is the only source**); a reload renders the fresh
state. `npm run rdf2html`/`html2rdf` convert the menu both ways.

**Boot sequence** (index.html, which is wormhole-guarded against recursive
framing): **component-interop** (parser-blocking; parses manifests, injects
the importmap, imports the `data-components`) → `dist/dk.bundle.js` (a direct
module that waits on `ComponentInterop.ready`, then imports the dk modules).
The inrupt auth library is published onto `window.solidClientAuthn` by a small
`<script type=module>` from sol-components' ESM build
(`dist/vendor/@inrupt-solid-client-authn-browser.js`) — consumed lazily at
session creation, so no separate UMD bundle is vendored.

## component-interop = a capability broker (not just a loader)

ci is manifest-driven and wires independently-authored component libraries
together at runtime. Manifests declare **components** (placeable custom elements),
**attributes** (`data-*`), and **objects** with `provides` / `consumes` /
`accepts` — shared capabilities like `auth` (authenticatedFetch), `store` (RDF
store), and `webid`.

dk uses this for shared auth: `dk.manifest.json` **provides** `webid` (from the
`sol-login` event); `dokieli.manifest.json` **consumes** it via
`dokieli-adapter.js`. Result: the dk pod browser, SolidOS, and dokieli all sign
in once. index.html names manifests + components + objects via `data-manifest`,
`data-components`, `data-objects`, `data-stage="auto"`.

The manifest shape is published and validates (ci 0.3.0: `context.jsonld` +
`ns#` vocab + `shapes/manifest.shaclc` / `.ttl`). The `ci:` namespace
(jeff-zucker.github.io/component-interop) is authoritative.

## Plugin system

A plugin is either:
- **`ui:Link`** — an external app. Needs `ui:href`; opens in a native reader
  overlay (see "External content" below).
- **`ui:Component`** — an in-app custom element. Needs `ui:name`; mounts in a tab
  pane. Attributes via `ui:attribute [ schema:name … ; schema:value … ]`.

Manifests are `.ttl` files in `plugins/`. Complex dk-own plugins get a subdirectory
plus a `manifest.jsonld` (podz, solidos, ia-player, news). A component is
"manifested" when it has an object-form ci entry (label / icon / shape / help).
Icons are **live favicon URLs** — the renderer paints a URL as `<img>` and an emoji
as text. Per-plugin settings are RDF-driven and gated on the plugin being in a menu
(`src/dk-plugin-settings.js`). **LIBRARY-FIRST:** for an sc component the settings
`shape` + default `data` doc come from **sc's manifest**
(`ComponentInterop.manifest.meta`, keyed by `ui:name` — or by `data-handler` when
the menu item is a launcher like `sol-button`); the form edits the deployment's own
`source` doc (subject = its `#fragment` or `foaf:primaryTopic`). `sol-time`,
`sol-weather`, `sol-calendar`, `sol-search` are migrated this way — **no per-plugin
`manifest.jsonld`**; only dk-own plugins still carry one (read via the fallback).

**Calendar is sc, not dk:** the bar item is `<sol-button data-handler="sol-calendar"
region=ui:Dropdown source=…>` — one click conjures a `sol-dropdown` surface (sibling
of `sol-modal`/`sol-window` in `core/display-target.js`) hosting `<sol-calendar
hide-header>`. `ui:Dropdown` is a `ui:Region` (ui-vocab); the old `dk-calendar-popout`
wrapper is **deleted**. The same `region=ui:Dropdown` pattern works for any widget.

**A chip = a PLUGIN (manifest entry), not a component.** One `ui:name` tag backs
many chips (ia-player → Music & Movies; dk-solidos → browser, AddressBook, Tasks,
Chat, Notes, Meeting). The Customize pantry (`sol-plugin-manager`) subtracts
plugins already in the menu/bar by chip identity = `dct:source` (manifest), with
a tag + `source`-attribute fallback for legacy items — never the bare tag, and
never the render attributes (`id`/`class`/`title`/`defer`/…) a menu adds. Keep a
plugin's `source` attribute identical in the catalog and the menu (all
`./dk-pod/dk/plugins/…`) or it double-lists. The catalog is generated from
`plugins/*.ttl` by `tools/seed-plugins-catalog.mjs --preserve-symlinks`;
`dct:subject` → its category. A labelled loaded component with no catalog entry
appears as a ghost under "Other".

## Key plugins

- **dk-podz** (`plugins/podz/`) — the Data Kitchen Pod Browser; keep-alive
  (one persistent instance). Messaging: panel-level errors (auth, load, copy/undo
  failures) render **in the affected pod's panel** via `sol-pod.showMessage` (the
  same surface as the no-auth notice); transient operation feedback uses a
  top-centre auto-dismiss popup (`podz-ui.js` `setStatus`, appended into `.app`).
  There is **no bottom status line**.
- **dk-solidos** (`plugins/solidos/`) — SolidOS via a thin same-origin iframe
  (`sol-solidos-host.html`, created by `dk-solidos.js`) running the fixed upstream
  `<sol-solidos>` on mashlib 2.2.2; mash.css is scoped inside the iframe (zero leak).
  **Folders MUST be fetched as turtle** (the server serves `/` as the app under
  text/html); the host's `GotoSubject` guard diverts both `/` and `/index.html` to
  `/dk-pod/` (wormhole guard), and shows a loading spinner until content renders.
  The browser def sets `has-location-bar` → `?bar=1` → a sticky location bar
  (Home / Back / URL box + a **Locations ▾** dropdown of discovered pods). The bar
  is `z-index:120` and `sol-solidos._fitBar` drops mashlib's `position:fixed` banner
  below it (else the banner paints over the bar). Locations come from the shared pod
  registry (`core/pod-registry.js`): `dk-solidos` subscribes to it and discovers on
  open + login (same `discoverOwnerWebIds → getStoragesFromWebIds` path as sol-pod),
  forwarding the list into the iframe via `window.solSetLocations`.
- **dk-dokieli** (`plugins/solidos/dk-dokieli.js`) — a standalone direct editor
  (loads the doc `.html` directly, no SolidOS browser); identity/auth via
  `dokieli-adapter.js`. Shows a spinner overlay until the doc iframe loads.
- **ia-player** (from the `open-media-player` package — sibling working tree in
  dev via the `node_modules/open-media-player` symlink; sources in its
  `src/ia-player/`, rebuild ITS bundle with `npm run build` there after edits) —
  Internet Archive music player, with a
  **local import** path (gear ▸ "Import music folder…"): the Electron main process
  scans a chosen folder (`import-music.mjs`, `music-metadata`) and the renderer
  authors a "My Music" RDF library (`import-id3-build.js`, a pure/SHACL-tested
  builder) whose `mo:item` points `file://` at the **originals in place** (never
  copied); embedded art → `foaf:depiction`. Local audio plays via the `dkfile:`
  scheme (see electron-config README). Imported libraries persist across restart
  via an RDF registry `libraries/imported.ttl` (read at boot by
  `loadImportedLibraryConfigs`). A catalog Agent with no `dcat:landingPage` is
  treated as local data (`ia-rdf.js`), so its albums/tracks resolve from the store,
  not an archive.org search.

## Pod / server / auth model

- `POD_ROOT` = `~/solid/`; the home pod is `~/solid/dk-pod`, served at `/dk-pod/`;
  dk content lives under `/dk-pod/dk/`. **Don't run with
  `DK_POD_ROOT=~/solid/dk-pod`** — it causes nesting. Root is served as the app.
- The bundled server runs **ALLOW-ALL: WebACL is NOT enforced**. `.acl` files are
  inert — don't reason from their contents. The owner WebID is a synthetic
  identity only. The real security boundary is **the gate** (below). Three
  hardened Electron sessions: default (app + login), trusted-guest (deliberate
  external apps, public port only), external (readers, no loopback).
- `bin/dk-curl` reads/writes the pod from the CLI (attaches the gate token).

### The gate (`electron-config/gate.cjs`) — the real security boundary

The bundled servers (Pivot/CSS + CORS proxy) are no-auth and loopback-bound, so
the only attacker left is another local browser page. The gate blocks that with a
per-install secret (`DK_GATE_TOKEN`, generated by `servers.cjs`). A request passes
if it carries the secret via: header `x-dk-token` (the Electron shell injects this
on app traffic), cookie `dk-token`, query `?dk-token=…` (the "blessing" flow →
sets a `SameSite=Strict` cookie and redirects, stripping the param), or
(proxy only) an allow-listed Origin/Referer. Deliberate public exceptions pass
un-gated so external Solid login works: OIDC discovery/provider
(`/.well-known/openid-configuration`, `/.oidc/`) and any `GET …/profile/card`
(public WebID docs). Everything else → bare 401, no CORS. **No token → gate off**
(standalone dev runs stay open). `bin/dk-curl` attaches the token automatically.

**"Open dk in Browser" uses a leak-free bless (2026-07):** rather than putting the
durable `?dk-token=<secret>` in the URL (which leaks into browser history), the menu
hands off `?dk-bless=<ts>.<hmac>` — a stateless, time-limited HMAC of the token
(`gate.cjs` `blessNonce`/`validBless`); the gate recomputes it from the token it holds.

### More security surface (2026-07 review)

- **App-shell CSP (`router/index.cjs` `serveShell`):** the shell (`/`, `/index.html`)
  is served with a per-response nonce stamped on every `<script>` + a matching
  nonce-based CSP. `component-interop` propagates that nonce to the importmap it
  injects. So a `<script>` written into a pod doc (via `sol-include … trusted`) has no
  nonce and is **blocked** — the backstop for pod-HTML injection.
- **CORS proxy SSRF guard + shared server core:** `server-core.cjs` (repo root, shared
  by the desktop `router/`+`proxy/` AND the mobile `nodejs-src/` forks via a symlink)
  holds `isEnginePath`/`serveEngine`/`proxyToCss`/`forwardUpgrade` + the SSRF guard
  (`assertProxyTarget` — refuses non-http(s)/loopback/private/metadata, per redirect
  hop; opt-in `DK_PROXY_ALLOW_HOSTS`).
- **`dkfile:` is allow-listed:** it (and `dk:read-cover`) only serve files under a
  folder the user imported via "Import music" (`electron-config/library-roots.cjs`,
  persisted) — no more arbitrary local-file read via a crafted `mo:item file://`.

### `dk-pod` / `!secret` — third-party login account

dk itself uses a **synthetic owner session** (`src/dk-owner-session.js`) and
needs no real account. But a **third-party** Solid app runs its OWN
solid-client-authn against this origin, which requires a genuine OIDC login — an
account with a password that owns the WebID. `electron-config/seed-account.cjs`
provisions exactly that on first launch: account `me@dk.local` /
password **`!secret`**, linked to the existing
`<publicOrigin>/dk-pod/profile/card#me` WebID. `!secret` **is not a real secret**
— the gate is the access control; the password just lets the standard CSS login
form complete so an external app can authenticate and come back as the pod owner.
(Linking is fiddly because `/dk-pod/` already exists, so the seeder drives the CSS
account HTTP API and satisfies the ownership challenge by briefly writing the
challenge triple into the on-disk profile, then restoring it; idempotent.)

### "Remember this IdP" — durable, headless per-issuer login

A signed-in CSS issuer can be REMEMBERED so later visits sign in with no popup.
Secrets stay in Electron **main**; the renderer only ever names an issuer and gets
back a proxied fetch.
- **Remember** (one-time): after a real interactive login, `src/dk-issuers-feed.js`
  (renderer) calls `dkElectron.offerRemember(issuer)`; main confirms it's a CSS
  account API and opens a dedicated password window (`remember-idp-window.html`).
  The password is used ONCE to mint a revocable client-credential
  (`idp-grant.cjs`) and discarded — only `{clientId, secret, webId, tokenEndpoint}`
  is kept, encrypted per-issuer with Electron `safeStorage` in `idp-vault.cjs`
  (`<userData>/idp-credentials.json`, never in the pod). The local pod is auto-minted
  on boot (`autoMintLocal`, known owner creds).
- **Silent re-login**: `dk-issuers-feed.js` wraps every `<sol-login>.login()`; for a
  remembered origin it calls `dkElectron.silentLogin()` → main runs a headless DPoP
  `client_credentials` grant (`createGrantSession`) and registers a
  `createMainProxySession` (`src/dk-idp-proxy-session.js`) under the element's side
  in the shared `AuthManager`. Each `.fetch()` is proxied over IPC (`dk:idp-fetch`)
  so the token / DPoP key never leave main. The hook then repaints the button
  (`el._updateUI()`) and wires rdflib (`el._integrateWithRdflib()`), and main shows a
  brief "Logging in automatically…" window (`auto-login-window.html`) for the grant.
- Issuers come from SETTINGS (`data-kitchen-settings.ttl#Settings solid:oidcIssuer`),
  never hardcoded. Pods use `login-mode="popup"`; the popup callback
  (sc `web/popup-auth-callback.html`) carries the chosen issuer through the IdP
  round-trip via per-window `sessionStorage` — inrupt's `session.info` has **no
  `issuer`** field, so without this the post-login remember-offer never fires.
- **`dist/` is gitignored** — after pulling renderer (`src/`) changes you MUST
  `npm run build`, or the app silently runs a stale bundle without the feature.

## The two-copies rule (IMPORTANT)

dk content (`ui-data/`, `pages/`, `plugins/`) exists as **two separate, unlinked
copies**: the **repo** (git, this tree) and the **pod**
(`~/solid/dk-pod/dk`, not a git repo). **Edit BOTH.** Symlinked deps (sc) are a
single edit. For now the **pod is the source of truth**; the distro/repo is
reconciled later — act on the pod without sync caveats.

## Build / run / verify

- `npm start` — launch the Electron app.
- `npm run serve` — static server on :8081 (used by smoke-tests).
- `npm run watch` / `npm run build` — esbuild `dist/dk.bundle.js`.
- `npm run start-css` — Pivot server on :8000 for dev.
- **Packaging desktop apps** (`electron-builder`, output → `release/`): `npm run
  dist` builds the **host** OS's full targets (Linux AppImage/deb/rpm, Win
  nsis+portable, Mac dmg+zip). `npm run dist:cross` builds **all three from Linux,
  wine-free** — Linux AppImage + Mac `.zip` (a `.app`) + Win `.zip` (runnable
  app); cross-built apps are **unsigned**. Artifacts are
  `Solid_Data_Kitchen-<ver>-<os>-<arch>.<ext>` (the `${os}-${arch}` token keeps
  the Win/Mac zips from colliding). Linux caveats: the Mac **dmg** needs the
  macOS-only `dmg-license` (use the zip), and the Win **nsis/portable installers**
  need `wine` (the zip needs none — `win.signAndEditExecutable:false` skips the
  wine-only rcedit step). Real installers + signing build on their native OS / CI.
  iOS isn't wired (the vendored `node_flutter` is Android-only — see `mobile/`).
- `npm test` — the test suite (native `node --test`, like ci; **no app needed**):
  `test/unit/` (gate.cjs, favourites store), `test/data/` (RDF contracts —
  plugin Link/Component, catalog↔manifest sync, menu invariants, manifest.jsonld,
  SHACL via `rdf-validate-shacl`), `test/roundtrip/` (rdf2html/html2rdf
  idempotence, auto-skips without chromium), `test/integration/` (boots
  router/proxy, drives the gate). `npm run test:e2e` drives the real shell
  (needs the app or pod+servers). See `test/README.md`. **Gotcha:** `npm install`
  rewrites the lockfile to the *registry* sc/ci and clobbers the local symlinks —
  re-link `node_modules/{sol-components,component-interop}` → `../../<pkg>` after.
- **Verify by driving the running app and measuring** (`claude/smoke-tests/`,
  Playwright) — don't theorize from CSS. "Works" must mean the UI actually
  painted (a real render root / visible content), not that an HTTP request
  returned. Some external catalog pods (`*.solidcommunity.au`) are
  Flutter/CanvasKit needing WebGL and load as empty shells under headless probes.

## External content

Electron opens external URLs via `window.open` → a **native WebContentsView**,
not iframes (avoids X-Frame-Options errors). Keep-alive external content uses an
iframe-pane shadow driven by the tabs — the shadow iframe is blanked to
`about:blank` so the cross-origin page only ever runs in the native view, never
in the app's gate-token session.

`sol-feed` articles work the same way (no stripped-iframe reader): the reading
pane carries the URL on `data-article-url`; dk's preload reads it via sol-feed's
open shadow root and paints a **locked-session** (`persist:external`)
`WebContentsView` over the pane's box. The live page runs its own JS, so a
Cloudflare/JS gate clears. The bundled CORS proxy therefore **no longer rewrites
HTML** — it only relays cross-origin feed XML/RDF/images the browser would block.

## Remember this IdP (durable headless login)

Picking a previously-remembered issuer from the sign-in list logs in with **no
popup**. Two tiers:

- **Tier 2 (durable, CSS issuers — the local pod + solidcommunity.net, both CSS):**
  main mints a CSS client-credential (the `/.account/` API) once and keeps it
  encrypted with Electron `safeStorage` in `<userData>/idp-credentials.json` (0600).
  Later clicks run a headless DPoP `client_credentials` grant
  (`electron-config/idp-grant.cjs`, via `jose`) — no browser, **no Authorize
  screen**. The raw password is **never** stored. All secrets stay in the MAIN
  process; the renderer only ever gets a proxied `fetch` (IPC `dk:idp-fetch` →
  `src/dk-idp-proxy-session.js`), never a token or key.
- **Tier 1 (non-CSS issuers):** the `sol-components` popup attempts
  `restorePreviousSession` (`prompt=none`) before the interactive login — silent
  while the refresh/IdP session lasts, else it falls back. May still hit the IdP's
  Authorize screen. (sol-components change → **npm republish**.)

Triggers: the **local pod auto-mints at startup** (owner account `me@dk.local` /
`!secret`, zero prompt). A **remote CSS issuer is offered "Remember this sign-in?"**
right after the first interactive login (`dk:offer-remember` → a dedicated password
`BrowserWindow`, `electron-config/remember-idp-window.html`); the password reaches
only main, is used to mint, and is discarded. The issuer-click hook is **dk-local**
(`src/dk-issuers-feed.js` wraps each `<sol-login>.login()`). Forgetting a local
issuer revokes it server-side; a remote one drops only the local copy (revoking
needs the password, which is never kept). The DPoP grant is verified against real
CSS 7.1.9 by `claude/smoke-tests/grant-smoke.mjs`; the in-Electron UI flow is not
yet live-verified. Files: `electron-config/{idp-vault,idp-grant,remember-idp-preload}.cjs`,
`remember-idp-window.html`, plus `main.cjs` (IPC + auto-mint) and `preload.cjs`.

## Conventions & repo facts

- `claude/` holds Claude-authored artifacts (plans, smoke-tests, validation,
  migration-scripts) and is gitignored; the user's own notes and the app source
  stay where they are.
- Vocabularies `ui:` (`ui-vocab.ttl`, upstreamed to W3C `ui:`) and `ci:` are
  **authoritative** — don't flag them in RDF audits. A genuinely new term needs
  an explicit OK and goes in `ui-vocab`. (See `jeff-skills.md`: never introduce
  an RDF term or HTML attribute on your own initiative.)
