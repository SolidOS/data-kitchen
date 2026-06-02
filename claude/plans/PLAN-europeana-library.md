# Adding a Europeana library — plan

**Status: design only. Not implementing yet.** Pick this up when you want
a second audio source alongside archive.org.

## Goal

Let the user enable a second library file (e.g. `europeana-music.ttl`)
that aggregates audio content from [Europeana](https://www.europeana.eu)
the same way the current `ia-music.ttl` aggregates content from the
Internet Archive. The user adds it via the existing `+ Source` flow.
Once enabled, its genres / artists / playlists merge into the player's
existing columns alongside the IA library — the multi-library plumbing
already in place handles that.

## What "similarly generated as the IA library" means here

The IA library carries:

- `mo:MusicArtist` rows with `foaf:name`, `dcat:landingPage` pointing at
  either an archive.org collection (`/details/<id>`) or a search URL
  (`/search?…`), and `mo:genre`.
- At runtime, `fetchAlbumsForArtist` hits archive.org via `getAlbums(query)`
  and `fetchTracksForAlbum` hits the IA metadata API via `getTracks(id)`.

For Europeana the model is the same shape — only the *fetch layer*
changes:

- Each `mo:MusicArtist` row points at a Europeana resource. The most
  natural analog is a saved **search URL** scoped to a theme (composer,
  region, genre), since Europeana doesn't expose per-creator landing
  pages the way archive.org does for collections.
- `getAlbums` / `getTracks` route through a new `europeana-utils.js` when
  the artist URL is on `europeana.eu`.

## Key decisions to lock in before starting

1. **Album abstraction.** Europeana records are typically single
   media items, not multi-track albums.
   - **Option A** — one record = one "album" with one playable track.
     Simplest mapping; matches Europeana's grain.
   - **Option B** — collapse all records by creator into one virtual
     "album" per artist. Closer to the IA experience but loses
     per-record metadata. *Recommend A.*
2. **API key handling.** Europeana requires a free `wskey` API key.
   - **Option A** — store on the library config record in localStorage
     (`{ id, label, url, enabled, apiKey }`), prompt on first add.
     *Recommend this.*
   - Option B — bundle a single dev key in source. Bad: anyone with the
     bundle can use it.
   - Option C — proxy via a server. Out of scope.
3. **Media filter.** Europeana indexes audio, video, images, text.
   `getAlbums` / `getTracks` must filter to `TYPE:SOUND` (or equivalent)
   and verify the file URL is a format the `<audio>` element can play.
4. **Seed file generation.** Two options:
   - **Manual** — hand-write `europeana-music.ttl` with a small starter
     set of search-URL "artists" grouped by genre. Quick (~30m) and
     fully under user control.
   - **Generated** — write `generate-europeana-library.js` that hits the
     Europeana search API once with broad parameters and emits a TTL of
     top creators per genre. Slower (~1.5–2h) but reusable.
   *Recommend manual to start; add the generator later if the manual
   seed proves too narrow.*
5. **License surfacing.** Europeana items have varied licenses (CC0,
   CC-BY, RR-F, etc.). Display the license string somewhere — at
   minimum in a tooltip on the now-playing strip — so the user knows
   what they're listening to. The existing `dcterms:rights` field on
   `mo:Release` is the natural home.

## Architecture sketch

```
                       ┌──────────────────────────┐
                       │   fetchAlbumsForArtist   │
                       │  fetchTracksForAlbum     │
                       └────────────┬─────────────┘
                                    │
                       dispatch by artist.url host
                                    │
              ┌─────────────────────┴─────────────────────┐
              │                                           │
       archive.org                              europeana.eu
       (existing)                                  (new)
              │                                           │
   ┌──────────┴──────────┐                  ┌─────────────┴────────────┐
   │  buildArchiveQuery  │                  │   buildEuropeanaQuery    │
   │  getAlbums          │                  │   getAlbumsFromEuropeana │
   │  getTracks          │                  │   getTracksFromEuropeana │
   └─────────────────────┘                  └──────────────────────────┘
   (ia-utils.js)                            (europeana-utils.js — NEW)
```

The dispatch lives in `ia3.js` (or a tiny `providers.js`); the existing
`buildArchiveQuery` becomes one of N providers selected by URL host.

## Step-by-step plan

| # | Step | Notes | Time |
|---|---|---|---|
| 1 | **Provider dispatch refactor** | Introduce a small `providers.js` (or inline helper). `pickProvider(url)` returns `{ buildQuery, getAlbums, getTracks }`. Wire `fetchAlbumsForArtist` + `fetchTracksForAlbum` through it. Keep current IA paths intact behind the abstraction. | 1.5h |
| 2 | **`europeana-utils.js`** | Implement `buildEuropeanaQuery(url)` (parse `query` and `qf=…` params from `europeana.eu/.../search?…` URLs); `getAlbums(query, { apiKey })` calling `https://api.europeana.eu/record/v2/search.json` with `qf=TYPE:SOUND`; `getTracks(europeanaId, { apiKey })` calling `https://api.europeana.eu/record/v2/<id>.json` and pulling playable URLs from the `webResources` array. | 2.5h |
| 3 | **API key UI** | Extend the library config to carry `apiKey`. Prompt for it when the URL host is `europeana.eu`. Edit-library menu gains an "Edit API key…" entry. Store in localStorage. Pass through to the provider's getAlbums / getTracks. | 1h |
| 4 | **Manual seed `europeana-music.ttl`** | Hand-write a starter library: 6–10 genres, a handful of search-URL artists each, all valid Europeana queries. Same shape as the current `ia-music.ttl`. | 30m |
| 5 | **Smoke test against live API** | Confirm the search + record endpoints return what we expect for a few sample queries. Verify `<audio>` playback against returned URLs (CORS, format support). Tune the playable-extension filter if Europeana ships formats archive.org doesn't (e.g. MPEG-4 audio with unusual codecs). | 1.5h |
| 6 | **Update `ia-help.html`** | Add a row to the Sources section explaining that Europeana libraries need an API key and where to get one. | 30m |
| 7 | **Build + manual regression** | Build, hard refresh, add the Europeana library via `+ Source`, verify it merges into the existing genre / artist columns without breaking the IA flows. | 30m |

**Total: ~7.5 hours focused work.**

### Optional follow-ups (defer)

| Step | Time |
|---|---|
| Generator script (`generate-europeana-library.js`) — pulls top creators per genre via the API and emits a TTL | 1.5–2h |
| License-surfacing UI (tooltip / license badge) | 1h |
| Provider abstraction also handles future providers (DPLA, MusicBrainz) | 30m extra at design time |

## Risks / unknowns

- **CORS.** Europeana's record JSON exposes URLs that may live on
  partner-institution servers without permissive CORS. The audio element
  is usually fine (it doesn't require CORS unless we read the data), but
  certain advanced features (e.g. visualisations) would break. Not a
  blocker for playback.
- **Rate limits.** The free `wskey` is generous but not unlimited. The
  existing per-artist `albumsByArtist` cache helps; per-record metadata
  caching (`tracksByAlbum`) does too. May want explicit rate-limit
  back-off if the user browses aggressively.
- **Variable schema.** Different content providers in Europeana serialize
  metadata inconsistently. Expect to write defensive accessors and fall
  back to `identifier` for the display name when `title` is missing or
  in an unexpected language.
- **License variance.** Some items are "rights reserved — free access"
  (RR-F) — playable but not downloadable. The player only streams, so
  this is fine, but it's worth surfacing the license on the now-playing
  strip so the user can decide whether to share.

## What does NOT change

- The RDF shape — Europeana data uses the same `mo:MusicArtist` /
  `mo:Release` / `mo:Track` model.
- The UI — genres / artists / albums / tracklist all work the same.
- ia-utils.js — left alone; routing to it happens via the provider
  dispatch.
- Existing playlists and favorites — they remain library-scoped and
  continue to work unchanged.

## Once unblocked, suggested sequencing

If you want to start, the smallest viable slice is **steps 1, 2, 4, 5**
(≈ 6h): a working Europeana library with manual seed file. Steps 3
(API-key UI) and 6 (help docs) can land after the player is proven to
work against real Europeana data. The optional generator (step 8) is
worth it once the manual seed gets cumbersome.
