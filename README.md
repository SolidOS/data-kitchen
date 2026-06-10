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

The app view loads `http://localhost:3000/index.html`, served by:

- **pivot** (`pivot/`) — a Community Solid Server rooted at the repo, started
  from a **pre-compiled** componentsjs config (`pivot/dist/create-app.cjs`;
  see `pivot/compile-config.cjs` for why and `pivot/build-compiled-config.sh`
  to regenerate after config/dependency changes)
- **proxy** (`proxy/index.cjs`) — a dependency-free CORS proxy on :3002

Both are spawned by `electron-config/servers.cjs` and killed on quit; if a
server already answers on its port it is reused. `npm run start-css` /
`npm run start-proxy` run them standalone for browser-based development.

## Layout

```
index.html          the shell: chrome bar + <sol-include source="./html-first.html">
html-first.html     the topmost <sol-tabs> — GENERATED from data/tabs.ttl
                    (chrome block preserved verbatim between chrome markers)
data/tabs.ttl       the RDF twin: #Tabs (tab menu) + #Bar (actions row)
data/palette.ttl    the plugins the Customize tab offers (a ui:Menu, curated)
plugins/<name>/     one SELF-CONTAINED folder per plugin: its scripts,
                    assets, pages, and RDF libraries (the tree-shaking unit)
src/                shell-only code (boot, tab wiring, auth, settings)
electron-config/    the Electron main process (.cjs)
pivot/ pivot-config/ proxy/   the bundled servers
help/  pages/  assets/  shapes/  favourites/   shell-level resources
tools/              conversion + palette seeding scripts
```

## Customize — build the UI with the UI

The **🎛 Customize** tab hosts three sol-components builders:

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

The help button and the ⋮ menu are **chrome** — fixed in `html-first.html`
(between the `chrome:begin/end` markers), not bar-managed; edit them by hand.

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
