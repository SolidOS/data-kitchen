# Search-result quality filter — design

**Status: IMPLEMENTED.** Shipped — tiered quality filter + Filters
modal (gear menu). Plan kept for reference.

Problem: search-URL artists (e.g. `archive.org/search?query=wu-tang+clan…`)
return 600+ items, most of them noise — podcasts, snippets, 30-second
talk-show clips, low-bitrate auto-uploads, dead items. The first 50 to
read often have no playable audio at all. We need a way to bias the
albums and tracks the user sees toward real music.

The user's anchor criterion: **don't include tracks shorter than 3
minutes**. That's the strongest signal we have for "music vs. snippet."
There are other signals available at zero or near-zero cost.

## Signals available and where they live

| Signal | Where it lives | Cost | Notes |
|---|---|---|---|
| Track length (`f.length`) | IA metadata API per item | Already paid (we fetch metadata to list tracks) | Most direct music/snippet signal. |
| Track bitrate (`f.bitrate`) | Same | Free | Excludes 64kbps junk. |
| Track file size | Same | Free | Cross-check against bitrate × length. |
| Item runtime / total length | IA search docs (`runtime` field on many items) | Free with search results | Catches whole-item snippets without a metadata round-trip. |
| Item download count (`downloads`) | IA search docs | Free | Popularity proxy. Many junk items have <10 downloads. |
| Number of reviews / favorites | IA search docs | Free | Curation proxy. |
| Item collection (`collection[]`) | IA search docs | Free | Exclude well-known podcast / spoken-word collections. |
| Item year / date | IA search docs | Free | Optional age filters. |
| `mediatype:"audio"` | IA search query syntax | Free | Already required by `buildArchiveQuery` for search URLs. |
| File format (`format:"MP3"`) | IA search query syntax / file metadata | Free | Excludes items with no playable derivatives. |
| Access-restricted flag | IA metadata | Free, already handled | Already filtered in `getTracks`. |

## Tiered design

Three layers, applied in order. Cheap clauses first, expensive checks
only on what made it through.

### Layer 1 — search-query clauses (server-side, free)

In `buildArchiveQuery`, when the URL is a `/search?…` form (catalog
`/details/<id>` URLs already point at curated collections — skip this
layer for them), append:

```
AND mediatype:"audio"
AND format:"MP3"
AND downloads:[<minDownloads> TO *]   ← only when configured > 0
```

Plus optional NOT clauses for blocklisted collections:

```
AND NOT collection:"podcasts"
AND NOT collection:"spokenword"
```

Effect: cuts most non-music results before they ever reach the client.

### Layer 2 — search-result filtering (client-side, free)

In `getAlbums`, after the search returns, drop items based on fields
already present in the response:

- `runtime` if present and < `minItemRuntimeSec` (e.g. 5 minutes — implies
  short snippet-only item)
- `downloads` < `minDownloads` (only as a safety net; the query-side
  clause is more efficient)
- `collection[]` intersects user blocklist

This is for fields that aren't filterable via Solr query syntax or that
we want to keep flexible.

### Layer 3 — per-track filtering (client-side, free)

In `getTracks`, after the metadata round-trip, drop files where:

- `f.length < minTrackDurationSec` (default **180 = 3 min** per user's
  spec)
- `f.bitrate < minTrackBitrateKbps` (optional, e.g. 96)

Already-grouped by `originalKey`, so the picked derivative inherits the
length / bitrate from any sibling file in the group when its own field
is missing.

### Layer 4 — playback-time skip (already implemented)

The audio `error` handler auto-advances past unplayable tracks with a
five-in-a-row cap. No change needed.

## Configuration model

```js
// localStorage key: "omp-player:quality-filter"
{
  minTrackDurationSec:   180,    // user's anchor: 3 minutes
  minTrackBitrateKbps:   0,      // off by default
  minItemRuntimeSec:     0,      // off by default
  minDownloads:          0,      // off by default
  blockedCollections:    [],     // e.g. ["podcasts", "spokenword"]
  applyToCatalogArtists: false,  // /details/ URLs skip Layers 1-2 by default
}
```

Defaults are intentionally conservative — only the 3-minute track filter
is on out of the box. Everything else opts-in to avoid silently hiding
valid content.

## UI

Two surfaces:

1. **Gear-menu entry** — "Filters…" opens a small modal (same shell as
   About, default `size: 'normal'`). Fields map 1:1 to the config above,
   plus a "Reset to defaults" button. Saved to localStorage on submit.

2. **Status hint** — when a filter trims results (e.g. "Showing 12 of 47
   tracks · adjust filters"), display a non-blocking footer message so
   users know why the list looks short. Clickable to open the Filters
   modal.

## Implementation outline

| File | Change |
|---|---|
| `ia-rdf.js` | None — the filter is metadata/runtime, not RDF. |
| `ia-utils.js` | `getAlbums(query, filter)` accepts an optional filter and appends Layer 1 clauses + applies Layer 2. `getTracks(albumId, filter)` applies Layer 3. |
| `ia3.js` | Loads the filter from localStorage at init; threads it through `fetchAlbumsForArtist` and `fetchTracksForAlbum`. Adds the "Filters…" gear-menu entry that opens a small modal form, persists changes, invalidates `albumsByArtist` / `tracksByAlbum` caches when the filter changes. |
| `ia-ui.js` | Optional: a small `showFiltersModal({ filter, onSave })` helper, or just reuse `showAboutModal` with bundled HTML and a small form. |

Estimate: **2–3 hours focused work**. Most of the cost is the modal form
and the cache invalidation, not the filter logic itself.

## Open questions

1. **Per-artist override?** Allow a specific artist to bypass the global
   filter (`omp:minTrackDurationSec "0"` or similar predicate on the
   artist row)? Adds one shape extension. Useful if you have a "snippets
   are OK" artist (e.g. a sample-pack collection). **Suggest: defer
   until needed.**
2. **Default `minDownloads`?** 0 keeps Layer 1 off and avoids surprising
   newcomers. **Suggest: keep at 0 in defaults; surface in UI for power
   users.**
3. **Should the duration filter apply to *playlist tracks* as well as
   search-derived tracks?** A user might explicitly favorite a 90-second
   intro and not want it removed silently. **Suggest: no — apply Layer 3
   only when tracks are coming from `getTracks` (i.e. archive.org item
   metadata fetch), not when they're already-saved Releases in a
   playlist.**
4. **Cache invalidation when filter changes** — `albumsByArtist` and
   `tracksByAlbum` are populated under the assumption the filter is
   stable. On filter change, clear both caches. Cheap; just `.clear()`.
5. **Search-side `format:"MP3"` clause** — IA's search index uses the
   `format` field with bracketed values. Worth a quick smoke-test to
   confirm `format:"MP3"` works the way we want before committing.

## Suggested defaults summary

```js
{
  minTrackDurationSec: 180,   // ON — user's anchor
  minTrackBitrateKbps: 0,     // off
  minItemRuntimeSec:   0,     // off
  minDownloads:        0,     // off
  blockedCollections:  [],    // empty
  applyToCatalogArtists: false
}
```

Only the 3-minute track filter is active out of the box; everything else
opts in via the Filters modal.
