# Plan: curated artist in library view behaves like a playlist

Status: **IMPLEMENTED + read-half widened to C.** Migration applied
(6 B→A); wiring done; smokes green.

### Post-implementation correction (2026-05-18)

The first wiring tied **both** the read half (auto-select all albums →
flatten tracks) and the edit half (delete/move) to a single flag
(`libraryBackingPlaylist`, set only when the agent has
`omp:sourcePlaylist`). That made **catalogue (C) artists** — e.g.
**Wu-Tang Clan**, a `localData` artist with ~24 `foaf:maker` release
files — *not* aggregate on click (regression: "lost the highlight").

Per §2/§4 the read half was always meant to be safe for **any**
curated artist. Fixed by splitting the triggers:
- `libraryAggregateAlbums` (new) — set for **any** single curated
  artist (A *or* C), gates only the album auto-select / track-flatten.
- `libraryBackingPlaylist` — unchanged, still A-only, still gates the
  edit half. C artists aggregate-and-view but stay **read-only**
  (matches the Q1 (c) decision).
- `isCuratedArtist()` extracted to closure scope so the 2-tier column
  split and the click-to-aggregate path classify identically.

**Wu-Tang was never a lost playlist.** A mid-session "recovery"
(`migrate-recover-wutang.js`, since deleted) wrongly rebuilt it from a
throwaway 19-track mixtape in `ia-music.ttl.pre-multifile` and added
`omp:sourcePlaylist`, which made `getLocalArtistAlbums` take the
playlist branch and **hide** the 24 real catalogue albums. That was
reverted from its backups; Wu-Tang is (correctly) a 24-album catalogue
C artist. Lesson: inspect on-disk `releases/*` before any "recovery";
`*.pre-multifile` is not a reliable playlist source.

### Locked decisions
- **B eliminated → A.** One-shot migration converts every search-stub
  agent that name-matches a curated playlist into a proper
  converted-playlist artist (`omp:sourcePlaylist` + `omp:localData`),
  **carrying over the stub's `mo:genre` AND `dcat:landingPage`**. The
  same-name agent is replaced in place. Post-migration there is no B.
- **Two cases only:** A = artist with `omp:sourcePlaylist` →
  fully playlist-editable; C = `localData`/`foaf:maker` catalogue
  artist (no single backing playlist) → **read-only** in this view.
- **Read:** click an A artist → auto-select all its albums, flatten all
  tracks into the track grid.
- **Group delete** → route to `removeTrackFromPlaylist` on the backing
  playlist (mirror playlist view; not the in-memory library drop).
- **Group "move" = add to another playlist** → reuse the existing
  add-to-playlist path (`addTracksToPlaylist`, same as drag-to-playlist).
  Copy semantics (mirror existing drag behaviour); delete is the
  separate explicit op. No new write code.

Net: one write target (the backing playlist file), all via the existing
proven playlist primitives. Only routing + a read-view entry point are
new; plus the one-shot migration.

### Simplification (the tracklist kebab/group/drag already exist)

The track grid already has `.ia-track-kebab`, `✕`/`col-remove`,
multi-select+Delete (`removeTracksFromView`), and drag
(`application/x-ia-tracks` → `addTracksToPlaylist`) — all gated by
`currentSource` (playlist branch persists; library branch is in-memory).
So the feature = **route an A-artist click so the tracklist is backed by
its playlist P**:
- click A artist → highlight all its albums, render P's tracks;
- a "view backed by playlist P" pointer that `removeTracksFromView`
  reads → group-delete persists to P (its existing playlist branch);
- drag-to-another-playlist already works (targets any destination).
Nothing new in the tracklist; C stays read-only. New code = migration +
that one routing pointer.

## 1. Ask

Library view, click a **curated** artist →
- auto-select **all** its albums,
- show **all** its tracks in the tracklist,
- tracklist behaves **exactly like a playlist**: row kebab (⋯) menus +
  multi-select group **delete** / **move**.

## 2. Read half (low-risk, well-defined)

Clicking a curated artist already resolves albums (`fetchAlbumsForArtist`
→ `getLocalArtistAlbums`). New behaviour: instead of "pick an album to
see tracks", auto-select every resolved album and flatten their tracks
into the tracklist (dedupe by download URL; keep album order then track
order). This is aggregation only — no write-path risk. Mostly a change
in `refreshAlbumsColumn`/the album→track flow + the artist-click handler.

## 3. Edit half — the hard part: **where do edits go?**

"Curated artist" is **three different backings**, with different (or no)
writable target:

| Backing | How detected | Edit target for delete/move |
|---|---|---|
| **A. Converted playlist** | agent has `omp:sourcePlaylist` | the one playlist file — clean, exactly playlist semantics |
| **B. Name-matched playlist** | agent is a search stub but a curated playlist's title/maker == artist name (the Madlib case) | the matched playlist file — but the artist's *displayed* albums currently come from an IA **search**, not that playlist (see §4 Q2) |
| **C. `localData` catalog artist** | `omp:localData`, albums via `foaf:maker` → `releases/*` | the per-release files — editing/deleting here mutates the **catalog**, shared by genre-browse and possibly other playlists |

A is straightforward. B and C are not: a group-delete on a C-artist's
tracklist would delete catalog release data (shared!); a group-delete on
B only makes sense if we're actually showing the playlist's tracks, not
search results. Guessing here is exactly what caused the pod-write saga.

## 4. Decisions needed (blocking)

- **Q1 — Edit scope by backing.** For **C (catalog/localData)** artists,
  should the playlist-style tracklist be (a) **read-only** (kebab shown
  but delete/move disabled with a tooltip "catalog album — edit via its
  source"), (b) **fully editable, mutating the `releases/*` files**
  (powerful but mutates shared catalog; ties into `shared-releases-plan`
  refcounting), or (c) **only A & B get full edit; C is read-only**?
  *Recommended: (c)* — full playlist editing only when there's a single
  unambiguous playlist behind the artist; catalog artists read-only for
  now.
- **Q2 — The Madlib (B) case.** When a curated artist is a search stub
  name-matched to a playlist, clicking it should show **the playlist's
  tracks** (so edits are meaningful) — not the live archive.org search.
  Confirm: name-matched artist ⇒ resolve content from the matched
  playlist, overriding the search `landingPage`?
- **Q3 — "Move" semantics.** In the existing playlist tracklist, what
  does group "move" do — reorder within, or move tracks to *another*
  playlist? For an artist aggregate spanning several albums, "move"
  needs a defined destination. (Need to read the current playlist
  group-move behaviour and mirror it; if it's "move to another
  playlist", the source for a curated artist is the backing playlist
  from Q1/Q2.)

## 5. Implementation outline (once Q1–Q3 are answered)

1. **Resolve backing** for the clicked artist → `{kind:A|B|C,
   playlistId?}`. Reuse `sourcePlaylist`; for B, the name→playlist map
   already built for the curated/raw split (`refreshArtistsColumn`).
2. **Read:** artist click → select all albums → flatten tracks →
   `renderTracks` in the same grid the playlist uses.
3. **Edit routing:** if kind A/B → route kebab + group delete/move at
   the **backing playlist file** (reuse `removeTrackFromPlaylist` /
   the existing playlist group ops verbatim — same store, same
   `runUpdate`). If kind C → per Q1 (read-only recommended).
4. **Selection model:** reuse the tracklist's existing multi-select +
   kebab; the only new bit is the artist-click entry point and the
   edit-target router. No new write primitives if A/B reuse playlist ops.
5. Smoke: extend a parse/aggregation check; edit paths reuse
   playlist-tested code (no Node-testable pod specifics added).

## 6. Commentary / recommendation

The read half is safe and should land regardless. The edit half is only
safe if we **route writes by backing kind and refuse to silently mutate
the shared catalog**. Strong recommendation: ship **A & B fully editable
(reusing the existing, already-correct playlist write path), C
read-only** with a clear affordance — that delivers "behaves like a
playlist" for the cases where it *is* a playlist, and avoids
re-opening the shared-release/refcount problem (`shared-releases-plan`)
prematurely. Don't make group-delete on a curated artist able to
silently destroy catalog releases other playlists/genres depend on —
same footgun principle as the shared-releases delete prompt.
