# src/sources/ — headless data-source fetchers

Importable, source-blind scripts that **fetch** data and emit RDF (or normalized
objects) for the display components (`<sol-gallery>`, `<ia-player>`, …). The
split: a **fetcher** acquires data and writes it as RDF; a **display** renders
RDF and nothing else. Neither knows the other's origin — RDF is the only
interchange.

These are the media player's own fetchers (moved here from sol-components). The
one piece they share with a sol-components display, the image **contract** vocab,
stays in sol-components (`web/utils/contract.js`, imported here and read by
`<sol-gallery>`).

A fetcher is just an importable function (no provider object, no registry): a
host imports it and calls it. Reading a host's *own* local catalog file is the
host's concern, not a fetcher's — fetchers are for talking to external sources
(Commons now, Wikidata later).

Design spec: `PLAN-source-adapters.md` in the open_media_player repo.

## Files

| file | role |
|---|---|
| `internet-archive.js` | archive.org fetcher (audio + video). `getAlbums`/`getTracks`/`buildArchiveQuery` → normalized media objects for `<ia-player>`. |
| `commons.js` | "Commons category → ImageItem RDF" fetcher. `imagesToStore` (pure) + `loadCategory` (async-iterable paging). Imports the shared contract from `sol-components/web/utils/contract.js`. |
| `commons-fetch.js` | Wikimedia Commons category → image list (the network primitive `commons.js` pages over). |
| `smoke-test.mjs` | Node check of the no-network logic. `node src/sources/smoke-test.mjs`. |

The shared image vocab + read/write helpers (`addImageItem`/`readImageItems`,
`addCollection`/`readCollections`) live in `sol-components/web/utils/contract.js`.

## The fetcher shape

```js
// expand a remote ref into pages of ImageItem RDF
async function* loadCategory(ref, opts) -> AsyncIterable<Store>
// (a future wikidata-images.js would add: search(query) -> AsyncIterable<Store>)
```

`ref` is opaque to the host (for images, a Commons category URL). Topics/genres
are **local** — owned by the host, never emitted by a fetcher.

## The display contract (what a display consumes/emits)

```
display.clear()            // new collection selected
display.add(store)         // append a page of records  ← the seam
display 'item-opened'      // event → opened item IRI (for lazy per-item detail)
display 'load-more'        // event → host pumps the next page (lazy paging)
```

## Status

`commons.js` + `contract.js` built and node-verified; `<sol-gallery>` slimmed to
the display contract; wired into omp's `<omp-images>` (which reads its own
`images.ttl` catalog locally and calls `loadCategory` to fetch pictures). Still
to do: a `wikidata-images.js` fetcher (live search → display, no save).
