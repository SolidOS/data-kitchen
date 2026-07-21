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
  **The ☰ shows MORE than this TTL when a plugin is active**: dk-tabs-shell's
  applyContext() sets the dropdown's `context-source` to the active plugin's
  manifest `#Menu`, appending those items below a separator. That's where
  "Filters…/View deleted/Install on my Pod…/Update app…" came from on media
  tabs (ia-player's manifest) — REMOVED 2026-07-10 per Jeff (the manifest
  #Menu block deleted in omp src + the pod copy). When hunting a mystery ☰
  item, check the active plugin's manifest.jsonld, not just the hamburger TTL.
- **The chrome has NO sign-in (2026-07-10):** `:chrome-login`/`:bar-login`
  removed from the main-menu TTL AND from dk-tabs-rdf's self-healing
  CHROME_DEFAULTS (it would have re-inserted them). News/media need no login;
  podz, SolidOS, and other apps carry their own sol-logins. dk-auth-router
  works off the shared AuthManager and never needed the element.
- `data-kitchen-plugins-catalog.ttl` — every plugin as a `ui:Plugin` entry
  (the ONE description each menu references — see "Plugin system"). Menus are
  reference lists over it; slot labels renamed 2026-07-18 for the discovered
  Customize headings: `#Tabs` "Menu Tabs", `#Bar` "Top Row Buttons", `#More`
  "☰ Menu".
- `data-kitchen-settings.ttl`; `data-kitchen-startup-{electron,pivot}.shacl`
  (the old combined `data-kitchen-startup-config.shacl` is split in two —
  window geometry vs ports + pod root — one Settings chip each)

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
**Play/pause ONLY since 2026-07-12** — the seek slider + time readout are
gone from omp's `mini-player.html` fragment (dk-tabs-shell's wiring
tolerates their absence; the hover tooltip still names the track).

**Boot sequence** (index.html, which is wormhole-guarded against recursive
framing): **sol-load** (sc's ci-free bootstrap, since 2026-07-14 —
parser-blocking classic script; injects the NONCE-PROPAGATED importmap and
imports the 11 `data-components`) → `dist/dk.bundle.js` (a direct module
that waits on `window.solLoadReady` — ci fallback kept — then imports the
dk modules). **component-interop is OFF dk's page**: the dep moved to
devDependencies (the manifest-envelope tests still validate against its
shapes), the dokieli identity adapter is PARKED (dokieli runs as an
external app; the in-app dk-dokieli editor still saves via imported
dkFetch), dk.manifest.json / dokieli.manifest.json are dormant files, and
build-web / packaged-smoke / the mobile packer no longer ship ci.
`window.ComponentInterop` still EXISTS at runtime — it's sc's services
surface aliasing itself to both names (core/services.js), not the broker.
data-handler needs no ci: sol-button consumes it natively.
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

## Plugin system (UNIFIED MODEL, 2026-07-18 — plugin-manifest-unification)

**One `ui:Plugin` entity = manifest = catalog card = mounted item.** Every
entry lives in `ui-data/data-kitchen-plugins-catalog.ttl` (the owner's live
working copy; `plugins/*.ttl` remain upstream SEEDS) and carries a REQUIRED
`schema:additionalType` discriminator plus **ONE payload predicate —
`schema:url`** (2026-07-19; replaced the ui:href/ui:module/ui:name trio) —
which the kind interprets:
- **`ui:Link`** — external app; `schema:url` is the URL to open (native
  reader overlay — see "External content" below).
- **`ui:Component`** — in-app custom element; `schema:url` is the ES module
  (**the element tag DERIVES from its filename**, e.g. `sol-clock.esm.js` →
  `<sol-clock>`; there is no separate tag predicate).
- **`ui:Command`** — `schema:url` is a fragment IRI in the command REGISTRY
  doc `ui-data/data-kitchen-commands.ttl` (`#restartApp`, `#toggleTheme`,
  `#cycleFontSize`) — the hyphen-free fragment is the key; dispatch-only,
  allow-listed in dk-tabs-shell. reloadApp/guestView/signIn stay
  registry-only (no entries, but the registry doc could list them later).

`:PluginShape` in sc `shapes/menu.shacl` (MIXIN rewrite 2026-07-19: concise
shapes, card/settings metadata PLUGIN-ONLY, retired spellings deleted)
constrains the one url per kind via `sh:xone` branches that DELEGATE to the
kind shapes via `sh:node` — `:LinkShape` (IRI-or-string) / `:ComponentShape`
(tag-shaped module filename) / `:CommandShape` (hyphen-free #fragment; NO
targetClass so bare registry fragments stay unbound) — each kind shape owns
its complete, REQUIRED `schema:url`. Shared blocks are node-level mixins
(`:IconMixin`, `:AttributedMixin`) which sc's forms expand via
`effectiveProperties()` (shape-to-form.js — dedup by path). Membership
helper shapes: `:OrderedItemShape` (positioned ListItem wrapper) /
`:UnorderedItemShape` (direct member + the reachable-label rule).
Shared metadata: `ui:label` (ONE label everywhere — card title AND
menu text; display overrides go through a `label` attribute pair),
`schema:description` (card blurb — NOT rdfs:comment, which stays a free
documentary note), `dct:publisher`, `schema:keywords` (topic categories →
Customize tabs), `dct:conformsTo`/`dct:references`/`schema:softwareHelp`
(settings shape / data doc / help), `ui:icon` (live favicon URL painted as
`<img>`, emoji as text), `schema:additionalProperty` pairs (region, if-logged-in, …; the ui:attribute spelling was RETIRED 2026-07-20). Also retired
2026-07-20: `ui:hoverTitle` (ci manifests' `title` key is now a `ui:label`
alias) and `schema:itemListOrder` (wrapper `schema:position` alone orders).
`data/ui-vocab.ttl` descriptions are Jeff's (from drafts/plugin-shape.md)
and the file is WRITE-FROZEN — no edits without a go naming it.

**Menus are REFERENCE lists, membership is positioned schema:ListItem
wrappers** (2026-07-19 — `ui:parts` rdf:Collections RETIRED everywhere except
the ui:Form forms vocab): a curated menu carries one `schema:itemListElement`
triple per member pointing at a placement wrapper —
`:More-Customize a schema:ListItem; schema:item data:Customize;
schema:position 1.` (`@prefix data: <data-kitchen-plugins-catalog.ttl#>`);
ordering comes from the wrappers' `schema:position` alone —
`schema:itemListOrder` was RETIRED everywhere 2026-07-20 (nothing ever read
it). Same idiom as
`#Locations`/`#Issuers`; wrappers exist so position lives on the PLACEMENT,
never the shared entry. The catalog `#Available` is an unordered SET — direct
membership, no wrappers (add plugin = ONE inserted triple; prune = one
delete). Reorder = swap two `schema:position` literals; add/remove = the
wrapper's few triples — statement-level PATCHes are now possible (the editors
still whole-doc-rewrite via `updateMenuInStore`, wrapper fragments are
deterministic `<menuFrag>-<memberFrag>`). Reader rule: an entry carrying
`schema:item` is a wrapper (deref + sort by position); otherwise the entry IS
the member. One placement per entry (want two placements → second entry with
its own label). In-use = referenced by a menu; the pantry subtracts by entry
identity. sc's parse resolves references cross-doc (`loadReferencedDocs`
follows `itemListElement`/`schema:item`) into the same in-memory item
descriptions consumers always used; serialize PRESERVES reference form (bare
refs re-emit as bare refs, never an inline copy). One-shot converter:
`claude/migration-scripts/migrate-menus-itemlist.mjs` (text-based, keeps
comments; the LIVE pod at `~/solid` still needs it). `manifest.jsonld` files
are DORMANT (facts folded into entries 2026-07-18; the dead `ui:parts`
context term and dk-pod ia-player's stale `#Menu` block were dropped).

Per-plugin settings are RDF-driven and gated on the plugin being in a menu
(`src/dk-plugin-settings.js`, rewritten entry-first): settings meta
(`dct:conformsTo` shape, `dct:references` data doc, help) reads off the
ui:Plugin ENTRY; subject = the item's `source` attr fragment/primaryTopic,
else the referenced doc's `foaf:primaryTopic`. The jsonld fallback is retired.

**Calendar is sc, not dk:** the bar item is `<sol-button data-handler="sol-calendar"
region="dropdown" source=…>` — one click conjures a `sol-dropdown` surface (sibling
of `sol-modal`/`sol-window` in `core/display-target.js`) hosting `<sol-calendar
hide-header>`. The old `dk-calendar-popout` wrapper is **deleted**. The same
`region="dropdown"` attribute pattern works for any widget.

**Placement: `ui:region` on CATALOG ENTRIES; attributes elsewhere (2026-07-20
reversal of the 07-17 retirement):**
- **A `ui:Plugin` catalog entry carries `ui:region <ui:Region IRI>`** (e.g.
  `ui:region ui:Dropdown` on the Calendar entry) — the entry is the editable
  deployment config, differentiated from the provenance manifest, so
  deployment aspects are first-class there. `:PluginShape` constrains it with
  `sh:in` over the seven ui-vocab regions (Inline/Element/Modal/Floating/
  Window/Tab/Dropdown) and the ✎ editor renders it as a constrained field.
- **INLINE menu items keep the `region` attribute-pair channel (schema:additionalProperty)** (`[ schema:name
  "region"; schema:value "modal" ]`, e.g. `:chrome-menu` in the main menu);
  sc's parse lifts either spelling into `desc.region` (attribute pair wins if
  both present). `if-logged-in` gating stays an attribute everywhere.
- **A `ui:region` ON A MENU is the default for members that carry none of
  their own** (item region always wins; submenus inherit until one sets its
  own). Parse marks inherited values `regionInherited` so saves never
  materialize the default onto items; menu-serialize round-trips the
  menu-level triple like `ui:orientation`. Purely additive — no menu sets
  one yet. NB the `'tab'` runtime keyword means BROWSER tab
  (`window.open`), not the app tabset — the tabset/button-bar → pane
  default is structural (`fallbackEl` in sc display-target.js), stays in
  HTML by decision 2026-07-20.
- Plugin seeds (`plugins/*.ttl` manifests) still carry NO placement — it's
  the deployment's decision — so a FRESH calendar install lands as a tab
  until the owner sets region on the entry. The
  plugin-manifest EDITOR discussed 2026-07-17 is BUILT (2026-07-18, ✎ on a
  pantry card — see "Plugin system"); the owner adds/edits the region
  attribute there. `seed-plugins-catalog.mjs` neither reads nor emits region.
- **`acl:mode acl:Write` is gone from dk data.** Owner-gating is the boolean
  `if-logged-in` attribute (`[ schema:name "if-logged-in"; schema:value "" ]`)
  on `<#MoreCustomize>`/`<#MoreSettings>` (hamburger) and `:panel-customize`.
  sc `gatedByParams()` (menu-rdf) maps an EMPTY-valued `if-logged-in` /
  `requires-write` param → `requiresWrite` → `part="requires-write"`; the
  VALUED form stays sol-include's alternate-source switch (Help "?"), NOT a
  gate. acl:mode still reads (legacy) and serialize emits it only for items
  not gated via params. The manifests' dead `acl`/`mode` @context entries
  were stripped (dk ×3, omp ×2, pod ×5).
- **KNOWN BUG (pre-existing, chip filed):** "View as guest" is a no-op in the
  desktop app — the synthetic owner session keeps `canWrite()` true, so
  `body.no-write` never engages. The CSS gate itself works (verified by
  forcing the class). Probes: `claude/smoke-tests/cdp-verify-gate-migration.mjs`
  + `cdp-verify-region-migration.mjs` (isolated instance, CDP 9223).

**A chip = a ui:Plugin ENTRY, not a component.** One module/tag backs many
entries (ia-player → Music & Movies; dk-solidos → browser, AddressBook, Tasks,
Chat, Notes, Meeting). Double-listing is structurally impossible now (one
entry, at most one referencing menu).

**The Customize page is ONE tag** (`pages/choose-plugins.html`):
`<sol-plugin-manager grouped source=…#Available>`. With no `for` attribute the
pantry SELF-DISCOVERS the app's plugin-holding UI slots — it scans the
document's declared menu sources (`[from-rdf], [source]`), keeps each doc's
root ui:Menus whose tree holds ≥1 ui:Plugin reference, and emits one editor
per slot ("Customize Menu Tabs" / "Customize Top Row Buttons" /
"Customize ☰ Menu" — heading = "Customize " + the root's ui:label;
`sol-button-bar-manager` only for a FLAT `ui:Horizontal` root, a root with
submenus gets `sol-menu-manager` whatever its orientation). Chrome (`#Chrome`)
holds no plugin references, so it never becomes a slot. `for` = legacy
hand-placed pairing, suppresses discovery.

**The entry EDITOR (✎ on an owned card, stage 6):** opens a modal
`<sol-form>` driven by `:PluginShape` (sc ships the shape beside its
components) with subject = the entry IRI. shape-to-form picks the entry's
`sh:xone` branch by its `schema:additionalType` (kind-aware payload field);
a Component's/Command's `schema:url` renders as a STATIC row (guard rails —
it names the tag / the key), a Link's is editable. Field edits PATCH the
catalog through solFetch (the gate-token
path — a bare fetch 401s); closing a dirty editor reloads the pantry and the
slot editors (chips re-resolve labels/icons from the entries). The entry IS
live config — the next parse propagates edits, no reinstall.

The catalog is RECONCILED (not regenerated) from `plugins/*.ttl` seeds by
`tools/seed-plugins-catalog.mjs` — additive only: new entries, missing
settings pointers, derived skos topic collections; drift is REPORTED, owner
edits never overwritten (`--force` = full regen). `schema:keywords` → topic tabs.
A labelled loaded component with no catalog entry appears as a ghost under
"Other". **Topic tabs always render** — a topic whose plugins are all in use
shows an "empty — …" hint instead of vanishing (only the synthetic "Other"
hides when empty). Audit tool: `claude/validation/audit-entry-references.mjs`
(dangling refs, one-placement, payload checks, local-path existence,
`*.invalid` origin leaks); `audit-double-listed.mjs` is retired with the
model that made doubles possible.

## App Builder (2026-07-19)

Users build STANDALONE apps on the pod. Entry: catalog `:App-Builder` (UI
Controls, catalog-only — place via Customize); its page
`pages/app-builder.html` is ONE `<sol-app-builder apps-root="dk-pod/apps/"
presets=… catalog=…>` tag. A built app = `/dk-pod/apps/<slug>/` holding
`app.ttl` (`schema:WebApplication`: `schema:name`, `ui:icon`, `ui:layout`),
`layout.ttl` (the `ui:Layout` tree), `app-menu.ttl` (seeded newborn menu),
GENERATED `index.html` + `app.css`. **The folder IS the registry** (a child
container whose app.ttl holds a WebApplication); the pod docs are the wizard
state, so any step can be re-entered and re-opening an app just works.

- **NEW ui: TERMS (Jeff-approved 2026-07-19):** `ui:Layout` (a page
  arrangement whose members render SIMULTANEOUSLY — vs `ui:Menu` whose
  members are alternatives; membership = the same positioned
  `schema:itemListElement` wrappers as menus since the ui:parts retirement;
  nested Layout = split, `ui:Component` leaf =
  content slot; empty layout = placeholder pane), `ui:layout` (app → root
  layout), `ui:columns` (grid column count). Also approved reuse:
  `schema:additionalProperty` on layout nodes (emitted HTML attrs; was ui:attribute until 2026-07-20) and
  `schema:additionalType` → semantic tag (SiteNavigationElement→nav,
  WPHeader→header, WPFooter→footer, WPSideBar→aside; the root's first
  unmarked layout child emits `<main>`, else `<div>`). Layout orientation
  defaults VERTICAL (a page stacks; menus default horizontal). Terms in sc
  `data/ui-vocab.ttl`; `shapes/layout.shacl` (+ generated shaclc twin) also
  IS the custom-layout editor (shape-driven sol-form — no bespoke editor).
  **NOT yet in the pending w3c ns-ui PR batch** (its own ask later).
- **sc pieces:** `core/layout-generate.js` (`generateAppHtml` /
  `generateAppCss` / `seedAppMenu` / `parseLayoutTree` / `menuSourcesIn`) —
  the RDF layout compiles at SAVE time into READABLE html (one sol-load tag,
  every element names its module/source/from-rdf; leaves emit via
  menu-generate's `emitBarItem`, so page markup ≡ menu markup; NO runtime
  region conjuring). Presets in `data/layouts/` (classic-shell, single-page,
  sidebar, dashboard-grid + `index.ttl`, an RDF index — never a directory
  listing; relative URLs mean copy-in needs no rewriting).
  `web/sol-app-builder.js` renders in **LIGHT DOM** (the pantry's `for`
  selector sees only page DOM); five steps (see 07-20 below), free jump-in.
  The Plugins step embeds `sol-menu-manager` per `from-rdf`
  doc + `<sol-plugin-manager for="#sab-managers sol-menu-manager">` (explicit
  pairing — self-discovery would find dk's own slots). Non-sol-* leaves get
  their own visible `<script type=module src=…>`; `components-base` attr
  picks /node_modules (default) or a CDN base for portable folders.
- **Menus stay runtime-rendered** (`from-rdf`) — menu edits need NO
  regeneration; only a LAYOUT change does (explicit Regenerate button).
- **Publish = catalog-only:** appends a `ui:Plugin` (kind ui:Link,
  `schema:url` the app's index.html, `schema:keywords "My Apps"`) to the
  catalog. PATCH (sparql-update) first; on failure — CSS's "Lock expired"
  500 on the big catalog doc, the same scar sol-form hit — falls back to
  full-IRI append + whole-doc PUT.
- Seeding on preset pick: each `from-rdf` doc missing on the pod gets
  `seedAppMenu` (orientation: sol-menu consumer → Vertical, else
  Horizontal); a `sol-include source="content.html"` leaf gets a starter
  content.html.
- **Tests:** sc `tests/core/layout-generate.test.js` +
  `tests/core/layout-shacl.test.js` + `tests/web/sol-app-builder.test.js`
  (jest's rdflib mock has NO turtle lists/blank nodes — fixtures parse with
  n3 INTO the mock store); dk contract suite covers the catalog entry.
  Probe: `claude/smoke-tests/cdp-verify-app-builder.mjs` (13 checks,
  isolated instance; the catalog check POLLS — the write can be slow).
- `~/solid/dk-pod/apps/` exists on the live pod; fresh installs create it on
  first app save (the builder tolerates the 404 listing). `sol-app-builder`
  is in both index.html copies' data-components; sol-load's baked map was
  regenerated (`npm run build:importmaps`).

### WordPress-style redesign (2026-07-20)

- **Five steps** (Jeff's naming): 1. Create/Choose App · 2. Select Layout ·
  3. Add Menus and Content · 4. Add Plugins · 5. Publish. Picking a layout
  advances straight to step 3.
- **Structural presets** replace the old four on the index (old .ttl files
  stay on disk for existing apps): `banner-main`, `banner-left-sidebar`,
  `banner-right-sidebar`, `banner-two-sidebars`, `banner-main-footer` in sc
  `data/layouts/`. Like WordPress themes they SHIP WITH theme chrome —
  banner ☰ (`sol-dropdown-button from-rdf app-menu.ttl#More`), sidebar
  `sol-menu` opening into `.app-main`, content includes — which step 3
  surfaces as ORDINARY removable/movable element rows. New class values:
  `app-banner`, `app-footer` (join `app-side`/`app-main`). No new RDF terms.
- **Select Layout cards carry a schematic DERIVED from each preset's RDF**
  (`parseLayoutTree` → nested boxes; aria-hidden, the ≥16px title/description
  stay the accessible text) — a user-supplied presets index gets correct
  diagrams for free.
- **Step 3 = region panels** mirroring the tree (semantic badge, rows per
  leaf with visible from-rdf/source, Move ↑↓ / Remove / Edit-menu accordion
  mounting `sol-menu-manager` in place, per-region Add-element palette:
  Menu w/ "items open into" pane picker over empty class-bearing regions,
  Tabs, Page content, Sign in/Clock/Calendar widgets, catalog ui:Component
  chips). Saves rewrite layout.ttl via **NEW sc `core/layout-serialize.js`**
  (`serializeLayout`/`addLeaf`/`removeLeaf`/`moveLeaf`; whole-doc PUT —
  attribute-pair blanks can't be SPARQL-DELETEd; round-trips exactly what
  parseLayoutTree reads, foreign hand-added triples drop on builder saves).
- **Generated apps got standard chrome:** head emits sc
  `web/scripts/prefs.js` + **NEW `web/scripts/app-commands.js`**
  (sol-command allow-list implementing `toggleTheme`/`cycleFontSize`, stored
  under swc-* prefs keys); app.css now APPLIES the theme vars
  (`html { background: var(--bg); color: var(--text) }`, body font vars) —
  root.css is variables-only, pages must apply (recurring lesson). The
  `<main>` claim recurses into wrapper rows (banner + row(aside, main) emits
  aside+main as siblings); sidebar rail `aside { flex: 0 0 14rem }`, middle
  row stretches, scroll stays on `main`.
- **Seeding is per-leaf** (`_seedDocsForLeaf`, runs on preset pick AND on
  element add): a `#More` from-rdf seeds the ☰ menu (Help link → seeded
  full-page help.html, Theme/Text size `ui:Command` items →
  `app-commands.ttl#toggleTheme`/`#cycleFontSize`, seeded registry doc);
  multi-menu docs APPEND missing fragments (app-menu.ttl holds #Menu AND
  #More — Turtle re-declares prefixes mid-doc fine).
- Command keys are hyphen-free schema:url fragments (`commandKeyFromUrl`);
  menu-from-rdf ships inside sol-basic so generated pages need no extra
  loader entry.
- Tests: NEW sc `tests/core/layout-serialize.test.js` (round-trip all nine
  presets, determinism, editors) + rewritten
  `tests/web/sol-app-builder.test.js` (7 tests, five-step flow).
- **Standalone Solid App Builder** lives at `~/solid/sol-app-builder/` — its
  own git repo (index.html + help.html, sc via node_modules symlink like the
  other siblings), served by dk `bin/standalone-pod.sh` (no-auth pivot on
  :3000, root ~/solid — gate off because no DK_GATE_TOKEN; loopback-only).

## Key plugins

- **sol-pod UX (2026-07-12):** a plain SINGLE click on a file opens its
  actions (inline ops / podClickAction / modal — same routing as the gear);
  modifier clicks stay pure selection for drag/copy. The pod dropdown's add
  entry is "＋ Add a Pod Location..."; the search placeholder is "Type to
  autocomplete search files ...". **pod-ops View-first (2026-07-12):**
  html / markdown / mermaid files open on a code-free View tab (the same
  preview live-edit shows — html iframe, marked, the shared mermaid
  renderer) with Live Edit one tab over; csv/turtle keep Live Edit first.
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
  (`ui:sortBy schema:position` → ↑/↓ arrows swap positions; Add mints the
  membership triple + `schema:ListItem` type + next position).
  `src/dk-locations-feed.js` is the two-way bridge: boot seeds the registry in
  position order (silent) BEFORE podz/dk-solidos import; `sol-form-save` on the
  settings doc re-syncs; NON-silent registry changes (discovery, user-added
  pods) auto-persist back as new entries. podz's localStorage `sessionPods`
  persistence is RETIRED (dk-boot one-shot `-v3` wipes the stale field; the
  `podz_v4` blob keeps layout/selection/prefs). Ordering caveat: a reorder in
  the form reaches the dropdowns on the next app start (the registry has no
  reorder primitive). Diagnostic access: dispatch `dk-diag-pod-registry` with a detail object (the window.dkPodRegistry global is gone 2026-07-14). Demo: sc
  `examples/pod-locations.html` (form + RDF + SHACL + shaclc, verified
  headless). Probe: `claude/smoke-tests/cdp-verify-pod-locations.mjs`
  (snapshots + restores the settings doc — rerunnable).
- **Sign-in issuers persist as a positioned list (2026-07-12):** `#Issuers`
  in the settings doc — same `schema:ItemList`/`schema:position` model as
  `#Locations` (shape: sc `shapes/oidc-issuers.shacl`; position 1 = the
  default). `src/dk-issuers-feed.js` reads it position-sorted and re-applies
  on `sol-form-save` — a reorder reaches the login buttons LIVE (no
  restart, unlike locations). The old `solid:oidcIssuer` triples and
  `<dk-issuers-editor>` (with its curated add-dropdown) are GONE — Add is a
  typed URL in the rolodex; the curated list survives only as the TTL seed +
  `src/shared/oidc-issuers.js` fallback. This RESOLVED the old
  "issuer order doesn't survive rdflib serialization" caveat.
- **Settings page = chip nav (2026-07-12):** `<sol-settings-nav>` (sc,
  loaded via sol-basic) renders one chip per `section` with a direct
  heading under its parent; exactly ONE group shows at a time (hidden attr
  + inline display — author `display:block` beats `[hidden]` alone). Chips
  derive from markup/runtime sections: Preferences, Pod locations, Sign-in
  issuers, per-plugin groups (dk-plugin-settings), per-widget groups
  (sol-settings), Electron, Pivot. Default selection TRACKS the first chip
  until the user picks one. sc's `<sol-settings>` renders flat
  `<section><h3>…</h3>editor</section>` per discovered widget now — the
  accordion rendering is DELETED, an empty sol-settings renders NOTHING.
  The chrome search-bar menu entry carries `data-settings-skip` so
  discovery doesn't double-list Search. Podz's settings chip is "Browser
  ignore paths" (the manifest.jsonld label — its only display use); the
  `ui:editorKeys` field is out of the form (live-edit manages it; the
  triple stays in pod-settings.ttl). Preferences lost the CORS-proxy field
  (the proxy is configured via its PORT in Pivot, and
  `dk-config-settings.syncProxyUrl` rewrites the `ui:proxy` URL's port on
  every Pivot save). Pivot has a plain **Pod Root** field (pim:storage —
  saveConfig adopts it; re-roots on reload, data NOT moved; "Move my pod"
  + dk:move-pod are REMOVED) and a permanent "Needs reload for changes."
  row; Electron (window geometry) applies live, no reload row.
- **sol-form editability model (2026-07-10, Jeff's rule):** every
  `<sol-form>` WITHOUT the `no-edit` attribute is fully editable — fields,
  Add/Delete, record search, reorder — everywhere, plain web included.
  Whether an edit persists is the SERVER's call (write access), not the
  form's. The old gates are gone: the `editable` attribute is no longer read
  and `kitchenLoggedIn()` no longer participates. Shape+subject container
  rolodexes (search engines, pod locations) got Add/Delete this way; their
  Add writes the container membership triple + the `sh:class` type + the
  next `ui:sortBy` position (`buildAddInserts`, exported for tests).
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

## 2026-07-14 plugin architecture overhaul (one big day)

- **sol-load (sc `web/sol-load.js`)** — ci-free bootstrap: ONE classic script
  tag injects the import map (baked at build, root-relative — same tag works
  from node_modules/pod/CDN, carries the page's CSP nonce-less inline map…
  place BEFORE any module script) and imports its `data-components`. Exposes
  `window.solLoad()` / `solLoadReady`. Skips injection if a map already
  resolves rdflib (ci coexistence). Map regenerates via `npm run
  build:importmaps` (also bakes into sol-load between markers).
  Bundles (sol-full is REMOVED; package.json "./web" export → sol-basic):
  `sol-basic` (everyday UI + menu-from-rdf — from-rdf works out of the box),
  `sol-pod-bundle` (pod+ops+wac+live-edit), `sol-form-bundle` (=
  core/rdf-bundle; `rdf-bundle` importmap alias kept).
- **sc help pages are ci-free** except authoring-components / shared-resources
  (ci is their topic); install-modes.html rewritten around sol-load.
  `SolidWebComponents.ready` → `window.solLoadReady` in the two pages that
  scripted it.
- **menu-consumer define-before-register race FIXED** (core/menu-consumer.js):
  an element upgrading before its module's registerMenuConsumer() call, with
  the add-on already installed, was neither wired nor parked → empty
  tabs/menus ~50% of parallel-import loads. ci's sequential loading always
  masked it. deferUntilLoader now wires the class + re-drives via
  queueMicrotask. GOTCHA pair: dropdown/tab triggers live in SHADOW roots
  (light-DOM textContent probes see nothing), and the browser HTTP cache can
  serve a stale module straight through a "fix isn't working" panic — verify
  on a fresh port.
- **Plugin description system unified (RDF, no ui:Plugin class):** ui:Link +
  ui:Component both carry the plugin surface — dct:publisher (dct:creator
  COLLAPSED into it everywhere: shapes, parse, serialize, byline, ttls ×3
  copies, manifest.jsonld files), dct:conformsTo (settings shape),
  dct:references (default data), schema:softwareHelp. NEW TERM `ui:module`
  (the ES module defining ui:name's element — in the PENDING w3c PR, 47
  terms, still NOT submitted; artifacts claude/prs/w3c-ns-ui-vocab/).
- **sc components are plain plugins:** sc `plugins/*.ttl` (7) are the SOURCE;
  `dist/sol-components.manifest.json` is GENERATED from them
  (tools/build-manifest.mjs + tools/manifest-base.json envelope; drift-guard
  test). omp likewise ships plugins/{ia-player,omp-images}.ttl.
- **sc `shapes/*.shaclc` are GENERATED twins** (2026-07-17): `.shacl` is
  canonical; `scripts/regen-shaclc.mjs` refreshes twins, `--check` compares
  without writing (byte comparison), and `tests/core/shaclc-generated.test.js`
  is the standing drift guard (runs on every sc `npm test`). House style
  (2026-07-20, Jeff's format): annotation blocks span three lines — property
  line ends `%`, one indented line of `sh:name ; sh:description`, closing
  `% .` at property indent; blank line between shapes. dk's `feeds.shaclc` +
  omp's four twins DON'T match what this generator emits (different
  provenance/formatting — unresolved, left alone).
- **dk settings = one lookup:** dk-plugin-settings reads the menu item's
  dct:source plugin doc (conformsTo/references/label); manifest.jsonld
  fallback stays for dk-own plugins; the sc-JSON branch (core/manifest.js
  helper) is retired from dk (helper remains as a JSON bridge).
  `tools/seed-sc-plugins.mjs` merges sc's canonical pointers into dk's
  deployment ttls (matches the schema:url-derived tag OR data-handler —
  catches the calendar launcher); run after sc updates, `--pod` for pod
  copies.
- **Lazy mount:** renderComponentItem→ensureHandler imports a menu item's
  `schema:url` module for ANY tag (http(s)-only; CSP gates foreign origins);
  menu-serialize + the plugin-manager install path round-trip it. sc `sol-*`
  tags ALWAYS lazy-loaded via sibling import when RDF-mounted. A dk plugin =
  one ttl + one self-contained ESM (demo: claude/smoke-tests/demo-star/).
- **Boot shrink:** index.html data-components (repo + ~/solid/index.html — the
  SHELL IS SERVED FROM THE POD ROOT copy) is now 11 tokens: sol-basic
  sol-pod-bundle sol-form-bundle sol-calendar sol-search sol-feed sol-gallery
  sol-login + 3 managers. ia-player/omp-images load via the media entries'
  schema:url modules; sol-time/weather/query lazy via
  sibling-ensure. KEEP-EAGER reasons: managers+form stack are raw tags in
  included pages (no ensure pass); omp's bundle uses sol-feed/sol-gallery as
  page-provided tags; bar-calendar's conjure path doesn't ensure.
- **Window globals gone (all but dkElectron):** dkFetch/dkActiveAuthTag are
  dk-auth-router MODULE EXPORTS (dk-solidos/dk-dokieli import them);
  dkPodRegistry replaced by the `dk-diag-pod-registry` request-event (the
  registry is bundle-internal — console import() gets a second instance).
  window.solidClientAuthn is REMOVED too (same day): sol-login/sol-form
  import inrupt via sc core/inrupt-global exports; dk-inrupt-global.js
  deleted from bundle + both shells; VERIFIED by a driven interactive popup
  login (CSS form → Authorize → "Log out"). inrupt's own
  solidClientAuthn:* localStorage keys are untouched.
- **sol-weather units:** ui:temperatureUnit is REPEATABLE (ui:Both is gone
  from vocab/shapes/data/code — both units listed = show both; shape [1..2]
  renders as one multiselect Choice via the existing ui:multiselect path).
- **sortBy:** ui:sortedBy renamed to ui:sortBy everywhere (sc code+shapes+
  examples, dk docs); ui-vocab.ttl no longer defines ui:name/ui:sortBy
  (upstream w3c terms used as-is).

## Media libraries availability sweep (2026-07-14)

- `claude/validation/check-media-libraries.mjs` sweeps all four media rooms'
  remote catalogs (movies/music/spoken = archive.org via ia-player's own
  query+cull logic; images = Wikimedia Commons categoryinfo) and reports
  dead collections / unplayable items; results merge into
  `media-sweep-results.json`, write-up in `media-availability-report.md`
  (same folder). The media LIBRARIES live in TWO copies: the pod
  (`~/solid/dk-pod/dk/plugins/{ia-player,omp-images}/libraries/…`) and the
  **omp repo** (`../open-media-player/libraries/…`) — dk's repo holds only
  the bundle. Pod resources exist twice on disk (`X.ttl` AND the
  extensionless resource's `X$.ttl` backing file, which can use
  extensionless refs) — edit BOTH variants.
- 2026-07-14 prune (`claude/migration-scripts/remove-dead-media-2026-07-14.mjs`):
  removed 3 dark movie collections, 1 dark music collection, Ishmael Reed
  (spoken), 49 dead Commons categories, 12 dark pinned releases + 2 dead
  tracks, 79 dead playlist entries; the emptied Stevie_Wonder +
  Wilson_Pickett playlists were then deleted (41 remain). Post-prune sweep:
  0 problems. GOTCHAS learned: Wikimedia 429s concurrent anonymous API
  calls (serial POSTs + Retry-After); IA advancedsearch rows cap = 10000
  (same as the app); a playlist whose every entry dies needs its
  `schema:itemListElement` property dropped, not an empty object list.

## Assorted 2026-07-12 facts

- **Tab icons:** sol-tabs paints a tab's `ui:icon` before its name (emoji as
  text, URL as `<img>`, class `.sol-tab-icon`) — News carries `ui:icon "📰"`
  in the menus now. Music still has 🎵 embedded in its LABEL (predates this).
- **Anchored dropdowns never overhang:** `core/anchor-place.js` clamps BOTH
  viewport edges, and `sol-dropdown-button` re-places on rAF + a popup
  ResizeObserver (the ☰ popup used to grow past the right edge after its
  first placement).
- **NEVER kill dk port-holders by bare port** — Jeff's own app's servers look
  identical to a test instance's. Only kill processes attributable to MY
  instance; better: run tests ISOLATED (throwaway `DK_POD_ROOT` +
  `DK_PUBLIC_PORT=18400 DK_CSS_INTERNAL_PORT=18410 DK_PROXY_PORT=18401` +
  `--remote-debugging-port=9223`) so Jeff's session is never touched.

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
- Issuers come from SETTINGS (`data-kitchen-settings.ttl#Issuers` — the
  positioned schema:ItemList; see the RDF-first section above), never
  hardcoded; position 1 is the default. Pods use `login-mode="popup"`; the popup callback
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
- **Same hole again, data edition (v2.1.5, 2026-07-10 — the Windows
  "404 on the local WebID" reports):** `pod-template/**` was ALSO never in
  `build.files` — packaged desktop builds shipped the personal-pod SEEDER
  but not the template data, so fresh installs never got
  `dk-pod/profile/card` (no WebID → discovery/podz degrade). Telltale log
  line: `[seed:pod] 0 new, 0 updated, 0 kept` (healthy ≈ 30+ kept). Android
  unaffected (prepare.sh copies the dir). Fixed + guarded by
  **`tools/packaged-smoke.mjs`** (`npm run release:smoke`; run automatically
  by `release:prep` while `release/linux-unpacked/` exists, skip with
  `--no-smoke`): static boot-critical-file assertions on the packed tree,
  then a real boot of the packed binary against a THROWAWAY pod home on
  spare ports (18400/18410/18401) asserting the seed plants files, the WebID
  card exists on disk, the app page loads, and the router answers.
- **Mac hardening (2026-07-13, v2.1.7):** the mac zip is the artifact nobody
  can test locally (no mac, no testers), so it gets three layers:
  1. `packaged-smoke.mjs` section **1b** statically checks the unpacked mac
     .app (`release/mac/`, present until release:prep prunes it): the same
     REQUIRED list, plus main-binary exec bit, framework symlinks intact,
     extraResources landed, Info.plist version. `SMOKE_MAC_APP=<path/to.app>`
     mode runs those checks AND a real boot of that bundle — used by
     **`.github/workflows/mac-smoke.yml`**, which downloads the released mac
     zip onto a `macos-14` (Apple Silicon) runner on every release publish
     (or manual dispatch with a tag) and boots it like a user would.
  2. `release:prep` step **1.5** injects **`READ ME FIRST.txt`**
     (`tools/mac-first-open.txt` — the Gatekeeper first-launch walkthrough;
     the app is UNSIGNED since it's cross-built on linux) into the mac zip
     next to the .app, then refreshes latest-mac.yml's sha512/size.
  3. Mac runtime fixes in v2.1.7: role-based application menu on darwin
     (`Menu.setApplicationMenu(null)` kills Cmd+C/V/X/A on mac — only
     there), pod root resolves BESIDE the .app bundle (`dirname(exe)` is
     Contents/MacOS *inside* it → pod died with every "replace the app"
     update, and translocated bundles are read-only), and window-all-closed
     quits on every platform (no activate handler → mac dock zombie).
  Next rungs when wanted: ad-hoc signing via `rcodesign` (works on linux, no
  Apple account; prerequisite for an arm64 zip), then notarization ($99/yr).
- **Mac VIDEO verified working (2026-07-17, the "videos do not play on
  macOS" reports):** mac-smoke gained a second "Video playback probe" step —
  `SMOKE_VIDEO=1` boots the .app WITH the GPU (the plain smoke boot uses
  `--disable-gpu`; users don't) + a CDP port, then runs
  **`tools/video-playback-probe.mjs`** (in tools/, NOT claude/, because
  claude/ is gitignored and CI needs it): codec matrix via canPlayType, a
  synthetic archive.org h.264 stream (retries once — /download/ 500s
  transiently), and a DRIVE_MOVIES=1 drive of the real Movies room. The
  v2.1.8 zip PASSED everything on the macos-14 runner (h.264 "probably",
  frames decoded, a real film streamed) — so the user reports are likely an
  older broken release (v2.1.0–2.1.5 were variously DOA), a film whose only
  derivative is unplayable, or machine-local. Notable: **Chromium dropped
  Theora — `.ogv` plays NOWHERE now**, but omp's VIDEO_EXTS/format-regex
  still treat it as playable (flagged, untouched); IA "512Kb MPEG4"
  derivatives are actually h.264 (ffprobe-confirmed) despite the name.
  packaged-smoke teardown fixes from the same session: `fail()` used
  `process.exit()`, which SKIPS `finally` — post-boot failures left a zombie
  app whose orphaned servers strand the next boot (the stale-server gotcha);
  now SIGTERM → 2s grace → SIGKILL in fail() AND the happy path (whose
  unref'd timers never fired), and `ELECTRON_RUN_AS_NODE` is scrubbed from
  the app's env so locals can run the smoke via electron-as-node.
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
  (needs the app or pod+servers). See `test/README.md`.
  **⚠ test:e2e server mode is STALE (found 2026-07-14):** its harness
  (`claude/smoke-tests/verify-unified-shell.mjs`, written 2026-06-15) asserts
  June-era shell conventions (Settings *out* of ☰, ☰ plugin items below a
  separator, a "Workspaces" tab, `dk-calendar-popout` in the bar), and its
  fixture — the gitignored repo-root `dk-pod/` — is a 2026-07-10 partial copy
  of the live pod's *customized* menus (9/23 `ui:module` refs). It fails 9
  checks identically on any recent commit; not a code regression (verified by
  a baseline worktree run). Needs a decision on what server-mode e2e should
  assert and which fixture to serve (pod-template seed?) before it's trusted
  again. The packaged-app CDP suite + `release:smoke` are the live gates.
  **Gotcha:** `npm install`
  rewrites the lockfile to the *registry* sc/ci and clobbers the local symlinks —
  re-link `node_modules/{sol-components,component-interop}` → `../../<pkg>` after.
- **Verify by driving the running app and measuring** (`claude/smoke-tests/`,
  Playwright) — don't theorize from CSS. "Works" must mean the UI actually
  painted (a real render root / visible content), not that an HTTP request
  returned. Some external catalog pods (`*.solidcommunity.au`) are
  Flutter/CanvasKit needing WebGL and load as empty shells under headless probes.
- **On-phone verify gotchas (2026-07-15, v2.1.8 S23 run):** a LOCKED or dozing
  phone reads as "page loaded but nothing painted" — document complete, body
  rect 0×0, `Page.captureScreenshot` hangs, and the WebView's devtools `/json`
  goes silent between commands. Wake + have Jeff unlock BEFORE trusting any
  paint probe (`wm dismiss-keyguard` is useless against a PIN); use
  `adb shell svc power stayon usb` while testing and revert after. Also:
  `innerText` stops at shadow roots, so nav-label checks must deep-walk
  shadow DOM — `claude/smoke-tests/cdp-verify-phone-release-boot.mjs` is the
  reusable release-boot probe (target discovery via
  `adb forward tcp:9223 localabstract:webview_devtools_remote_<pid>`).
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
    membership triples, not full-text); the device pod refreshes dk pages from the
    packed seed at boot, so page edits ride an APK rebuild.

## Updates & releases (2026-07)

- **v2.1.8 (2026-07-15):** first release carrying the sol-load boot /
  ci-elimination / one-lookup-settings work. Reconcile repaired v2.1.7's
  accidental DarkColorScheme and established the Locations-trim rule (below).
  Smoke gate + mac-smoke workflow green; S23 sideload verified same day.
  sc 2.7.4 + omp 0.3.4 published to npm the same day (sc 2.7.4 is what makes
  the help docs' CDN `sol-load.js` snippet resolve).

- **Every release starts with `npm run pull-defaults` (standing rule,
  2026-07-12):** before any `release:prep`/packaging, sync the repo's seed set
  to the live dev pod (`tools/pull-defaults.mjs` — menus, bar/buttons,
  settings, flat plugin manifests, news feeds; it is NOT chained into
  `release:prep`). Hand-reconcile whatever it reports as code drift and show
  Jeff before continuing. Three fixed reconcile rules: the repo's
  `ui-data/data-kitchen-settings.ttl` always ships
  `ui:colorScheme ui:SystemColorScheme` whatever the pod says (leave the pod's
  own value alone — v2.1.7 accidentally shipped DarkColorScheme, repaired in
  v2.1.8); losing repo-side `#` comments to the pod's re-serialization is
  fine; and the shipped `:Locations` list is ONLY the generic loc1/loc2
  (Data Kitchen Pod + Local Root) — runtime-discovered/personal pods that
  dk-locations-feed appended pod-side (Jeff's solidcommunity/inrupt pods,
  dev localhost ports) get trimmed on pull (Jeff, 2026-07-15). Also strip
  serializer-baked absolute `http://localhost:8000/...` prefix declarations
  the pull leaves in the header when the body no longer uses them.
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
