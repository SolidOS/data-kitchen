# Data-Kitchen Consolidation Plan

*Drafted 2026-06-10. Status: approved as a plan; no build phase has a GO yet.*

## Context

dk (`/home/jeff/solid/data-kitchen`, currently just `notes.md`) is to become a
single Electron app — packaging a Solid server ("pivot" = Community Solid
Server), a CORS proxy, and a shell app of plugins — eventually replacing
https://github.com/solidOS/data-kitchen (Jeff controls it). It consolidates:

- **el** `/home/jeff/solid/electron` — Electron shell. `electron-config/main.js:106`
  loads `APP_URL` = `http://localhost:3000/data-kitchen/index.html`
  (`config.js:24`); `servers.js` spawns CSS (:3000, `pivot-config/no-auth.json`)
  and `proxy/index.js` (:3002); `preload.js` + `external-views.js` give native
  overlays for external content in `#dk-content`. Serves the app via a symlink
  `data-kitchen -> /home/jeff/data-kitchen`. Not a git repo.
- **old dk** `/home/jeff/data-kitchen` — current web app (git repo, branch
  `main`, no remote, one dirty file `data/data-kitchen-settings.ttl`).
  component-interop + sol-components shell; `data/menu.ttl` (ui:Menu incl.
  unreferenced "pantry" items `#Forum`, `#Chat`).
- **omp** `/home/jeff/solid/open_media_player` — look-and-feel model (git repo,
  no remote). `index.html` → `<sol-include source="./html-first.html">` →
  topmost `<sol-tabs id="omp-tabs" keep-alive>` with 7 tabs + action buttons.
  Known debt: UI hidden in JS (itemized below). Ceases to exist standalone.
- **sc** `/home/jeff/solid/sol-components` (npm v2.4.0, has remote) and
  **ci** `/home/jeff/solid/component-interop` (npm v0.2.3, has remote) —
  libraries dk uses. Menu machinery already exists: `core/menu-rdf.js` parses
  ui:Menu/ui:parts (RDF Collection — order-preserving), ui:Component
  (`ui:name` + `ui:attribute [schema:name/schema:value]`), ui:Link, ui:label,
  ui:orientation, acl:mode; `web/menu-from-rdf.js` opt-in; sol-feed threePanel
  has working palette→bar drag-drop; omp `conversion/` has an HTML↔RDF
  round-trip generator (`rdf-to-html.mjs --verify`).

## Hard constraints (Jeff's rules — apply to every phase)

1. **All existing folders (el, omp, old dk, ci, sc, …) are left AS IS.** Parts
   needed are **copied** into dk. No moves, no edits, no symlink removal in
   source folders. (Exception: sc receives the new builder components — see
   choice points for anything in sc beyond those new files.)
2. **No new RDF terms or HTML attributes without asking** — builders use the
   existing ui:Menu vocabulary exactly as `core/menu-rdf.js` parses it. Any
   spot that seems to need a new term/attribute stops and becomes a question.
3. **No sourceless includes** — every `<sol-include>` names `source=` in
   markup; components carry full attributes in markup; HTML/text/md lives in
   its own files.
4. **Nothing is pushed/published without an explicit per-action GO.** Remote
   landing and npm publishing are planned but execute-only-on-go.
5. Stack ordering wherever listed: rdflib, solid-logic, solid-ui.
6. Meaningful file names everywhere.

## Decisions already made by Jeff

- New dk index = omp look & feel: one topmost `<sol-tabs>`; tabs are the UNION
  of omp's tabs and the old-dk subapps dk wants — all plugins.
- The three builders are **new reusable components in sc**, names approved:
  `<sol-menu-builder>`, `<sol-bar-builder>`, `<sol-plugins-available>`, reusing
  existing attribute conventions (`source=`, `for=`).
- Builders read/write existing ui:Menu; save = serialize + rewrite the whole
  Turtle doc (no list PATCHing); unreferenced "pantry" subjects preserved.
- Palette catalog = curated ui:Menu palette doc (`data/palette.ttl`), seeded
  once from interop manifests, hand-curated thereafter.
- **Button bar = the actions row of the topmost sol-tabs.** Users name buttons
  (login, search, …) in the bar builder and drag palette entries (incl. action
  components like sol-login) onto them; generated buttons land as non-anchor
  children of `<sol-tabs>` (sol-tabs re-homes those into its actions row).
  RDF-wise a bar is a flat `ui:Menu` (`ui:orientation ui:Horizontal`) — where
  it renders is declared in HTML, not RDF. No new vocabulary.
- Git: preserve old dk's local history; eventual landing on
  solidOS/data-kitchen `main` preserves both histories.
- **Plugin self-containment:** ALL resources of a plugin live in that
  plugin's folder — source scripts, assets, AND its RDF libraries/data.
  ia-player (serving both Music and Movies) is one folder holding both
  libraries. Rationale: eventual tree-shaking — a user downloads only the
  plugins they want.
- **The actions-row items ARE plugins too** (Jeff): login, search, calendar,
  theme/fontsize etc. are plugins the user can omit or retain, managed by
  the button bar (the bar builder edits which of them appear in the tabset's
  actions row). They get self-contained `plugins/` folders and palette
  entries like any other plugin. **Exceptions — chrome: the menu button (⋮)
  and the help button.** Both are declared by the shell itself and are not
  bar-builder-managed (a user who wants help gone can edit the HTML by hand —
  it's declarative markup, so that remains possible). So the root shell is
  index.html, html-first.html, the shell stylesheet, dk-shell.js, the ⋮ menu
  and help buttons, and the menu/tabs/palette/settings docs.

## Execution now vs later

**The only step executed now:** this plan document itself. All phases below
await explicit per-phase GO.

## Target layout of dk

Web app at repo root (CSS server root = repo root, replacing the symlink trick;
revisit at packaging). Copied-in pieces:

```
/home/jeff/solid/data-kitchen/
├── .git/                      ← via git clone of /home/jeff/data-kitchen (history preserved, original untouched)
├── package.json               ← merged web + electron (name "data-kitchen", main electron-config/main.cjs)
├── notes.md                   ← committed
├── index.html                 ← NEW omp-style shell
├── html-first.html            ← NEW topmost <sol-tabs> declaration (canonical UI source)
├── dk.manifest.json           ← extended: + ia-player, omp-images, dk-* components
├── esbuild.config.mjs
├── electron-config/           ← copied from el (entry files renamed .cjs — see Electron changes)
├── proxy/                     ← copied from el (dependency-free CORS proxy, :3002)
├── pivot-config/              ← copied from el
├── bin/                       ← copied from el (cleanCache etc.)
├── src/                       ← SHELL-ONLY code (dk-shell.js, dk-styles.css, chrome pieces);
│                                plugin scripts do NOT live here
├── plugins/                 ← one SELF-CONTAINED folder per plugin: its scripts, assets,
│   │                            pages, AND its RDF libraries/data (tree-shaking-ready)
│   ├── ia-player/             ← omp src/ia3.js, ia-rdf.js, ia-ui.js, omp-favourites-*.js
│   │   ├── assets/            ←   + extracted shells/modals (Phase 5)
│   │   └── libraries/         ← internet_archive_music/ + internet_archive_movies/ (one place —
│   │                              ia-player serves both Music and Movies tabs)
│   ├── omp-images/            ← omp-images.js + extracted omp-images.css
│   │   └── libraries/         ← wikimedia_images/
│   ├── news/                  ← libraries/news feeds.ttl (sol-feed threePanel config/data)
│   ├── home/                  ← home.html (NEW, extracted dashboard) + its feeds.ttl
│   ├── podz/                  ← dk-podz.js + dk-podz.html (from old-dk src/+pages/)
│   ├── solidos/               ← dk-solidos.js + dk-solidos.html + solidos-host.html
│   ├── solid-resources/       ← resources.html (omp's, merged with old-dk's 5 iframe links)
│   ├── dev-tools/             ← dev-tools.html (omp's, merged with old-dk's 4 playgrounds)
│   ├── customize/             ← dk-customize.html hosting the three builders (Phase 6)
│   │                          — bar-managed plugins (actions-row residents, equally
│   │                            omit-or-retain-able):
│   ├── search/                ← sol-search markup fragment + search-engines.ttl (omp ∪ old-dk)
│   ├── calendar/              ← dk-calendar-popout.js/html + calendar-settings.ttl (merged)
│   ├── login/                 ← sol-login markup fragment + issuer config + popup-callback.html
│   └── appearance/            ← theme/fontsize buttons fragment
│                              (help is NOT a plugin — it's chrome; see help/ at root)
├── assets/                    ← SHELL look only (omp.css → dk chrome stylesheet, icons);
│                                mini-player.html lives with ia-player (its plugin)
├── data/                      ← SHELL docs only: menu.ttl, tabs.ttl, palette.ttl (NEW),
│                                data-kitchen-settings.ttl
├── pages/                     ← shell-level pages (settings.html, …)
├── help/                      ← merged help content (old-dk help/ + omp help files) — chrome,
│                                served by the shell's fixed help button
├── importmaps/  shapes/  tools/ (incl. tools/conversion/ copied from omp)  test/
└── claude/plans/data-kitchen-consolidation-plan.md   ← this plan
```

Copying into plugin folders means the self-referencing `./libraries/...`
paths inside omp's TTL/HTML must be rewritten to the new locations (e.g.
`plugins/ia-player/libraries/internet_archive_music/index.ttl`) — done at
copy time, verified by loading each tab. Each plugin folder is the future
tree-shaking unit (its `dk.manifest.json` entries point only into its folder;
a later phase can give each folder its own manifest fragment).

Do NOT copy: editor backups (`#*#`, `*~`, `.#*`), omp `*.ttl.pre-*` snapshots,
el `drafts/`/`dist/`/`noel.txt`/legacy `index.html`/`test-tabs.html`, old-dk
`drafts/`, any `node_modules/`.

## Git strategy

### History preservation (build phases; sources untouched)

1. Park `notes.md` aside; `git clone /home/jeff/data-kitchen /home/jeff/solid/data-kitchen`
   (full history copied; original repo untouched); restore + commit `notes.md`;
   tag `pre-consolidation`.
2. The dirty file: `cp /home/jeff/data-kitchen/data/data-kitchen-settings.ttl`
   into the clone and commit there (avoids committing in the old repo).
3. omp history graft (**C1, approved**): in dk,
   `git remote add omp /home/jeff/solid/open_media_player && git fetch omp &&
   git merge --allow-unrelated-histories -s ours omp/main -m "Absorb open_media_player (history graft)" &&
   git remote remove omp`. Read-only on omp; the omp folder remains untouched
   as an archive.
4. el is not a git repo — its pieces arrive as plain copies + commits.
5. Old electron setup keeps working throughout (nothing moved/removed there).

### Remote landing — EXECUTE-ONLY-ON-EXPLICIT-GO

```
git remote add origin https://github.com/solidOS/data-kitchen.git
git fetch origin
git merge --allow-unrelated-histories -s ours origin/main -m "data-kitchen 2.x: consolidated …"
git push origin main      # fast-forward; both histories preserved; no force push
```
Pre-push check: `git merge-base --is-ancestor origin/main main`; fresh
`git clone` + `npm install` + `npm start` from a temp dir works. Tag `v2.0.0`.

## New index.html (omp-modeled; existing components/attributes only)

```html
<head>
  <link rel="stylesheet" href="node_modules/sol-components/web/styles/root.css">
  <link rel="stylesheet" href="src/dk-styles.css">
  <link rel="stylesheet" href="assets/omp.css">
  <script src="…vendored inrupt solid-client-authn UMD…"></script>   <!-- local, not CDN -->
  <script src="node_modules/component-interop/component-interop.js"
          data-stage="auto"
          data-manifest="node_modules/sol-components/dist/sol-components.manifest.json dk.manifest.json"
          data-components="… union of needed components … ia-player omp-images"></script>
  <script type="module" src="dist/dk.bundle.js"></script>
</head>
<body>
  <sol-default label="Preferences" theme="dark" fontsize="medium"
       proxy="http://localhost:3002/proxy?uri="
       source="data/data-kitchen-settings.ttl#Settings" …></sol-default>
  <nav class="dk-chrome-bar"><sol-include source="plugins/ia-player/assets/mini-player.html" trusted></sol-include></nav>
  <main id="dk-content" class="dk-panels">
    <sol-include id="dk-body" source="./html-first.html" trusted></sol-include>
  </main>
</body>
```

- `#dk-content` kept ⇒ `config.js` `CONTENT_SELECTOR` + external-views work unchanged.
- Settings URL relative (not `http://localhost:3000/...`).
- **Canonical UI source = declarative `html-first.html`** (omp-proven;
  inspectable/diffable; no rdflib before first paint). `data/tabs.ttl` +
  `data/menu.ttl` kept in sync via the generator
  (`tools/conversion/rdf-to-html.mjs --verify` round trip). Builders write RDF
  → generator regenerates HTML.
- `html-first.html`: `<sol-tabs id="dk-tabs" keep-alive>` with the union tabs
  as `<a>` anchors + non-anchor children → actions row, consisting of: the
  bar-managed plugins (search, calendar, appearance, login — each
  omit-or-retain-able via the bar builder, fragments living in their
  `plugins/<name>/` folders, emitted here by the generator) and the
  **chrome: the help button and the ⋮ menu button (sol-dropdown-button)** —
  declared directly by the shell, never generated or bar-managed (removable
  only by hand-editing this declarative file).

## Plugin migration map (union + dedupe)

| Tab | Source | Markup (sources under each plugin's own folder) | Notes |
|---|---|---|---|
| 🏠 Home | old dk | `sol-include` → NEW `plugins/home/home.html` | extract old-dk index.html inline Home block (sol-weather, sol-time, sol-feed dashboard); its dashboard feeds.ttl lives beside it |
| 📰 News | omp | `sol-feed view=threePanel` → `plugins/news/feeds.ttl#Feeds` | Home's feed list stays separate (default D4) |
| 🎵 Music | omp | `ia-player storage-ns=music defer` → `plugins/ia-player/libraries/internet_archive_music/index.ttl` | |
| 🎬 Movies | omp | `ia-player storage-ns=movies favourites-only defer` → `plugins/ia-player/libraries/internet_archive_movies/index.ttl` | one ia-player folder serves both tabs |
| 🖼 Images | omp | `omp-images` → `plugins/omp-images/libraries/wikimedia_images/images.ttl#Images` | |
| 🗂 Podz | BOTH | `dk-podz` → `plugins/podz/` | default D1: old-dk wins; omp's checked-in `workspaces/podz.bundle.min.js` not copied |
| 🐧 SolidOS | old dk | `dk-solidos` → `plugins/solidos/` | unchanged behavior |
| 📚 Solid Resources | BOTH | `sol-include trusted` → `plugins/solid-resources/resources.html` | merge old-dk menu.ttl's 5 iframe links into resources.html |
| 🛠 Dev Tools | BOTH | `sol-include` → `plugins/dev-tools/dev-tools.html` | merge old-dk's 4 playground iframes in |
| 🎛 Customize (Phase 6) | NEW | `plugins/customize/dk-customize.html` | hosts the three builders |

ia-player / omp-images live **inside dk** under `plugins/`, registered via
`dk.manifest.json` (default D2; extractable later if a second consumer appears).
Merge `search-engines.ttl` and `calendar-settings.ttl` (omp ∪ old-dk; default
D3). Old-dk's `dk-calendar-popout` wins over omp's near-twin.

## omp JS-extraction cleanup (during/after absorption; sources = dk copies)

| # | File (in dk's plugins/) | Extract to |
|---|---|---|
| 1 | `ia-player/ia-ui.js:22–154` ~130-line shell innerHTML | `plugins/ia-player/assets/ia-player-shell.html` |
| 2–6 | `ia-ui.js` modals: about 978–984, filters 1016–1054, playlist-edit 1135–1160, library-edit 1197–1218, track-edit 1262–1287 | `…/assets/modal-*.html` (one file each) |
| 7 | `omp-favourites-ui.js:36–45` favourite prompt | `…/assets/modal-favourite-prompt.html` |
| 8 | `omp-images.js:30–89` 60-line CSS string | `plugins/omp-images/omp-images.css` |
| 9 | `omp-images.js:567–587` add-form builder (borderline) | extract if mechanical, else leave + note |
| 10 | `ia3.js:1543–1593` add forms; `ia3.js:2642` notice banner | small fragment files |

Data-driven row/list rendering stays in JS (acceptable per rule). Every include
names `source=` in markup or a static fragment file.

## Builders (in sc — new files; anything else in sc = choice point)

New files in sc only:
- `core/menu-serialize.js` — inverse of `core/menu-rdf.js`: item tree + original
  store → complete Turtle. Emits `ui:parts` as a real `( … )` collection
  (order); **re-emits all subjects not in the rebuilt tree** (pantry rule).
  Whole-doc PUT. Round-trip unit test incl. pantry preservation against a copy
  of dk's real `menu.ttl` (`#Forum`/`#Chat` must survive).
- `web/sol-menu-builder.js` — tree of label inputs; add item/submenu, delete,
  drag-reorder; `source=` names the Turtle doc + `#fragment` (absent ⇒ new
  doc). New leaves = `ui:Component ; ui:label` with no `ui:name` until a
  palette drop assigns one (verify parser tolerates missing ui:name; else ask).
- `web/sol-bar-builder.js` — depth-1 variant over the same editing core; edits
  the flat actions-row ui:Menu.
- `web/sol-plugins-available.js` — draggable cards from `source=` (palette doc);
  `for=` names the builder(s) it feeds; drop assigns `ui:name` +
  `ui:attribute` set. Drag-drop: use sol-feed threePanel
  (`web/sol-feed.js` ~850–1286, `web/utils/feed-edit.js`) as the reference,
  but **adapt and improve rather than clone** — Jeff rates that implementation
  "ok but not great." sol-feed itself stays untouched (D5).

**Choice points — sc touches beyond new files:**
- **C2 (approved):** registering the three components in
  `sol-components.manifest.json` / package exports (small edits to existing
  sc files — required for interop loading).
- **C3 (NO, per Jeff):** do not refactor sol-feed onto a shared drag util;
  leave sol-feed alone.

dk side: `data/palette.ttl` (curated ui:Menu of ui:Component entries; seeded
once by `tools/seed-palette.mjs` from the manifests — entry attributes point
into each plugin's folder), `plugins/customize/dk-customize.html`
declaring the builders with full attributes, e.g.
`<sol-menu-builder source="data/tabs.ttl#Tabs">`,
`<sol-plugins-available source="data/palette.ttl#Palette" for="sol-menu-builder, sol-bar-builder">`.
Gate via existing `acl:mode acl:Write` / `if-logged-in`. Save → run generator →
reload; same path edits existing menus. Any capability needing a new RDF
term/HTML attribute ⇒ stop and ask.

## Electron changes (in dk's copies only)

- `config.js`: `APP_URL` → `http://localhost:3000/index.html`; symlink comment
  block rewritten; `POD_ROOT` stays `REPO_ROOT`; `CONTENT_SELECTOR '#dk-content'`
  unchanged.
- `servers.js`, `main.js`, `preload.js`, `external-views.js`: unchanged logic.
- package.json merge: name `data-kitchen`, `main: ./electron-config/main.cjs`;
  root keeps `"type": "module"` ⇒ electron entry files renamed `.cjs`
  (main, config, servers, preload, external-views, electron-utils,
  reader-chrome-preload) with requires updated — mechanical.
- Deps merged from el: `@solid/community-server ^7`, `@solid/pivot`, `mashlib`;
  verify whether `express`/`cors`/`jsdom` are actually used (proxy looks
  dependency-free) before carrying them. devDeps: `electron ^40`,
  `electron-builder`.
- Packaging (Phase 7): narrow electron-builder `files`; `asarUnpack` (or
  `asar:false` first) for CSS/pivot/mashlib + `pivot-config/` (servers spawn
  binaries from disk); vendor the inrupt UMD locally (no CDN in a desktop app).

## Dependency strategy

- Development: `"sol-components": "file:../sol-components"`,
  `"podz": "file:../podz"`, `"component-interop": "^0.2.3"` (script from
  node_modules). file: needed because builders land in sc concurrently.
- Before remote landing (gate): publish sc ≥2.5.0 (builders) **on explicit
  GO**, pin `^2.5.0`; podz remains file:/git-dep until published (flag at gate).

## Phases & verification (each ends with the app launching)

Standard check = `npm start` from dk; watch for `[css] … listening`, window
opens, no `[app] load failed`; kill any dev server on :3000 first (servers.js
reuses an existing one).

- **P0 Snapshot (½d):** clone-prep checks; record HEAD shas of old dk, omp, sc;
  confirm old electron app still starts. Sources untouched throughout.
- **P1 Clone (½d):** git-strategy steps 1–3 (incl. C1 graft). Verify:
  `git log` in dk shows old dk's initial commit; old el app still runs as before.
- **P2 Copy in the electron shell (1–2d):** copy electron-config/proxy/
  pivot-config/bin; package.json merge + `.cjs` renames; `APP_URL` edit; fix
  `file:` dep paths (from /home/jeff/solid/data-kitchen these become
  `file:../sol-components`, `file:../podz`); `npm install`; commits in logical
  chunks. Verify: `npm start` in dk shows the current old-dk app at
  `http://localhost:3000/index.html`;
  `curl 'http://localhost:3002/proxy?uri=https://example.com'` works; external
  link → native reader overlay.
- **P3 Absorb omp (1–2d):** copy omp pieces into self-contained
  plugin folders (ia-player with both IA libraries, omp-images with
  wikimedia_images, news, solid-resources, dev-tools — minus junk &
  workspaces/), rewriting the `./libraries/...` self-references at copy time;
  shell assets → assets/; conversion → tools/conversion; merge shell data/;
  fold omp manifest entries into dk.manifest.json (paths into plugins/);
  interim `omp.html` entry (paths fixed, interop from node_modules). Verify:
  Music tab plays a track; News threePanel renders; Images render via :3002
  proxy.
- **P4 Unified shell (2–3d):** new index.html + html-first.html;
  plugins/home/home.html; merged resources/dev-tools/help; retire omp.html +
  old sol-menu header (menu.ttl kept, pantry intact); `npm run build`. Verify:
  omp-look shell, click through EVERY tab; search/calendar/login/help/settings/
  theme/fontsize work; reader overlay still covers #dk-content.
- **P5 JS-extraction (2–3d):** items 1–10 above, one commit each. Verify per
  item: surface renders identically; `grep -rn 'innerHTML = \`' plugins/`
  trends to ~0 outside data-driven rendering.
- **P6 Builders (1–2w, sc + dk):** serializer+tests → menu builder → palette →
  bar builder → customize plugin + palette.ttl seed → generator
  generalization. Verify: sc tests pass (round-trip + pantry); in dk: build a
  menu, drag ia-player onto an item, save, `rdf-to-html.mjs --verify`,
  restart — new tab appears and works.
- **P7 Packaging & pruning (2–3d):** electron-builder config, vendor inrupt
  UMD, prune, README. Verify: `npm run dist`; AppImage runs with networking
  limited to localhost — Home + local tabs work offline.
- **P8 Remote landing (½d) — EXECUTE-ONLY-ON-EXPLICIT-GO:** publish sc (GO),
  pin deps, remote-landing commands, pre-push checks, push (GO), tag.

## Choice points & defaults (Jeff can override any time)

- **C1** omp history graft into dk — **APPROVED** (read-only on omp).
- **C2** sc manifest/exports edits to register the three new components —
  **APPROVED.**
- **C3** refactor sol-feed onto a shared drag util — **NO:** leave sol-feed
  alone.
- **D1** Podz: old-dk `dk-podz` + live podz dep wins (omp bundle not copied).
- **D2** ia-player/omp-images stay dk-internal under `plugins/`.
- **D3** merge search-engines.ttl / calendar-settings.ttl (omp ∪ old-dk),
  each living in its plugin's folder (`plugins/search/`,
  `plugins/calendar/`). *Why merge:* there is one search plugin and one
  calendar plugin, and both projects' files configure that same plugin;
  two lists would mean one is ignored or they're unioned at runtime anyway.
  One source of truth per plugin, in that plugin's folder. Easy to
  override if Jeff prefers one project's list to win outright.
- **D4** Home-dashboard feeds (in plugins/home/) and News-tab feeds (in
  plugins/news/) stay separate lists — also consistent with plugin
  self-containment.
- **D5** palette drag-drop adapted (and improved — "ok but not great") from
  sol-feed's threePanel reference; sol-feed untouched.
- **D6** CSS server root = repo root (as today via symlink); revisit at P7.
