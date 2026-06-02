# PLAN — Source adapters (provider/display split)

> **Status: Images IMPLEMENTED + browser-e2e-verified — 2026-05-31** (Feeds &
> Internet-Archive still pending). Supersedes the
> `sol-form`/`sol-settings`/`solid-ui` settings approach (see
> [[project_settings_forms]] in memory). The **image contract here is the
> canonical interface** every later adapter conforms to.
>
> **Built so far:**
> - `solid-web-components/sources/` — `contract.js`, `registry.js`,
>   `commons.js`, `commons-file.js`, `smoke-test.mjs` (5/5 node checks),
>   `README.md`.
> - `sol-gallery` SLIMMED to display-only (`clear`/`add(store)`/`end` +
>   `item-opened`/`load-more`); its CSS lost the selector-column rules.
> - omp `src/omp-images.js` — the Images panel shell (Topics/Collections
>   columns + owner `+Topic`/`+Collection` + the load→pump loop), wired in
>   `bundle-entry.js` + `index.html` (replaces `<sol-gallery source=…>`).
> - `claude/smoke-tests/e2e-images.mjs` updated for the two-shadow-root
>   structure — **all checks pass** (34 topics, owner add-controls render,
>   topic→collection drill, 18 live Commons thumbs, lightbox open/page, no
>   console errors).
> - **Note:** the `+Topic`/`+Collection` *write* path is a raw sparql-update
>   PATCH against the served file — exercised only for rendering/gating in
>   e2e; the actual write needs a PATCH-capable pod the owner controls.
> - **Not done:** `wikidata-images` provider; Feeds; Internet Archive.

## Why

We are reverting the decision to drive in-app editing/viewing through
`sol-form` + `sol-settings` + `solid-ui` (the settings-overlay rolodex
editors). Those pulled a heavy `solid-ui` dependency into omp's bundle and
fused "where the data comes from" with "how it's shown."

The replacement is a clean three-layer split, applied uniformly across every
tab (Images now; News/feeds next; Internet Archive music/movies last):

```
  selection (UI)        acquisition → RDF             display (pure render)
  ┌──────────────┐     ┌────────────────────┐      ┌────────────────────┐
  │ pick a topic │────▶│  file read   ──┐    │      │ sol-gallery        │
  │ type a query │     │                ├──▶ RDF ──▶│ sol-feed           │
  └──────────────┘     │  search adapter┘   │      │ ia-player (display)│
   omp shell           └────────────────────┘      └────────────────────┘
                         all network, provider-       source-blind,
                         specific knowledge           NO network
```

- **Providers** are headless, importable scripts — one per source — that
  produce RDF in a shared vocab and know nothing about omp or any display.
- **Displays** render that RDF and nothing else: no network, no search, no
  knowledge of where the data came from.
- **omp** is composition only: it wires registered providers to displays and
  owns the local topic/genre taxonomy.

The set is **open** — "others will undoubtedly appear" (Europeana, local
filesystem, etc.). The design must let a new source drop in as a module +
one `registerProvider` call, with **zero edits to omp's wiring core or to any
display**.

## Settled decisions

1. **Push seam (`add`/`clear`), not pull.** omp pumps batches into the
   display as they arrive from the provider's async iterator. `src="…url…"`
   is rejected (it drags the fetch back into the display); a property holding
   a growing store is rejected (forces the display to watch for mutations).
   The display's entire surface is `clear()` + `add(graph)` + an
   `item-opened` event out.
2. **Topics/genres are local, always.** The taxonomy lives in curated data
   (`dcat:theme` for images, `mo:genre` for music) and is owned by omp.
   Providers return **bare collections with no topic**. A search hit has no
   place in the topic tree until it is *curated/saved* (the `+collection`
   flow assigns `dcat:theme`); live uncurated results render flat.
3. **No collection thumbnails.** `search()` does zero per-collection cover
   fetches (avoids an N+1 of API calls). Collections are text/labels until
   opened.
4. **RDF is the interchange,** shaped as **one envelope + a typed payload per
   media kind** (not a single universal flat record, not per-source ad-hoc
   shapes).

## The image contract (canonical reference)

Grounded in the vocab already in `libraries/wikimedia_images/images.ttl`
(`schema.org` + `dcat`/`skos`), so the file path is "read what's there" and
the search path emits the same shapes.

### Two record shapes

**CollectionRecord** — a browsable grouping; what selectors list and what
`load()` takes. This is essentially today's `dcat:Dataset` entry:

```turtle
<#img-0128> a schema:ImageGallery , dcat:Dataset ;
  dct:title        "Graffiti of spray cans" ;
  dcat:landingPage <https://commons.wikimedia.org/wiki/Category:Graffiti_of_spray_cans> ;  # the load() ref
  dcat:theme       <#Graffiti_Sticker_Art> .   # LOCAL topic — file path only; never from a provider
```

(No `schema:thumbnailUrl` — decision 3.)

**ImageItem** — one picture the gallery tiles; `schema:ImageObject`:

```turtle
<https://commons.wikimedia.org/entity/M12345> a schema:ImageObject ;
  schema:thumbnailUrl     <https://…/thumb/640px-foo.jpg> ;   # masonry tile
  schema:contentUrl       <https://…/foo.jpg> ;               # lightbox full-res
  schema:width 4000 ; schema:height 2600 ;
  schema:caption          "…" ;                               # optional
  schema:license          <https://creativecommons.org/…> ;   # optional
  schema:author           "…" ;                               # optional attribution
  schema:mainEntityOfPage <https://commons.wikimedia.org/wiki/File:foo.jpg> .  # "View on Commons/Wikidata"
```

### Envelope vs payload

- **Envelope** (every media kind shares): `rdf:type` (the kind
  discriminator), title/caption (`dct:title`/`schema:caption`),
  `schema:thumbnailUrl`, one provenance link (`schema:mainEntityOfPage`).
- **Typed payload** (kind-specific): images add `contentUrl` + `width`/
  `height`; audio would add `duration`/`contentUrl`; news would add
  `articleBody`/`datePublished`. New media kinds slot in without a rewrite.

## The provider interface

Headless, source-blind output, paging built in; RDF is the unit.

```ts
type Graph = Store;                 // rdflib store — one page of records
type MediaKind = 'image' | 'audio' | 'video' | 'article';

interface Provider {
  id:    string;                    // 'wikidata-images', 'commons-file'
  label: string;                    // 'Images'  → drives the tab
  kinds: MediaKind[];               // ['image']
  display: string;                  // custom-element tag: 'sol-gallery'
  capabilities: { search: boolean; load: boolean };

  // discover groupings — query optional (file path may ignore it).
  // Returns CollectionRecords WITHOUT topic (decision 2).
  search?(query: string, opts?: PageOpts): AsyncIterable<Graph>;

  // expand one grouping into its items → ImageItems
  load(ref: string, opts?: PageOpts): AsyncIterable<Graph>;
}

interface PageOpts { signal?: AbortSignal; cursor?: string; limit?: number; }
```

- `AsyncIterable<Graph>` is the paging primitive — each yielded `Graph` is one
  batch the display renders on arrival (lazy masonry, free). `AbortSignal`
  cancels an in-flight collection when the user clicks away.
- `ref` is **provider-opaque** — for images it is the `dcat:landingPage`
  (a Commons category URL). The display passes back the ref it was handed;
  only the provider knows it is a Commons category.

## The two image providers (same interface)

| | `commons-file` | `wikidata-images` |
|---|---|---|
| `search()` | parse `images.ttl`, yield its `dcat:Dataset`s (optionally filtered) | SPARQL/Commons query → build `dcat:Dataset` records for matching categories |
| `load(ref)` | Commons API: category → `ImageObject`s | **same** Commons API path |

`load()` is identical for both — once you hold a Commons category, expanding
it to images is one shared routine (a small `commons` helper both lean on).
The *only* difference between the providers is where the **collection list**
comes from: a local file, or a Wikidata search. That is exactly "rdf from a
file, or from a wikidata search."

## Registration (the open-set slot)

```ts
// each provider module self-registers on import — no omp edit to add one
registerProvider(commonsFileProvider);
registerProvider(wikidataImagesProvider);

// omp builds tabs FROM the registry, never a hardcoded list
for (const p of providers())   // → {id,label,kinds,display,capabilities}
  shell.addTab(p);
```

Each provider declares its own metadata (`id`, `label`, `kinds`, `display`,
`capabilities`) so the **tab shell becomes data-driven** — a new provider
brings its own tab. With an open set, every adapter must pass a shared
**conformance kit** (swap test, envelope-shape test, paging behaviour) so
quality stays flat as providers are added.

## The display's complete surface

```
gallery.clear()        // new collection selected → drop current tiles
gallery.add(graph)     // append a page of ImageObjects   ← the seam
gallery.item-opened    // event → opened item's IRI, for lazy per-item detail
```

- **Knows:** masonry, lightbox, lazy image loading.
- **Does NOT know:** Commons, Wikidata, files, search, `dcat`, `skos`,
  provenance. Grep test: "wikidata"/"commons"/"search"/`fetch`/SPARQL appear
  **zero times** in `sol-gallery`.
- **Per-item Wikidata detail** ("View on Wikidata" in the lightbox) uses
  **event-out**: the gallery emits `item-opened`; the acquisition layer
  decides whether that means a lookup and feeds detail back. The gallery does
  not fetch.

The omp pump:

```js
gallery.clear();
for await (const page of provider.load(ref, { signal }))
  gallery.add(page);
```

This surface generalizes: `sol-feed` and the future `ia-player` display get
the same `clear`/`add`/`item-opened` pattern, fed by the same pump.

## Where adapters live (open question — needs the user's call)

"Separate from omp" → **not** `omp/src`. Most likely a new `sources/` (or
`providers/`) family alongside the `sol-*` components in the component
library (the sibling `solid-web-components` repo), or their own standalone
package. If the sibling repo, it must be pointed at explicitly before edits.
Either way they are imported into omp's bundle like the existing
`import '../../solid-web-components/web/sol-gallery.js'` lines.

## Removal work (the revert that triggered this)

`solid-ui` / `sol-form` / `sol-settings` usage in omp is confined to the
settings path and is **not** used anywhere else in the project:

- `src/bundle-entry.js` — drop the `./omp-settings-widgets.js` import.
- `src/omp-settings-widgets.js` — delete (the `solid-ui` + `sol-form` +
  `sol-settings` carrier elements and rolodex editors).
- `bin/build.js` — drop the `solid-ui` / `solid-logic` aliases + the
  `swcVendor` block (re-check `solid-logic` isn't needed by `sol-login`'s
  shared singleton before removing that one).
- `index.html` — remove `.omp-settings-overlay` + the `omp-prefs` /
  `omp-*-editor` / `<sol-settings>` carriers and the guest-gating wired to
  them.
- `omp-settings-applier.js` — **keep** (it has no `solid-ui` dependency; it
  bridges theme/size/proxy). Theme + text-size stay on the gear menu.

Decisions captured from the conversation:
- **News-feed editing** rode the same `sol-form`; it drops to file-only for
  now and is re-approached in the **feeds adapter** (the "we'll do feeds
  next" step).
- **Proxy editing is deferred** — the value is still bridged by
  `omp-settings-applier`; no UI for it for now.
- **Preferences overlay** goes away with `sol-settings`; theme/size already
  live on the gear menu.

## Sequencing (least → most risk)

1. **Images (greenfield).** Define the contract above; build `commons-file`
   + `wikidata-images` providers + the registry; slim `sol-gallery` to the
   `clear`/`add`/`item-opened` surface; omp owns the local topic selectors +
   `+topic`/`+collection`. Remove the `sol-form`/`solid-ui` settings path.
2. **Feeds (News) — DONE, but NOT split (2026-05-31).** The dumb-display +
   `sources/` split was **rejected for sol-feed** — it has only one kind of
   fetch (RSS), not generalizable to other components, so there's nothing to
   abstract (see [[feedback_dont_overgeneralize_split]]). sol-feed stays a
   complete self-contained component: it fetches, parses, edits, AND displays.
   The editing (rename topic, +add feed, drag-to-re-categorize, drag-to-
   reorder via `schema:position`, delete→reserved-`#Deleted`-bin + restore,
   gated by an `editable` attr; raw sparql-update PATCH) lives **inside
   sol-feed** (`web/utils/feed-edit.js`); omp just sets `editable` when owner
   and routes ⋮ "View deleted" → `appAction('viewDeleted')`. So the split rule
   below applies **only when one display takes multiple swappable sources**
   (images: Commons + Wikidata + …); a single-fetch component is left whole.
3. **Internet Archive (music/movies).** Only the *fetcher* was extracted
   (`sources/internet-archive.js`, relocated `ia-utils.js`). The full
   `ia-player`→pure-display teardown is the large, deliberately-last job —
   AND, like sol-feed, ia-player is a self-contained component, so the split
   may not be wanted at all; decide before doing it.

## Cross-cutting: cache lives in the adapter layer

The known "loading too slow, needs a cache" follow-up
([[project_omp_followups]]) belongs here — add caching once, behind the
shared `search`/`load` contract, so every tab benefits and no display learns
about it.

## Open decisions still to pin (non-blocking)

- **Where adapters live** (above) — sibling repo `sources/` vs standalone
  package.
- **Provider↔display pairing format** — `display` as a bare custom-element
  tag (assumed here) vs a richer descriptor.
- **`commons` helper home** — shared by both image providers; module beside
  the adapters.

## Related

- Memory: [[project_settings_forms]] (what is being reverted),
  [[project_images_tab]], [[project_media_type_seam]],
  [[project_solid_ui_skos]] (the SKOS add-on — re-evaluate whether it is
  still wanted once `sol-form` leaves omp), [[reference_repos_git]].
- Plans: `PLAN-images-library.md` (current Images tab), `news-tab-plan.md`,
  `PLAN-favorite-images.md` + `PLAN-topic-editing.md` (both assume the old
  `sol-form` path — revisit under this model).
