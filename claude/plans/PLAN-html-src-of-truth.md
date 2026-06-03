# PLAN — HTML as the source of truth (RDF & Forms auto-generated)

Status: **Phases 1–6 BUILT + verified 2026-06-02. SHIPPED entry point: a vanilla
`index.html` that includes `html-first.html` or `rdf-first.html` per
`<sol-default src-of-truth="html|rdf">` (default html) — see Phase 6 below.**
Forms generation remains the only open build. `bin/html-to-rdf.mjs`
(`npm run gen:rdf` / `gen:rdf:verify`) parses the
declarative HTML (puppeteer + inert `DOMParser`) and emits the tabs menu, the ⋮
menu, and settings as Turtle into `data/generated/`. Verified the output is
structurally equal to the hand-authored `data/tabs.ttl` / `data/menu.ttl` that
index.html's `from-rdf` consumes (so generated RDF drives the real app); the
only intentional difference is Music/Movies get a consistent `source` (from
`href`) that the hand-authored tabs.ttl omitted.

**Phase 2 (RDF → HTML round-trip) BUILT + verified 2026-06-02.**
`bin/rdf-to-html.mjs` (`npm run gen:html` / `gen:html:verify`) parses the
generated `data/generated/*.ttl` and emits the declarative HTML fragments
(`tabs.fragment.html` = the `<sol-tabs>` anchors, `menu.fragment.html` = the
`<sol-dropdown-button><menu>`) in index2's authoring style. Shared mappings live
in `bin/lib/html-rdf.mjs` (both directions + the parsers). `--verify` runs the
closed loop **HTML(index2) → RDF → HTML → RDF** and confirms it's stable
(lossless). This is the sync for flipping TO HTML-canonical; it is NOT on the hot
path. (Building it caught a real bug — rdflib parses `( … )` into a Collection
`.elements`, not rdf:first/rest triples — which had been making the earlier
list-traversal verify vacuously pass.)

**Phase 3 (the `from-rdf` switch on `<sol-default>`) BUILT + verified 2026-06-02.**
One flag flips source of truth (present→RDF, absent→HTML). swc `sol-tabs` +
`sol-dropdown-button` promote an OPTIONAL `data-from-rdf` hint only when the
switch is on (own from-rdf/source always wins). index2 carries the hints +
defaults to HTML. Verified both modes (identical UI, 0 errors). See the contract
+ Completeness principle below.

**Phase 4 (completeness: toolbar actions + settings) BUILT + verified 2026-06-02.**
- **Toolbar actions → tabs.ttl.** The `<sol-tabs>` launchers (`?`/`A`/`🌙`/
  `<sol-login>`/`⋮`) are now generated both ways as `ui:Component` parts marked
  `[ schema:name "slot" ; schema:value "actions" ]` (tag→ui:name, direct text→
  ui:label, every attribute→ui:attribute). swc `sol-tabs._loadFromRdf` splits the
  `slot=actions` parts out of the tabs and rebuilds them as bar launchers
  (`_buildLauncher`), **replacing** the inline launchers in RDF mode. Verified:
  in RDF mode the toolbar comes from `tabs.ttl` and the ⋮ loads `menu.ttl` (no
  inline `<menu>`), 0 errors.
- **Settings in the sync.** `rdf-to-html` regenerates the `<sol-default>`
  attributes from settings.ttl (`emitSolDefaultAttrs`); attributes stay the
  pre-paint runtime form (the carve-out). Round-trip lossless.

The ⋮ is **dual-role** — a toolbar action that also owns the menu (its
`data-from-rdf` points at `menu.ttl#More`); in RDF mode the action dropdown
loads its menu from RDF, so the inline `<menu>` is only the HTML-mode form.

Remaining (not built):
- **Wiring** — assembling the generated fragments back into a single file at
  flip-time (the dual-role ⋮ means the menu nests inside the action dropdown).
- **Forms** — generate `<sol-form>` / shapes from the same HTML (open question #3).

## Phase 6 (the vanilla shell + runtime switch) BUILT + verified 2026-06-02

The two pure files from Phase 5 were **trimmed to body fragments** (just the
`<sol-tabs …>` + its children; no doctype / `<head>` / `<sol-default>`), and
**`index.html` became the vanilla shell** that picks one at runtime:

- `index.html` holds `<sol-default src-of-truth="html" …>` (values `html` | `rdf`,
  **default `html`**), the shared mini-player chrome bar, and an empty
  `<sol-include id="omp-body" trusted>` inside `<main class="omp-panels">`.
- **`html-first.html`** — the inline declarative `<sol-tabs>` (tabs + toolbar +
  inline ⋮ `<menu>`).
- **`rdf-first.html`** — `<sol-tabs id="omp-tabs" keep-alive
  from-rdf="./data/generated/tabs.ttl#Tabs">` (empty; tabs + toolbar + ⋮ all
  from the generated RDF).
- `omp-shell.js` — a top `selectBody()` IIFE reads `src-of-truth` off
  `<sol-default>` and sets `#omp-body`'s `source` to `./html-first.html` or
  `./rdf-first.html`. `sol-include[trusted]` renders into the **light DOM**
  (wrapped in `.si-content`), so `getElementById('omp-tabs'/'panel-news')` still
  resolve. `solTabs` is now `let`/null, assigned inside `whenTabsReady` because
  the tabs arrive asynchronously via the include.
- `assets/omp.css` — `.omp-panels > sol-include, .omp-panels > sol-include >
  .si-content { display: contents }` keeps `<sol-tabs>` the flex child despite
  the include wrappers.
- **Generators** now default their source to `html-first.html` for tabs/menu and
  additionally read `index.html` for the `<sol-default>` settings (concatenated
  before extract, so `settings.ttl` still regenerates). `gen:rdf:verify` and
  `gen:html:verify` both still pass; `index2.html` deleted.

**Why this over the Phase-5 "serve the other file" approach:** one stable URL
(`index.html`); the choice is a declarative attribute on `<sol-default>` (where
all app config already lives), read on the omp side — **no swc change** (chosen
deliberately; `sol-include`'s trusted→light-DOM behaviour already existed).

Verified by `claude/smoke-tests/e2e-src-of-truth.mjs` (self-contained static
server; `?rdf` rewrites the attr to exercise both modes): **12/12 in both
modes, 0 non-network errors** — default loads `html-first.html` with inline
tabs in light DOM and laid out; `?rdf` loads `rdf-first.html` with `from-rdf`
tabs; identical 4-tab order; `panel-news` present both ways.

## Goal

Make the declarative **HTML the single source of truth** for the app's UI
configuration, and **auto-generate the RDF (`.ttl`) and the editing Forms from
it** — instead of hand-authoring HTML *and* a parallel `.ttl` (and `<sol-form>`)
that say the same thing.

## Why now

The 2026-06-01/02 work moved configuration out of JS and RDF into slim,
declarative HTML. `index2.html` is the showcase:

- **Tabs** — inline `<a href id="panel-*" data-handler=… data-*=…>` anchors
  (no `from-rdf`); `data-tab-id` sets the tab identity.
- **Toolbar actions** — bare non-anchor children of `<sol-tabs>` (no
  `slot="actions"`); `<sol-button>`, `<sol-login>`, `<sol-dropdown-button>`.
- **⋮ menu** — an inline `<menu>` of `<button handler="…">` (no `menu.ttl`),
  gated by `if-logged-in`.
- **Theme / text-size / dev-write** — attributes on `<sol-default>`
  (`theme` / `fontsize` / `solid-kitchen`); the CSS `:has()` cascade resolves them.
- **One attribute, `handler`**, covers component-or-action (a custom-element tag
  mounts; a bare name dispatches `sol-command`).

So index.html (RDF-driven via `from-rdf`) and index2.html (HTML-driven) now
express the **same UI two ways**. That duplication is the thing to remove.

## The inversion

Today: author `.ttl` → `from-rdf` builds the UI. Also: hand-author `<sol-form>`s.

Proposed: **author the HTML → derive the `.ttl` and the Forms.**
- The `from-rdf` consumers stay, but the `.ttl` they read becomes a *generated
  artifact* (precedent: `.shaclc` is derived from `.shacl` via a regen script —
  never hand-edited).
- `<sol-form>` editors are *generated* from the HTML (or a shape inferred from
  it), not coded by hand.

## Both entry points stay first-class (clarification 2026-06-02)

This is NOT "drop the RDF path." The rendering components (`sol-tabs`,
`sol-menu`, `sol-dropdown-button`) are already **dual-input** — they build from
`from-rdf="…ttl"` OR from inline HTML children, normalising both to the same
`ui:`/`acl:` descriptors. `index.html` (RDF-driven) and `index2.html`
(HTML-driven) prove the same UI runs from either entry point. So:

- **A site can start from HTML or from RDF and still work** — that already holds.
- What we're removing is **hand-maintaining BOTH for the same site** (an inline
  `<menu>` and a `menu.ttl` kept in sync by hand). One authored source per site.
- The generator is the bridge: an **HTML-first site can emit RDF** (for pod
  storage, interop, feeding Forms) without that RDF becoming a hand-kept copy.

Direction of generation, for now, is **one-way HTML → RDF** (HTML canonical, RDF
a projection). The reverse (RDF → HTML) and full round-trip (edit either,
regenerate the other) are a later step — not required for "either entry point
works," since the renderers are source-agnostic.

## DIRECTION CHOSEN 2026-06-02 — two pure files (supersedes the one-file switch)

The one-file `from-rdf` switch (below) was built and worked, but carrying both
representations in one file read as confusing duplication. **Chosen instead: two
self-describing files**, with the generator as the bridge:
- **`html-first.html`** — pure inline (canonical authoring; no `data-from-rdf`).
- **`rdf-first.html`** — pure `from-rdf` (tabs + toolbar + ⋮ menu all from
  `data/generated/*.ttl`; the ⋮ action carries its own `source` to menu.ttl, so
  no switch is needed).
- `index2.html` retired. Switching canonical source = regenerate the other side
  (`gen:rdf` / `gen:html`) and serve the other file. The swc switch glue is now
  dead code (offered for removal); `_buildLauncher` + slot=actions stay (rdf-first
  needs them). Both files verified: identical UI, 0 errors.

The switch design below is kept for reference (it's how we got here).

## A single switch: `from-rdf` on `<sol-default>` (added 2026-06-02, SUPERSEDED)

Rather than two separate files (index.html = RDF-driven, index2.html =
HTML-driven), let **one document pick its source of truth with a single flag on
`<sol-default>`**:

- `<sol-default from-rdf …>` present/true → **RDF is the source of truth.** The
  UI components load their config from RDF (their `from-rdf`/`source` URLs, e.g.
  the generated `data/*.ttl`); inline HTML children, if any, are secondary /
  ignored. Edits target the RDF; HTML is the projection.
- `<sol-default>` *without* `from-rdf` → **HTML is the source of truth.**
  Components build from their inline declarative children; the RDF is generated
  FROM the HTML (`bin/html-to-rdf.mjs`). Edits target the HTML.

So the same markup serves both roles by flipping one attribute — index.html and
index2.html collapse into a single file. `<sol-default>` is already the app-wide
config element (proxy / theme / fontsize / solid-kitchen), so the source-of-truth
mode belongs there too.

**Switching requires a sync; everyday use does not.** The flag is read at
runtime and the app just *reads the canonical source directly* — no generation
on a normal load, in either mode. The generator runs only **once, when you flip
the source of truth**, to bring the now-secondary representation up to date from
the now-canonical one:

- flip → RDF-canonical: sync = generate RDF from the current HTML (`html-to-rdf`,
  built).
- flip → HTML-canonical: sync = generate HTML from the current RDF (the RDF→HTML
  round-trip — NOT built yet).

So full switch support needs both generator directions, but neither is on the
hot path: pick a mode, edit that source, run, ship — the other side is only
regenerated at the moment you change which side is authoritative.

**Contract for the per-component `data-from-rdf` hint:** it is **OPTIONAL** and
read **only** when `<sol-default from-rdf>` is set. In HTML mode (no switch) it
is ignored entirely — so a pure-HTML page needs no pointers. It is only required
on the components you want switchable, and only matters when `from-rdf` is true;
in RDF mode a component lacking the hint just falls back to its inline children.
(A component's own `from-rdf`/`source` always wins, switch or not — back-compat.)

## Completeness principle (2026-06-02)

**In HTML mode, ALL the UI config lives in the HTML; in RDF mode, ALL of it
lives in RDF — except the carve-outs we've decided.** Each mode must be
self-contained: nothing silently falls back to the other side for a piece of
config. Implications for the generator/sync (it must cover *everything*):

- **Tab anchors** → tabs.ttl `ui:Component` parts. ✓ built.
- **The ⋮ menu** → menu.ttl. ✓ built.
- **Toolbar action buttons** in `<sol-tabs>` (the `?`/`A`/`🌙`/`<sol-login>`/`⋮`
  launchers) → **tabs.ttl** (an "actions" group of `ui:Component` launchers,
  each with handler/source/region/inline/if-logged-in/label as `ui:attribute`s;
  cf. `PLAN-tab-row-actions.md`). **NOT built — current gap.**
- **`<sol-default>` settings** (theme/fontsize/proxy) → settings.ttl.
  `html-to-rdf` emits it ✓; `rdf-to-html` must also regenerate the `<sol-default>`
  attributes from it. **NOT built — current gap.**

**The carve-out ("except as we've decided"):** theme/fontsize MUST always
materialise as `<sol-default>` *attributes* because omp.css's `:has()` cascade
reads them pre-paint (no script → no flash). So even in RDF-canonical mode the
attributes are present — as a *generated projection* of `settings.ttl` (synced at
flip-time), not a hand-kept second copy. settings.ttl is the editable source in
RDF mode; the attributes are its always-on runtime form.

**Settings pointer (2026-06-02):** `<sol-default>` carries
`data-settings="./data/generated/settings.ttl#Settings"` — the address of the
settings RDF. Even though theme/fontsize live on the attributes, **Forms (and
the flip-time sync) need this address** to read/write settings. `settings.ttl`
is generated by `html-to-rdf`; the pointer just declares where it lives. (Runtime
still reads the attributes — the pointer is for editing/sync, not for loading.)

Open details: boolean flag vs a base URL/dir (where the per-component RDF lives,
e.g. `from-rdf="./data/generated/"`, which would drop the per-component hints);
whether "RDF mode" still *generates* HTML for inspection (the round-trip
question above).

## Open questions / steps (to flesh out before building)

1. **Scope of the generator.** Which HTML → which RDF? At least: `<sol-tabs>`
   anchors → a `ui:Menu` of tab parts; `<sol-dropdown-button><menu>` → a
   `ui:Menu` of command/link items (incl. `acl:Write` from `if-logged-in`);
   `<sol-default>` attrs → a settings record. Mirror the existing `ui:`/`acl:`
   vocabulary so the `from-rdf` path consumes the output unchanged.
2. **Where it runs.** Build-time script (HTML → `data/*.ttl`) vs runtime
   (serialize the live DOM to RDF on demand, e.g. for a "publish to pod" step).
   Build-time is the `.shaclc` precedent; runtime suits pod-sync/export.
3. **Forms.** Generate `<sol-form>` (or its shape) from the same HTML/shape so
   editing the config is possible without hand-authored forms.
4. **Round-trip?** Is HTML→RDF one-way (HTML canonical), or must edits via a
   generated Form write back to HTML? Likely one-way first (HTML canonical),
   pod-stored RDF is a projection.

## Guardrails

- Don't add NEW hand-maintained `.ttl` UI config that duplicates HTML — flag it.
- Keep the `ui:`/`acl:`/SKOS vocabulary (no coined terms) so generated RDF stays
  consumable by the existing `from-rdf` / SHACL machinery.

See memory [[project_html_src_of_truth]]. Related: `project_soltabs_solbuttons`,
`project_menu_commands`, `project_theme_system`, `project_solid_kitchen_attr`.
