# Vocabulary migration — retire `omp:`, adopt established vocabulary

**Status:** Phase A and Phase B **shipped 2026-05-21**.
**Shape model:** [`../../shapes/music.shaclc`](../../shapes/music.shaclc)

## Goal

Replace the app-specific `omp:` namespace with established vocabulary
(the standing "never invent predicates" rule), and model playlists and
releases each with the structure that genuinely fits.

## The model — Release and Playlist are NOT one structure

They were considered for unification, but they are genuinely different
and one structure cannot honestly serve both:

- **Release** — `mo:Release` (+ `dcat:Dataset`). Tracks are an
  *unordered* `mo:track` set; ordering is each track's intrinsic
  `mo:track_number`. A track sits at exactly one position on its one
  album — no per-list slot needed. A Release is **not** a
  `schema:ItemList`.
- **Playlist** — `schema:ItemList` + `schema:MusicPlaylist` (+
  `dcat:Dataset`). Tracks are an *ordered* `schema:itemListElement` →
  `schema:ListItem` sequence; each `ListItem` is a per-occurrence slot
  with `schema:position`. A playlist needs slots — ordering, arbitrary
  per-list positions, and the same track possibly appearing twice —
  none of which an unordered `mo:track` set can express.

The "release ≈ playlist" equivalence the app relies on is a **code-level
abstraction** (one parser yields a uniform ordered-track array from
either; one UI renders it), not identical triples. A `mo:Track` is the
shared leaf — a Release *owns* its tracks, a Playlist only *references*
them. Editability is not stored: it derives from the type (`mo:Release`
= read-only catalog) and auth context.

## Vocabulary decisions (all approved)

| Old | New |
|---|---|
| `as:OrderedCollection` (playlist type) | `schema:ItemList` + `schema:MusicPlaylist` |
| `omp:entry` | `schema:itemListElement` |
| (entry node, untyped) | `a schema:ListItem` |
| `omp:position` | `schema:position` (`xsd:integer`) |
| `omp:track` | `schema:item` |
| (order implicit) | `schema:itemListOrder schema:ItemListOrderAscending` |
| `omp:sourcePlaylist` | `dcterms:source` |
| `omp:localData` | removed — derived from `dcterms:source` |
| `omp:hidePlaylist` | `oa:styleClass "hidden"` |
| `dcat:downloadUrl` (track → file) | `mo:item` (multi-valued) |

Releases keep `mo:Release` / `mo:track` / `mo:track_number` unchanged —
that is correct Music Ontology and needs no migration. New prefixes:
`schema:` = `http://schema.org/`, `oa:` = `http://www.w3.org/ns/oa#`.
The `omp:` RDF namespace is fully retired (the unrelated `omp:`-prefixed
`localStorage` keys remain).

## Phase A — Playlists (SHIPPED 2026-05-21)

- `claude/migration-scripts/convert-playlist-vocab.mjs` converted the
  42 playlist files + `agents.ttl` (asserted `localData ⊆
  sourcePlaylist` before dropping `localData`).
- `src/ia-rdf.js` — namespaces, `PLAYLIST` → `schema:MusicPlaylist`,
  parsers, PUT-body templates, list-item minting (`schema:ListItem` +
  integer `schema:position`), `setPlaylistHidden`,
  `convertPlaylistToArtist`.
- `src/ia3.js` — no functional change (reads parsed object fields);
  comments updated.
- `installToPod` verified clean; `skills.md` vocab section updated;
  `music.shaclc` reworked.
- Verified: `claude/smoke-tests/smoke-test-vocab.mjs` (12/12, offline);
  build green.
- Residual: `music-example.ttl` + `music-shape*.mmd` not refreshed;
  server-dependent smoke tests / browser run not exercised here.

## Phase B — Music Ontology track→file link (SHIPPED 2026-05-21)

Done as **B1**: a `mo:Track` links its audio file(s) directly via
**`mo:item`** — the Music Ontology sub-property of `mo:available_as`
meaning the item holds the *full* track (vs `mo:preview` for a part).
**No `mo:Signal` node**: once the file link sits on the Track, a Signal
would carry nothing (omp never shares one recording across tracks), so
it was dropped. `mo:item` is multi-valued, so a track can offer several
formats; the conversion carried each track's existing single URL
across, and extra formats fill in as items are re-ingested.

```
<#t05> a mo:Track ; mo:track_number 5 ; mo:duration 213.0 ;
    mo:item <file.mp3>, <file.flac> .
```

- `claude/migration-scripts/convert-release-downloadurl.mjs` renamed
  `dcat:downloadUrl` → `mo:item` across the 312 release files (1914
  track links).
- `src/ia-rdf.js` — every `DCAT('downloadUrl')` read/write site and the
  release PUT-body template now use `mo:item`. `src/ia3.js` unaffected
  (it reads the parsed `url` field).
- `music.shaclc` / `music.shacl` — `TrackShape` uses `mo:item`
  (multi-valued).
- Verified: build green; offline vocab smoke test extended.

## Decision log

- 2026-05-21 — Vocab mapping approved; `omp:` retired. Playlist →
  `schema:ItemList` + `schema:MusicPlaylist` with
  `itemListElement`/`ListItem`/`position`/`item`/`itemListOrder`;
  `sourcePlaylist` → `dcterms:source`; `localData` eliminated;
  `hidePlaylist` → `oa:styleClass`.
- 2026-05-21 — Release/Playlist NOT unified into one structure
  (Option A): a Release stays `mo:Release` + `mo:track` +
  `mo:track_number` (unordered set, intrinsic numbering); a Playlist
  uses `schema:ItemList`/`ListItem` (ordered slots). `mo:track` can't
  order, position per-list, or hold duplicates — so it cannot back a
  playlist. The equivalence lives in code, not RDF.
- 2026-05-21 — Phase A shipped.
- Phase B re-scoped: no release restructure; only the track→file layer
  remains.
- 2026-05-21 — `mo:available_as` placement resolved: on the `mo:Track`
  (the manifestation — MO-domain-correct), not the `mo:Signal`.
- 2026-05-21 — Phase B done as **B1**: no `mo:Signal` node (it would be
  empty once the file link sits on the Track). Track→file is `mo:item`
  (sub-property of `mo:available_as`, "the full track"), multi-valued
  for multiple formats. `dcat:downloadUrl` retired. Phase B shipped.
