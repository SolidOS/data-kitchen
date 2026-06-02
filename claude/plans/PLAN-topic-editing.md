# PLAN — Topic editing (feed topics, image topics, topic↔library)

**Status: DEFERRED** (designed 2026-05-30, not built). Builds on the shipped
SHACL settings/editors — see [[project_settings_forms]] and the settings work
in `index.html` / `src/omp-settings-widgets.js` / `shapes/*.shacl`.

## Why
The settings editors let you edit feed *sources* and image *collections*, and
add/rename image *topics* and *libraries* — but three gaps remain:

1. **No feed-topic editor** — News/Sci-Tech/Culture (the `taxo:topic` concepts)
   can't be added / renamed / removed.
2. **Topic Add is broken** — the rolodex `Add` only inserts the target/anchor
   triples, so a new topic has no `skos:Concept`/marker type → the parser and
   `sh:class` dropdowns don't recognise it. So "add/remove image topics"
   doesn't actually produce a usable topic yet.
3. **Can't associate a topic with a library** — `image-topics.shacl` is
   name-only; there's no way to set/change a sub-topic's parent library
   (`skos:broader`), because libraries and sub-topics are both `skos:Concept`
   and a `sh:class` dropdown can't tell them apart.

## Why the distinct marker types exist (taxo:topic, schema:DefinedTerm[Set], mo:Genre)

This is the non-obvious bit, worth understanding before touching the shapes.

A `sol-form` dropdown declared `sh:class X` is rendered by solid-ui's Choice
widget, which enumerates its options by walking **`kb.each(null, rdf:type, X)`
over the whole shared singleton store** — not the document being edited. omp
loads *all* libraries into that one store (music genres, movie genres, news feed
topics, image topics …), so they coexist there at once.

Consequence: if every topic were just a plain `skos:Concept`, then **every**
topic/category dropdown (`dcat:theme`, `skos:broader`, …) would list **every**
concept in the app — News feeds offered "Jazz" and "Feature Films", image
collections offered music genres, etc. (We hit exactly this and it's why the
News topic picker first showed garbage.)

`sh:class` can only discriminate by `rdf:type` — it can't filter by SKOS scheme
membership or by source document. So each domain/tier gets its **own existing
marker class**, and its dropdown targets that marker:

- Feed topics → `taxo:topic` (RSS 1.0 taxonomy module) → feed editor's topic list.
- Image sub-topics → `schema:DefinedTerm` → collection editor's topic list.
- Image libraries → `schema:DefinedTermSet` → topic editor's "library" list.
- Music genres → `mo:Genre` (already) → would scope a genre picker.

Note the asymmetry: `findSubjects` (which records a *rolodex* edits) **is**
document-scoped (`baseDoc`), so the record SETS are already clean without
markers — it's only the `sh:class` CHOICE enumeration that leaks globally and
therefore needs the markers. (A cleaner long-term fix would be to make
shape-to-form scope `sh:class` enumeration to the edited document; until then,
distinct markers are the pragmatic, no-new-vocab workaround.)

## Root enabler — distinct tier markers
Give each topic tier its own (existing, schema.org / RSS) marker class so
`sh:class` dropdowns and editors can scope to one tier. Migrator change in
`claude/migration-scripts/migrate-bookmark-to-dcat.mjs` (emit per-tier types,
re-migrate from the `claude/backups/*.pre-dcat-*` originals):

| Tier | Type | Enables |
|---|---|---|
| Feed topic | `skos:Concept, taxo:topic` (unchanged) | feed editor topic dropdown |
| Image **library** (Art/Life, top concepts) | `skos:Concept, schema:DefinedTermSet` | the "which library" dropdown |
| Image **sub-topic** | `skos:Concept, schema:DefinedTerm` (unchanged) | collection topic dropdown |

In the migrator, top concepts (parent == root scheme) → `DefinedTermSet`;
others → `DefinedTerm`. (Today ALL image concepts are `DefinedTerm`; this
splits them so the collection dropdown also stops listing Art/Life.)

## 1. Feed-topics editor (new panel)
- `shapes/feed-topics.shacl` over `feeds.ttl`: `sh:targetClass taxo:topic`
  **+** `sh:targetSubjectsOf skos:topConceptOf` (so Add anchors the new topic to
  the scheme). Field: **Name** (`skos:prefLabel`). Plus the seed-types property
  (see §3).
- New `omp-feed-topics-editor` carrier in `src/omp-settings-widgets.js` + an
  owner-gated "Feed topics" panel in the `index.html` settings overlay (lazy
  rolodex + Add/Delete/search, `class="omp-content-editor"`).

## 2. Associate an image topic with a library
- Add a **Library** field to `shapes/image-topics.shacl`:
  `sh:path skos:broader ; sh:class schema:DefinedTermSet ; sh:name "Library"` —
  a dropdown of libraries only (now possible via the distinct marker). Setting
  it changes the topic's parent (what `sol-gallery` reads).
- Retarget `image-libraries.shacl` to `sh:targetClass schema:DefinedTermSet`.

## 3. Make topic Add valid (swc — sol-form + shape-to-form)
A new record must come out well-formed. Use the existing `music.shaclc` pattern
(`rdf:type [ sh:hasValue X ]`) as the seed mechanism:
- **`core/shape-to-form.js`**: expose `sh:hasValue` on property descriptors and
  treat a `sh:hasValue` property as *fixed* — don't render it as an editable
  field.
- **`web/sol-form.js`** `_buildRolodexCards` Add handler: insert the fixed
  `sh:hasValue` triples **+** the `targetClass` types **+** the
  `targetSubjectsOf` parent anchor (already done). Result for a new topic:
  `<#n> a skos:Concept, <marker> ; <parentPred> <existingParent>` — ready to
  name (and re-home via the Library dropdown for image sub-topics).
- Shapes then declare e.g. `sh:property [ sh:path rdf:type ; sh:hasValue skos:Concept ]`.

## Open decision — delete of an in-use topic
Deleting a topic still referenced by feeds/collections (`dcat:theme → it`)
orphans them (they stop rendering). Recommended: **(b) guard** — block with
"can't delete: N items use this topic", forcing reassignment first. Alternative
(a): just delete. The rolodex Remove (`sol-form.js`) would need a pre-delete
ref-count check (count `?x dcat:theme <topic>` in the doc) to implement (b).

## Files
- omp: migrator, new `feed-topics.shacl`, edit `image-topics.shacl` +
  `image-libraries.shacl`, `src/omp-settings-widgets.js` (+1 carrier),
  `index.html` (+1 panel). Re-migrate feeds.ttl + images.ttl.
- swc: `core/shape-to-form.js` (sh:hasValue), `web/sol-form.js` (Add seeding +
  optional delete-guard). Commit per-component, direct to main.

## Verify (e2e)
Add a feed topic → appears in the feed topic dropdown. Add an image topic, pick
its Library → shows under that library in the gallery. Rename. Delete an unused
topic; delete-guard fires on an in-use one. Existing settings / image-edit /
coldstart / images-browse e2es stay green.

## Effort
Migrator + 1 new shape + 2 shape edits + 1 carrier/panel (omp) + a small
shape-to-form/sol-form Add enhancement and optional delete-guard (swc).
