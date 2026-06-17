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
- **sc — sol-components** (v2.4.0, published on npm) — `../sol-components`,
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
framing): `solid-client-authn.bundle.js` → **component-interop**
(parser-blocking; parses manifests, injects the importmap, imports the
`data-components`) → `dist/dk.bundle.js` (a direct module that waits on
`ComponentInterop.ready`, then imports the dk modules).

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

Manifests are `.ttl` files in `plugins/`. Complex plugins get a subdirectory plus
a `manifest.jsonld` (podz, solidos, ia-player, calendar, news, search, weather,
time). A component is "manifested" when it has an object-form ci entry
(label / icon / shape / help). Icons are **live favicon URLs** — the renderer
paints a URL as `<img>` and an emoji as text. Per-plugin settings are RDF-driven
and gated on the plugin being in a menu (`src/dk-plugin-settings.js`, subject via
`foaf:primaryTopic`).

## Key plugins

- **dk-podz** (`plugins/podz/`) — the Data Kitchen Pod Browser; keep-alive
  (one persistent instance).
- **dk-solidos** (`plugins/solidos/`) — SolidOS via a thin same-origin iframe
  (`solidos-host.html`) running the fixed upstream sol-solidos on mashlib 2.2.2;
  mash.css is scoped inside the iframe (zero leak). **Folders MUST be fetched as
  turtle** (the server serves `/` as the app under text/html).
- **dk-dokieli** (`plugins/solidos/dk-dokieli.js`) — a standalone direct editor
  (loads the doc `.html` directly, no SolidOS browser); identity/auth via
  `dokieli-adapter.js`.
- **ia-player** (`plugins/ia-player/`) — Internet Archive music player.

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
- **Verify by driving the running app and measuring** (`claude/smoke-tests/`,
  Playwright) — don't theorize from CSS. "Works" must mean the UI actually
  painted (a real render root / visible content), not that an HTTP request
  returned. Some external catalog pods (`*.solidcommunity.au`) are
  Flutter/CanvasKit needing WebGL and load as empty shells under headless probes.

## External content

Electron opens external URLs via `window.open` → a **native WebContentsView**,
not iframes (avoids X-Frame-Options errors). Keep-alive external content uses an
iframe-pane shadow driven by the tabs.

## Conventions & repo facts

- `claude/` holds Claude-authored artifacts (plans, smoke-tests, validation,
  migration-scripts) and is gitignored; the user's own notes and the app source
  stay where they are.
- Vocabularies `ui:` (`ui-vocab.ttl`, upstreamed to W3C `ui:`) and `ci:` are
  **authoritative** — don't flag them in RDF audits. A genuinely new term needs
  an explicit OK and goes in `ui-vocab`. (See `jeff-skills.md`: never introduce
  an RDF term or HTML attribute on your own initiative.)
