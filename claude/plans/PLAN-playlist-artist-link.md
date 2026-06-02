# Playlist ⇄ artist as a live link (not a copy)

**Status: IMPLEMENTED.** Supersedes the copy-into-releases.ttl
behaviour of `convertPlaylistToArtist`. Convert does NOT ask about /
set the hide state — it always links visible (shows in both lists).
Hiding is a toggle in the artist kebab only. New predicates
`omp:sourcePlaylist` (Agent→playlist) and `omp:hidePlaylist`
(playlist→bool). Functions: `convertPlaylistToArtist` (link/relink),
`unlinkPlaylistArtist`, `setPlaylistHidden`; `getLocalArtistAlbums`
reads live from the source playlist; `parsePlaylists` returns
hidden+artistNode; `parseBookmarks` carries sourcePlaylist. UI: Sources
filters hidden; playlist modal Convert↔Unlink; linked-artist kebab →
Edit playlist / Hide-Show / Unlink. No data migration needed (legacy
snapshot artists keep working via the foaf:maker fallback).

## Problem

Convert-to-artist currently *copies* the playlist's Track/Release
triples into `releases.ttl`. The playlist and the artist then drift,
the artist's contents can't be edited, and re-converting duplicates.

## Model

The underlying entity is **always a playlist**. Two bits of metadata
control how it appears:

- **Artist link** — an Agent in `agents.ttl` with `omp:localData true`
  and `omp:sourcePlaylist <playlistUri>`. Presence of this Agent =
  "also appears as an artist". The artist's albums/tracks are read
  *live* from the playlist's `hasPart` (no copied triples, no sync).
- **Hide flag** — `omp:hidePlaylist true` on the playlist resource =
  "don't show the playlist row in Sources".

Three states fall out:

| State | Artist link | hidePlaylist | Sources | Artists |
|---|---|---|---|---|
| Plain playlist | no | – | ✓ | – |
| Playlist + artist | yes | false | ✓ | ✓ |
| Artist only | yes | true | – | ✓ |

It is always editable as a playlist (from the playlist row, or — when
hidden — from the linked artist's kebab, which routes to the playlist
editor).

## New predicates (omp: = http://open-media-player.org/ns#)

- `omp:sourcePlaylist` — Agent → playlist resource URI.
- `omp:hidePlaylist` — playlist resource → xsd:boolean.

## Read path (ia-rdf.js)

- `getLocalArtistAlbums(store, artistNode)`: if the Agent has
  `omp:sourcePlaylist P`, albums = distinct parent Releases of P's
  `hasPart` Tracks (read from the playlist file). Else fall back to the
  existing `foaf:maker` logic (legacy snapshot artists keep working).
- `getLocalReleaseTracks` unchanged (`mo:track` on the Release).
- `parsePlaylists`: also return `hidden` (from `omp:hidePlaylist`) and
  `artistNode` (reverse `omp:sourcePlaylist`) so the UI can filter +
  cross-link.
- `parseBookmarks`: artist bookmarks already carry `localData`; add
  `sourcePlaylist` so the UI can route a linked artist to its playlist.

## Write path (ia-rdf.js)

- `convertPlaylistToArtist(store, baseURI, playlistId, { name, genreId,
  hidePlaylist })`:
  1. Resolve target Agent: an existing Agent already
     `omp:sourcePlaylist`-linked to this playlist, else an Agent with
     the same `foaf:name`. **Name-collision default: relink/replace
     that Agent** (drop its old `mo:genre`/links, keep the node) — matches
     "existing artist A should be removed and replaced". Else mint a new
     Agent.
  2. PATCH `agents.ttl`: type `mo:MusicArtist`, `foaf:name`,
     `mo:genre`, `omp:localData true`, `omp:sourcePlaylist <playlist>`.
  3. PATCH the playlist file: set/clear `omp:hidePlaylist`.
  No triples copied into `releases.ttl`.
- `setPlaylistHidden(store, baseURI, playlistId, hidden)` — toggle
  `omp:hidePlaylist` (used by the kebab/checkbox).
- `unlinkPlaylistArtist(store, baseURI, playlistId)` — delete the
  linked Agent's triples from `agents.ttl` (+ clear `omp:hidePlaylist`).
  "Convert back to plain playlist." Playlist itself untouched.
- Legacy snapshot artists (from the shipped copy approach): their
  orphaned `releases.ttl` Releases are left as-is (harmless; the
  existing `sweep-orphan-tracks.js` can clean them). Re-converting such
  an artist relinks cleanly via step 1.

## UI (ia3.js / ia-ui.js)

- **Playlist edit modal** gains a checkbox **"Hide from Playlists list
  (show only as artist)"** bound to `omp:hidePlaylist`. Save persists it
  alongside name/maker/description.
  - Actions when *not* linked: `Convert to artist…`, `Remove playlist`.
  - Actions when *linked*: `Unlink artist`, `Remove playlist`
    (`Convert…` becomes `Unlink`).
- **Sources list** filters out playlists with `hidden = true` (they stay
  in `playlists`/`playlistIds` for editing + linking; only the display
  is filtered).
- **Artist kebab** for a `sourcePlaylist`-linked artist routes to the
  playlist edit modal (single pane — the playlist is the editor), so
  "edit/add things to a converted artist" = edit the playlist. Search-
  based / legacy artists keep today's Rename/Delete/Visit menu.
- After convert/unlink/hide: refresh Sources + Artists; if the active
  source was a now-hidden playlist, snap to library.

## Validation

- Convert keeps the playlist; artist appears; editing the playlist's
  tracks is reflected in the artist with no resync.
- Hide → playlist row disappears from Sources, artist remains, still
  editable via the artist kebab.
- Unlink → artist disappears, playlist reappears (un-hidden), contents
  intact.
- Re-convert an existing same-named artist → relinks, no duplicate.

## Estimate

~3–4 h: read-path branch + new predicates (1 h), convert/unlink/hide
write fns (1 h), modal checkbox + action wiring + artist-kebab routing
(1–1.5 h), regression pass.
