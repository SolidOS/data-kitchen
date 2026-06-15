# Plugin settings — RDF-driven, in-use-gated (AS BUILT 2026-06-15)

Final state of the Settings-page per-plugin settings work (the successor to the
"discovery accordion only" approach). Implemented in dk commits `7fc8176`,
`7856555`, `60c2b8a` (+ the sol-pod consumption in dk `5ecfa6a` / sol-components
`e083df3`).

## The problem
sc's `<sol-settings>` builds its form by walking the **live DOM** for mounted
components — so a plugin's settings only appeared once its (deferred, keep-alive)
tab had been opened. Jeff wanted plugin settings that are **RDF-driven** (not
hardcoded HTML), **gated on catalog "in-use" status** (shown iff the plugin is
wired into the active shell, not when parked in the catalog), and **in dk** (sc's
DOM-discovery left intact so other apps keep zero-config auto-discovery).

## What was built
- **`<dk-plugin-settings menu="…main-menu.ttl">`** (`src/dk-plugin-settings.js`),
  placed on the Settings page (`pages/settings.html`). On connect it:
  1. computes the **in-use set** = every `ui:name` referenced in the active shell
     doc (`data-kitchen-main-menu.ttl`) — dk's definition of "in use";
  2. for each in-use plugin, loads its **own manifest** `plugins/<id>/manifest.jsonld`;
  3. if the manifest declares a settings **shape** (`dct:conformsTo`) **and** a
     settings `.ttl` (`dct:requires`), renders a shape-driven `<sol-form>`.
- **Subject via `foaf:primaryTopic`** — no settings-subject term was invented.
  Every settings doc already declares `<> foaf:primaryTopic <#Settings>` (the
  established Solid "what this doc is about" convention, used by the mashlib data
  browser). The renderer loads the doc and reads its `foaf:primaryTopic` for the
  `<sol-form>` `subject`/`save-to`.
- **No duplication, no side file** — settings live in each plugin's own manifest;
  the heading is the manifest's `ui:label`. (An earlier intermediate used a
  separate `ui-data/data-kitchen-settings-groups.ttl`; removed.)
- **Pod browser treated like any plugin** — its settings data is
  `plugins/podz/pod-settings.ttl` (moved out of the one-off `plugins/sol-pod/`),
  declared in `plugins/podz/manifest.jsonld` (`shape` → sol-pod's sc shape;
  `requires` → the ttl). Both `<sol-pod>`s carry `data-settings-skip` so the
  discovery accordion never double-lists it; `dk-settings-applier` re-applies a
  save to any mounted `<sol-pod>` (live update).
- **Relabelled "Data Kitchen Pod Browser"** everywhere (flat manifest →
  regenerated catalog, folder manifest, main-menu tab, dk.manifest.json, help).

## Why dk, not sc
Replacing sc's DOM-walk with RDF-as-source-of-truth would limit other apps (lose
zero-config discovery + subject-from-element). `sol-form` is a pure renderer
(shape+subject in), unaffected by where shape/subject come from, so dk just
composes it over its own catalog/menu RDF. sc untouched.

## Adding another plugin's settings (data-only)
In the plugin's `manifest.jsonld`: add `shape` (its SHACL) + the settings `.ttl`
in `requires`; ensure the ttl declares `foaf:primaryTopic`. Also add
`data-settings-skip` to the plugin's mounted instance(s) to avoid a discovery
dup, and a `reload()` path if it should apply live. Plugins without a SHACL shape
(e.g. calendar, search) need one authored first.

## Verify
`claude/smoke-tests/verify-plugin-settings-rdf.mjs` (served via `:8081` + a temp
repo-root `dk-pod` symlink → `~/solid/dk-pod`): with the pod browser tab NOT
mounted the group still renders (manifest-driven), subject derived via
`foaf:primaryTopic`, heading "Data Kitchen Pod Browser"; gated out when the
plugin isn't in the menu; no discovery double-list. Companion checks:
`verify-sol-pod-settings.mjs` (sol-pod consumes ui:ignorePattern + editorKeys),
`verify-podz-absorbed.mjs`.
