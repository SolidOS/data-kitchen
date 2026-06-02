# Multi-file library layout — plan

**Status: IMPLEMENTED.** Shipped — multi-file layout + `migrate-to-multifile.js`.
Plan kept for reference. Supersedes the narrower
`PLAN-playlist-files.md` (which only split playlists out of the main
file); this proposal splits *every* entity type across its own resource.

## Target layout

```
ia-music-library/
  ├── agents.ttl        # all Agents (Artists, Labels, Groups)
  ├── genres.ttl        # all Genres + the <#Music> root concept
  ├── releases.ttl      # all Releases + their Tracks
  └── playlists/
      ├── Favorites
      ├── PlaylistBaz
      └── …
```

Each top-level catalog file is loaded once on init. Each playlist is a
standalone LDP resource in the `playlists/` container.

## Cross-file references via prefixes

```turtle
@prefix agents:    <ia-music-library/agents.ttl#> .
@prefix genres:    <ia-music-library/genres.ttl#> .
@prefix playlists: <ia-music-library/playlists/> .
@prefix releases:  <ia-music-library/releases.ttl#> .

# releases.ttl
releases:AlbumFoo a mo:Release ;
    dcterms:title "Album Foo" ;
    foaf:maker agents:AgentFoo ;
    mo:genre genres:GenreBar ;
    mo:track releases:AlbumFoo-t1, releases:AlbumFoo-t2 .

releases:AlbumFoo-t1 a mo:Track ;
    dcterms:title "Track 1" ;
    mo:track_number 1 ;
    dcat:downloadUrl <https://…/01.mp3> ;
    dcterms:isPartOf playlists:PlaylistBaz .

# playlists/PlaylistBaz (the whole file *is* the playlist)
<> a dctypes:Collection, mo:Playlist ;
    dcterms:title "Baz" ;
    dcterms:hasPart releases:AlbumFoo-t1 .
```

The playlist file uses `<>` to refer to its own document — the playlist
URI **is** the file URI, no fragment needed.

## Five choices to lock before coding

### 1. Index resource (how the app finds all the files)

| Option | Description | Rec |
|---|---|---|
| **A.** `library.ttl` at the root with `rdfs:seeAlso` → catalog files + each playlist | Server-agnostic, explicit | ✓ |
| **B.** Solid LDP container listing (load `ia-music-library/` and read `ldp:contains`) | Nicer when on a Solid pod, server-config dependent | |
| **C.** Convention only (hard-coded paths) | Brittle | |

### 2. Inverse edges across files

When a Track is in a playlist:
- `releases:AlbumFoo-t1 dcterms:isPartOf playlists:PlaylistBaz` (in `releases.ttl`)
- `playlists:PlaylistBaz dcterms:hasPart releases:AlbumFoo-t1` (in `playlists/PlaylistBaz`)

| Option | Description | Rec |
|---|---|---|
| **A. Keep both** | Two PATCHes per add/remove; O(1) lookups from either side. With our `checkSaved`-strict write path, an inconsistency is loud, not silent. Could add a one-shot repair tool later. | ✓ |
| **B. `hasPart` only** | One PATCH per change; scan all playlist files to answer "which playlists is this Track in?" | |
| **C. `isPartOf` only** | One PATCH; opening a playlist needs scanning `releases.ttl`. | |

### 3. Couple with the track-route refactor?

The layout *implies* track-route — `releases.ttl` contains Releases
**and** their Tracks. Without coupling, the file fills with the
redundant Release-per-track shape we have today, and we'd have to do a
second migration later to fix it.

### Concrete: 10 tracks from one album added to a playlist

**Stay with Release-as-member:**

```turtle
# releases.ttl — 10 separate Release nodes, all redundant with each other
releases:Track-1 a mo:Release ;
    dcterms:title "Track 01 — Some Song" ;
    foaf:maker agents:Agent_X ;
    dcat:landingPage <…/album-page> ;     ← repeated 10×
    dcat:downloadUrl <…/01.mp3> ;
    dcterms:isPartOf playlists:MyList .

releases:Track-2 a mo:Release ;
    dcterms:title "Track 02 — Other Song" ;
    foaf:maker agents:Agent_X ;
    dcat:landingPage <…/album-page> ;     ← repeated again
    dcat:downloadUrl <…/02.mp3> ;
    dcterms:isPartOf playlists:MyList .

… 8 more clones …
```

Each row is a one-track "Release" sharing the same album URL. Adding
the same 10 tracks to a second playlist creates **10 more** Release
nodes. Renaming the album = rewriting 10 nodes.

**With the track-route refactor:**

```turtle
# releases.ttl — one Release per album, Tracks underneath
releases:AlbumX a mo:Release ;
    dcterms:title "Album X" ;
    foaf:maker agents:Agent_X ;
    dcat:landingPage <…/album-page> ;
    mo:track releases:AlbumX-t1, releases:AlbumX-t2, … releases:AlbumX-t10 .

releases:AlbumX-t1 a mo:Track ;
    dcterms:title "Some Song" ;
    mo:track_number 1 ;
    dcat:downloadUrl <…/01.mp3> ;
    dcterms:isPartOf playlists:MyList .

releases:AlbumX-t2 a mo:Track ;
    dcterms:title "Other Song" ;
    mo:track_number 2 ;
    dcat:downloadUrl <…/02.mp3> ;
    dcterms:isPartOf playlists:MyList .

… 8 more Tracks (no Release duplication) …
```

One Release per album. Adding the same 10 tracks to a second playlist
just adds another `dcterms:isPartOf playlists:OtherList` triple per
Track — no Release/album-info duplication. Renaming the album touches
one node.

**Recommendation: yes, couple.**

### 4. Playlist URI: with or without `.ttl`?

| Option | Example | Rec |
|---|---|---|
| **A. No extension** | `playlists:PlaylistBaz` resolves to `…/playlists/PlaylistBaz` | ✓ (Solid-native, works via content negotiation) |
| **B. `.ttl` extension** | `playlists:PlaylistBaz.ttl` | Plainer HTTP, less RESTful |

### 5. Migration scope

What it takes to turn the current `ia-music.ttl` into the new four-file
structure.

#### What's in `ia-music.ttl` today

- 1 root concept `<#Music>`
- 10 genre concepts (`<#World>`, `<#Funk>`, etc.)
- 137 catalog Agents (each `mo:MusicArtist` with `foaf:name` + `dcat:landingPage` + `mo:genre`)
- `<#Favorites>` Collection with 13 member Releases
- `<#Wu-Tang_Clan_…>` empty Collection
- 13 Release nodes (the favorites' members)

#### What migration does

| From | To | Difficulty |
|---|---|---|
| Each genre concept | `genres.ttl` as fragments | Trivial — straight copy + rewrite URI refs |
| Each catalog Agent | `agents.ttl` as fragments | Trivial — straight copy + rewrite URI refs |
| Each existing Release | `releases.ttl`, **but grouped** | **Hard** — see below |
| Each playlist (`<#Favorites>`, `<#Wu-Tang_…>`) | `playlists/<slug>` as standalone resources | Easy — one file each |
| All `<#X>` fragment refs everywhere | rewrite to `genres:X` / `agents:X` / `releases:X` / `playlists:X` per type | Mechanical — sed-style |

#### The hard part: regrouping existing Releases

Today each "favorite" is a flat Release. We need to figure out the
parent Release for each by grouping on `dcat:landingPage`. Concrete
example from current data:

**Before** (`ia-music.ttl`):
```turtle
<urn:uuid:4cdadc35-…> a mo:Release ;
    dcterms:title "The Motet — The Motet Live at Last Concert Cafe on 2013-11-23 — Unknown" ;
    dcat:landingPage <https://archive.org/details/motet2013-11-23> ;
    dcat:downloadUrl <…/motet2013-11-23s1t08.mp3> ;
    foaf:maker <urn:uuid:8a78cb51-…> ;
    dcterms:isPartOf <#Favorites> .

<urn:uuid:df3f27f8-…> a mo:Release ;
    dcterms:title "The Motet — The Motet Live at Last Concert Cafe on 2013-11-23 — Unknown" ;
    dcat:landingPage <https://archive.org/details/motet2013-11-23> ;     ← SAME album
    dcat:downloadUrl <…/motet2013-11-23s1t09.mp3> ;
    foaf:maker <urn:uuid:8a78cb51-…> ;
    dcterms:isPartOf <#Favorites> .
```

**After** (`releases.ttl`):
```turtle
releases:motet2013-11-23 a mo:Release ;
    dcterms:title "Live at Last Concert Cafe on 2013-11-23" ;   ← parsed from middle segment
    foaf:maker agents:Agent_The_Motet ;
    dcat:landingPage <https://archive.org/details/motet2013-11-23> ;
    mo:track <urn:uuid:4cdadc35-…>, <urn:uuid:df3f27f8-…> .

<urn:uuid:4cdadc35-…> a mo:Track ;
    dcterms:title "Unknown" ;                                   ← parsed from last segment
    dcat:downloadUrl <…/motet2013-11-23s1t08.mp3> ;
    dcterms:isPartOf playlists:Favorites .

<urn:uuid:df3f27f8-…> a mo:Track ;
    dcterms:title "Unknown" ;
    dcat:downloadUrl <…/motet2013-11-23s1t09.mp3> ;
    dcterms:isPartOf playlists:Favorites .
```

The five things the migrator has to do for each group:

1. **Group** all Releases sharing a `dcat:landingPage`.
2. **Mint** a parent Release URI from the IA item id (the part after `/details/`).
3. **Derive** the album title by splitting the existing track title on ` — `: take the middle segment if 3+ segments, or the URL's identifier if not.
4. **Derive** the per-track title from the last segment of the existing title.
5. **Demote** each existing `mo:Release` to `mo:Track` and link it from the new parent via `mo:track`.

#### Edge cases

- **Single-favorite-from-an-album**: some `dcat:landingPage` values have only one Release in our data (e.g. POOL OF FIRE mixtape). Still gets a parent Release; that Release has exactly one Track child.
- **Inconsistent makers across siblings**: if two Releases on the same album have different `foaf:maker`, the parent Release gets a "Various Artists" placeholder OR no `foaf:maker` at all; each Track keeps its own.
- **Title parsing**: when the title doesn't split cleanly (single segment, weird separators), fall back to using the existing title as-is on the Track and a derived-from-URL string on the parent. A few will look ugly until hand-edited.

#### Time breakdown — migration alone

| Step | Time |
|---|---|
| Read + parse existing TTL | 5m |
| Group by landing page, mint parent Releases | 25m |
| Demote Release→Track, parse titles, build `mo:track` edges | 25m |
| Rewrite cross-file URI refs (`<#X>` → `genres:X` etc.) | 15m |
| Emit `agents.ttl`, `genres.ttl`, `releases.ttl` | 10m |
| Emit one playlist file per existing `mo:Playlist` | 10m |
| Smoke-test: parse all four/N files back, verify counts + cross-refs resolve | 20m |
| **Total migration** | **~1.75h** |

## Runtime changes (separate from migration)

### Loading

`loadOneLibrary(config)` currently does one `fetcher.load(url)`. Becomes:

```js
await fetcher.load(libraryRootUrl);             // library.ttl
const doc = sym(libraryRootUrl);
const seeAlso = store.match(doc, RDFS('seeAlso'), null).map(s => s.object.value);
await Promise.all(seeAlso.map(u => fetcher.load(u)));   // all four catalog files
// Then discover playlist files
const playlistRefs = store.match(doc, /* … */).map(...);
await Promise.all(playlistRefs.map(u => fetcher.load(u)));
```

All triples land in the same in-memory store; `parseBookmarks` /
`parsePlaylists` read the merged view.

### Writes

`addPlaylist` / `removePlaylist` / `addTracksToPlaylist` /
`removeTrackFromPlaylist` need to write to the **right file** — the
`doc` arg in `st(s, p, o, doc)` must be the playlist file (or
`releases.ttl`, or `agents.ttl`, depending on what's being changed).
A small helper resolves the correct doc per entity type.

For "add Track to Playlist" specifically, that's two PATCHes (option 2A):
1. PATCH `releases.ttl` to add the Track if it doesn't already exist
   there, plus `dcterms:isPartOf playlists:X` on the Track.
2. PATCH `playlists/X` to add `dcterms:hasPart` to the same Track.

Both must succeed to count as saved. Our `checkSaved` strict path
already handles failure — surface a clear status if either PATCH fails.

## Full time estimate

| Slice | Hours |
|---|---|
| Migration script + smoke-test | 1.75 |
| Load path (multi-file + index) | 1 |
| Write path (`doc` selection per entity, `addPlaylist` PUT new file) | 2 |
| `library.ttl` index maintenance on add/remove playlist | 0.75 |
| `removePlaylist` (DELETE file + remove seeAlso) | 0.5 |
| Manual sanity pass against the live UI | 1 |
| **Total** | **~7h** |

## Recommendations summary

| Choice | Recommendation |
|---|---|
| 1. Index resource | A — `library.ttl` with `rdfs:seeAlso` |
| 2. Inverse edges | A — keep both `hasPart` and `isPartOf` |
| 3. Couple with track-route | Yes |
| 4. Playlist URI extension | A — no extension |
| 5. Migration | Run once; back up `ia-music.ttl` first |

## What does NOT change

- The RDF *shape* (Release/Track/Playlist/Agent/Genre with their
  current properties) — only the storage layout.
- The UI — same columns, same kebab menus, same drag/drop.
- localStorage / library config schema.
- The `checkSaved` strict write semantics — they apply uniformly across
  the multi-file PATCHes.

## Risks

- **Cross-file PATCH atomicity** — no transactions across files. If
  PATCH-1 succeeds and PATCH-2 fails, we end up with a dangling
  reference. Mitigation: surface the failure loudly; provide a "rebuild
  inverses" repair script.
- **Solid server quirks** — file creation (PUT to a new URL) and
  deletion behaviour vary. Worth a manual smoke test on the actual pod
  before committing.
- **Loading-time fan-out** — N+4 file fetches on every page load. For
  the current data set (2 playlists, ~150 catalog rows), this is fine.
  At hundreds of playlists, parallel-fetch caps matter.
