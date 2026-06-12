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
launch the definition is **seeded-or-updated** into the pod root
(`electron-config/seed.cjs`): missing files are filled in, and files you haven't
edited are refreshed from a newer build — tracked by a per-file baseline hash in
`userData`, so your edits are kept and definition changes reach the pod with no
manual sync. When the pod root and the repo coincide (dev default), it's a no-op
and everything is served from the repo as before.

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
                    (tabs, bar AND chrome; kept in two-way sync with it)
data/tabs.ttl       the RDF twin: #Tabs (tabs) + #Bar (actions) + #Chrome
                    (help / ☰ menu / sign-in); rdfs:comment ↔ HTML comments
data/menu.ttl       #More — the ☰ hamburger's standard items
data/plugins-catalog.ttl    the plugin catalog: one #Available list + topics
plugins/<name>/     one SELF-CONTAINED folder per plugin: its scripts,
                    assets, pages, RDF libraries, and manifest.ttl
                    (the tree-shaking unit)
src/                shell-only code (boot, tab wiring, auth, settings)
electron-config/    the Electron main process (.cjs)
pivot/ pivot-config/ proxy/   the bundled servers
help/  pages/  assets/  shapes/  favourites/   shell-level resources
tools/              conversion + plugins-catalog seeding scripts
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

**☰ → Customize** opens a sub-tabset (pages/customize.html; more subtabs
to come):

1. **Define the main menu tabs** — `<sol-menu-manager source="data/tabs.ttl#Tabs">`
   above, `<sol-button-bar-manager source="data/tabs.ttl#Bar">` below: name
   items, reorder, remove; drop a plugin on either. The add row is an input:
   drop a plugin on it, or type a name + Enter for a submenu.
2. **Choose plugins the menu should access** — the catalog
   (`<sol-plugin-manager grouped source="data/plugins-catalog.ttl#Available">`,
   topic tabs, two cards wide) beside the same menu/bar managers as drop
   targets. Entries the menus already mount are hidden from the catalog box
   (the `for=` pairing) and reappear when dragged off. Drop or type a
   manifest URL to add a plugin (a `ui:Component` with `ui:name`, or a
   `ui:Link` with `ui:href` for an external app).

Rows are three columns — name field | plugin chips | ✕ — and chips show the
catalog's display names (the managers' `catalog=` attribute). A menu item
holding several plugins lists them all as chips and its tab renders them all
stacked in the pane. There are no Save buttons — every editor auto-saves.

The catalog is ONE `#Available` list GENERATED from the flat one-file
manifests in `plugins/` (`plugins/<entry>.ttl`) by
`tools/seed-plugins-catalog.mjs` — the seeder holds no content; edit a
manifest and re-seed. "In use" simply means `data/tabs.ttl` mounts it.
**☰ → All Plugins…** browses the same catalog read-mostly (guests too).

Saving rewrites the whole Turtle document (unreferenced "pantry" items are
preserved), and `src/dk-tabs-sync.js` keeps `html-first.html` and the running
shell in step **automatically** — no manual regenerate step:

- the live tab bar and bar launchers update **in place** (chrome untouched);
- `html-first.html` is regenerated from the RDF and saved (the standalone
  `node tools/conversion/generate-html-first.mjs [--verify]` does the same for a
  build/CI check);
- on load, a hand-edited `html-first.html`'s tabs are imported back into the RDF
  (reverse sync), and any deleted mandatory chrome item is self-healed.

The help button, ☰ menu and sign-in are **chrome** — now modeled in
`data/tabs.ttl#Chrome` (config-editable: help target, icon, ☰ menu source,
issuers) and emitted between the `chrome:begin/end` markers. They're fixed shell
furniture: not in the plugin lists, and self-healed if a hand-edit deletes one.
`rdfs:comment` on any item round-trips as the HTML comment before it. The bar
carries search / calendar; theme, settings, sign-in, Manage Plugins and Manage
Menus live in ☰ (their definitions stay in tabs.ttl as pantry). Sign-in is
on-demand: the hidden
`sol-login` surfaces only during an auth flow.

## Verification

```bash
node claude/smoke-tests/verify-unified-shell.mjs   # every tab functional
node claude/smoke-tests/verify-customize-menus.mjs   # subtab 1: edit → auto-save → regenerate
node claude/smoke-tests/verify-customize-plugins.mjs # subtab 2: catalog + manifest import
```

(Both need the servers up and Chrome; see the file headers.)

## Packaging

```bash
npm run dist        # electron-builder (linux: AppImage/deb/rpm)
```

`asar` is off: the bundled servers are spawned as plain node processes and
read their trees from disk. Note: an AppImage mounts read-only, so in-app
saves (favourites, settings, Manage Plugins / Manage Menus) need a writable root — set
`DK_POD_ROOT` to point the pivot server at a writable copy of the data.

## Provenance

This repo consolidates three earlier projects: the data-kitchen web shell,
the `electron` desktop wrapper, and `open_media_player` (whose history is
grafted into this repo's `main`). It builds on the Solid stack —
rdflib, solid-logic, solid-ui — via `sol-components` and `component-interop`.
