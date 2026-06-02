# Playlists in their own turtle files — design + plan

**Status: superseded.** See `PLAN-multifile-library.md` for the broader
proposal that splits *every* entity type across its own resource, not
just playlists. This narrower plan kept everything in `ia-music.ttl`
except user-created playlists; the newer plan is cleaner end-to-end.

Move every user-created playlist into its own TTL resource. The main
library file (`ia-music.ttl`) stays the home for genres + catalog
artists; playlists live in sibling files referenced by an index in the
main file.

## Decisions to lock before coding

### 1. File-naming convention

Slug the playlist title to ASCII-safe characters and prefix:
- `JZ's Hip Hop` → `ia-music-playlist-JZs_Hip_Hop.ttl`
- `Wu-Tang Clan - The Sword Chamber (2019)` → `ia-music-playlist-Wu_Tang_Clan_The_Sword_Chamber_2019.ttl`

Rules:
- replace any non-`[A-Za-z0-9]` with `_`
- collapse runs of `_`; trim leading/trailing
- cap length (say 80 chars), append a short unique suffix on collision
- live next to `ia-music.ttl` in the same directory/container

### 2. Linking main → playlist files

Add `rdfs:seeAlso` to the main file:

```turtle
<> rdfs:seeAlso <ia-music-playlist-Wu_Tang_Clan.ttl> ,
                <ia-music-playlist-Funk_Friday.ttl> .
```

The `<>` is the document itself. Loading the main file then iterates
`store.match(<doc>, rdfs:seeAlso, null)` to find the playlist files.

Alternative considered: Solid LDP container listing. Skipped — needs
LDP-aware server config and varies across implementations.

### 3. Cross-file references

Inside a playlist file, references back to `ia-music.ttl` use an
absolute prefix:

```turtle
@prefix : <#> .
@prefix mc: <ia-music.ttl#> .   # main catalog

mc:Wu_Tang_Clan_2019 dcterms:hasPart :t1, :t2 .

:t1 a mo:Release ;
    dcterms:title "Bring Da Ruckus" ;
    foaf:maker mc:Agent_Wu_Tang_Clan ;
    mo:genre mc:Hip_Hop ;
    dcterms:isPartOf mc:Wu_Tang_Clan_2019 ;
    dcat:downloadUrl <https://archive.org/download/.../track.mp3> .
```

Notes:
- The playlist node (`Wu_Tang_Clan_2019`) is defined in **the main
  file** so genre filtering + sources column work without loading the
  playlist file. Members and Releases live in the playlist file.
- Each Release gets a local fragment (`:t1`, `:t2`, …) instead of a
  URN — saves space, keeps the file readable. URNs still work if we
  want them; pick one and stick with it.

### 4. Favorites

Stays in the main file. It's already special-cased (also typed
`skos:Concept`, surfaces in the genres column, hidden from
`parsePlaylists`). Moving it to a separate file would force the genre
column to fetch a second file before it can render, which slows down
first paint.

User-created playlists only — Favorites untouched.

### 5. Releases that live in playlist files

Release nodes (`mo:Release`) currently sit in `ia-music.ttl` with
`dcterms:isPartOf <#PlaylistX>` back-references. They move with their
playlist into the playlist file. The main file ends up containing
**only** catalog Agents, Genres, the Favorites Collection (with its
member Releases), and the playlist-file pointers.

### 6. Empty-playlist case

`addPlaylist("Foo")` creates `ia-music-playlist-Foo.ttl` even when the
playlist has no tracks yet. The file contains just the rdfs:seeAlso
target and an empty playlist node — or we defer file creation until
the first track is added. Cleaner to create eagerly so the user can
see the file landed on disk.

## Migration

One-shot script `migrate-playlists-to-files.js` that, for each
`mo:Playlist` in `ia-music.ttl` other than `<#Favorites>`:

1. Mints a sibling filename from the playlist's title.
2. Writes a new TTL file with the playlist's hasPart + member Release
   triples (rewriting `<#X>` references to `mc:X` form).
3. Removes the same triples from the main file.
4. Adds `<> rdfs:seeAlso <new-file.ttl>` to the main file.

For the current data, this moves the empty `<#Wu-Tang_Clan_-…>`
playlist out. Favorites stays.

## Runtime / app changes

### Loading

`loadOneLibrary(config)` currently does one `fetcher.load(url)`.
Becomes:

```js
await fetcher.load(url);
const doc = sym(url);
const seeAlsoUris = store.match(doc, RDFS('seeAlso'), null).map(s => s.object.value);
await Promise.all(seeAlsoUris.map(u => fetcher.load(u)));
```

All triples merge into the same `store`. `parsePlaylists` and
`parseBookmarks` work unchanged — they read the merged store.

### Writes

`addPlaylist` / `removePlaylist` / `addTracksToPlaylist` /
`removeTrackFromPlaylist` need to write to the **right file**.
Concretely: the document URI used for each statement (the `doc` arg
in `st(s, p, o, doc)`) must be the playlist file, not the main file.

A small helper `playlistDocFor(playlistId, baseURI)` returns the
playlist file URL for a given playlist id (resolved by the
`rdfs:seeAlso` back-edge stored on the playlist node, or by
slug-derived filename when first creating it).

### `addPlaylist` flow

1. Mint slug + new file URL.
2. Create the file with PUT (rdflib's UpdateManager has a way to create
   a new resource — `kb.fetcher.webOperation('PUT', url, …)` with
   appropriate content-type).
3. Insert `<> rdfs:seeAlso <new-file>` and `<#X> a dctypes:Collection, mo:Playlist; rdfs:seeAlso <new-file>` into the main file.
4. Insert the playlist node into the new file's store (this happens
   via UpdateManager once the file exists).

### `removePlaylist` flow

1. Delete every triple in the playlist file (PATCH).
2. DELETE the file itself.
3. Remove the `rdfs:seeAlso` triple from the main file.

Step 2 may fail on some Solid servers if they don't allow DELETE.
Fallback: leave the empty file in place.

## Plan + time estimate

| # | Step | Notes | Time |
|---|---|---|---|
| 1 | **Slug helper** in `ia-rdf.js` | `slugifyForFile(title)` + collision check against existing seeAlso targets. | 20m |
| 2 | **Main-file reader update** | Add `rdfs:seeAlso` discovery to `loadOneLibrary` (fetch + merge into the same store). | 30m |
| 3 | **`addPlaylist` rewrite** | PUT new file, insert seeAlso in main, insert playlist node in new file. | 45m |
| 4 | **`addTracksToPlaylist` / `removeTrackFromPlaylist`** | Look up the playlist's file URL (cached in a `playlistDocByUri` map) and use it as `doc` in every Statement. | 40m |
| 5 | **`removePlaylist` rewrite** | Empty + DELETE the file, remove seeAlso from main. Graceful fallback if server rejects DELETE. | 30m |
| 6 | **Migration script** `migrate-playlists-to-files.js` | One-shot. For each existing user playlist: emit a new TTL, prune the main file. Backup as `.pre-playlists`. | 1h |
| 7 | **Smoke tests** | Verify a round-trip: add playlist → add tracks → reload → tracks still there. Add playlist twice with same name → collision-safe slug. | 30m |
| 8 | **Help-doc update** | Note in `ia-help.html` that each playlist lives in its own file alongside the main library. | 15m |

**Total ~4–5 hours focused.**

## Risks

- **Race conditions** — creating a new file then immediately PATCHing
  it can fail on servers that don't return 201 fast enough. Mitigation:
  await PUT before issuing the PATCH for triples.
- **Permissions** — Solid pods may restrict file creation. The Solid
  server you're using accepted file rewrites for the main file, so
  creates likely work too, but worth verifying with one manual test
  before automating.
- **Renaming a playlist** changes its title, *not* its file name.
  Files keep their original slug indefinitely so the URI stays stable
  across renames. Optionally we can rename the file on
  `renamePlaylist`, but that breaks any external bookmarks to the
  file's URL. Suggest keeping file names stable.
- **Drag-to-playlist** in the sources column writes to the playlist
  file, not the main file. Same plumbing as `addTracksToPlaylist`.
- **Recovery of the two lost playlists** (`<#Playlist_1>`,
  `<#JZ_Hip_Hop>`) is out of scope — they're already gone and the
  migration only touches what's currently in the main file. The
  Wu-Tang playlist (currently empty) will migrate.

## What does not change

- Genres + catalog Agents stay in the main file.
- Favorites stays in the main file.
- `parsePlaylists` and `parseBookmarks` read the merged store; no
  rewrites needed.
- The RDF shape — same `mo:Playlist` / `mo:Release` / `mo:Track`.
- localStorage / library config schema.

## Open questions for you

1. **File naming** — the proposed `ia-music-playlist-Foo.ttl` pattern
   OK, or do you want `playlist-Foo.ttl` (drop `ia-music-`), or
   something else?
2. **Eager file creation** for empty playlists — yes/no?
3. **Move existing Wu-Tang playlist** (currently empty) out as part of
   migration? Or leave it where it is and only apply this scheme to
   new playlists going forward?
4. **Release identifiers** in the new files — keep `urn:uuid:…` (stable
   if the playlist file is renamed/moved), or switch to local
   `<#t1>` / `<#t-uuid>` fragments?

My recommendations: ①  `ia-music-playlist-Foo.ttl` ; ② eager creation ;
③ migrate Wu-Tang for consistency ; ④ keep `urn:uuid:…` (already in
the data; cross-file safe).
