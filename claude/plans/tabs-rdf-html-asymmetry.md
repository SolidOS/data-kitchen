# tabs.ttl ↔ html-first.html — asymmetry inventory

Reference for the two-way tabs sync plan (RDF canonical, `html-first.html` kept
hand-editable; see `/home/jeff/.claude/plans/show-my-sc-with-parallel-planet.md`).
Lists every item that lives in **only one** of the two representations, so the sync
design knows what it must preserve and what is at risk of being dropped on a
round-trip.

Sources: `data/tabs.ttl`; generator `tools/conversion/generate-html-first.mjs`
(`emitTab`/`emitBarItem`); parser `node_modules/sol-components/core/menu-rdf.js`
(`parseMenuItems`/`rdfComponent`); harvester `…/web/sol-tabs.js` (`_harvestAnchors`,
SKIP set at `:302`); merge `…/core/menu-serialize.js` (`updateMenuInStore` `:149`).

Legend: **PRESERVED** = the planned sync keeps it; **AT RISK** = a naive
round-trip would drop it (needs a decision).

---

## A. RDF-only — in `tabs.ttl`, absent from `html-first.html`

### A1. Pantry items — PRESERVED
Components defined in the doc but NOT in their menu's `ui:parts`, so never emitted
as anchors. Kept so the builders/palette can drag them back in.

| Subject | label | menu | note |
|---|---|---|---|
| `#panel-home` | 🏠 Home | #Tabs | pantry |
| `#panel-solidos` | 🐧 SolidOS | #Tabs | pantry |
| `#panel-customize` | 🎛 Customize | #Tabs | pantry; also `acl:mode acl:Write` |
| `#bar-theme` | 🌙 | #Bar | pantry |
| `#bar-settings` | ⚙ | #Bar | pantry |
| `#bar-login` | Sign in | #Bar | pantry |

Preserved because HTML→RDF is a **merge**: `updateMenuInStore` only rebuilds the
subjects the active tree references plus the menu node, leaving these untouched.

### A2. Menu-level metadata — PRESERVED
On the `#Tabs` / `#Bar` menu nodes, not on any anchor:
- `ui:label` — `"data-kitchen"` (#Tabs), `"actions"` (#Bar). The menu's own name;
  never rendered into the HTML.
- `ui:orientation` — `ui:Horizontal`. (Could map to `<sol-tabs orientation>`, but
  the generator does not emit it today.)
- `rdf:type ui:Menu` + the `ui:parts` list structure itself.

Preserved for the same merge reason (the menu node is re-emitted from the model,
which carries label/orientation; the parts order is exactly what the edit sets).

### A3. ~~Per-item RDF-only properties~~ — NOT actually RDF-only (corrected)
**Correction:** an earlier version listed `acl:mode acl:Write` and `ui:icon` here as
RDF-only and at-risk. Both are wrong:
- **Write/owner gating HAS an HTML form** — the attributes `requires-write` and
  `if-logged-in`. `sol-menu`'s `isGated` reads them (`web/sol-menu.js:309`:
  `n.hasAttribute('requires-write') || n.hasAttribute('if-logged-in')`), and it
  round-trips with `acl:mode acl:Write`: `parseMenuItems` reads `acl:mode` →
  `requiresWrite` (`menu-rdf.js:16,101`); `menu-serialize.js:107,134` writes it back
  (`if (item.requiresWrite) store.add(node, acl('mode'), acl('Write'))`).
  `html-first.html` already uses the HTML form on the chrome help button
  (`if-logged-in="./help/dk-owner.html"`).
- **Icons HAVE an HTML form** — `sol-menu` reads an `icon` attribute
  (`web/sol-menu.js:333`), mirroring `ui:icon`.

So these are expressible in **both** and survive a round-trip — not an asymmetry.

The real (smaller) point: this gating/icon wiring exists for the **☰ menu**
(`sol-menu`, driven live from `data/menu.ttl`), but the **tab-strip path does not
wire it** — the generator `emitTab` doesn't emit `requires-write`/`icon`, and
`_harvestAnchors` doesn't read them. So a tab that carried `acl:mode`/`icon` would
lose it RDF→HTML. That's a **tab-generator gap to close if needed**, not an inherent
RDF-only fact. (Moot today: the one `acl:mode` in `tabs.ttl` is on `#panel-customize`,
a pantry/☰-menu item — already covered by A1, and gated correctly in the menu.)

---

## B. HTML-only — in `html-first.html`, absent from `tabs.ttl`

### B1. The chrome block — RECLASSIFIED (no longer HTML-only under the new design)
Currently the help button, ☰ menu, and sign-in sit between `<!-- chrome:begin -->` …
`<!-- chrome:end -->`, preserved verbatim and absent from RDF. The chrome design
(see the plan's "Chrome" section) changes this: the buttons become an RDF group
`#Chrome` whose CONFIG (source, if-logged-in, icon/label, ☰ menu source, issuers) is
modeled and editable, so it round-trips like `#Bar` — NOT HTML-only. What remains:
- **Presence** is enforced by APP CODE (mandatory list) + self-heal on load, not by
  the HTML. Not data in either file.
- **Critical plumbing** (`popup-callback` engine path, `region`, `trusted`, `inline`)
  is app-supplied, not user data — neither HTML-only nor RDF.

### B2. `<sol-tabs>` wrapper attributes — PRESERVED (hardcoded)
`id="dk-tabs"` and `keep-alive` on the `<sol-tabs>` element. The generator hardcodes
`<sol-tabs id="dk-tabs" keep-alive>`; they are not modeled in RDF.

### B3. Hand-authored non-tab markup & comments — PRESERVED
Anything a person adds outside the tab anchors / bar elements — extra structural
HTML, explanatory comments (including the generator's own "Actions row…" comment).
The harvester only reads `:scope > a[href]` tab anchors + bar elements, so non-tab
markup never reaches RDF and is left verbatim. This is the hand-editability the plan
is protecting.

### B4. Skipped `<a>` attributes on a tab anchor — AT RISK
`_harvestAnchors` SKIPs these and never forwards them to the model
(`sol-tabs.js:302`): `target`, `rel`, `download`, `hreflang`, `type`,
`referrerpolicy`, plus `data-tab-id` (consumed as the tab id, not as a param).
If hand-added to a tab anchor, they render but do NOT round-trip to RDF — so after a
HTML→RDF import + regenerate cycle they are **lost**. Decision needed: model them,
fence them, or accept the loss (document it).

---

## C. Representation differences (same item, different shape) — not "only-in-one"

Listed so they aren't mistaken for asymmetries; the extractor must invert each:
- Tab attributes: `data-`prefixed in HTML ↔ bare `schema:name` in RDF
  (`emitTab` adds `data-`, `_harvestAnchors` strips it).
- **Bar** attributes: emitted **verbatim** (no `data-` prefix) — extractor needs a
  separate rule from tabs.
- Component tag: `ui:name` ↔ `data-handler` (tabs) / the element tag name (bar).
- Label: `ui:label` ↔ anchor `textContent` (tabs) / `sol-button` text (bar).
- Tab `id`: `id` param ↔ anchor `id` attribute (or `data-tab-id`).

---

## Design consequences

1. **HTML→RDF must be a merge** (reuse `updateMenuInStore`) — preserves A1, A2.
2. **Non-tab regions preserved verbatim** (chrome markers + harvest only reads
   anchors/bar) — preserves B1–B3.
3. **One real AT-RISK set** to decide before relying on round-trips:
   - B4: skipped `<a>` attributes (`target`, `rel`, …) hand-added to a tab anchor —
     the harvest drops them, so a full sync cycle loses them.
   Options: extend the RDF model to carry it, fence it as preserved-verbatim, or
   accept+document the loss. Does not block the core customize-save→render fix;
   bounds only what survives a full sync cycle.
4. **Tab-generator gap (A3), optional:** if tabs ever need owner/write gating or
   icons, wire `emitTab`/`_harvestAnchors` to the existing `requires-write` /
   `if-logged-in` / `icon` HTML attributes (already used by `sol-menu`). Not a
   data asymmetry — just unwired on the tab path.
