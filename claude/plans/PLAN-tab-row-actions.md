# PLAN — Tab-row actions (buttons on the tab bar that open in the tab display area)

Status: **PROPOSAL — not started** (2026-06-02)
Scope: `solid-web-components` (`sol-tabs`, maybe `sol-button`) + omp wiring.
Related: [[project_soltabs_solbuttons]], [[project_menu_commands]]. Builds on the
already-shipped `sol-button` `inline` region and `sol-include` `if-logged-in`
(both done + tested this session).

---

## Problem / motivation

omp's Help (`?`) is a transient view that should open **in the main content
area** (where tab panes show), not a modal — with the tab bar staying visible,
the active tab de-emphasised, and the `?` highlighted while help is up. We got
that working, but the *activation wiring* kept being awkward:

- A plain `<button>` + JS that builds/show-hides an element elsewhere = "magic"
  (the markup doesn't say what activates what). **Rejected** — see
  [[feedback_no_magic_html_activation]].
- `<sol-button inline for="#omp-tabs > .sol-tabs-content">` works, but couples
  `index.html` to `sol-tabs`'s internal class and repeats the selector per button.
- `<sol-default region="…">` to declare the host once **broke the app** — it's the
  *global* default for the region cascade, so `sol-tabs`'s own panel-mounting
  inherited it and every pane mounted at once. **Do not use sol-default for this.**

The pattern we actually want is general: **"tab-row actions"** — buttons that live
in the tab bar next to the real tabs, but show *transient* content in the same
display area and are mutually exclusive with the active tab. Help, Settings,
About, "What's new", etc. The right owner is `sol-tabs`, because it already holds
the bar, the content area, and the active-tab state.

## Current building blocks (already exist)

- `sol-button` `inline` (boolean) + `for=` host, or host via the region cascade
  (`closest('[region]')` → `<sol-default region>`). Toggle, non-keep-alive,
  reflects `open` + `aria-expanded`, `close()` method. Tested (8/8).
- `sol-include` `if-logged-in="alt.html"` — swaps source when logged in
  (SolidKitchen counts as logged-in). Tested.
- `sol-tabs` already renders three light-DOM regions: `.sol-tabs-bar`,
  `.sol-tabs-actions` (a toolbar row, currently fillable only imperatively via
  `tabsEl.actionsEl`), `.sol-tabs-content`. Tabs come from `<a href>` children or
  `from-rdf`. Nested `ui:Menu` already renders as a sub-tab strip.

## Goal

Author tabs **and** tab-row action buttons together, declaratively; the buttons
open their content in the tab display area with no `for=`, no global default, and
no per-app JS glue. `sol-tabs` coordinates dismiss-on-tab + highlight.

Target authoring (the *what*, independent of option):
```
[News][Music][Images][Movies] ………… [?][⚙][ℹ]
clicking ? → help overlays the content area; clicking a tab dismisses it.
```

---

## Shared work (needed by BOTH options A and B)

These live in `sol-tabs` regardless of how the buttons are declared:

1. **Place actions on the bar row.** Today `.sol-tabs-actions` is a separate row
   between bar and content. Render/position action buttons within (or right-
   aligned on) `.sol-tabs-bar` so they sit on the tab row.
2. **Expose the content area as a *scoped* region** that action launchers inside
   `sol-tabs` inherit — e.g. `sol-tabs` sets `region` (pointing at its own
   `.sol-tabs-content`) on the actions container, OR claims those launchers via
   `data-for`. Scoped so it never leaks to panel-mounting (the sol-default trap).
3. **Coordination** (sol-tabs owns the state):
   - activating a tab → `close()` any open inline action overlay;
   - while an action is open → mark it so CSS can de-emphasise the active tab and
     highlight the action button (generalises the omp `:has()` + `[open]` CSS).

## Option A — HTML slotted action buttons

Declare buttons as children of `<sol-tabs>` with `slot="actions"`; `sol-tabs`
harvests them into the actions area (it's light DOM — no shadow `<slot>`, so it
reads the `slot="actions"` marker and relocates them, like it harvests `<a>`
tabs).

```html
<sol-tabs id="omp-tabs" keep-alive from-rdf="./data/tabs.ttl#Tabs">
  <sol-button slot="actions" inline class="omp-help-launch" title="Help"
              handler="sol-include"
              source="./assets/omp-help.html" if-logged-in="./assets/omp-help-owner.html"
              trusted>?</sol-button>
</sol-tabs>
```

- **Pros:** least new machinery; buttons + their attributes are plainly visible in
  HTML; works with `from-rdf` tabs OR `<a>` tabs; no RDF→attribute mapping layer.
- **Cons:** the bar's contents come from two sources (RDF tabs + HTML buttons);
  not server/pod-configurable.
- **swc work:** harvest `[slot="actions"]` children into `.sol-tabs-actions`
  (+ the shared work above). `sol-button` unchanged.

## Option B — RDF buttongroup (extend the menu ui shape)

Put the buttons in the same Turtle as the tabs: add a part that's a **group
marked as actions**, whose members are `sol-button` launcher components (params →
attributes, the convention `menu.ttl` already uses).

```turtle
<#Tabs> a ui:Menu ; ui:parts ( <#News> <#Music> <#Images> <#Movies> <#BarActions> ) .

<#BarActions> a ui:Group ; ui:role "actions" ; ui:parts ( <#Help> ) .
<#Help> a ui:Component ; ui:label "?" ; ui:name "sol-button" ;
   ui:params [ schema:name "handler"      ; schema:value "sol-include" ] ,
             [ schema:name "inline"       ; schema:value "true" ] ,
             [ schema:name "source"       ; schema:value "./assets/omp-help.html" ] ,
             [ schema:name "if-logged-in" ; schema:value "./assets/omp-help-owner.html" ] .
```

- **Pros:** one declarative source for the whole bar; the action set is
  data-driven (server/pod-configurable, varies by deployment); consistent with
  the project's RDF-driven-UI direction.
- **Cons:** every button attribute round-trips through `ui:params` (wordier, less
  obvious than HTML); more `sol-tabs` RDF-loader complexity.
- **swc work:** teach the RDF loader an "actions group" marker that routes members
  to `.sol-tabs-actions` instead of the bar/subtabs (+ the shared work above).
  `renderComponentItem` already maps `ui:Component`+params → an element.

### Design decisions to settle (B)
1. **Group marker** — a nested `ui:Menu` already = subtabs, so actions needs a
   *different* marker. `a ui:Group ; ui:role "actions"` (proposed) vs a dedicated
   SWC class. Must not collide with the subtab path.
2. **Label vs icon** — `ui:label "?"` as the glyph, or separate `ui:icon` + title.
3. **Region** — keep it implicit (sol-tabs auto-scopes the content region to the
   actions group) so RDF needn't name a selector.

## Option C — status quo (baseline, no general feature)

Keep `<sol-button inline for="#omp-tabs > .sol-tabs-content">` in `index.html`
(what's shipped now and working). No `sol-tabs` change. Coupled selector + the
dismiss-on-tab JS + `:has()` CSS stay in omp. Listed for comparison.

---

## Recommendation

- If the action set is small/fixed (just Help, maybe Settings) → **Option A**.
  Simplest, fully declarative, no RDF mapping; do the shared `sol-tabs` work once.
- If the bar should be fully data-driven (pod/deploy-configurable action set) →
  **Option B**, built *on top of* A's `sol-tabs` plumbing (harvest + region +
  coordination are shared; B just adds an RDF→`slot="actions"` front-end).

Suggested path: do the **shared `sol-tabs` work + Option A** first (gets omp off
the `for=`/JS-glue baseline), then add **Option B** as an RDF front-end if/when a
data-driven action set is wanted. A and B are not mutually exclusive.

## Testing

- swc jest: `sol-tabs` harvests `slot="actions"` into the actions row; slotted
  `inline` button resolves its host to the tab content area (no `for=`); tab
  activation closes an open action; (B) an `actions`-group in RDF renders into the
  actions row, members render as `sol-button`s.
- omp e2e (`e2e-soltabs.mjs`): `?` on the tab row opens owner/guest help inline in
  the content area, `?` highlights, active tab de-emphasised, tab-click dismisses
  — same assertions as now, minus the `for=`/JS glue.

## Files (anticipated)
- `solid-web-components/web/sol-tabs.js` (+ its css) — shared work; A harvest; B loader.
- `solid-web-components/tests/web/sol-tabs.test.js` — new cases.
- omp `index.html` — `?` becomes a slotted child (A) or moves to `tabs.ttl` (B);
  drop `for=`.
- omp `data/tabs.ttl` — (B only) the `#BarActions` group.
- omp `src/omp-shell.js` / `assets/omp.css` — remove the dismiss-on-tab JS and the
  `:has()`/`[open]` glue once `sol-tabs` owns it.
