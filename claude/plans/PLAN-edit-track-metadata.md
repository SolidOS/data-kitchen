# Edit title / artist / album of playlist tracks — plan

**Status: IMPLEMENTED.** Shipped — per-track Edit (title/artist/album)
via the tracklist row kebab. Plan kept for reference.

## Goal

In a playlist view, let the user edit a track's **title**, **artist**,
and **album**, persisted to the RDF.

## Where each field lives

A playlist track is a `mo:Track` in `releases.ttl` with a parent
`mo:Release` (linked by `mo:track`):

| Field | RDF location | Edit scope |
|---|---|---|
| title | Track `dcterms:title` | this track only |
| artist | Track `foaf:maker` (per-track override; literal) | this track only |
| album | **parent Release** `dcterms:title` | **all tracks sharing that Release** |

- **Title**: clean, per-track.
- **Artist**: set the *Track's* own `foaf:maker` as a string literal.
  `parseBookmarks` already prefers a Track's maker over the parent
  Release's, so the override affects only this track. (Matches how
  `addTracksToPlaylist` already stores literal makers when there's no
  Agent match.)
- **Album**: this is the parent Release's `dcterms:title` — **one
  triple, one file**. There is no redundant copy on Tracks or
  playlists; they reference the Release node. Editing it is a single
  triple replace in `releases.ttl`. The only consequence is *display*:
  every track that resolves through that same Release will now show the
  new album name (they all read the one Release). The modal should note
  this so it isn't surprising: "Album — also updates the N other tracks
  from this source." Moving a single track to a *different* album
  (re-parenting under another Release) is a bigger feature; out of
  scope here.

All three are single-file PATCHes to `releases.ttl` — no multi-file
orchestration, no rollback chain. Reuses `runUpdate` + `checkSaved`.

## Prerequisite bug fix: literal makers

`parseBookmarks` currently does:

```js
const makerNode = store.any(trackNode, FOAF('maker')) || …Release maker;
const artistName = makerNode ? store.any(makerNode, FOAF('name'))?.value || '' : '';
```

If the maker is a **literal** (which `addTracksToPlaylist` already
writes when no Agent matches, and which this feature will write for the
artist override), `store.any(literal, FOAF('name'))` is `undefined` →
artist shows blank. Fix: if `makerNode.termType === 'Literal'` use its
`.value` directly; else read `foaf:name`. This is a pre-existing latent
bug — fixing it will make some currently-blank artists show their
literal names (an improvement, but a visible change to call out).

## Track resolution

Resolve the Track by its node URI, not its download URL — the same mp3
URL can legitimately exist as two Track nodes (added to two different
playlists; per-playlist dedup doesn't dedup across playlists). The
playlist-track bookmark already carries `node` (the Track URI) from
`parseBookmarks`. Thread it: bookmark.node → `currentTracks` row
(`parsePlaylistBookmark` must keep `node`) → `onEdit`.

## UI

- A per-row **bolded ⋯ kebab** in the tracklist's existing remove
  cell — same affordance as the genre / artist / source rows (reuse
  `.ia-row-kebab` styling + `showFloatingMenu`). Shown **only in
  playlist view** (`currentSource` is a playlist). Library-view tracks
  are ephemeral live-search results with no backing RDF — no kebab.
- Click ⋯ → small menu: **Edit… / Remove**. This *replaces* the
  standalone ✕ button on playlist rows so the row matches every other
  editable row in the app (kebab-only). Remove keeps its existing
  confirm behavior; it just moves one click deeper (kebab → Remove).
  Library-view rows (no kebab) keep the ✕ as today.
- **Edit…** → `showTrackEditModal` — a Title / Artist / Album form
  modeled on the existing `showPlaylistEditModal` (same modal shell &
  CSS). Title required; Artist/Album optional. Album field carries the
  "also updates N other tracks from this source" note.
- On save: `updateTrackMeta`, then update the in-memory bookmark +
  `currentTracks` row, recompute display, re-render the playlist view.

(Could later generalise `showPlaylistEditModal` + `showTrackEditModal`
into one `showFieldsModal({fields,…})`; deferred to avoid churn on the
working playlist modal.)

## New `ia-rdf.js` function

`updateTrackMeta(store, baseURI, trackNode, { title, artist, album })`:
- `title != null` → replace Track `dcterms:title` in `releases.ttl`.
- `artist != null` → replace Track `foaf:maker` (delete any existing,
  insert `literal(artist)`), `releases.ttl`.
- `album != null` → find parent Release (`?r mo:track <trackNode>`),
  replace its `dcterms:title`, `releases.ttl`.
- One `runUpdate` to `releases.ttl` with all deletes+inserts batched.
- Returns `{ ok, err }`; caller routes through `checkSaved`.

## Steps + time estimates

| # | Step | Time |
|---|---|---|
| 1 | `parseBookmarks` literal-maker fix (prereq) | 15m |
| 2 | `updateTrackMeta` in `ia-rdf.js` (batched single-file PATCH) | 45m |
| 3 | `showTrackEditModal` in `ia-ui.js` | 20m |
| 4 | `renderTrackList`: ⋯ kebab in remove cell (playlist only), replacing ✕ there; bold styling reuse | 25m |
| 5 | `setupTrackList`: kebab → `showFloatingMenu` (Edit… / Remove); route to `onEdit` / existing `onRemove` | 30m |
| 6 | thread `node` through `parsePlaylistBookmark` → row | 15m |
| 7 | `ia3.js` onEdit: modal → `updateTrackMeta` → checkSaved → in-memory update + re-render | 45m |
| 8 | Build + smoke test (edit each field; reload persists; album-title display updates siblings; literal-maker artists show) | 35m |

**Total ≈ 3.7 hours focused.**

## Risks

- **Album-edit scope** surprises users if not surfaced — mitigated by
  the modal note + showing the sibling count.
- **Literal-maker fix** changes some existing rows' displayed artist
  (blank → literal). Desired, but visible; note in the change summary.
- Multiple Track nodes for the same URL across playlists — handled by
  resolving via the bookmark's `node`, never the URL.
- Library-view tracks intentionally not editable (no backing RDF) —
  the ✎ is gated on playlist context.

## Out of scope (future)

- Re-parenting a single track to a different album (split/move Release).
- Editing artist as an Agent IRI (with dedup into `agents.ttl`) rather
  than a literal — the literal is consistent with current behavior; an
  Agent-reconciliation pass is a separate effort.
- Editing track metadata for converted-local-artist albums (same RDF
  path; just a different entry point — easy follow-on once playlist
  editing works).
