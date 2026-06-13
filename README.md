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
buttons, the components wired in (the manifest), settings. The **pod root**
(`DK_POD_ROOT`) is a Solid storage served at `/`; the user's **home pod** lives
at **`/dk-pod/`** — a real owner WebID `<origin>/dk-pod/profile/card#me`,
provisioned from a template (`electron-config/pod-template.cjs`). Only
`index.html` sits at the served root; the rest of the editable app **definition**
(the HTML shells, `data/*.ttl`, `dk.manifest.json`, plugin config + content) is
seeded under **`/dk-pod/dk/`**, so the root stays clean even when it's a folder
shared with other things. The read-only **engine** (component libraries, vendor
bundles, compiled plugin `dist/`, dk's own bundle) ships in the executable and is
served by the router at its root paths. On launch the definition is
**seeded-or-updated** (`electron-config/seed.cjs`): missing files filled in,
unedited files refreshed from a newer build — tracked by a per-file baseline hash
in `userData`, so your edits are kept and definition changes reach the pod with
no manual sync. Favourites are **per-library** (each media library owns its
`<library>/favourites/`), not shipped. **"Move my pod"** (☰) re-homes the pod
root to a folder you pick and relaunches — the WebID is origin-relative, so no
rewrite is needed.

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

The gate lets **public-by-design** endpoints through un-gated — the WebID profile
document and the OIDC discovery/provider endpoints (`/.well-known/openid-configuration`,
`/.oidc/`) — so the owner's WebID is dereferenceable and third-party Solid apps
can run their own OIDC login against this server with the dummy password
**`!secret`** (the gate is the real access control; the password just completes
the standard login form). The app and the embedded SolidOS act as the owner via a
synthetic local session (`src/dk-owner-session.js`); `electron-config/seed-account.cjs`
provisions the `!secret` account on launch.

Ports are overridable with `DK_PUBLIC_PORT` / `DK_CSS_INTERNAL_PORT` /
`DK_PROXY_PORT` (defaults 8000/8010/8001); the pod root with `DK_POD_ROOT`. Note
that `index.html` declares the proxy URL in markup
(`proxy="http://localhost:8001/proxy?uri="`), so overriding `DK_PROXY_PORT`
means editing that attribute too.

## Layout

```
index.html          the shell: chrome bar + the inline topmost
                    <sol-tabs from-rdf="./data/data-kitchen-main-menu.ttl#Tabs">
data/data-kitchen-main-menu.ttl       THE shell model (rdf-first): #Tabs (tabs) + #Bar (actions)
                    + #Chrome (help / ☰ menu / sign-in), rendered at runtime
                    (#Bar/#Chrome built by src/dk-tabs-rdf.js)
data/data-kitchen-hamburger-menu.ttl       #More — the ☰ hamburger's standard items
data/plugins-catalog.ttl    the plugin catalog: one #Available list + topics
plugins/<name>/     one SELF-CONTAINED folder per plugin: its scripts,
                    assets, pages, RDF libraries, and manifest.ttl
                    (the tree-shaking unit)
src/                shell-only code (boot, tab wiring, auth, settings)
electron-config/    the Electron main process (.cjs)
pivot/ pivot-config/ proxy/   the bundled servers
help/  pages/  shapes/   shell-level content (seed under /dk-pod/dk/)
assets/             engine assets (served at /assets/, not seeded)
pod-template/       the home-pod template (profile/card, settings, ACLs)
                    seeded into /dk-pod/ — gives the owner WebID
tools/              conversion + plugins-catalog seeding scripts
```

The above is the repo (engine-source) layout. In the **served pod**, `index.html`
+ `dk.manifest.json` sit at `/`, the home pod is at `/dk-pod/` (owner WebID), and
the content dirs above seed under `/dk-pod/dk/`. Favourites are per-library
(`/dk-pod/dk/plugins/<plugin>/libraries/<lib>/favourites/`), not shipped.

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

**Help and the ☰ menu are context-sensitive** to the active tab: the `?`
button opens the active plugin's help (dk's own help is the fallback); a
plugin's `#Menu` items appear in ☰ below a separator while its tab is
active (e.g. the player's Filters / View deleted / Install / Update). The
global settings page lives under **☰ → Customize ▸ Customize Preferences**
(no Settings… item in ☰).

## Customize — build the UI with the UI

**☰ → Customize** opens a sub-tabset (pages/customize.html; more subtabs
to come):

1. **Customize Plugins, Menus, & buttons** — the catalog
   (`<sol-plugin-manager grouped source="data/plugins-catalog.ttl#Available">`,
   topic tabs, two cards wide) beside the menu/bar managers as an ACCORDION
   of drop targets (`heading=` / `accordion=` / `open` on
   `<sol-menu-manager source="data/data-kitchen-main-menu.ttl#Tabs">` and
   `<sol-button-bar-manager source="data/data-kitchen-main-menu.ttl#Bar">` — "Customize Menu
   Tabs" opens first; clicking a header opens it and closes the other; both
   headers stay visible). Name items, drag to reorder, ✕ to remove; the add
   row is an input: drop a plugin on it, or type a name + Enter for a
   submenu. Entries the menus already mount are hidden from the catalog box
   (the `for=` pairing) and reappear when dragged off. Drop or type a
   manifest URL to add a plugin (a `ui:Component` with `ui:name`, or a
   `ui:Link` with `ui:href` for an external app).
2. **Customize Preferences** — the global settings page (pages/settings.html):
   the preferences form (color scheme, font size, CORS proxy) sits OPEN at
   the top — no accordion to expand — and below it `<sol-settings>` collects
   one panel per editable plugin the running page mounts (Search and
   Calendar always; Weather/Time etc. when a tab uses them). Navigation
   tabsets, the ☰ button, and the form itself opt out of that discovery
   with `data-settings-skip`.

Rows are three columns — name field | plugin chips | ✕ — and chips show the
catalog's display names (the managers' `catalog=` attribute). A menu item
holding several plugins lists them all as chips; dragging a chip onto
another chip's left/right half REORDERS the plugins within the item, and a
chip dropped on another row moves the plugin there. A chip repeating its
item's own name is the submenu-conversion artifact and is never shown — in
the form or the shell ("a menu item that calls a submenu is not also an
item on the submenu"). In the shell, an all-component submenu renders its
plugins stacked in the pane; a submenu containing links renders as a nested
sub-tab strip whose link panes embed the site (filling the pane). There are
no Save buttons — every editor auto-saves.

The catalog is ONE `#Available` list GENERATED from the flat one-file
manifests in `plugins/` (`plugins/<entry>.ttl`) by
`tools/seed-plugins-catalog.mjs` — the seeder holds no content; edit a
manifest and re-seed. "In use" simply means `data/data-kitchen-main-menu.ttl` mounts it.
**☰ → All Plugins…** browses the same catalog read-mostly (guests too).

Saving rewrites the whole Turtle document (unreferenced "pantry" items are
preserved). The shell is **rdf-first** — `data/data-kitchen-main-menu.ttl` is the only live
artifact, so a save IS the source of truth; there is no companion HTML file
and no sync. `src/dk-tabs-rdf.js` reacts to a save by updating the running
shell **in place** (no reload): an edited tab re-renders from its new
definition while unchanged tabs keep their keep-alive panes (change detection
via the generator's canonical emission, so renames/reorders never disturb
live panes), and the bar launchers rebuild with the chrome kept untouched.
Deleted mandatory chrome items are self-healed on load.

Prefer editing the shell as HTML? Round-trip it offline: `npm run rdf2html`
emits an editable snapshot (`tools/conversion/shell.html`), `npm run html2rdf`
merges your edits back into `data/data-kitchen-main-menu.ttl` (pantry and `#Chrome` preserved) —
see `tools/conversion/README.md`.

`ui:Link` tabs/children round-trip too: a link emits as a plain anchor with
no `data-handler` (`target=` encodes `ui:region` — tab ↔ `_blank`, inline ↔
`_self`); `ui:icon` has no HTML spelling and lives in the RDF only.

The help button, ☰ menu and sign-in are **chrome** — now modeled in
`data/data-kitchen-main-menu.ttl#Chrome` (config-editable: help target, icon, ☰ menu source,
issuers) and emitted between the `chrome:begin/end` markers. They're fixed shell
furniture: not in the plugin lists, and self-healed if a hand-edit deletes one.
`rdfs:comment` on any item round-trips as the HTML comment before it. The bar
carries search / calendar; theme, sign-in and Customize live in ☰ (settings
is a Customize subtab; retired definitions stay in tabs.ttl as pantry).
Sign-in is on-demand: the hidden
`sol-login` surfaces only during an auth flow.

## Verification

```bash
node claude/smoke-tests/verify-unified-shell.mjs     # every tab functional
node claude/smoke-tests/verify-customize-menus.mjs   # menu/bar editors: edit → auto-save (+ chip reorder)
node claude/smoke-tests/verify-customize-plugins.mjs # catalog + manifest import
node claude/smoke-tests/verify-live-tab-sync.mjs     # save → live in-place shell update (rdf-first)
node claude/smoke-tests/verify-link-tabs.mjs         # ui:Link submenus end to end
```

(Both need the servers up and Chrome; see the file headers.)

## Packaging

```bash
npm run dist                            # electron-builder, all linux targets (AppImage/deb/rpm)
npx electron-builder --linux AppImage   # just the AppImage
```

Artifacts land in `release/` (kept out of `dist/` so a build never bundles
its own previous output) and are named with underscores
(`Solid_Data_Kitchen-<version>.AppImage`).

`asar` is off: the bundled servers are spawned as plain node processes and
read their trees from disk. An AppImage mounts **read-only**, so in-app saves
(settings, Customize edits, the home pod, plugin data) need a writable pod
root. The packaged app provides one automatically: a **`data-kitchen-home/`
folder next to the executable** (the portable-app pattern — app and data travel
together); if that spot isn't writable it falls back to Electron's `userData`.
`resolvePodRoot()` order: `DK_POD_ROOT` env → a persisted `userData/dk-pod-root`
pointer (written by **Move my pod**) → install-dir → userData. On launch it
seeds `index.html` at the root, the rest of the definition under `/dk-pod/dk/`,
and provisions the `/dk-pod/` home pod + `!secret` owner account — this now runs
in dev too, since the seed destination (`/dk-pod/dk/`) differs from the
engine source.

## Provenance

This repo consolidates three earlier projects: the data-kitchen web shell,
the `electron` desktop wrapper, and `open_media_player` (whose history is
grafted into this repo's `main`). It builds on the Solid stack —
rdflib, solid-logic, solid-ui — via `sol-components` and `component-interop`.
