# PLAN — HTML as the source of truth (RDF & Forms auto-generated)

Status: **Proposal / next up** (top of the to-do, 2026-06-02). Not built.

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
