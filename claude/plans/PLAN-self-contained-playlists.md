# Self-contained playlist files — design + plan

**Status: IMPLEMENTED.** Write-path rewritten in `ia-rdf.js`
(`addTracksToPlaylist`, `removeTrackFromPlaylist`, `updateTrackMeta` via
new `docOf` helper, `convertPlaylistToArtist` now copies into the
catalogue). Migration `migrate-selfcontained-playlists.js` applied:
708 tracks + 100 cloned releases moved into 13 playlist files;
releases.ttl 514K→125K (28 local-artist releases / 346 tracks kept;
~809 orphan tracks purged). Backup in
`ia-music-library/.pre-selfcontained-<ts>/`. Decisions 1–3 resolved as
recommended (keep Release grouping; per-playlist clone; backup+apply
after reviewed dry-run). Plan kept for reference.

## Problem

Every track add — even a single one — issues a SPARQL PATCH against the
monolithic `ia-music-library/releases.ttl` (now 472K, 6353 lines, 1426
Tracks + 129 Releases) because that is where playlist Track nodes live.
Community Solid Server takes a write lock on the file, reads + parses
~6300 triples, applies the patch, re-serialises, writes back — all
inside one time-bounded lock. At this size the cycle exceeds CSS's lock
expiration and/or collides with the concurrent GET on `releases.ttl`,
producing `500` lock timeouts. Chunking the PATCH body does not help:
the cost is the full-file rewrite under lock, not the body size.

## Goal

A playlist add/remove must PATCH only that playlist's own small file.
`releases.ttl` stops being on the playlist write path.

## New layout

Each playlist file (`ia-music-library/playlists/<Slug>`) becomes
**self-contained**: it holds the `mo:Playlist`/`dctypes:Collection`
resource, its `dcterms:hasPart` edges, **and** the `mo:Track` +
parent `mo:Release` triples those edges point at. Everything needed to
render the playlist lives in one ~4–8K document.

`releases.ttl` keeps **only** the local-artist catalogue: Releases /
Tracks reachable from an Agent with `omp:localData true` (converted
playlists, future imports). With no converted artists it can be nearly
empty.

Track nodes keep their existing `urn:uuid:` IRIs (globally unique, and
— because dedup is per-playlist — each Track is referenced by exactly
one playlist, so relocating it is safe). Parent Releases are **cloned
per playlist** (fresh `urn:uuid:`), deduped by `dcat:landingPage`
*within* a playlist. Two playlists containing the same album get
independent Release nodes — that is the point of self-containment.

## Read path (ia-rdf.js) — minimal change

Everything still parses into one rdflib store, so `parseBookmarks` /
`parsePlaylists` / track lookups are doc-agnostic and keep working.
`loadRDF` already follows `rdfs:seeAlso` to every playlist file and
still loads `releases.ttl` for the local-artist catalogue. No
structural read change expected; verify nothing assumes a Track's
`.why` graph is `releases.ttl`.

## Write path (ia-rdf.js) — the real work

| Function | Change |
|---|---|
| `addTracksToPlaylist` | Build Track + parent-Release triples targeting **`playlistDoc`** (not `releasesDoc`). Single-file PATCH: Track/Release triples + `hasPart` edges in one update to the playlist file. Drop the two-file rollback. Keep the chunk loop (bounds body size for huge adds) but every chunk targets the playlist file. |
| `removeTrackFromPlaylist` | Delete `hasPart` + the Track triples (+ parent Release if it has no other Track in that playlist) from **the playlist file**. |
| `updateTrackMeta` | Target the doc the Track actually lives in (from the statement's `.why`), not a hard-coded `releasesDoc`. Playlist track → playlist file; local-artist track → `releases.ttl`. |
| `convertPlaylistToArtist` | Source Tracks now come from the playlist file. Copy the Track + Release triples into `releases.ttl` under the new `omp:localData` Agent (the catalogue), then the playlist may be deleted as today. |
| `getLocalArtistAlbums` / `getLocalReleaseTracks` / `releaseSiblingCount` | Unchanged — still operate on the in-memory store; local-artist data still in `releases.ttl`. |

## Migration (one-time script, dry-run first)

`migrate-selfcontained-playlists.js`:

1. Back up `releases.ttl` and every `playlists/*` file (timestamped dir).
2. Load releases.ttl + agents.ttl + all playlist files (same base URIs
   as `sweep-orphan-tracks.js`).
3. Compute local-artist-reachable Releases/Tracks (reuse the sweep's
   `omp:localData` reachability) — these **stay** in releases.ttl.
4. For each playlist file, for each `hasPart` Track currently defined in
   releases.ttl:
   - clone its parent Release into the playlist file (dedup by
     `landingPage` within that playlist; fresh `urn:uuid:` per playlist),
   - move the Track triples into the playlist file, repoint
     `mo:track` to the cloned Release.
5. Rewrite each playlist file (prefixed CURIE emitter, same style as the
   orphan sweep) with playlist resource + its Tracks + cloned Releases.
6. Rewrite releases.ttl keeping only local-artist-reachable nodes.
7. Print before/after counts. `--apply` to write; default dry-run.

Idempotent + guarded like `sweep-orphan-tracks.js` (don't clobber an
existing pristine backup).

## Validation

- Single-track add → one PATCH to a ~4K file, no releases.ttl touch,
  no lock timeout.
- Reload: playlist renders identically (artist/album/duration intact).
- Remove track, edit track metadata, convert-to-artist, add 200 tracks
  (chunked into the playlist file) all still work.
- `releases.ttl` shrinks to local-artist-only (≈0 if none converted).

## Estimate

~4–6 h: write-path rewrite (2–3 h), migration script + dry-run
verification (1.5–2 h), regression pass (1 h).

## Open questions

1. Keep `mo:Release` grouping inside playlist files, or flatten Track
   triples (artist/album as literals on the Track) for simpler small
   files? Plan assumes **keep Release grouping** for display parity and
   reversible convert-to-artist. Flattening is simpler but loses the
   shared shape — recommend keeping grouping.
2. Cross-playlist album dedup is intentionally dropped (clone per
   playlist). Acceptable? Recommended yes — self-containment is the
   whole point and storage cost is trivial.
3. Run the migration against live data now (backups taken) vs. stage a
   copy first? Recommend backup + apply, with dry-run reviewed first.
