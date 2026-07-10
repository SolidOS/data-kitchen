# Data Kitchen — project skills

What a future Claude session needs to know about Data Kitchen (dk) and its two
key dependencies, sol-components (sc) and component-interop (ci). Current state,
not history. Pairs with the (gitignored) `jeff-skills.md` for how to work with
the user.

## What dk is

An Electron "pod-in-a-box": it bundles a Solid server (Pivot/CSS, mashlib 2.2.2),
a CORS proxy, and an **RDF-first shell** for Solid & federated apps. v2.1.4, ESM.
Consolidated from three former repos (electron, old data-kitchen,
open_media_player). The UI is fully customizable through forms — menus, buttons,
and plugins are described in RDF, not hard-coded.

## The three layers & where they live

- **dk** — `/home/jeff/Dropbox/Web/solid/data-kitchen` (also `~/s`, a symlink).
  Remote: `github.com/SolidOS/data-kitchen` (push needs an explicit per-task go).
- **sc — sol-components** (v2.7.2 in-tree — npm still has 2.7.1 (2026-07-08);
  the 2.7.2 publish is OWED, needs Jeff's OTP) — `../sol-components`,
  symlinked into `node_modules/`. ~40 `sol-*` web components (web/), Node tools
  (node/), shared core (core/). **dk loads the raw `web/*.js`** — a component
  edit needs only a reload, no build. dk's own `src/` does need `npm run build`.
- **ci — component-interop** (v0.5.0, published on npm) — `../component-interop`,
  symlinked into `node_modules/`. Single-file zero-dep broker + loader.

> Solid stack order is always foundational → higher-level:
> **rdflib → solid-logic → solid-ui**. Never reverse it.

## RDF-first shell

The UI renders from `.ttl` in `ui-data/`:
- `data-kitchen-main-menu.ttl#Tabs` — the tabs/menu tree (also `#Bar`, `#Chrome`)
- `data-kitchen-hamburger-menu.ttl` — the ☰ menu: Customize (plugin chooser
  only), Settings (direct item since 2026-07-06), Theme, Text size, Restart dk.
  (Sign in… / View as guest / Reload dk removed 2026-07-06; their commands
  survive in dk-tabs-shell. Settings previously hid under Customize ▸
  Preferences — `pages/customize.html` is now a single-subtab tabset, and
  sol-tabs auto-hides the bar for one tab.)
- `data-kitchen-plugins-catalog.ttl` — every available plugin (Customize source)
- `data-kitchen-settings.ttl`, `data-kitchen-startup-config.shacl`

Flow: `src/dk-tabs-rdf.js` builds Bar/Chrome launchers from the RDF at load and
re-renders on Customize save. The Customize page PUTs RDF back to the pod
(**single-write invariant — RDF is the only source**); a reload renders the fresh
state. `npm run rdf2html`/`html2rdf` convert the menu both ways.

**Chrome mini-player** (`src/dk-tabs-shell.js`): shows whenever the music
panel's audio has a src AND the music view is not the one on screen. Visibility
is decided by layout (`panelEl('music').offsetParent !== null`), NOT the
`current` panel tracker — `current` only updates when the picked item carries a
`panel-*` id, which only the media plugins do, so keying on it hid the mini on
every non-media item (fixed 2026-07-05). **Hidden on the PHONE entirely**
(Jeff 2026-07-09; `dk-chrome.css` coarse-pointer block — its sticky-bar
styling and padding reservation are gone too; desktop keeps it).

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

The manifest shape is published and validates (ci ≥0.5.0: `context.jsonld` +
`ns#` vocab + `shapes/manifest.shaclc` / `.ttl`). Since ci 0.5.0 / sc 2.7.0
the manifest shape covers only the ENVELOPE; the shared item shapes
(ui:Component / ui:Link — menus, palette cards, and manifest entries are all
the same shapes) live in sol-components `shapes/menu.shacl`, and validators
compose the two files (see test/data/menu-shacl.test.mjs). A manifest entry
may be a ui:Link as well as a ui:Component. The `ci:` namespace
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
never the render attributes (`id`/`class`/`title`/`defer`/…) a menu adds.
**Since 2026-07-05 every menu/bar item carries `dct:source plu:<manifest>.ttl`**
(pod + repo menus; `menu-serialize` snapshots and re-attaches it across Customize
saves), so the param-path-form fallback no longer decides anything — when adding
a menu item, give it its `dct:source` or it may double-list (label mismatches
like "News" vs "News (three-panel feeds)" defeat label-based tooling). The
catalog is generated from `plugins/*.ttl` by `tools/seed-plugins-catalog.mjs
--preserve-symlinks`; `dct:subject` → its category. A labelled loaded component
with no catalog entry appears as a ghost under "Other". **Topic tabs always
render** — a topic whose plugins are all in use shows an "empty — every plugin
in this topic is already on a menu or bar" hint instead of vanishing (only the
synthetic "Other" hides when empty). Audit tool:
`claude/validation/audit-double-listed.mjs` replays the exact in-use matching
rules against the pod data and lists any double-listed cards.

## Key plugins

- **dk-podz** (`plugins/podz/`) — the Data Kitchen Pod Browser; keep-alive
  (one persistent instance). Messaging: panel-level errors (auth, load, copy/undo
  failures) render **in the affected pod's panel** via `sol-pod.showMessage` (the
  same surface as the no-auth notice); transient operation feedback uses a
  top-centre auto-dismiss popup (`podz-ui.js` `setStatus`, appended into `.app`).
  There is **no bottom status line**.
  Layout (since 2026-07-05): **single-panel default** — one browser at a fixed
  px width (default 420, `#left-panel`), pod-ops open **inline** in `#ops-panel`
  on the right (fresh `<sol-pod-ops>` per activation via sol-pod's public
  `podClickAction` hook; Esc/✕ close + focus-restore; `sol-navigate` closes +
  reloads). The ◫◫ footer toggle (`_setMode`) switches to the classic
  **dual-browser** view where `podClickAction = null` so the ops **modal**
  returns; collapse buttons are dual-only. Splitter branches by mode: px model
  in single (drag / dblclick+Home reset 420 / arrows ±16 Shift ±48, inert while
  ops empty), untouched ratio model in dual. Persistence: `mode` +
  `singleLeftWidth` ride the existing `podz_v4` layout blob (absent mode ⇒
  single). No sol-components changes (one private call:
  `pod._persistEditorKeys?.()`). Probe:
  `claude/smoke-tests/verify-podz-single-panel.mjs` (27 checks, needs the app
  running with `--remote-debugging-port=9222`).
- **SolidOS app containers live under `dk-pod/solidos-apps/`** (Jeff,
  2026-07-09, dk 24cc2f7): chat, contacts, meetings, notes, tasks, dokieli
  (+ dokieli's `scripts/` and `media/` satellites). In lockstep everywhere:
  `pod-template/solidos-apps/…` (fresh pods are born with it), the five
  menu/catalog `source` paths, the type indexes
  (public → `solidos-apps/contacts`, private → `solidos-apps/tasks/main`),
  and `dk-dokieli.js _folder` (BUNDLED — rebuild). Deleted from the live pod
  the same day: `friends$.ttl` (Solidflix stub), the movies containers + their
  privateTypeIndex registrations, and a stray root dokieli doc;
  `test-resources/` kept. Pre-move backup:
  `claude/backups/dk-pod-pre-solidos-apps-move-2026-07-09.tgz`. GOTCHA: CSS
  won't DELETE non-empty containers — recursive LDP walk must resolve EVERY
  `<iri>` in the container doc (naive `ldp:contains` regexes miss members).
- **SolidOS pane data contracts** (bit dk 2026-07-05): the pod seeds under
  `pod-template/` (and the live pod's copies) must carry the structure the
  SolidOS panes hard-require, mirroring what the panes write on create —
  a notepad needs the `pad:next` linked list (self-loop = canonical empty pad;
  missing → "Inconsistent data … No initial next pointer"), a meeting needs
  `meeting:toolList ( <the meeting itself> )` (missing → TypeError on
  `.elements`); a tracker needs `a wf:Tracker`. Fix in BOTH
  `pod-template/solidos-apps/{meetings,notes}/index.ttl` and
  `~/solid/dk-pod/solidos-apps/{…}`.
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
- **Pod locations persist in RDF (2026-07-10):** the pod list behind every pod
  selector lives as `#Locations` in `ui-data/data-kitchen-settings.ttl` — a
  `schema:ItemList` of `schema:ListItem` entries (`schema:item` storage URL,
  optional `schema:name` label, REQUIRED integer `schema:position`; shape:
  sc `shapes/pod-locations.shacl` + generated `.shaclc` twin, model authored
  by Jeff). Edited on the Settings page by a shape-driven `<sol-form>` rolodex
  (`ui:sortedBy schema:position` → ↑/↓ arrows swap positions; Add mints the
  membership triple + `schema:ListItem` type + next position).
  `src/dk-locations-feed.js` is the two-way bridge: boot seeds the registry in
  position order (silent) BEFORE podz/dk-solidos import; `sol-form-save` on the
  settings doc re-syncs; NON-silent registry changes (discovery, user-added
  pods) auto-persist back as new entries. podz's localStorage `sessionPods`
  persistence is RETIRED (dk-boot one-shot `-v3` wipes the stale field; the
  `podz_v4` blob keeps layout/selection/prefs). Ordering caveat: a reorder in
  the form reaches the dropdowns on the next app start (the registry has no
  reorder primitive). Diagnostic handle: `window.dkPodRegistry`. Demo: sc
  `examples/pod-locations.html` (form + RDF + SHACL + shaclc, verified
  headless). Probe: `claude/smoke-tests/cdp-verify-pod-locations.mjs`
  (snapshots + restores the settings doc — rerunnable).
- **sol-form editability model (2026-07-10, Jeff's rule):** every
  `<sol-form>` WITHOUT the `no-edit` attribute is fully editable — fields,
  Add/Delete, record search, reorder — everywhere, plain web included.
  Whether an edit persists is the SERVER's call (write access), not the
  form's. The old gates are gone: the `editable` attribute is no longer read
  and `kitchenLoggedIn()` no longer participates. Shape+subject container
  rolodexes (search engines, pod locations) got Add/Delete this way; their
  Add writes the container membership triple + the `sh:class` type + the
  next `ui:sortedBy` position (`buildAddInserts`, exported for tests).
- **dk-dokieli** (`plugins/solidos/dk-dokieli.js`) — a standalone direct editor
  (loads the doc `.html` directly, no SolidOS browser); identity/auth via
  `dokieli-adapter.js`. Shows a spinner overlay until the doc iframe loads.
- **ia-player** (from the `open-media-player` package — sibling working tree in
  dev via the `node_modules/open-media-player` symlink; sources in its
  `src/ia-player/`, rebuild ITS bundle with `npm run build` there after edits) —
  Internet Archive music player. **In dk its gear menu hides three items**
  (Filters…, Install on my Pod…, Update app on Pod…) via a dk-side rule at the
  end of `src/dk-styles.css` — the gear is light DOM; standalone omp keeps
  them. Also with a
  **local import** path — **PARKED 2026-07-04** (UI entry points hidden: gear
  "Import music folder…" + "+ Library" commented out in omp
  `assets/ia-player-shell.html`, imported-library boot listing gated by
  `LOCAL_MEDIA_IMPORT_PARKED` in omp `ia3.js`; the Electron backend, pod data,
  and `dkfile:` scheme are all intact — flip the flag + uncomment to restore.
  How it works when live — (gear ▸ "Import music folder…"): the Electron main process
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
  (The import UI is parked as of 2026-07-04 — see the ia-player entry above —
  but the scheme + allow-list stay wired for existing imports and the restore.)

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
  never hardcoded. The dk-issuers-editor's save was DEAD until 2026-07-06 (it
  used a callback with sc's promise-only rdf.serialize — hung forever); its
  persist() also re-reads the live doc now so an issuer edit can't revert
  interleaved settings writes. CAVEAT: the "first issuer = default" order does
  NOT survive rdflib serialization (the serializer orders objects itself) —
  a durable fix needs an RDF list or a default-issuer predicate (Jeff's call). Pods use `login-mode="popup"`; the popup callback
  (sc `web/popup-auth-callback.html`) carries the chosen issuer through the IdP
  round-trip via per-window `sessionStorage` — inrupt's `session.info` has **no
  `issuer`** field, so without this the post-login remember-offer never fires.
- **Pod locations come from the WebID PROFILE, never from the IdP
  (2026-07-09, Jeff-directed).** On login, sol-pod walks the WebID's
  `pim:storage` (following `owl:sameAs`) and adds those storages to the pod
  registry, non-silently → podz persists them (`_adoptLoginStorages`). The
  OIDC issuer origin is a login service, NOT a pod: podz's old fresh-session
  fallback that assigned the issuer as the right pod's `source` (which
  registered + persisted it) is REMOVED (`_chooseFreshRightTarget`), and
  `staleProviderRoots()` heals already-polluted lists (origin-root on a
  storage's base domain, not itself a storage → dropped; localhost never).
  PodRegistry has remove()/removeAll now. "Add a Pod…" itself was verified
  working all along (adds + persists across restart) — the missing pods were
  the profile storages.
- **Android login = redirect, not popup (sc 2.7.2, 2026-07-09).** The Android
  System WebView has no multi-window support, so sol-login detects the
  `"; wv)"` UA token and coerces `mode="popup"` back to the classic full-page
  redirect; the Flutter shell's overlay intercepts the IdP round-trip and
  hands the redirect back to the shell. Redirect mode is also hardened
  against dk's synthetic owner session (`src/dk-owner-session.js`, a
  method-less logged-in object on the `'default'` tag): `handleIncomingRedirect`
  skips session-shaped objects, `ensureAuthenticated` only short-circuits when
  the session COVERS the requested origin (and mints a real session when the
  tag-holder can't login), and the button's login-vs-logout basis plus the
  redirect session tag are side-scoped (`_displaySession`). Verified on the
  S23 by real trusted-tap UI drive (`claude/smoke-tests/
  cdp-verify-android-login-flow.mjs`); full credential round-trip = Jeff.
- **`dist/` is gitignored** — after pulling renderer (`src/`) changes you MUST
  `npm run build`, or the app silently runs a stale bundle without the feature.

## The two-copies rule (IMPORTANT)

dk content (`ui-data/`, `pages/`, `plugins/`) exists as **two separate, unlinked
copies**: the **repo** (git, this tree) and the **pod**
(`~/solid/dk-pod/dk`, not a git repo). **Edit BOTH.** Symlinked deps (sc) are a
single edit. For now the **pod is the source of truth**; the distro/repo is
reconciled later — act on the pod without sync caveats.

**Plugin JS executes from the BUNDLE, not the loose files** (found 2026-07-07):
`src/dk-shell.js` imports `../plugins/podz/dk-podz.js` with a *relative* path,
so esbuild bundles all of podz's JS into `dist/dk.bundle.js` — an edit to
`plugins/**/*.js` does nothing until `npm run build` + app **restart** (reload
isn't reliable, and Electron's HTTP disk cache survives restarts — CDP
`Network.clearBrowserCache` when a rebuild still looks stale). Still sync the
pod copy per the rule above; the pod serves the plugin's html/css/ttl and keeps
the copies honest, but its `.js` is not what runs. The bundle is minified with
comments stripped — grep it for code fragments, not comments.

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
- **Desktop packaging: `server-core.cjs` MUST be in build.files (v2.1.4,
  2026-07-10 — the Win11 "port 8000 never came up" report):** the 2026-07-02
  de-fork moved shared router/proxy code to repo-root `server-core.cjs`, but
  electron-builder's `build.files` never listed it — every packaged desktop
  build v2.1.0–v2.1.3 shipped a proxy+router that died at require time
  (`Cannot find module '../server-core.cjs'`), so ports 8000/8001 never came
  up while CSS on 8010 ran fine. Dev runs (repo tree) and Android
  (prepare.sh copies it) never showed it. Fixed by adding `server-core.cjs`
  to `build.files`; packaged zips are now checked for the file before
  release. Lesson: a root-level shared module is invisible to every `dir/**`
  glob — launch-test the PACKAGED artifact, not just `npm start`.
- **Startup diagnostics (v2.1.2, 2026-07-09 — the "Windows blank page" report):**
  `electron-config/log.cjs` mirrors all console output to `<userData>/dk.log`
  (previous run kept once as `dk.log.old`) — a packaged app has no terminal, so
  this file is what a bug report can include. A failed main-frame load
  (anything but ERR_ABORTED) now shows a static error page instead of a blank
  window (`main.cjs showStartupError`: failed URL, reason, `Servers.
  startupError`, log path, retry link — generated inline as a `data:` URL, no
  scripts). Verified live: happy path logs + loads; router forced onto port 1
  → error page with "port 1 never came up". NOTE: `ensureCss/ensureRouter`
  still REUSE any process answering their port — a foreign service on :8000
  would be loaded as the app; dk.log now at least records it.
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
- **Stale-server relaunch gotcha:** main reuses servers "already up" on
  :8000/:8001/:8010. Launching a new instance while a previous one is still
  dying makes the new one reuse servers that vanish moments later, stranding it
  (blank library loads, `Failed to fetch`). After killing an instance, wait
  until `ss -ltn` shows 8000/8001/8010/9222 all free before relaunching; the
  startup log line to check is `[router] already up on :8000 — reusing`.

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

**Pane loading overlay** (`electron-config/external-views.cjs` +
`pane-loading.html`): the app pane shows a "Loading… <host>" overlay from
`did-start-loading` until the page actually *paints* (poll; 10s cap). Two
2026-07-05 fixes: `_showPaneLoading` records `_paneLoadingShown` even while the
views are **suspended** (a dropdown pick fires did-start-loading while the popup
still has views suspended; dropping the request left the pane blank for the
whole load — `resume()` re-attaches from the flag), and the overlay names the
app from `_paneUrl` (the openPane target) because `webContents.getURL()` still
reports the *replaced* page until the new load commits. Since 2026-07-06 the **reader** and the **feed article pane** have the same
cover — a LoadingOverlay helper (one instance per target: pane/article/reader)
owns each view, its logical-shown state, and the paint-poll. Popups
suspend all native views, so the pane region is blank while a menu is open —
by design.

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
  Authorize screen. (Published in sc 2.7.1.)

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

## Phone media player (M1–M4, verified on the S23)

- **ia-player's Android layer** (omp, all behind the coarse-pointer gate —
  desktop unreachable by construction): tracklist is the stage (two-line
  rows: title over dim artist, time + ⋯ right, playing-row accent spine);
  transport docks at the bottom (`.ia-phone-dock`, built in `createPlayerUI`'s
  `isPhone` branch — same nodes moved, wiring intact; times on the
  now-playing line so the 28px seek strip gets the full row); the sources
  column + browser cascade hide and their LIVE listbox ULs move into a
  **`<sol-sheet>`** behind the toolbar's Browse pill (native exclusive
  `<details name>` sections; genre pick auto-opens Artists, artist opens
  Albums, album closes the sheet over the just-prepended queue).
- The phone NAV sheet (sol-tabs) rides `<sol-sheet>` since 2026-07-06 — the
  scrim/panel/grip/trap/back-gesture come from the primitive; sol-tabs keeps
  the list/accordion/accents; dk themes the panel via `--menu-bg`
  (dk-chrome.css). sol-sheet's trap now filters to VISIBLE focusables.
- **`<sol-sheet>`** (sc `web/sol-sheet.js`): 4th surface (modal/window/
  dropdown/sheet). Pointer-agnostic, no media queries inside; scrim + panel,
  Escape/scrim dismiss, focus trap, and the back-gesture contract (show()
  pushes a history entry; popstate closes). Registered in the loader
  manifest (local+cdn) + sol-full. **Closed = inert** (`pointer-events:none`
  + visibility on scrim AND panel) — regression-tested; an invisible
  full-viewport scrim once swallowed every tap in the app.
- **Three on-device bugs worth remembering:** (1) that scrim; (2) a bare
  `1fr` grid track's automatic minimum is its content min-width — the
  nowrap now-playing line inflated the app column to ~1100px and pushed the
  Browse pill off-screen → phone grid uses `minmax(0,1fr)`; (3) the search
  form needed `flex: 1 1 0` + `min-width:0` (its desktop min-width kept the
  toolbar overflowing).
- **Engine packer fix:** `mobile/tool/prepare-node-project.sh` now packs
  `node_modules/open-media-player` (manifest + dist + src) into engine.nmz —
  the media tabs had been DEAD on the phone since the 2026-07-02 cutover
  (only verified headless desktop back then).
- **mashlib in engine.nmz (v2.1.2, 2026-07-09):** the SolidOS iframe hosts
  load `/node_modules/mashlib/dist/mashlib.min.js` + `mash.css` from the
  ENGINE, which never shipped mashlib → SolidOS 404'd on-device (the v2.1.1
  "mashlib not loaded" report). The packer now includes `mashlib/dist`
  (minified bundle + lazy chunk + css + images; the 7MB un-minified bundle
  and maps stay out — ~+1MB compressed). Probe:
  `claude/smoke-tests/cdp-verify-android-mashlib-login.mjs` (serves, executes,
  PAINTS).
- **Extraction sentinel is a sha1, not a size (v2.1.2):** two consecutive
  engine builds with a small code delta really did land on the SAME tarball
  byte size, so `ensureExtract` kept serving the STALE engine after an APK
  upgrade (`mobile/nodejs-src/main.js tarballFingerprint`). Any old
  size/timestamp sentinel mismatches a sha1, so upgrading to this code forces
  exactly one re-extract.
- **The phone has a PERSONAL POD now (v2.1.3, 2026-07-09):** mobile never ran
  the pod-template seeders, so the device had NO `dk-pod/profile/card#me`, no
  `pim:storage`, no root owner `.meta` — podz said "no pods".
  `mobile/nodejs-src/main.js` now runs the SAME
  `seedPodTemplate`/`seedRootOwnerMeta` as desktop at every boot
  (`pod-template.cjs` + `seed-core.cjs` + `pod-template/` staged by
  prepare-node-project.sh); baseline in filesDir (outside nodejs-project) so
  user pod edits survive APK upgrades. NOTE: CSS re-serializes `.meta` with
  FULL IRIs — probe for `solid/terms#owner`, not the `solid:` prefix.
- **podz phone layout (v2.1.3):** podz.js applies the single-panel width as
  an INLINE `flex: 0 0 420px` with no viewport clamp — on a 360px portrait
  phone that pushed Log in / gear OFF SCREEN behind overflow:hidden. Fix in
  podz.css (repo AND desktop pod copy): `.app .pod-container` gets
  `max-width: 100%` (max-width beats flex-basis → min(420, container)), and
  a `(hover:none)` `min-height: 380px` stops the LANDSCAPE collapse (274px
  viewport → sol-pod flexed to 0, footer painted over and ate the header's
  taps); the dk-podz pane host scrolls (`overflow:auto`) so the scrollbar is
  on the item. Both verified on-device (computed styles + eyeballed
  screenshots; the login probe now GATES on the button being fully inside the
  visual viewport — CDP taps land on layout coordinates, so only a viewport
  check catches offscreen UI).
- **Login button paints correctly after redirect (sc, 2026-07-09):**
  sol-login `initialize()` is SINGLE-FLIGHT — sol-pod's mount and podz's
  handleRedirect both call it; two concurrent runs raced the OIDC code
  exchange and left "Log in" painted on a logged-in session. It also always
  paints from real session state (even when redirect processing throws) and
  announces the SIDE session's webId in its sol-login event — not
  getFirstLoggedIn(), which on dk is the synthetic owner (that mis-announce
  would have made pod adoption walk the wrong profile on fresh devices).
- **Phone chrome pass (dk baf81b7, 2026-07-09):** the ~33px dead band above
  the navigator pill was env(safe-area-inset-top) double-counting (the
  Flutter shell already insets the WebView — `--dk-m-safe-top` is 0 now);
  the mini-player is hidden on phones (see above); and pod-ops uses the
  classic MODAL on coarse pointers (podz skips the inline podClickAction —
  the inline panel sat right of the full-width panel, off screen; inline
  ops stays desktop-only).
- **KNOWN GAP (Jeff's call):** redirect-mode sessions do NOT survive app
  restarts — no restorePreviousSession wiring on this path (Tier-1 restore
  exists only in the popup path). After an update/restart the user must log
  in again; the last-visited restore can land on an auth-required container
  showing "Authentication required — please log in".
- **Phone-polish batch (2026-07-09 evening, Jeff GO'd item-by-item then "all
  the others"; ALL S23-verified via `claude/smoke-tests/
  cdp-verify-phone-batch{,-device}.mjs` + eyeballed screenshots in
  `claude/plans/android-ui-survey/`):** every fix coarse-gated
  (`hover:none`+`pointer:coarse`), desktop regression-probed unchanged.
  - **sol-wac** = stacked per-who cards on phone: each mode cell's checkbox
    now sits in a `label.acl-mode-chip` with a `span.acl-mode-tag` (hidden
    on desktop; the 44px chip face on phone — CSS-only re-lay of the same
    table DOM, `input:checked + tag` styling, no `:has()`).
  - **sol-login dropdown**: viewport cap + 44px wrapping rows (the 44ch
    min-width floors beat the 90vw max-width — min-width WINS over
    max-width; that plus content-box was the whole overflow).
  - **sol-live-edit**: phone stacks editor OVER preview 50/50, resizer
    (horizontal drag math) hidden; sol-modal ✕ 44px under coarse.
  - **core/anchor-place.js clamps X** now (right-aligned panels never go
    x<0 — was the calendar at x=−146 over the dock); sol-calendar phone
    rows wrap (date+time line, `.cal-row-body` full-width beneath).
  - **sol-search**: panel viewport cap, 44px controls; input bg moved to
    the `--input-*` tokens (standing rule — UNGATED, desktop too).
  - **sol-pod**: 44px tree rows + item/crumb gears. **sol-feed**: phone
    title `max-height: calc(3lh + .55rem)` — line-clamp only paints the
    ellipsis, the CLIP is the box bottom, so any box taller than 3 lines
    shows a sliver of line 4 (cap = lines + TOP padding only).
  - **sol-tabs.setNavLabel(text)**: host names a non-room screen on the
    phone pill; cleared by the next switchTab. dk wires it to the ☰ menu
    pane (`sol-tab-activate` names it, `hideMenuPane` clears). NOTE:
    Settings/Customize mount into `#dk-menu-pane` (index.html `data-for`
    claims) — NOT a conjured modal.
  - **dk**: podz ◫◫ hidden on coarse PORTRAIT (portrait dual = 142px
    panels); help/dk{,-owner}.html copy is pointer-conditional
    (`.dk-mouse`/`.dk-touch` spans, media-gated); sol-menu-manager's adder
    placeholder says "Tap a plugin below…" on coarse; omp tracklist
    zebra/selected/playing paint the ROW (tds transparent) on the phone
    grid (omp 0.3.2).
  - **sol-solidos bar**: two rows on phone (Home/Back/Locations over
    URL+Go); host page (`sol-solidos-host.html`, POD copy is what runs)
    un-floors mashlib's 375px body min-width + pads outline rows. sc also
    gained defensive bar survival: `_barEl` handle + `_keepBarAlive()`
    re-seats the wired bar at body level if solid-ui's mobile layout
    rebuilds the body, bar CSS selectors location-independent, `_fitBar`
    document fallbacks.
  - **dk-dokieli** injects coarse-gated overflow guards + 44px buttons
    into its same-origin doc iframe (`_injectPhoneCss`; best-effort —
    full editor chrome pending live DO init).
  - **HARD LESSON (bit twice, sol-search + sol-login, the latter only ON
    DEVICE):** a viewport `max-width` cap on a padded box MUST set
    `box-sizing: border-box` — content-box lets padding+border push past
    the cap; and device fonts differ from emulation, so a box that stays
    under its cap in emulation can hit it on the phone. Also: CDP
    **emulation dies with the session that set it** — measurements from a
    second WS connection are hybrid garbage; and iframe module boot can
    LOSE a cold-boot race after an engine re-extract (retry via src
    re-set).
  - Deferred/parked from the plan: landscape music chrome; a phone home
    for time/weather/shell sign-in (Jeff's call). Plan + survey:
    `claude/plans/android-ui-phone-polish-plan.md`.
- **FIXED 2026-07-10 (v2.1.4): the Android SolidOS navigate-away /
  refresh-loop bug.** Root cause was AUTH, not layout: the phone's
  redirect-flow login leaves a solid-client-authn session
  (`solidClientAuthn:currentSession` / `currentUrl`) in the shared
  `localhost:8000` localStorage; mashlib's bundled authn inside the
  SolidOS iframe "restored" it with a real full-frame redirect to the
  IdP (`prompt=none`). When the IdP answered `interaction_required`, the
  bounce (`index.html?error=…`) hit the wormhole guard → `/dk-pod/` →
  the mashlib databrowser there re-attempted → a ~1.1s refresh loop.
  Desktop never reproduces because its logins live in separate Electron
  storage partitions. Three-leg fix, all S23-verified via
  `claude/smoke-tests/cdp-diagnose-solidos-refresh.mjs` (zero frame
  navigations, bar mounted, shim active):
  1. `plugins/solidos/sol-solidos-host.html` shadows `localStorage` for
     that document only, hiding `solidClientAuthn:*` / `oidc.*` keys from
     mashlib (dk still shares auth via adoptAuth; the shell's storage is
     untouched).
  2. `src/dk-wormhole-guard.js` clears the dead session keys when a
     failed silent re-auth bounces in with `?error=…&state=…` — the loop
     is one-shot even outside the host page.
  3. `plugins/solidos/dk-solidos.js` re-seats the host page if the frame
     ever really navigates away (capped at 3).
- **FIXED 2026-07-10: Android back dismisses the reader/login overlay.**
  Root cause: the overlay WebView is a native platform view that swallows
  KEYCODE_BACK before Flutter's PopScope ever sees it (measured: back
  backgrounds the app with no overlay, does nothing with one open).
  `MainActivity.kt` now intercepts in `dispatchKeyEvent` while an overlay is
  up (Dart flags it over the `dk/back` MethodChannel) and asks Dart to close
  it; no overlay → normal back. S23-verified both ways (uiautomator view dump
  — the lingering CDP target after close is just the undisposed controller,
  not a visible overlay).
- **FIXED 2026-07-10 (code shipped; positive test needs a real login):
  phone sessions restore across app restarts.** sol-login's redirect-mode
  boot only completed in-flight logins; now `handleIncomingRedirect()` also
  does a Tier-1 boot restore — it rebuilds the stored session (deterministic
  `sol_<tag>_<origin>` id via the persisted side-origins) and calls
  `handleIncomingRedirect({restorePreviousSession:true})`: silent via refresh
  token in the common case; a failed prompt=none bounce is one-shot (the
  wormhole-guard loop breaker clears dead state). Popup mode (desktop)
  untouched. Test: log in on the phone, force-stop, reopen → still signed in.
- **FIXED 2026-07-10: the StorageDescriptionAdvertiser "Unable to find
  storage root" log error** on every request to `/`: the config imported
  `css:config/storage/location/pod.json` (storages = pods) while dk serves
  the whole tree with root at `/`. Now `root.json` (the base URL is the
  storage root). One line in `pivot-config/no-auth.json` + BOTH compiled
  configs regenerated (`bash pivot/build-compiled-config.sh` and `… mobile` —
  the compile takes several minutes; run in background). Verified on a
  standalone server: zero advertiser errors, containers serve normally.
- **Phone WebView is now debuggable** (`AndroidWebViewController.enableDebugging`
  in `mobile/lib/main.dart`): `adb shell cat /proc/net/unix | grep
  webview_devtools_remote` → `adb forward tcp:9223 localabstract:<sock>` →
  CDP at :9223 (screenshot/drive the REAL on-device DOM). Use TRUSTED input
  (`Input.dispatchTouchEvent`), not synthetic `.click()`.
- **M2–M4 built 2026-07-06 and VERIFIED ON THE S23** (trusted-touch CDP pass,
  real Wikimedia data + real swipe: `cdp-verify-phone-m2m4.mjs`, all green;
  also desktop touch emulation). M2 (omp): phone movies split the stage —
  video/film-intro 16:9 pinned under the returned toolbar (desktop hides it;
  the film-search form now stays in the phone toolbar instead of riding
  .ia-nowplaying into the dock), Favorites film list beneath, touch intro
  hint. M3 (omp + sc): omp-images phone = two snap-scrolling chip rows
  (★ Favorites + topics / collections; thin skin over the same selection
  methods) over sol-gallery's new 2-column square grid + full-bleed
  swipe-stepping lightbox (caption bottom, 44px ✕). M4 (sc + dk-chrome.css):
  ONE shared phone chip — navigator trigger, feed source chips, Browse pills
  all 44px / 0 16px / stadium / 16px floor; feed cards got breathing room.
  Probes: `claude/smoke-tests/cdp-verify-m{2-movies,3-images,4-chips}.mjs`.
- **M5–M6 (2026-07-07): phone Settings + phone Customize, VERIFIED ON THE
  S23** (Electron probes `cdp-verify-m{5-settings,6-customize}.mjs` +
  on-device `cdp-verify-phone-m5m6-device.mjs`, all green; plan + status in
  `claude/plans/mobile-customize-settings-plan.md`).
  - **Customize tap model** (drag-drop is dead on touch): tapping a catalog
    card opens a body-mounted `sol-sheet.sol-plugin-sheet` "Add to…" listing
    the paired managers + their submenus; picking calls the new sc APIs
    `SolMenuManager.addPlugin(payload, {submenuId})` / `placeTargets` getter
    (same `_itemFromPlugin` → `_touch()` save path as a drop). Coarse-only
    ▲▼ row reorder + submenu-chip ✕; grip hidden. Phone skin in sc
    `sol-builders-css.js`; page stacks one column (editors capped
    `min(40dvh, 50%)` — **container-relative, never bare dvh**: S23 bars/
    dock/46px gesture inset eat half the viewport). **Dropped on phone:**
    chip half-drop reorder, drag-off, submenu-by-second-drop, catalog↔catalog
    moves, AND the manifest-URL row (measured: it cost 94px of a ~175px box
    and collapsed the card list to 21px). dk themes the sheet next to the
    nav sheet's rule in dk-chrome.css.
  - **Settings**: sc `sol-form-css.js` phone block (1-col shape grid, 44px
    controls) fixes the main form + every dk-plugin-settings/sol-settings
    form at once; dk-styles issuer rows 44px with wrapping URLs;
    `dk-config-settings` hidden on phone (CSS).
  - **placeAnchored now flips vertically** (sc `core/anchor-place.js`):
    dropdowns anchored to the phone's bottom dock (☰, calendar) used to open
    BELOW the viewport. `sol-dropdown` gained a phone max-width cap.
  - **Probe gotchas**: the shell BLOCKS `Page.reload` (wormhole guard) — CDP
    reloads are silent no-ops, treat emulation flips as live; sc `web/*.js`
    edits are NEVER picked up mid-session — restart the app; row taps need
    `scrollIntoView` first; "remove from menu" keeps pantry RDF (assert
    `ui:parts`, not full-text); the device pod refreshes dk pages from the
    packed seed at boot, so page edits ride an APK rebuild.

## Updates & releases (2026-07)

- **Startup update check** (`electron-config/update-check.cjs`, hooked at the
  end of `start()` in `main.cjs`): asks GitHub Releases
  (`api.github.com/repos/SolidOS/data-kitchen/releases/latest`) whether a newer
  version exists; silent on any failure. If newer → native dialog (data-safety
  wording: updates replace only the app; pod/settings/logins live in userData /
  beside-exe `data-kitchen-home`, untouched). Linux AppImage: full auto —
  download beside the AppImage (taskbar progress), sha512-verify against the
  release's `latest.json`, atomic in-place rename, offer restart. mac/win:
  download to Downloads, verify, reveal with "quit and replace" instructions.
  Gates: packaged-only; `DK_UPDATE_CHECK=0` off; `DK_UPDATE_FORCE=1` +
  `DK_UPDATE_REPO=<owner/repo | http://mock>` for dev testing. Tag parse
  requires two dotted parts so legacy junk tags (`v.04`) can't look newer.
- **Android**: same check in `mobile/lib/main.dart` (`_checkForUpdates`, fired
  when the frontend opens); version stamped by `build-apk.sh`
  `--dart-define=DK_VERSION=<package.json version>` (dev builds = 0.0.0 →
  skipped). Update = open the release APK in the browser (`url_launcher`);
  in-place install keeps on-device data ONLY with the same signing key — keep
  building releases with the same keystore (currently the machine debug key).
- **Release workflow — keep `release/*` fresh before a dk push**: before any
  push that ships user-facing changes run `npm run release:check`; if stale,
  rebuild (`npm run dist:cross` + `npm run dist:android`), then
  `npm run release:prep` (`tools/prepare-release.mjs`: normalizes artifact
  stems, prunes electron-builder intermediates, writes `release/latest.json`
  with hex sha512s, prints the `gh release create v<version> …` command).
  Publishing the GitHub Release is ALWAYS a separate explicit act (run the
  printed command yourself). Tags are `v<semver>` going forward. `release/`
  itself stays gitignored — GitHub Releases is the distribution channel (the
  old Pages URL was never configured; README now points at releases/latest).

## Release variants (2026-07-06) — PARKED

**PARKED by Jeff 2026-07-06 — do not extend or ship without his go.** The
system is dormant: the mobile APK seed loop is reverted (swap line commented
in prepare-node-project.sh), variant tests need DK_VARIANTS=1. What exists:

Three variants, one assembler. Repo top-level content = the BASE (electron)
variant; `variants/{web,mobile}/` hold whole-file overlays + an EXCLUDE list.
`tools/assemble-variant.mjs <base|web|mobile> <out>` materializes the seeded
tree with seed.cjs's own SEED_ENTRIES (imported — one source of truth), bakes
in the media-plugin content `seedMediaPlugins` provides at boot (static trees
have no boot seeder), and REGENERATES the variant catalog from the assembled
manifests (`seed-plugins-catalog.mjs --plugins-dir/--out`).

- **Web demo** (read-only, root-hosted): `npm run dist:web` → `release/web/`
  + `Solid_Data_Kitchen-<ver>-web.zip`; `npm run serve:web` (:8082) serves it
  with correct .ttl/.jsonld types. Menus: Media / Apps(links) / Solid
  Resources / Dev Tools; ☰ = Theme + Text size; no ui:proxy. Verified in
  headless chromium (`claude/smoke-tests/verify-web-demo.mjs`): boots, plays
  IA music, writes 405 quietly. Read-only-ness is CONTENT, not code switches.
- **Mobile**: electron set minus Dev Tools; `prepare-node-project.sh` builds
  pod-seed.nmz via the assembler now.
- **pull-defaults** (`npm run pull-defaults [--dry-run]`): pod→repo snapshot
  of the saveable defaults (menus/settings/flat manifests/feeds sanitized);
  reports (never copies) plugin CODE drift. Don't run blind: the live pod's
  issuer ORDER is serializer-scrambled (see the issuers caveat above).
- Tests: menu invariants run per-variant via `test/helpers/menu-invariants.mjs`
  + `test/data/variant-{menus,hygiene}.test.mjs` (no localhost in web TTL,
  reachable menu parts resolve, mobile ships the full plugin set).

## Conventions & repo facts

- `claude/` holds Claude-authored artifacts (plans, smoke-tests, validation,
  migration-scripts) and is gitignored; the user's own notes and the app source
  stay where they are.
- Vocabularies `ui:` (`ui-vocab.ttl`, upstreamed to W3C `ui:`) and `ci:` are
  **authoritative** — don't flag them in RDF audits. A genuinely new term needs
  an explicit OK and goes in `ui-vocab`. (See `jeff-skills.md`: never introduce
  an RDF term or HTML attribute on your own initiative.)
