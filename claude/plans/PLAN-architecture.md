# data-kitchen (dk) — architecture & UI plan

## Status (as of 2026-05-24)

> **⚠️ 2026-06-08 — major architecture change.** `solid-web-components` was
> renamed to **`sol-components`** and re-architected to all-ESM + a
> `component-interop` loader. The `sol-loader` bundle, the
> `*.bundle.min.js` / vendor-UMD `<script>` tags, and the hand-inlined
> importmap described throughout sections 2–4, 9 below are **superseded**.
> See the **"Addendum 2026-06-08 — sol-components migration"** at the end of
> this file for the current loading model; treat the older sections as
> historical design context.

The three "visible bugs / UX" items at the top of section 13 (settings
accordion, podz.css theme scoping, single-mount podz keep-alive) are
all complete in the current source; see section 13's "Recently
resolved" sub-section for verification details and smoke-test paths.

The chrome and dashboard are fully declarative in `index.html` — the
component graph is readable end-to-end without opening JS. Major
moves since the initial Phase 0–3 build (in chronological order, so
the doc reflects what the current source looks like):

**Persistent tabs as the mount model.** `core/component-mount.js`
provides `mountInTarget({ target, name, tag, attrs, replace })` —
every menu item and every chrome button mounts into its own
`[data-menu-item="…"]` wrapper in `#dk-content`, hidden in place on
nav-away so internal state (login sessions, scrolls, in-flight
fetches) survives. `replace: true` switches a wrapper to "scratch
tab" semantics, used by external `ui:Link` items (auto-detected via
origin mismatch in `core/rdf-render.js`). sol-menu, sol-tabs, and
sol-button all go through this helper. Active-state visuals are
synchronised by a bubbling `sol-tab-activate` event the helper
emits.

**`<sol-button>` as a declarative launcher.** `web/sol-button.js` —
on click it mounts `<handler source="…" …>` inside `target`,
forwarding every non-reserved attribute through to the handler.
Reserved attrs: `handler`, `target`, `name`, `source`, `replace`.
The dk chrome uses it for **Settings** and **Help** (each is a
sol-button mounting `pages/settings.html` / `help/dk.html`); it
replaces what used to be `dk-help` and the prefs sol-modal.

**Discovery-based `<sol-settings>`.** `web/sol-settings.js` walks
light DOM + shadow roots, finds elements whose class declares
`static get editor()` or `static get shape()`, and builds one
accordion panel per editable widget with the editor lazily mounted
on first expand. Spec resolution lives in `core/editor.js`
(`resolveEditorSpec`, `buildEditorElement`). `editor-self` modal
flow on individual components uses the same helper.

**Shape-driven sol-form.** `web/sol-form.js` + `core/shape-to-form.js`
turn a SHACL `sh:NodeShape` into an editable form via solid-ui's
fieldFunction. shape-to-form now handles:
- `sh:node` nested shapes → `ui:Group` (wrapped in `ui:Multiple`
  when multi-valued); the list-of-sub-fields goes through an rdflib
  `Collection` so solid-ui's Group handler can read `parts.elements`.
- `sh:path [ sh:inversePath <pred> ]` → emits `ui:reverse "true"`
  on the synthesized `ui:Multiple` (solid-ui's own reverse support
  handles read + add).
- `sh:class <X>` → emits `ui:from <X>` on a `ui:Choice`; solid-ui
  enumerates instances of X at render time. Combines with
  `owl:imports` follow (now async) so a shape can pull in its
  enum-instance vocab from another TTL.
- Single-select Choices get a delegated change handler that mutates
  the store + PUTs the doc back via `updater.put` + dispatches
  `sol-form-save` (solid-ui's own Choice handler only autosaves in
  multiSelect mode). Synthesized form metadata is filtered out of
  the PUT body — only the subject's own triples persist.

**Component manifests.** Each `dk-*` and `sol-button` instance has
its non-trivial config in a co-located TTL: `src/dk-*.manifest.ttl`
under `<>` typed `ui:Component` with `dct:hasPart` / `dct:requires`
/ `owl:imports` listing its templates, vocab, and dependencies.
Classes expose `static get template()` and `static get manifest()`
returning the URLs. JS only handles wiring.

**Chrome chips via CSS mask.** Search / calendar / help / settings
are uniform `2.6rem` squares; the icon glyph comes from an SVG in
`assets/icons/` painted via CSS `mask-image: url(...)` and
`background-color: currentColor`, so icons track the page theme
without per-glyph code. HTML `<button>`s are empty.

**Settings as RDF.** `data/data-kitchen-settings.ttl` (lives on the
CSS pod at
`http://localhost:3000/data-kitchen/data/data-kitchen-settings.ttl`,
auto-seeded by `dk-settings-applier.js` on first load) carries
`ui:colorScheme`, `ui:fontSize`, `ui:editorKeys`, `ui:proxy` on
`<#Settings>` against the unified `shapes/data-kitchen-settings.shacl`. Value
classes + instances live in `data/ui-vocab.ttl` (`ui:ColorScheme` /
`ui:FontSize` / `ui:EditorKeys` each `rdfs:Class` with three
`rdfs:label`-bearing instances). `<sol-form>` in
`pages/settings.html` is the editor; `<sol-default>` reads the same
file for chrome-level knobs (`ui:proxy`). All four predicates plus
the value classes are declared in `data/ui-vocab.ttl` so a single
`owl:imports` of the vocab gives the shape and any consumer
everything it needs. The first-paint inline script in `index.html`
reads `localStorage['data-kitchen-settings']` so the chosen theme
and font apply before the cross-origin fetch returns.

**External-link convergence.** `sol-search` carries a
`schema:ItemList` shape at `data/search-engines.ttl#SearchEngines`
— a `schema:itemListElement` set of `hydra:IriTemplate` entries
with `dct:title` labels, `hydra:template "...{query}..."` URL
patterns, and `schema:position` for ordering
(`schema:itemListOrder schema:ItemListOrderAscending`). Read at
runtime by `feed-fetch.js#parseEngineList`; submitting expands
`{query}` against the selected template. `DEFAULT_ENGINES` in
sol-search remains as the fallback when no `source` attribute is
set or the fetch fails. (The previous SKOS+hydra+dct shape with
`dct:subject` back-pointers — which required SHACL inverse-path
and never worked at runtime — has been retired in favour of the
forward `schema:itemListElement` edge.)

**Deletions** that pruned the tree along the way:
`dk-account` (login lives in `sol-pod`), `dk-settings-quick` (gear
→ sol-button), `dk-help` (`?` → sol-button), `dk-prefs` (tile UI
→ `<sol-form>`), `dk-dashboard.css` (dead), `shapes/defaults.shacl`
(merged into `data-kitchen-settings.shacl`), `data/defaults.ttl` (merged into
`data-kitchen-settings.ttl`).

See "Next steps" near the end of this file for outstanding items.

## 1. Goal

dk is a single-page shell that hosts multiple "apps" (initially:
home/dashboard and podz), driven by an RDF menu. The shell unifies:

- one OIDC session pool across all apps (login once, all apps see it),
- one CSS theme + font-size, settable from the shell header,
- one importmap + one set of vendor bundles so no package loads twice,
- one menu (`<sol-menu from-rdf="data/menu.ttl">`) declared in RDF.

Eventual delivery is Electron; this plan stays pure-web so the
BrowserWindow wrapper is a thin afterthought.

## 2. What already exists in solid-web-components (swc) we lean on

Reading `/home/jeff/solid/solid-web-components/`:

- **`AuthManager` singleton** in `web/sol-login.js` (the
  module-level `sharedAuth`). Keyed by *tag* (`default`, `left`,
  `right`, …). Already supplies:
  - `sessionFor(tag, origin)` / `setSideOrigin(tag, url)`
  - `fetchFor(url, tag?)` — authenticated fetch, falling back to
    iterating sessions if no tag
  - `getFirstLoggedIn()` — first session with a live login
  - `ensureAuthenticated(url, tag)` — login flow if needed
  - Persists per-tag origin to `localStorage[solLoginOrigins]`
- **`<sol-menu from-rdf="...">`** — loads a `ui:Menu` from a TTL
  file. Items can be `ui:Link`, `ui:Component` (with
  `ui:name "tag-name"` + `ui:attribute` pairs), or nested `ui:Menu`.
  Renders a nav + content panel; orientation `horizontal`/`vertical`.
- **`web/styles/root.css`** — defines `--bg`, `--surface`, `--text`,
  `--accent`, `--font-size`, `--font-ui`, spacing/radius scale, and a
  `[data-theme="dark"]` switch. Custom props cascade through
  shadow-DOM boundaries → setting them on `:root` reaches every
  swc / dk component without any per-component plumbing.
- **`dist/vendor/`** — UMD + ESM bundles for `rdflib`,
  `@inrupt/solid-client-authn-browser`, `@comunica/query-sparql`,
  `marked`, `dompurify`, `ical.js`, `n3`, `solid-ui`, `solid-logic`,
  `rdf-validate-shacl`. Plus the swc + podz-extras bundles.
- **`define()`** helper in `core/define.js` for registering custom
  elements (used by every sol-* and reused for dk-*).

## 3. Repo layout & dependency resolution (three stages)

dk has three resolution stages, in this order:

1. **Local** (now) — consume the sibling working trees at
   `/home/jeff/solid/solid-web-components/` and `/home/jeff/solid/podz/`
   directly. Edits in those trees are picked up live.
2. **npm** (once swc and podz are published) — same `node_modules/`
   shape, but coming from the npm registry.
3. **CDN** (production / Electron-ready builds) — bundles served from
   esm.sh / jsdelivr / unpkg.

The invariant that makes all three reachable without touching dk
source: **all imports in dk code use the published package names as
bare specifiers**. The swap happens in `package.json` (stages 1 → 2)
and in the importmap (stage 2 → 3).


```
data-kitchen/
  index.html              # shell page
  src/
    dk-shell.js           # boot: theme/font from localStorage, mount menu
    dk-dashboard.js       # custom element wrapping dashboard.html's body
    dk-podz.js            # custom element wrapping podz's body
    dk-account.js         # header chip: lists sessions, opens sol-login
    dk-settings.js        # theme + font-size + advanced auth/session UI
    dk-styles.css         # shell chrome only; root.css does the heavy lifting
  data/
    menu.ttl              # ui:Menu describing the top-level menu
  importmaps/
    local.json            # stage 1: maps to node_modules/ (file: deps)
    npm.json              # stage 2: identical to local.json (just keeps the
                          #          symmetry; useful if a published bundle
                          #          path differs from the working-tree path)
    cdn.json              # stage 3: maps to esm.sh / jsdelivr / unpkg
  package.json            # see below
  esbuild.config.mjs      # bundles dk's own src/* only; external = peer deps
  claude/
    plans/                # this file
```

**`package.json` — stage 1 (local) uses `file:` deps**:

```json
{
  "name": "data-kitchen",
  "type": "module",
  "dependencies": {
    "solid-web-components": "file:../solid/solid-web-components",
    "podz":                  "file:../solid/podz",
    "rdflib": "^2.3.6",
    "dompurify": "^3.4.0",
    "marked": "^18.0.0",
    "ical.js": "^2.2.1",
    "@inrupt/solid-client-authn-browser": "^4.0.0",
    "@comunica/query-sparql": "^5.1.3"
  }
}
```

`npm install` symlinks `node_modules/solid-web-components` →
`/home/jeff/solid/solid-web-components` and likewise for podz, so
edits in those working trees are picked up immediately. Peer deps
come from npm.

**Imports in dk code use published bare specifiers only**:

```js
import { define } from 'solid-web-components/core/define.js';
import 'solid-web-components/menu';
import 'podz';
```

No relative `../solid/...` paths ever appear in dk source. That is
the property that makes the dev → prod swap clean.

**Stage transitions**:

- 1 → 2: change two lines in `package.json`
  (`file:../solid/solid-web-components` → `"^X.Y.Z"`; same for podz),
  re-run `npm install`. importmap unchanged.
- 2 → 3: swap `<script type="importmap" src="importmaps/local.json">`
  to `importmaps/cdn.json`, swap the UMD `<script src>` tags to their
  CDN equivalents. No source edits.

The Electron wrapper, when we get there, can use any of the three
maps depending on whether it ships pre-bundled assets.

## 4. Shell page (`index.html`) skeleton

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>data-kitchen</title>
  <link rel="stylesheet" href="node_modules/solid-web-components/web/styles/root.css">
  <link rel="stylesheet" href="src/dk-styles.css">

  <script>
    // Apply theme + font-size before first paint to avoid flash.
    (function () {
      try {
        const s = JSON.parse(localStorage.getItem('data-kitchen-settings') || '{}');
        if (s.theme)    document.documentElement.dataset.theme = s.theme;
        if (s.fontSize) document.documentElement.style.setProperty('--font-size', s.fontSize);
      } catch (_) {}
    })();
  </script>

  <!-- Stage 1 (local) importmap. Points at node_modules/ paths
       populated by `npm install` (file: deps for swc + podz, npm
       for peer deps). Stage 2 (npm published) keeps the same paths.
       Stage 3 (CDN) swaps src= to importmaps/cdn.json. -->
  <script type="importmap" src="importmaps/local.json"></script>

  <!-- UMD globals that components expect on window. Loaded once.
       In dev, served straight out of swc's already-built dist/.
       In prod, the same URLs come from the CDN. -->
  <script src="node_modules/solid-web-components/dist/vendor/rdflib.umd.js"></script>
  <script src="node_modules/solid-web-components/dist/vendor/@inrupt-solid-client-authn-browser.umd.js"></script>
  <script src="node_modules/solid-web-components/dist/vendor/@comunica-query-sparql.umd.js"></script>
  <script src="node_modules/solid-web-components/dist/solid-web-components.bundle.min.js"></script>
  <script src="node_modules/solid-web-components/dist/podz-extras.bundle.min.js"></script>
</head>
<body>
  <header class="dk-chrome">
    <h1 class="dk-title">data-kitchen</h1>
    <dk-account></dk-account>
    <dk-settings-quick></dk-settings-quick>
  </header>

  <sol-menu from-rdf="data/menu.ttl" orientation="horizontal"></sol-menu>

  <script type="module" src="dist/dk.bundle.js"></script>
</body>
</html>
```

Everything below `<header>` is the menu, which owns the content
region. The menu's content panel is where each app renders.

## 5. The menu file (`data/menu.ttl`)

```turtle
@prefix ui:     <http://www.w3.org/ns/ui#> .
@prefix schema: <http://schema.org/> .

<#MainMenu> a ui:Menu ; ui:label "data-kitchen" ;
  ui:orientation ui:Horizontal ;
  ui:parts ( <#Home> <#Podz> <#Solidos> <#SolidResources> <#DevTools> ) .
# region is set in HTML now: <sol-menu region="#dk-content"> (not ui:linkTarget)

<#Home> a ui:Component ; ui:label "Home" ;
  ui:name "sol-include" ;
  ui:attribute
    [ schema:name "source"  ; schema:value "pages/home.html" ] ,
    [ schema:name "trusted" ; schema:value "true" ] .

<#Podz> a ui:Component ; ui:label "Podz" ;
  ui:name "dk-podz" .

<#Solidos> a ui:Component ; ui:label "Solidos" ;
  ui:name "dk-solidos" .

<#SolidResources> a ui:Menu ; ui:label "SolidResources" ;
  ui:parts ( <#Website> <#TagExplainer> <#Faq> <#Glossary> <#Catalog> ) .

<#DevTools> a ui:Menu ; ui:label "DevTools" ;
  ui:parts ( <#JsonldPlayground> <#RdfConverter> <#ShaclPlayground> <#SparqlPlayground> ) .
```

Settings and Help live in the chrome (top-right) as `<sol-button>`s
rather than menu items — they `<sol-include>` `pages/settings.html`
and `help/dk.html` into `#dk-content`. The Home dashboard widgets
are inlined directly into `<main id="dk-content">` at first paint;
clicking Home re-shows that wrapper rather than mounting a custom
element.

Adding a future app is one block in this file plus one custom
element.

## 6. App-mount strategy

Each "app" becomes a custom element that writes its body into its own
*light DOM* (so sol-* components inside it can still see the
document-level importmap and AuthManager). Shadow DOM is reserved for
shell chrome.

### 6a. `<dk-dashboard>`

`connectedCallback` clones the markup from `dashboard.html`'s
`<body>` (the `header.dash` + `main.feed` block) into `this`. The
scoped `<style>` block from dashboard.html becomes a constructed
stylesheet adopted by the element. All sol-* widgets bind unchanged.

### 6b. `<dk-podz>`

`connectedCallback` clones podz's `.app` markup into `this`. Then
runs `new SolidFileBrowser()` from `podz/src/podz.js`.

Important detail: `podz.js` currently does
`document.getElementById('prefs-modal')` etc. As long as the markup
lives inside `<dk-podz>` (in the light DOM = same document tree),
`getElementById` still finds it. The cost is that those IDs become
*page-global*, so a future second instance of `<dk-podz>` would
collide — fine for v0.

**Lifecycle**: keep podz mounted across menu switches. sol-menu's
content panel by default replaces the body when switching items;
override its render handler for podz to do `display:none/block`
instead so podz's in-memory state (open panels, scroll, drafts)
survives navigation. (Smaller apps re-mount cleanly.)

### 6c. `<dk-settings>`

Plain settings UI: theme select, font-size buttons (S/M/L mapping to
`--small-font` / `--medium-font` / `--large-font` already defined in
root.css), session manager (lists `authManager.sessions`, per-tag
logout, "add session"). Persists into
`localStorage['data-kitchen-settings']`.

### 6d. `<dk-account>` (header chip)

Live read of `authManager.sessions`. Shows the active WebID(s),
clicking opens a small popup with the same controls as `<dk-settings>`
session pane. Listens for `sol-login` / `sol-logout` events to
re-render. This is the dashboard's first authenticated chip.

## 7. Auth sharing

The win: there is *already* a single `sharedAuth` AuthManager inside
the swc bundle. As long as both apps import auth helpers from that
one loaded bundle (the importmap + the single `<script>` tag in the
shell guarantee this), all sessions live in one Map.

**Tag conventions used by dk**:
- `home`  – any authenticated fetch the dashboard widgets do
- `podz-left`, `podz-right` – podz's existing side tags (need to
  rename podz's `left`/`right` defaults to `podz-left`/`podz-right`,
  or leave as `left`/`right` if no other app needs those tags).
- Future apps register their own tag.

**`#auth` honoring**: `dk-shell.js` parses `location.hash` for
`auth=<tag>` and stashes it in `window.dkActiveAuthTag`. A small
wrapper around `authManager.fetchFor`:

```js
window.dkFetch = (url) => {
  const tag = window.dkActiveAuthTag;
  return authManager.fetchFor(url, tag);  // tag undefined → iterate
};
```

App code that fetches Solid resources calls `dkFetch(url)` (or, since
swc widgets call `authManager.fetchFor(url, tag)` internally with
their own tag, this only matters for ad-hoc fetches from dk-level
code).

**"Silently try in order"**: `fetchFor(url)` without a tag already
walks sessions for one covering the origin. If multiple sessions
cover, the *first one registered* wins — order is whatever
construction order is. dk-shell will register sessions in a stable
order (`home`, `podz-left`, `podz-right`, …) so behaviour is
predictable. If a future requirement is "try them and use the first
to return 2xx", that needs a tiny addition (a `tryFetch` helper that
iterates and falls back), but for v0 the existing semantic is fine.

### 7b. On-demand login via `solFetch` + `sol-auth-needed`

dk has no permanent login button. The chrome mounts a single hidden
`<sol-login mode="popup">` whose job is to listen for the
`sol-auth-needed` event and run the OIDC flow when triggered.

**Contract** (lives in `swc/core/auth-fetch.js`):

```js
import { solFetch } from 'solid-web-components/core/auth-fetch.js';

const r = await solFetch(url, init);
// On 401 (or 403 with no active session), solFetch dispatches
// `sol-auth-needed` on document with detail { url, response,
// resolve, reject }. A listener resolves(true) once auth completes;
// solFetch retries once and returns the new response.
```

Routing summary:

- **swc widgets** that use rdflib's UpdateManager / Fetcher (sol-form,
  sol-query, sol-include, …) flow through `_integrateWithRdflib` which
  wraps the fetcher's `.fetch` with `solFetch`. Saves that 401 prompt
  for login automatically.
- **swc widgets with raw fetch** (sol-feed's bookmark writes) call
  `solFetch` directly.
- **dk-level code** uses `window.dkFetch(url, init)`, which forwards to
  `solFetch` and threads through `window.dkActiveAuthTag` as
  `init.authTag`.
- **No `<sol-login>` on the page** → `solFetch` falls through to plain
  fetch (still routed through `AuthManager.shared` when present, but
  no prompt). Widgets work in unauthenticated contexts unchanged.

**sol-login behaviour**:

- Hidden by default (`:host { display: none }` in
  `styles/sol-login-css.js`).
- On `sol-auth-needed` it sets the `active` attribute on itself;
  `:host([active])` flips it visible so the user sees the picker.
  Cleared on success / cancel / popup-blocked.
- Picks the default issuer: own `issuer` attribute →
  `<sol-default default-issuer="…">` → first entry of `issuers`.
- Concurrent prompts are coalesced into a single login attempt; later
  callers share the same in-flight promise.
- Five-minute listener timeout — an ignored popup eventually returns
  the original 401 rather than hanging the caller.

**Logged-in indicator (dk)**: the chrome's Settings gear doubles as
the indicator. `dk-auth-indicator.js` listens for `sol-login` /
`sol-logout` on document and toggles `.dk-chrome-authed` on the
gear's sol-button; CSS in `dk-styles.css` colours the gear green via
`color: var(--success)`. The WebID lands on the gear's `title`
attribute for hover. No separate chip is needed.

**Mode choice**: chrome `<sol-login>` is `mode="popup"`. Redirect
mode reloads the whole page during login, which loses the in-flight
solFetch caller — auto-retry then can't resume. Popup mode preserves
caller state and is required for the on-demand UX.

## 7a. Shared defaults via `<sol-default>`

Non-CSS shared knobs (proxy URL, default issuers, default endpoint,
…) live in a singleton `<sol-default>` element in the dk shell. Any
sol-* component that needs such a value consults sol-default when
its own attribute isn't supplied.

### Resolution order

For each consuming component (initially sol-calendar, sol-feed for
the `proxy` knob):

1. The component's own HTML attribute (e.g., `proxy="..."`).
2. The component's RDF `source` value (e.g., a `ui:proxy` triple
   on `data/calendar-settings.ttl#All`).
3. `<sol-default>`'s matching attribute.
4. Hard-coded fallback inside the component.

The first non-empty value wins. CSS-driven knobs (theme, font-size)
stay as `:root` custom properties — sol-default is for JS-side
values only.

### API (in swc)

`web/sol-default.js` — custom element. Body of element is empty
(display:none). Observes every attribute set on it. On change,
dispatches a bubbling, composed `sol-default-change` event with
`detail: { name, newValue, oldValue }`.

`core/defaults.js` — exports two helpers:

```js
export function getDefault(name) {
  return document.querySelector('sol-default')?.getAttribute(name) ?? null;
}

export function onDefaultChange(handler) {
  const fn = (e) => handler(e.detail.name, e.detail.newValue, e.detail.oldValue);
  document.addEventListener('sol-default-change', fn);
  return () => document.removeEventListener('sol-default-change', fn);
}
```

### Consumer pattern

Each consuming component:

```js
import { getDefault, onDefaultChange } from '../core/defaults.js';

// Initial resolve in _applySource / load path:
const proxy = this.getAttribute('proxy') || cfg.proxy || getDefault('proxy') || '';

// Subscribe in connectedCallback:
this._unsubDefaults = onDefaultChange((name) => {
  if (name === 'proxy') this.reload();   // 'proxy' is what this component consumes
});

// Tear down in disconnectedCallback:
this._unsubDefaults?.();
```

### RDF backing (deferred)

sol-default can later accept `source="data/defaults.ttl#Defaults"`
with the same direct-predicate pattern sol-time/sol-weather use,
making its values editable through the dk Settings editor flow. v0
= HTML attributes only.

### Usage in dk

`index.html`'s header chrome holds the singleton:

```html
<sol-default proxy="http://localhost:3002/proxy?uri="></sol-default>
```

dk-dashboard's sol-feed and the calendar TTL no longer need their
own `proxy` attribute — sol-default supplies it. Per-feed override
remains possible by setting the attribute or the triple back.

## 8. CSS / theming

- `root.css` is the only stylesheet that defines theme variables.
- `dk-styles.css` is shell chrome only (header layout, the small
  spacing around the menu). It uses the same `--*` variables.
- Theme switch: `document.documentElement.dataset.theme = 'dark'`
  flips every component (custom props cascade into shadow DOM).
- Font-size: set `--font-size` on `:root` (or use one of the
  preset variables `--small-font` / `--medium-font` / `--large-font`).
- Per-app overrides remain possible (each `<dk-*>` element can have
  its own scoped sheet for layout-specific tweaks); they consume
  shared vars and never redefine them.

## 8a. Shared editor system

Every editable sol-component is configurable from dk's Settings menu
item via the same pipeline. Editors are not per-app — they sit at
the dk shell level and reach into whatever app is currently mounted.

### What already exists in swc

- **`<sol-form>`** (`web/sol-form.js`): generic RDF form renderer
  that loads a `ui:Form` definition from a TTL, edits an RDF subject
  in an rdflib store, validates against SHACL (`shape` attribute),
  and saves via PUT / UpdateManager. Auto-saves on field change for
  unordered forms; explicit Save button for ordered (`ui:ordered`)
  forms. Emits `sol-form-save` on success.
- **`data/menu-form.ttl`**: fully-realized editor for `ui:Menu`
  (label, orientation, nested submenus, ui:Link / ui:Component /
  ui:Menu items, ui:attribute pairs). Drives any `<sol-menu>`.

### Colocation rule (firm)

**Every new form TTL is authored *in swc*, alongside the component
it edits.** Forms are properties of the component, not of dk. dk
contains zero `*-form.ttl` files. This is the same principle that
makes the editor "shared" — any other app embedding swc benefits.
See `MEMORY.md` → shared-editor-principle.

### What's missing — exhaustive list of new form definitions

Audit of every sol-* component (from
`/home/jeff/solid/solid-web-components/web/sol-*.js`) against the
existing form library:

**Net new forms to create in `swc/data/`** (sol-time, sol-weather,
and sol-calendar are covered by shape-driven sol-form against their
per-component SHACL shapes — no `*-form.ttl` needed):

1. **`swc/data/search-engines-form.ttl`** — bookmark-list editor.
   sol-search uses a different shape: a `bk:Topic` container with
   `ui:Link` entries, each carrying `ui:label`, `bk:recalls` (the
   search-URL prefix), and `bk:hasTopic` back-reference. One
   `ui:Multiple` over the topic members.

**SHACL shapes to add (alongside each form)**:

2. **`swc/shapes/search-engines.shacl`** — validates the bookmark
   shape (`bk:Topic` membership + each Link has label + recalls).
   `shapes/menu.shacl` already covers the menu/tabs shape.

**Reuse — no new forms needed**:

- sol-menu → reuses existing `swc/data/menu-form.ttl`.
- sol-tabs → reuses **the same** `swc/data/menu-form.ttl`. Confirmed
  from `data/demo-tabs.ttl`: "This is the identical ui:Menu shape
  <sol-menu> consumes — the same document can drive either element."
  No tabs-specific form needed.

**Opt out (no editor)**:

- sol-feed → `static get editor() { return { inline: true }; }`.
  Its picker is already a permanent part of the rendered widget;
  Settings lists it as "edit inline".

**Deferred for v0** (configured by HTML attributes rather than an
RDF source — would need an attribute-editor pattern, which is a
separate design):

- sol-query, sol-include, sol-live-edit, sol-pod, sol-pod-ops,
  sol-wac, sol-modal, sol-login, sol-rolodex, sol-solidos,
  sol-accordion. These take typed attributes; an editor for them
  would be a generic "attribute editor" component, not a sol-form.
  Not in scope for v0; revisit once the source-driven editors are
  proven.

### Per-component declarations to add in swc

Each editable component class gets a one-line static getter naming
the form. These edits land **inside each sol-*.js file**, not in dk.

```js
// sol-time, sol-weather, sol-calendar — no `editor` getter needed;
// shape-driven sol-form generates the editor from each component's
// `static get shape()` (already in place).

// in web/sol-search.js   class SolSearch
static get editor() { return new URL('../data/search-engines-form.ttl', import.meta.url).href; }

// in web/sol-menu.js     class SolMenu
static get editor() { return new URL('../data/menu-form.ttl', import.meta.url).href; }

// in web/sol-tabs.js     class SolTabs
static get editor() { return new URL('../data/menu-form.ttl', import.meta.url).href; }

// in web/sol-feed.js     class SolFeed
static get editor() { return { inline: true }; }
```

`import.meta.url` resolution means the URI is correct whether swc
is loaded from `node_modules/`, npm, or a CDN — supporting the
three-stage vendoring trajectory.

### Standardized `reload()` method (per component, in swc)

Each editable component exposes:

```js
async reload() {
  // re-fetch this.getAttribute('source') and re-render
}
```

Some components already do this through `attributeChangedCallback`;
the work is to standardize the public name so dk can call
`el.reload()` after a save without per-component branching.

### dk Settings UI

`<dk-settings>` is the menu item; it owns the page. **Single
unified surface — no separation into sub-parts (no "Shell" vs
"Sessions" vs "Editors" sections, no modal launches).** Theme, font,
and the account chip stay in the page chrome (`<dk-settings-quick>`
and `<dk-account>`); the Settings page is just the editor list.

The list is a single `<sol-accordion>`. Each editable widget is one
panel; opening expands the form *below the panel header* and any
previously open panel collapses. No file paths or RDF subject URIs
appear — the panel summary shows a friendly label only (the
component's `label` attribute, falling back to a titlecased tag
name). Feeds are **not listed here** at all (their picker is part
of the rendered widget). Forms are mounted lazily on first expand
so the page doesn't fetch every TTL up front.

The discovery walk runs each time the Settings panel becomes visible,
and also re-runs whenever any `sol-form-save` fires at document level
(item 9 below — keeps the list mirroring the live state):

```js
function discoverEditableComponents(root = document) {
  const found = [];
  for (const el of root.querySelectorAll('*')) {
    const ctor = customElements.get(el.localName);
    if (!ctor) continue;
    const editor = ctor.editor;          // static getter, may be undefined
    if (!editor) continue;
    const app = el.closest('dk-dashboard, dk-podz, dk-settings, [data-dk-app]');
    found.push({ element: el, editor, app: app?.localName ?? 'shell',
                 label: el.getAttribute('label') || el.localName });
  }
  return found;
}
```

The accordion renders one panel per discovered element. Summaries
show *only* a friendly label — no tag names, no file paths, no RDF
subject URIs. Feeds are filtered out entirely.

```
▾ Time              ← open: <sol-form> rendered inline below
▸ Weather
▸ Calendar
▸ Search Engines
▸ Main Menu
```

The expanded body, mounted lazily on first open, is:

```html
<sol-form source="<editor-uri>"
         subject="<element.getAttribute('source')>"
         save-to="<same subject URI>"
         shape="<optional SHACL>">
</sol-form>
```

`save-to` is pre-filled with the same URI the component reads from,
so a successful save updates the same document. On `sol-form-save`,
dk calls `element.reload()` to re-render the component with the new
config, and also calls `_refresh()` so the settings list mirrors any
new discoverable widgets.

### Save targets

- **Solid pod resources**: sol-form already PATCHes via rdflib's
  UpdateManager, using `authManager.fetchFor(url, tag)` (sol-form
  consumes the shared session pool transparently). Works today.
- **Local TTL files** (e.g. `data/time-settings.ttl` shipped with dk): need a
  writable dev server. The CSS dev server podz uses
  (`community-solid-server`) supports PUT. For non-pod dev, dk's
  Electron shell can use the FS via IPC. v0: show the form, surface
  any save error to the user; wire writable dev server when needed.

### Two modes: `editor-self` vs `editor-shared`

Editing is opt-in *per instance* on the host page, via boolean
attribute:

- **`editor-self`** — the component renders a small gear (or pencil)
  button next to itself. Clicking opens the same `<sol-form>` modal
  dk Settings would use. Good for in-context editing of a single
  widget.
- **`editor-shared`** *(or attribute absent)* — no gear. The
  component is discoverable from dk Settings (or any other admin
  surface) and edited there. Good for keeping the page clean and
  centralizing config.

Both modes share the same `static get editor()` declaration on the
component class. The mode is purely a runtime choice; swapping it
needs no form-side changes.

#### Implementation: `core/editor-self.js`

New swc helper exporting one function:

```js
// core/editor-self.js
export function attachEditorSelfGear(el) {
  const editor = el.constructor.editor;
  if (!editor || (typeof editor === 'object' && editor.inline)) return;

  const btn = document.createElement('button');
  btn.className = 'sol-editor-self-gear';
  btn.type = 'button';
  btn.setAttribute('aria-label', `Edit ${el.localName}`);
  btn.textContent = '⚙';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    openEditorModal(el, editor);
  });

  // Position the gear at the host's top-right. Components attach it
  // inside their shadow root (so styling stays scoped) or as a
  // positioned sibling — see per-component notes.
  const root = el.shadowRoot ?? el;
  root.appendChild(btn);
}

async function openEditorModal(el, editorUri) {
  const subject = el.getAttribute('source')
                || el.getAttribute('from-rdf')
                || '';
  // SolModal.choice / SolModal.openWith — whichever API exposes a
  // programmatic form modal. Fall back to creating one inline.
  const modal = document.createElement('sol-modal');
  modal.title = `Edit ${el.localName}`;
  const form = document.createElement('sol-form');
  form.setAttribute('source', editorUri);
  if (subject) {
    form.setAttribute('subject', subject);
    form.setAttribute('save-to', subject);
  }
  form.addEventListener('sol-form-save', () => { el.reload?.(); modal.close?.(); });
  modal.append(form);
  document.body.appendChild(modal);
  modal.open?.();
}
```

#### Per-component opt-in

Each editable component, in its `connectedCallback`, adds:

```js
import { attachEditorSelfGear } from '../core/editor-self.js';

// at the end of connectedCallback:
if (this.hasAttribute('editor-self')) attachEditorSelfGear(this);
```

One import + one line per file. Same six components that have
`reload()` and a `static get editor()` (sol-time, sol-weather,
sol-calendar, sol-search, sol-menu, sol-tabs). sol-feed opts out via
`{ inline: true }` from its `editor` getter and is exempt from this
hook (helper short-circuits).

`editor-shared` is intentionally a no-op — its only purpose is
declarative clarity in the markup when the page author wants to be
explicit that a component is centrally edited.

#### dk's stance

**Every editable component on dk pages is shared-mode.** No
`editor-self` attribute appears anywhere in dk's HTML, `dk-dashboard`,
`dk-podz`, or other markup; all editing flows through dk Settings.
The editor-self machinery is built in swc anyway — it's a property
of the component infrastructure, useful to other apps that embed
swc — but dk's Phase 3 does not exercise it. If future dk pages
want a quick edit-in-place affordance for one specific widget,
flipping the attribute on is a one-character change.

### Where each change lands (summary)

- **In swc** — every form TTL, every SHACL shape, every component
  declaration, the editor-self gear helper. Specifically:
  `swc/data/search-engines-form.ttl`,
  `swc/shapes/search-engines.shacl`, `swc/core/editor-self.js`,
  plus `static get editor()`, `reload()`, and the optional
  `attachEditorSelfGear(this)` call on each editable component class.
- **In dk** — only the discovery + launcher UI inside
  `<dk-settings>`. Zero `*-form.ttl` files in dk.

## 9. Dedup of packages

The critical move is **one shell, one importmap, one set of
`<script>` tags**:

- `rdflib`, `@inrupt/solid-client-authn-browser`, `@comunica/...`,
  swc bundle, podz-extras bundle — loaded *once* in the shell head.
- Every ES module that says `import {…} from 'rdflib'` resolves
  through the importmap to the same file → one module instance.
- Inside `dist/dk.bundle.js`, esbuild marks `rdflib`, the inrupt
  packages, and Comunica as *external* so they aren't re-bundled;
  they resolve via the importmap at runtime.
- Podz is currently bundled as `podz/dist/podz.bundle.min.js`. We can
  either keep loading that bundle (simple, no re-build) or pull
  podz's `src/` into the dk esbuild config. v0 = keep the bundle;
  v0.1 = unified build once we're past the proof-of-concept.

## 10. UI shell — layout sketch

```
┌──────────────────────────────────────────────────────────────────┐
│ data-kitchen      [ webID/login chip ]   [ theme ]  [ Aa size ]  │  header  ~3rem
├──────────────────────────────────────────────────────────────────┤
│ [ Home ] [ Podz ] [ Settings ]                                   │  menu nav (sol-menu horizontal)
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   menu content panel — whichever <dk-*> is active                │
│                                                                  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

Vertical variant if the menu grows:

```
┌──────────────────────────────────────────────────────────────────┐
│ data-kitchen        [ webID chip ]    [ theme ]  [ Aa size ]     │
├──────────┬───────────────────────────────────────────────────────┤
│ Home     │                                                       │
│ Podz     │   menu content panel                                  │
│ Notes ▾  │                                                       │
│   Daily  │                                                       │
│   …      │                                                       │
│ Settings │                                                       │
└──────────┴───────────────────────────────────────────────────────┘
```

Header chrome details:
- **Login chip** (`<dk-account>`): if zero sessions logged in →
  shows "Sign in" → opens issuer picker (reuses `<sol-login>`). If
  one session → shows WebID slug. If multiple → shows "N WebIDs ▾"
  → dropdown lists all + which one matches `#auth`.
- **Theme toggle**: sun/moon button. 3-state: light / dark / system.
- **Font-size**: small Aa / medium A / large A buttons.

## 11. Build order

dk-side and swc-side work is interleaved. swc PRs unblock dk; dk
gets useful screens before the editors are all wired.

**Phase 0 — scaffold (dk only)**

1. `package.json` (file: deps), `esbuild.config.mjs`, `index.html`,
   `importmaps/local.json`, `data/menu.ttl` with just `<#Home>`.
2. `<dk-dashboard>` renders a placeholder. Verifies bundle chain.

**Phase 1 — apps mount (dk + a tiny swc tweak)**

3. Port dashboard markup into `<dk-dashboard>`; verify widgets work.
4. Port podz markup into `<dk-podz>`; verify pods render and login.
5. swc: standardize `reload()` on components dk will edit (small).

**Phase 2 — shell chrome (swc adds sol-default, then dk)**

6. swc: `web/sol-default.js` + `core/defaults.js` helpers. Update
   sol-calendar and sol-feed to consult `getDefault('proxy')` as the
   last fallback and subscribe via `onDefaultChange`.
7. dk: add `<sol-default proxy="...">` to `index.html` chrome; drop
   the now-redundant `proxy=` attribute from dk-dashboard's sol-feed
   markup. (calendar-settings.ttl's per-record predicates stay — they
   let individual feeds override.)
8. dk: `<dk-account>` against the live `authManager`. Verifies
   `sol-login` / `sol-logout` events.
9. dk: `<dk-settings-quick>` header chrome (theme + font-size).
   Persist prefs.
10. dk: wire `#auth` parser and `dkFetch` helper.

**Phase 3 — editor system**

Two substreams. Stream A (shared mode) is what dk needs; Stream B
(editor-self) is swc-only and can land in parallel or be deferred
without blocking dk's Settings UI.

*Stream A — shared editor flow (required for dk)*

Each swc step is a separate commit so it can land without dk being
on a particular tip.

10. swc: author **`data/search-engines-form.ttl`** — bookmark-list
    editor (Multiple over `bk:Topic` members; each item is a
    ui:Link with label + `bk:recalls`).
11. swc: author **`shapes/search-engines.shacl`** — validates the
    bookmark shape used by sol-search.
12. swc: add `static get editor()` to each editable component class
    (sol-time, sol-weather, sol-calendar, sol-search, sol-menu,
    sol-tabs); add `editor = { inline: true }` to sol-feed. One
    one-line edit per file; URIs resolved via `import.meta.url`.
13. swc: `async reload()` standardized — **already done in Phase 1**
    for the six editable components.
14. dk: `<dk-settings>` discovery walk (`document.querySelectorAll`
    filtered by `customElements.get(tag).editor`), per-component
    "Edit" rows grouped by hosting `<dk-*>` ancestor. Edit button
    opens `<sol-modal>` hosting `<sol-form source=<editor>
    subject=<source> save-to=<source>>`.
15. dk: on `sol-form-save`, call `element.reload()` on the target.
    Verify dashboard widgets and the dk menu pick up the change
    live.

*Stream B — editor-self inline gear (swc-only, no dk work)*

dk does not exercise this stream (every dk page is shared-mode), so
it can land anytime — including after Stream A, or alongside it for
unrelated swc consumers.

B1. swc: author **`core/editor-self.js`** — `attachEditorSelfGear(el)`
    helper as sketched in section 8a above.
B2. swc: in each component's `connectedCallback`, after the existing
    init, add:
    `if (this.hasAttribute('editor-self')) attachEditorSelfGear(this);`
    One import + one line per file (same six components from
    step 12).
B3. swc: per-component CSS for `.sol-editor-self-gear` (small
    absolute-positioned button at top-right; visible on host hover).

If any deferred component (sol-query, sol-pod, …) needs an editor
later, it goes through the same swc-first sequence — author the
form/shape in swc, add the static getter, and the dk Settings
discovery walk picks it up automatically.

**Phase 4 — later**

13. Per-component "edit-in-place" pencil button (swc, optional).
14. Writable dev server (or Electron FS bridge) for local TTL save.
15. Electron wrapper.

## 12. Decisions (resolved 2026-05-23)

1. **Menu orientation: horizontal top-strip.** Menu nav lives in a
   thin row under the header chrome; the menu's content panel fills
   the rest of the viewport.

2. **Podz integration: no-refactor wrap.** `<dk-podz>` clones podz's
   `.app` markup into its light DOM and calls `new SolidFileBrowser()`
   once. Hide/show on menu nav rather than re-mount so podz's in-memory
   state survives. ID-collision risk (second `<dk-podz>` instance)
   acknowledged and deferred — only matters if we ever want two
   simultaneous podz mounts.

3. **Vendoring: three-stage local → npm → CDN.** Invariant: imports
   in dk source use published bare specifiers. Stage 1 today via
   `file:` deps to `../solid/solid-web-components` and `../solid/podz`.
   See `MEMORY.md` → vendoring-strategy and section 3 above.

## 13. Next steps

Outstanding items, roughly ordered by what would have the biggest
quality-of-life payoff first.

### Recently resolved (verified 2026-05-24)

The three top-of-list items from the previous revision are all
already done in the current source:

- **Settings page → accordion, no modals.** `<sol-settings>` walks
  light DOM + shadow roots, builds one `<sol-accordion>` with a panel
  per editable widget. Feeds opt out via
  `static get editor() { return { inline: true } }`; `resolveEditorSpec`
  returns null and they're filtered. Each panel lazy-mounts its editor
  on toggle, friendly label via `el.getAttribute('label')` or
  tag-derived. No `[Edit]` buttons, no `<sol-modal>`. There is no
  `dk-settings.js` — the previous list-of-buttons element has been
  removed; `pages/settings.html` is now just a header + `<sol-form>`
  for prefs + `<sol-settings>`.
  Verified: `claude/smoke-tests/diag-settings.mjs`.

- **podz.css theme override.** `solid/podz/src/podz.css` no longer
  redefines shared theme vars at `:root`; swc's `web/styles/root.css`
  owns them. Only podz-specific extension vars (`--bg-grad-tint`,
  `--surface-2`, `--border-soft`, `--folder-color`, …) live in
  podz.css, scoped under `.app`. Dark overrides use
  `[data-theme="dark"] .app, body.dark .app` (both swc and
  podz-standalone toggles). Standalone-body chrome guarded with
  `:has(>.app)`. Pre-sync backup at `solid/podz/claude/backups/`.
  Verified: `claude/smoke-tests/diag-podz-theme-leak.mjs`.

- **Single-mount podz.** `mountInTarget` in
  `solid-web-components/core/component-mount.js` is keep-alive by
  default: each `(target, name)` pair gets one wrapper, hidden on
  nav-away. dk's `index.html` sets `<sol-menu region="#dk-content">`
  (display lives in HTML now, not the TTL), so all items inherit the
  keep-alive mount path (`renderComponentItem` → mountInTarget). The
  remount warning in `dk-podz.js` is now defensive only —
  unreachable in normal nav. Verified across three Home↔Podz
  round trips: `claude/smoke-tests/diag-podz-keepalive.mjs`.

### Deferred editor work

1. **sol-search editor**. Data model uses
   `?link bk:hasTopic <#Topic>` (inverse). sol-form's ui:Multiple
   wants a forward property. Two paths: (a) add a forward
   `bk:hasMember` predicate to the data and have sol-search read
   either; (b) extend sol-form / ui:Multiple to handle inverse
   relations. (a) is simpler.

2. **dk-account multi-issuer / popup mode**. v0 uses sol-login in
   redirect mode with three issuers. Bigger UX would let multiple
   issuers be active simultaneously (popup-mode sessions per tag,
   like podz uses for left/right). Settings could add per-session
   logout, "add session", and an editor for the issuers list.

### Infrastructure

3. **Writable dev server**. sol-form's UpdateManager PATCHes to the
   `save-to` URL. For local `data/*.ttl` files served by python's
   `http.server`, PUT/PATCH are not supported, so saves silently
   fail. Either run podz's `community-solid-server` from dk's root
   (it accepts writes), or wait for the Electron wrapper which can
   bridge to local FS via IPC. (User already runs CSS at
   `localhost:3000` for CSS testing — see
   `[[reference_css_localhost_3000]]`.)

4. **Electron wrapper**. The deferred end-state from section 1.
   Pure-web design has been maintained throughout, so this is a
   BrowserWindow + preload-script + (optionally) a stage-3-style
   CDN-or-asar build pipeline. Half-day to a day.

5. **sol-default RDF backing**. `SolDefault` already declares
   `static get shape()`, so the discovery walk picks it up and the
   Settings accordion now shows a "Default" panel that lazy-mounts a
   sol-form against the shape. The remaining work is verifying the
   shape's predicates round-trip (proxy in particular) and that
   sol-default's runtime listeners refresh on `sol-form-save`.

### Convenience

6. ~~**Settings nav reload**.~~ **Resolved 2026-05-26.**
   `<sol-settings>` listens for `sol-tab-activate` and re-runs
   discovery when it becomes visible (signature-based diff means
   the rebuild only happens when the widget set actually changed).
   A public `refresh()` method on the element lets consumers force
   a re-walk after mounting an editable widget late. Each panel's
   `sol-form-save → widget.reload()` wiring already handles the
   in-flight edit case.

7. ~~**Sync the inline `<script type="importmap">` from
   `importmaps/local.json`**.~~ Done — `tools/sync-importmap.mjs`
   exists and the IMPORTMAP markers in `index.html` are populated by
   it (called from `npm run build` per the inline comment).

---

## Addendum 2026-05-25 — Solidos integration

This section reflects current state for features that landed after
the original plan was written. Earlier sections of this document
describe historical design choices and have drifted in details
(e.g. there is no `<dk-dashboard>` or `<dk-settings>` custom
element — Home is inlined directly in `index.html`, Settings is a
chrome `<sol-button>` that sol-includes `pages/settings.html`).
Treat the menu.ttl example in section 5 as authoritative; use the
running code for everything else.

### `<dk-solidos>` and the SolidOS iframe

A new menu item "Solidos" mounts a `<dk-solidos>` custom element
(`src/dk-solidos.js`). It loads `pages/dk-solidos.html` as its
template — a flex split with sol-pod on the left and an iframe on
the right. The iframe `src` points at
`pages/solidos-host.html`, a standalone same-origin page that
loads rdflib + inrupt-authn + mashlib + sol-solidos UMDs and
exposes `window.gotoSubject(url)`. When the user clicks a per-item
icon in the pod tree, dk-solidos calls
`iframe.contentWindow.gotoSubject(item.url)`; sol-pod's
`gear-icon` attribute is set to
`node_modules/solid-web-components/web/styles/solid-logo.svg` so
the click target reads as the Solid logo.

**Why an iframe** — mashlib's CSS and JS aggressively own the host
page (fixed banner at viewport top, `data-theme` on `<html>`,
many global `:root` CSS vars, a webpack-bundled `solid-logic`
instance). We tried importing it directly into dk's main page and
into a lazy `<style>@import layer()</style>`; both leaked.
Isolating mashlib inside a same-origin iframe gives full
containment while still sharing IndexedDB-scoped auth, and lets
dk push theme + `--font-size` directly into the iframe's
`<html>` for shared appearance.

**First-paint detail** — `solidos-host.html` defers
`panes.initMainPage` until the first `gotoSubject` call (passing
the iframe's own URL would render a page-info pseudo-banner that
looks like a duplicate of the SolidOS banner). `src/dk-solidos.js`
auto-fires that first call with `sol-pod.rootUrl` once
`pod.initialize()` resolves, so the banner appears immediately
without an empty-iframe gap.

### New dependency

`mashlib` (npm package, ~233 transitive deps) is now in
`package.json` / `node_modules`. Only loaded inside
`pages/solidos-host.html`; dk's main page never references it.

### Related swc changes

- `<sol-pod>` gained a `gear-icon` attribute — see swc's
  `help/sol-pod-demo.html` and the JSDoc on the class.
- `<sol-pod>`'s pod dropdown strips `http(s)://` for display.
- `.pod-header select` gained `min-width: 0` so the gear stays in
  the row in narrow sidebars like dk-solidos.

---

## Addendum 2026-06-08 — sol-components migration

`solid-web-components` (swc) was renamed to **`sol-components`**
(`/home/jeff/solid/sol-components`, npm name `sol-components`) and
re-architected to **all-ESM + a `component-interop` loader**. This supersedes
the bundle/sol-loader/UMD/inlined-importmap details in sections 2–4 and 9
above. dk + podz were migrated to match; podz was committed/pushed, and dk was
put under git (initial commit).

### What changed in the library
- **No more `sol-loader.min.js`** and **no `*.bundle.min.js` / vendor `*.umd.js`**.
  Components are plain ESM under `web/` + `core/`; shared deps (rdflib, solid-ui,
  solid-logic, …) are vendored as ESM under `dist/vendor/`.
- Loading is driven by **`component-interop`** (CDN or vendored), configured by
  attributes on one `<script>`:
  ```html
  <script src="node_modules/component-interop/component-interop.js"
    data-stage="auto"
    data-manifest="node_modules/sol-components/dist/sol-components.manifest.json dk.manifest.json"
    data-components="sol-basic sol-pod sol-pod-extras sol-live-edit sol-time sol-weather sol-calendar sol-search sol-feed sol-login sol-query menu-from-rdf rdf-bundle"></script>
  <script type="module" src="dist/dk.bundle.js"></script>
  ```
  - `data-manifest` is **whitespace-separated**, merge is **first-wins** →
    sol-components' manifest listed FIRST owns shared specifiers; `dk.manifest.json`
    (component-interop format) adds only `podz/`.
  - `data-stage="auto"` → localhost serves vendored local paths, else esm.sh CDN
    (this replaces the old per-stage importmap swap; `importmaps/local.json` is now
    just a reference / Plan-B).
  - Old `data-extend-with="auth sparql rdf"` → name the components instead:
    `sol-login` (auth), `sol-query` (sparql), `rdf-bundle` (editing stack),
    `menu-from-rdf` (RDF-driven `<sol-menu>` — REQUIRED or the menu renders empty).
  - The loader publishes `window.ComponentInterop.ready`; sol-components aliases
    `window.SolidWebComponents` to the same object. `dk-shell.js` awaits it.

### Sharp gotchas (cost real debugging this session)
- **`menu-from-rdf` must be in `data-components`** — `<sol-menu from-rdf=…>` is
  an opt-in capability; without it the menu silently renders an empty navbar
  (no tabs/dropdowns, no error).
- **Web components are `sol-components/<name>.js`, NOT `sol-components/web/<name>.js`**
  — the importmap prefix `sol-components/` already maps to `web/`, so `/web/`
  double-resolves to `web/web/…` → 404 (and kills the importing ESM module).
  `core/` modules ARE `sol-components/core/<name>.js`.
- **Chrome buttons use `region=` not `target=`** — `<sol-button>` resolves its
  mount via `region=`/`for=`/ancestor cascade; the old `target=` is ignored, so
  the button does nothing (only a `no region resolved` warn). dk's Help + Settings
  buttons use `region="#dk-content"`.

### dk specifics now
- `index.html`: component-interop loader (above) + `<link>` to
  `node_modules/sol-components/web/styles/root.css`; `<sol-default shape=…>` →
  `node_modules/sol-components/shapes/data-kitchen-settings.shacl`.
- `dk.manifest.json`: component-interop format (`stages.{local,cdn}` →
  `components`/`shared-modules`), only adds `podz/` → `node_modules/podz/src/`.
- `dk-shell.js`: awaits `window.ComponentInterop?.ready` (not the old
  `SolidWebComponents.ready`).
- `dk-podz.js`: loads podz as an **ESM module** (`import(url)` of
  `podz.bundle.min.js`), so podz shares dk's single rdflib via the importmap.
- `pages/solidos-host.html`: the removed rdflib/inrupt UMDs replaced by an inline
  importmap → vendored ESM, publishing `window.$rdf` for mashlib/SolidOS.
- `esbuild.config.mjs` externals: `solid-web-components`/`*` → `sol-components`/`*`.

### podz now
Refreshed to ESM consumption (separate repo, committed + pushed): imports
`sol-components/core/pod-ops.js` + `sol-components/sol-modal.js` as bare specs;
esbuild emits **ESM** and externalizes `rdflib` + `sol-components/*`; dropped the
`window.$rdf` alias plugin and the eager `solidClientAuthn` check; swc pin →
`../sol-components`.

### Verification
`claude/smoke-tests/verify-sol-components-migration.mjs` (functional: menu
renders items, tab click mounts content, dropdown opens, Help/Settings panes
mount, single rdflib, no old-name requests) and `verify-podz-tab.mjs` (podz ESM
bundle loads + shares rdflib). Lesson recorded: assert **rendering/behavior**,
not just `customElements.get` registration.
