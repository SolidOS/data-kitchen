# PLAN — Save favourite images & image collections

**Status: SUPERSEDED 2026-05-31 by the communal favourites wall** — see
`PLAN-communal-favourites.md` / [[project_communal_favourites]]. That feature
generalised favouriting across ALL tabs into one shared `favourites/` folder
(append-only, communal), replacing this image-only, per-device-vs-RDF design.
Image collections + loose images now favourite to the communal wall; the
"per-device localStorage / owner-RDF" split below is obsolete.

Historical (the original image-only design):
Builds on the Images tab ([[project_images_tab]]) and the SHACL/RDF settings
work ([[project_settings_forms]]).

## Goal
Let the user **favourite** (a) an individual image and (b) a whole image
collection, and get back to them later via a **Favourites** view in the Images
tab.

## The two things being favourited differ
- A **collection** is already an RDF node in `images.ttl`
  (`schema:ImageGallery` + `dcat:landingPage` Commons category + `dct:title`).
  Favouriting it = referencing that existing node.
- An **image** has **no RDF node** — images stream live from the Commons API
  (`getCategoryImages` → `{ full, thumb, title, artist, license, descUrl, … }`).
  Favouriting one must **mint** a node capturing enough to re-display it without
  re-querying: `schema:ImageObject` with `schema:contentUrl` (full),
  `schema:thumbnailUrl`, `schema:name`, `schema:license`/`schema:creditText`,
  and `foaf:page`/`schema:url` (the Commons descUrl).

## Data model (existing terms)
A single **Favourites** concept the user's favourites attach to, so it shows as
one entry in the flat Topics list (it's `schema:DefinedTerm` like every image
topic, so it appears alongside them — or pin it to the top):

```turtle
<#Favourites> a skos:Concept, schema:DefinedTerm ; skos:prefLabel "★ Favourites" .

# a favourited collection — just tag the existing gallery node into Favourites
<#chicago> dcat:theme <#Favourites> .          # in addition to its real topic (multi-valued theme)

# a favourited image — a minted ImageObject, themed into Favourites
<#fav-img-001> a schema:ImageObject ;
  schema:name "…" ; schema:contentUrl <…full.jpg> ; schema:thumbnailUrl <…thumb.jpg> ;
  schema:license "…" ; schema:url <…commons-descUrl> ; dcat:theme <#Favourites> .
```
(Note `dcat:theme` is already multi-valued in the collection editor, so a
collection can keep its real topic AND be in Favourites.)

## UI
- **Lightbox**: a ♥/★ toggle on the current image → mint/remove its
  `schema:ImageObject` in/from Favourites.
- **Collection row + masonry**: a ♥ affordance to add/remove the collection
  to/from Favourites (kebab or hover button).
- **Favourites topic**: appears in the flat Topics list (pin to top). Selecting
  it shows favourited collections in the Collections column **and** favourited
  images in the grid. sol-gallery's grid currently fills from the Commons API
  per collection; the Favourites view instead renders the saved `ImageObject`s
  directly (a "virtual collection" backed by RDF, not a Commons category).

## Persistence
- **Guest**: localStorage (mirror the existing `sol-gallery:collection:*`
  remembered-selection pattern) — favourites survive locally without a pod.
- **Owner**: write to RDF (a `favourites.ttl`, or into `images.ttl`) via the
  same authed raw-sparql-update PATCH `sol-form` now uses
  ([[project_settings_forms]]); then favourites sync to the pod and across
  devices. The gallery already loads `images.ttl` into the store, so a
  `favourites.ttl` would need `owl:imports`/`rdfs:seeAlso` or a second fetch.

## Open decisions
- One shared `#Favourites` vs separate "favourite images" / "favourite
  collections" buckets.
- Where minted image nodes live (a dedicated `favourites.ttl` is cleaner than
  bloating `images.ttl`).
- Whether the Favourites grid needs the API at all (it shouldn't — render saved
  thumbs/full directly), which is a small new render path in `sol-gallery`.

## Files (when built)
- swc `web/sol-gallery.js` (♥ affordances, Favourites virtual-collection render,
  add/remove favourite); maybe a small write helper.
- omp: a `favourites.ttl` (owner) + localStorage (guest); wiring in the gallery
  host. Commit swc per-component.
