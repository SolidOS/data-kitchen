# data-kitchen

A desktop (Electron) app that packages a Solid server, a CORS proxy, and a
shell of **plugins** — media players, a pod browser, the SolidOS data
browser, news feeds, and more — behind one tabbed interface, one theme, and
one sign-in.

## Run

```bash
npm install
npm install --prefix pivot     # the bundled Solid server's own dependency tree
npm run build                  # bundles: dist/dk.bundle.js + the ia-player plugin
npm start                      # launches Electron; spawns the servers below
```

The app view loads `http://localhost:8000/index.html` from one origin, served by
three loopback servers spawned by `electron-config/servers.cjs` (killed on quit;
a server already answering on its port is reused):

- **router** (`router/index.cjs`, :8000) — the single public origin. Engine path
  prefixes (`/node_modules/`, `/dist/`, `/src/`, `/assets/`, `/plugins/*/dist/`)
  are served as static read-only files from the executable; everything else is
  reverse-proxied to the pivot below.
- **pivot** (`pivot/`, :8010) — a Community Solid Server rooted at the writable
  **pod root**, behind the router. Started from a **pre-compiled** componentsjs
  config (`pivot/dist/create-app.cjs`; see `pivot/compile-config.cjs` for why and
  `pivot/build-compiled-config.sh` to regenerate). It advertises the public origin
  (`DK_CSS_BASEURL`) so the URLs it generates point at the router.
- **proxy** (`proxy/index.cjs`, :8001) — a dependency-free CORS proxy.

**Self-hosting / redesignable.** dk is meant to be redesigned by the user — tabs,
buttons, the components wired in (the manifest), settings. So the editable app
**definition** (the HTML shells, `data/*.ttl`, `dk.manifest.json`, favourites,
plugin config, content) lives in the **pod root** and is served from there, while
the read-only **engine** (component libraries, vendor bundles, compiled plugin
`dist/`, dk's own bundle) ships in the executable and is served by the router. On
first launch the definition is **seeded** into the pod root if absent
(`electron-config/seed.cjs`; never overwrites edits — a newer build only fills in
missing files). When the pod root and the repo coincide (dev default), seeding is
a no-op and everything is served from the repo as before.

All three servers bind to `127.0.0.1` (loopback only — not reachable from the LAN).
External content (reader/pane overlays) runs in its own session whose requests to
loopback hosts are cancelled, so outside pages can't reach the local servers.

When spawned by the app, the servers also require a **per-install gate token**
(`electron-config/gate.cjs`): a secret generated on first launch into Electron's
`userData/gate-token` and injected by the shell as an `x-dk-token` header on all
app traffic — so dk needs no login, but a page in any outside browser gets a 401.
To use dk from a regular browser, right-click → **Open dk in Browser**: it opens
the app with `?dk-token=…`, which sets a `SameSite=Strict` cookie and redirects —
that browser then works until the cookie expires, while foreign pages in it still
can't ride along (no cookie attached cross-site, token unknown). Standalone runs
(`npm run start-css` / `start-proxy`) have no `DK_GATE_TOKEN`, so they stay open
for browser-based development.

Ports are overridable with `DK_PUBLIC_PORT` / `DK_CSS_INTERNAL_PORT` /
`DK_PROXY_PORT` (defaults 8000/8010/8001); the pod root with `DK_POD_ROOT`. Note
that `index.html` declares the proxy URL in markup
(`proxy="http://localhost:8001/proxy?uri="`), so overriding `DK_PROXY_PORT`
means editing that attribute too.

## Layout

```
index.html          the shell: chrome bar + <sol-include source="./html-first.html">
html-first.html     the topmost <sol-tabs> — GENERATED from data/tabs.ttl
                    (chrome block preserved verbatim between chrome markers)
data/tabs.ttl       the RDF twin: #Tabs (tab menu) + #Bar (actions row)
data/menu.ttl       #More — the ☰ hamburger's standard items
data/palette.ttl    the plugins the builders offer (a ui:Menu, curated)
plugins/<name>/     one SELF-CONTAINED folder per plugin: its scripts,
                    assets, pages, RDF libraries, and manifest.ttl
                    (the tree-shaking unit)
src/                shell-only code (boot, tab wiring, auth, settings)
electron-config/    the Electron main process (.cjs)
pivot/ pivot-config/ proxy/   the bundled servers
help/  pages/  assets/  shapes/  favourites/   shell-level resources
tools/              conversion + palette seeding scripts
```

## The plugin manifest

Each plugin folder may carry a `manifest.ttl` describing it — existing
`ui:Component` vocabulary plus three optional declarations the shell uses:

```ttl
<> a ui:Component ;
  ui:label "Music" ; ui:name "ia-player" ;
  dct:hasPart <./ia3.js> ;                      # the plugin's files
  dct:requires <./libraries/...> ;              # its data/deps
  schema:softwareHelp <./help.html> ;           # context help page
  dct:conformsTo <../../shapes/music.shacl> .   # settings/data shape

<#Menu> a ui:Menu ; ui:parts ( … ) .            # ☰ contributions
```

**Help, Settings and the ☰ menu are context-sensitive** to the active tab:
the `?` button opens the active plugin's help (dk's own help is the
fallback); ☰ → Settings… opens a `sol-form` over the plugin's declared
shape and the panel's own `source` (or the global settings page without
one); a plugin's `#Menu` items appear in ☰ below a separator while its tab
is active (e.g. the player's Filters / View deleted / Install / Update).

## Customize — build the UI with the UI

**☰ → Customize…** opens the three sol-components builders in a modal:

- `<sol-menu-builder source="data/tabs.ttl#Tabs">` — edit the tab menu
- `<sol-bar-builder source="data/tabs.ttl#Bar">` — edit the actions bar
- `<sol-plugins-available source="data/palette.ttl#Palette">` — drag a plugin
  card onto a menu/bar item to assign what it mounts

Saving rewrites the whole Turtle document (unreferenced "pantry" items are
preserved). Then regenerate the declarative shell and reload:

```bash
node tools/conversion/generate-html-first.mjs           # tabs.ttl → html-first.html
node tools/conversion/generate-html-first.mjs --verify  # round-trip check
```

The help button and the ☰ menu are **chrome** — fixed in `html-first.html`
(between the `chrome:begin/end` markers), not bar-managed; edit them by
hand. The bar carries search / calendar / text-size; theme toggling,
settings, sign-in and Customize live in ☰ (their bar/tab definitions stay
in tabs.ttl as pantry, restorable with the builders). Sign-in is
on-demand: the hidden `sol-login` surfaces only during an auth flow.

## Verification

```bash
node claude/smoke-tests/verify-unified-shell.mjs   # every tab functional
node claude/smoke-tests/verify-builders.mjs        # edit → save → regenerate → reload
```

(Both need the servers up and Chrome; see the file headers.)

## Packaging

```bash
npm run dist        # electron-builder (linux: AppImage/deb/rpm)
```

`asar` is off: the bundled servers are spawned as plain node processes and
read their trees from disk. Note: an AppImage mounts read-only, so in-app
saves (favourites, settings, Customize) need a writable root — set
`DK_POD_ROOT` to point the pivot server at a writable copy of the data.

## Provenance

This repo consolidates three earlier projects: the data-kitchen web shell,
the `electron` desktop wrapper, and `open_media_player` (whose history is
grafted into this repo's `main`). It builds on the Solid stack —
rdflib, solid-logic, solid-ui — via `sol-components` and `component-interop`.
