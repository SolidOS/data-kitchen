# Podz integration + sol-pod settings — DONE 2026-06-15

> **STATUS: SHIPPED 2026-06-15.** Both the podz integration and the sol-pod
> settings work are done. What actually shipped:
> - **podz absorbed into dk** as the in-house `dk-podz` component (separate podz
>   repo deleted; sealed bundle gone; sol-pod/sol-live-edit stayed in sc).
>   Commit `140b8dc`.
> - **sol-pod owns one settings doc** (`ui:ignorePattern` + `ui:editorKeys`),
>   actually consumes it (glob filtering; live-edit inherits editorKeys + writes
>   back); inline ⚙ panel removed. dk `5ecfa6a` / sol-components `e083df3`.
> - **Settings page is RDF-driven + in-use-gated** via `<dk-plugin-settings>`,
>   manifest-driven (no side file), subject via `foaf:primaryTopic`; pod-settings
>   moved to `plugins/podz/`; relabelled "Data Kitchen Pod Browser".
>   **See `rdf-driven-plugin-settings.md` for the as-built settings design.**
>
> The plan below is the original (2026-06-15) direction, kept for history; the
> settings approach evolved past it (manifest-driven, not the discovery-only
> pattern it assumed). Don't execute it as-is.

---

# (Original plan) Podz integration + sol-pod settings

> Written 2026-06-15 for **the next Claude session**, by request. If you're
> picking up the sol-pod / live-edit settings work, start here — the obvious
> path (wire settings around the current podz bundle) is a trap; do the
> integration first. Everything below is Jeff's decided direction, not a
> proposal to re-litigate.

## TL;DR

1. **Do the podz integration FIRST**, then the sol-pod settings work becomes a
   routine sc-component-in-dk job.
2. sol-pod settings end-state: **one** RDF/SHACL settings file owned by sol-pod
   (holds both `ui:ignorePattern` and `editorKeys`), instance living in
   `plugins/sol-pod/`, surfaced on the **central Settings page** via the
   weather/time discovery pattern; **live-edit is subordinate** to sol-pod.
3. A partial/intermediate wiring already landed this session — it will be
   reworked by the above; see "Current state" so you don't double-count it.

## The sol-pod / podz split (why the current setup fights us)

- **sol-pod** (+ `sol-live-edit`, `sol-modal`, `sol-tabs`, `sol-wac`) are
  reusable **components** in **sol-components**. sol-pod is "a pod file browser
  as a custom element" — no shell, no layout/auth opinion.
- **podz** (`Dropbox/Web/solid/podz`, the `podz` npm dep) is a separate
  **application/shell** — `SolidFileBrowser` + `podz-ui / podz-state /
  podz-auth / podz-live / podz-pod` — that composes those sc components into a
  two-panel file manager (split layout, login flow, panel state, and the
  *orchestration*: it is podz, not the component, that spawns a
  `<sol-live-edit>` when you open a file).
- **How dk runs it today:** `plugins/podz/dk-podz.js` injects podz's markup
  (`dk-podz.html`, which has the `<sol-pod>` panels) and then loads podz's
  **pre-built bundle** (`node_modules/podz/dist/podz.bundle.min.js`), which
  *self-instantiates* `new SolidFileBrowser()` and wires the DOM. Components
  inside resolve from sc via the importmap, but **the shell logic is a sealed
  black box dk runs in a tab.**

That sealed bundle is the *actual* root of every settings snag (full autopsy in
the conversation): dk can't reach the transient editor podz spawns, can't inject
a settings-file path into podz's internals, can't choose where/how widgets
mount. The component-vs-shell *concept* is fine and healthy; the
**opaque-bundle indirection** is the problem.

## The integration (what removes the friction)

Bring podz's shell in-house: dk imports `sol-pod` & friends **directly** from
sol-components and owns the file-browser shell itself, instead of loading the
self-instantiating `podz.bundle.min.js`. Concretely it means absorbing/porting
podz's shell modules (`podz.js`/`SolidFileBrowser`, `podz-ui`, `podz-state`,
`podz-auth`, `podz-live`, `podz-pod`, `podz-editor`, `podz.css`) into dk's own
code (or importing them as **source** modules, not a bundle), so dk controls
mounting.

Once dk owns the mounting:
- sol-pod is just another sc component dk mounts → dk sets its `data-subject`,
  picks the single settings-bearing instance (no `data-settings-skip`
  double-mount gymnastics).
- live-edit is a component **dk** creates → the "inherit `editorKeys` from
  sol-pod + write changes back" channel is dk-wired and visible.
- host paths like `plugins/sol-pod/…` are dk's to set at mount time — the
  host-path problem disappears.

The *painful* split (sealed runtime app) goes away; the healthy split (sc
components + a dk-owned shell composing them) remains. podz-the-package stops
being a black box dk embeds; its shell effectively becomes dk code. **Open:**
decide what (if any) of podz's shell is general enough to land in sc vs dk.
WiP — nothing is live to users, so this can change freely
([[wip-no-backward-compat]]).

## sol-pod settings — the end-state design (after integration)

Jeff's model, in his words distilled:

- **sol-pod is the authority.** It owns ONE settings file in RDF/SHACL holding
  **both** `ui:ignorePattern` and `editorKeys`.
- **"Self-manage" = the mechanism lives in the component**, NOT that sol-pod
  renders the form. Exactly like `sol-weather`/`sol-time`: sol-pod declares
  `static get shape()` + a subject (`data-subject`), and the central
  `<sol-settings>` discovery **presents and drives** the editing form. sol-pod
  owns the shape, the subject, load-on-mount, and **applying** the values.
- **sol-pod must actually CONSUME `ui:ignorePattern`** — today it filters via
  hardcoded `this._prefs = { hideDot, hideHash, hideTilde }`
  (`sol-components/web/sol-pod.js` ~line 115, used ~451-453). The saved value is
  inert until this is wired. This consumption is part of "mechanisms live in
  sol-pod."
- **live-edit is subordinate.** It no longer has its own settings file: it
  *reads* `editorKeys` from sol-pod and *pushes* keybinding changes back to
  sol-pod, which persists them. `live-edit-settings.shacl` (sc) +
  `live-edit-settings.ttl` (still in `ui-data/`) get **absorbed into sol-pod's
  shape/file and deleted**.
- **Instance RDF location:** a `plugins/sol-pod/` tree (dk repo + pod) — a data
  location, NOT a dk plugin with a manifest. `sol-pod` (the general component),
  not `podz` (one app using it), is the right owner name.

### Decisions still open (ask Jeff, don't guess)
1. **`plugins/sol-pod/` folder + file name** (e.g. `pod-settings.ttl`). It
   *supersedes* the `plugins/podz/podz-settings.ttl` placed this session.
2. **How sol-pod locates its file host-agnostically** — almost certainly a new
   attribute on sol-pod (e.g. `settings="…#Settings"`) set by the host. **New
   attribute → needs Jeff's explicit OK on the name** (the no-new-attribute HARD
   rule). `data-subject` is already OK'd for the discovery-subject.
3. **The sol-pod ↔ live-edit channel** — property/event; routed through the
   (now dk-owned) shell or component-to-component. Sets how coupled they are.

## Current state (what already landed 2026-06-15 — intermediate, will be reworked)

These are real, mostly-keeper increments, but they encode the *pre-redesign*
shape (separate podz-named file in `plugins/podz/`, no editorKeys yet, live-edit
not yet subordinate). Don't treat them as the finished design.

- **sc** `web/sol-pod.js`: added `static get shape()` → `pod-settings.shacl`
  (keeper — sol-pod declaring its shape is the agreed pattern). *editorKeys must
  still be folded into that shape.*
- **sc** `shapes/pod-settings.shacl`: **new** — moved here from the podz package
  (per `generally-applicable-goes-in-sc`; sol-pod is an sc component so its
  shape belongs in sc). Currently only `ui:ignorePattern`; **fold in
  `editorKeys`** next.
- **podz** `shapes/podz-settings.shacl`: **deleted** (moved to sc above).
- **dk** `plugins/podz/dk-podz.html` (repo + pod): left `<sol-pod>` got
  `data-subject="./dk-pod/dk/plugins/podz/podz-settings.ttl#Settings"`.
  *Provisional* — path moves to `plugins/sol-pod/` and the double-mount needs
  handling (right pod likely shows a dup panel; would need `data-settings-skip`
  — but the integration removes the double-mount need entirely, so prefer to fix
  it there).
- **dk** `podz-settings.ttl`: moved `ui-data/ → plugins/podz/` (repo + pod).
  *Provisional location* — moves to `plugins/sol-pod/`.
- **Untouched on purpose:** `ui-data/live-edit-settings.ttl` (its `editorKeys`
  folds into sol-pod's file and the standalone file is then deleted).
- **Reverted:** a brief `static get shape()` on `sol-live-edit` (its editor is
  transient, so it would be mis-discovered as a settings panel while editing).

## Known gaps to close as part of the real build
- sol-pod doesn't consume `ui:ignorePattern` yet → saved Hide-paths value is
  inert.
- Double-mounted `<sol-pod>` (left/right panels) → discovery dup unless the
  integration lets dk mount a single settings-bearing instance.
- live-edit ↔ sol-pod inheritance/write-back channel doesn't exist yet.

See also: [[data-kitchen-consolidation]] (session log), [[generally-applicable-goes-in-sc]],
[[wip-no-backward-compat]], [[pod-is-source-of-truth-for-now]].
