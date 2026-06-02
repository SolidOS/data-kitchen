# Convert a playlist into a local-catalog artist — plan

**Status: IMPLEMENTED.** Shipped — convert playlist → local-catalog
artist (`omp:localData`) + local read path. Plan kept for reference.

## Goal

Let the user convert a playlist (e.g. the Wu-Tang Clan playlist) into an
artist whose albums + tracks are served entirely from the local RDF —
no archive.org search, no live metadata fetch.

After conversion:
- (a) Wu-Tang Clan no longer appears under Playlists.
- (b) Wu-Tang Clan appears as an Artist (in the Artists column, under a
  chosen genre).
- (c) Selecting the artist lists the albums already in the RDF (the
  Releases that own the playlist's Tracks); clicking an album plays its
  Tracks straight from `dcat:downloadUrl`. No network round-trip.

This is the same read path a future MP3 / Rhythmbox / iTunes importer
will use — "the data is already here, don't search." Worth building the
local-catalog read path now so imports plug straight into it.

## Data-model change

A new boolean flag on the Agent marks it as local-catalog:

```turtle
@prefix omp: <http://open-media-player.org/ns#> .

<urn:uuid:…> a mo:MusicArtist ;
    foaf:name "Wu-Tang Clan" ;
    mo:genre genres:Hip_Hop ;
    omp:localData true .          # ← look in the RDF, don't IA-search
```

`omp:` is an app-internal namespace (placeholder URI — it never
resolves; it's just a stable predicate name).

The artist's albums are the Releases it `foaf:maker`s. Conversion adds
`foaf:maker <agent>` to every Release that owns a Track in the
playlist:

```turtle
# releases.ttl, after conversion
<urn:uuid:releaseA> a mo:Release ;
    dcterms:title "Enter the Wu-Tang (36 Chambers)" ;
    foaf:maker <urn:uuid:wutangAgent> ;        # ← added by conversion
    mo:track <urn:uuid:t1>, <urn:uuid:t2>, … .
```

Tracks and Releases are untouched otherwise — they already exist in
`releases.ttl` from when the playlist was filled.

## Read-path branching

`fetchAlbumsForArtist(artist)`:
- If `artist._localData` → query the store for Releases where
  `foaf:maker == artist.node`. Map each to an album object carrying
  `_local: true`, `_releaseNode`, `name` (Release `dcterms:title`).
- Else → existing `buildArchiveQuery` + live `getAlbums`.

`fetchTracksForAlbum(album)`:
- If `album._local` → read `album._releaseNode --mo:track-->` Tracks
  from the store; build track objects from `dcterms:title` /
  `dcat:downloadUrl` / `mo:duration`. No fetch.
- Else → existing live `getTracks`.

`parseBookmarks` already emits an artist bookmark per Agent with
`mo:genre`; it just needs to also surface `_localData` (read
`omp:localData`) and keep `node`.

(a) and (b) fall out for free: deleting the playlist node removes it
from the Playlists column and from playlist-track bookmarks; the new
`mo:MusicArtist` with `mo:genre` shows up in the Artists column.

## The conversion operation

`convertPlaylistToArtist(store, baseURI, playlistId, { name, genreId })`
in `ia-rdf.js`. Steps, with the multi-file orchestration:

1. Collect the playlist's `hasPart` Tracks; resolve their distinct
   parent Releases via reverse `mo:track`.
2. **PATCH `agents.ttl`** — mint `<urn:uuid:X> a mo:MusicArtist ;
   foaf:name <name> ; mo:genre <genreId> ; omp:localData true`.
   On failure → abort, nothing else done.
3. **PATCH `releases.ttl`** — add `foaf:maker <X>` to each parent
   Release. On failure → roll back step 2 (delete the Agent), abort.
4. **PATCH `ia-music.ttl`** — remove the playlist's `rdfs:seeAlso`.
   On failure → roll back steps 3 + 2, abort.
5. **DELETE the playlist file** — best-effort (server may reject
   DELETE; the `seeAlso` is already gone so it won't reload).
6. In-memory: drop the playlist node + its triples; the Agent + maker
   edges are already in the store from the successful PATCHes.

Rollback chain mirrors the `addTracksToPlaylist` rollback we just
added. `checkSaved` surfaces any failure in the status bar; a failed
conversion leaves the playlist intact and no half-made Agent.

## UI

New entry on the playlist's ⋯ menu (`openSourceEditMenu`):
**"Convert to artist…"**. Click →
- prompt/confirm the artist name (default = playlist title),
- pick a genre from a dropdown of existing genres (required — an Agent
  with no `mo:genre` wouldn't show in the Artists column),
- call `convertPlaylistToArtist`,
- on success: `refreshSources()` (playlist gone) + `repopulateGenres()`
  / `refreshArtistsColumn()` (artist appears); status bar confirms.

## Edge cases / notes

- **Shared Releases.** If a Release's Tracks also live in another
  playlist, adding `foaf:maker <X>` makes that Release show under
  artist X too. Acceptable; note it. `foaf:maker` is multivalued so we
  add, never replace, any existing maker.
- **Album scope.** A converted artist's album shows *all* of that
  Release's Tracks, not only the ones that were in the playlist. That's
  usually what you want (the whole album); flag it in the help text.
- **Genre required.** Conversion must assign a genre or the artist is
  invisible. The dropdown enforces it.
- **No `dcat:landingPage`.** Local artists have none, so the ⋯ menu's
  "Visit on archive.org" entry already won't show (it's gated on an
  archive.org URL).
- **Reverse (artist → playlist).** Out of scope; can revisit.
- **Importer alignment.** An MP3/Rhythmbox importer produces exactly
  this shape: Agents with `omp:localData`, Releases with `foaf:maker`,
  Tracks with `dcat:downloadUrl` (file:// or http). The local read
  path built here is reused verbatim.

## Steps + time estimates

| # | Step | Time |
|---|---|---|
| 1 | `omp:` namespace + `omp:localData` constant in `ia-rdf.js` | 5m |
| 2 | `convertPlaylistToArtist` — gather Tracks/Releases, 3-file PATCH + rollback chain, DELETE playlist file | 1.5h |
| 3 | `parseBookmarks` — surface `_localData` (+ keep `node`) on artist bookmarks | 15m |
| 4 | `fetchAlbumsForArtist` — local branch (Releases by `foaf:maker`) | 45m |
| 5 | `fetchTracksForAlbum` — local branch (`mo:track` from store, no fetch) | 45m |
| 6 | UI: "Convert to artist…" menu entry + genre-pick prompt + refresh wiring | 45m |
| 7 | `checkSaved` integration + status messaging | 15m |
| 8 | Smoke test (convert → reload → artist shows → albums/tracks play offline) + build + manual sanity | 45m |

**Total ≈ 5 hours focused.**

## Risks

- **Multi-file atomicity** — 3 PATCHes + 1 DELETE per conversion. The
  rollback chain is the fiddly part; mitigated by the same pattern we
  just shipped for `addTracksToPlaylist`.
- **Reverse `mo:track` lookups** assume each Track has exactly one
  parent Release. True for everything we generate; defensive code skips
  Tracks with no resolvable parent.
- **Genre dropdown empties** if the library has zero genres — guard
  with a "create a genre first" status message.

## What does not change

- The RDF shape for Releases / Tracks / Genres.
- The live archive.org path for non-local artists — untouched; the
  local branch is purely additive.
- localStorage / library config.
- The `checkSaved` strict-write semantics.
