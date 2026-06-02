# Playlist metadata: maker / name / description — plan

**Status: IMPLEMENTED.** Shipped — playlist maker/description + combined
edit modal + `backfill-playlist-maker.js`. Plan kept for reference.

## Goal

A playlist gains four fields:

| Field | Predicate | Notes |
|---|---|---|
| name | `dcterms:title` | already present |
| maker | `foaf:maker` | new — the curator. String literal (e.g. "JZ"); the Music-Ontology shape wants an Agent IRI but a literal is pragmatic and matches how Release makers already fall back when there's no Agent match. |
| description | `dcterms:description` | new — free text. Already in the SHACLC shape, just unused. |
| tracks | `dcterms:hasPart` | already present |

**Display in the Sources column:** `name (maker)` when a maker exists,
otherwise just `name`. The description, when present, becomes the row's
`title` attribute (native hover tooltip).

Example playlist file after this change:

```turtle
<> a dctypes:Collection, mo:Playlist ;
   dcterms:title "Dance Mix" ;
   foaf:maker "JZ" ;
   dcterms:description "Late-night warehouse set, 2019" ;
   dcterms:hasPart <urn:uuid:…>, <urn:uuid:…> .
```

Sources row shows: **Dance Mix (JZ)**, hover → "Late-night warehouse
set, 2019".

## Touch points

| File | Change |
|---|---|
| `ia-rdf.js` `parsePlaylists` | Return `{ id, name, maker, description, label }`. `label = maker ? \`${name} (${maker})\` : name`. Missing maker/description handled (label falls back to name; no hover). |
| `ia-rdf.js` `addPlaylist` | Signature `addPlaylist(store, baseURI, { name, maker, description })` (string arg still accepted for back-compat → treated as name). PUT body includes `foaf:maker` / `dcterms:description` only when provided. |
| `ia-rdf.js` `renamePlaylist` | Becomes `updatePlaylistMeta(store, _baseURI, playlistId, { name, maker, description })` — replaces whichever of the three are supplied; PATCHes the playlist file. `renamePlaylist` kept as a thin wrapper (name-only) for existing callers. |
| `ia-ui.js` `createListbox` | Support an optional per-item `title` string → emit `title="…"` (escaped) on the `<li>`. Used for the description hover. Purely additive; other columns pass no title. |
| `ia3.js` `refreshSources` | `playlists.map(p => ({ id: p.id, label: p.label, title: p.description || '' }))`. |
| `ia3.js` `playlists[]` model | Each entry carries `name`, `maker`, `description`, `label` (not just `label`). Conversion/rename/delete code that reads `playlist.label` keeps working; rename now edits `name` and recomputes `label`. |
| `ia3.js` `addPlaylistBtn` | Prompt sequence: name (required) → maker (optional, blank ok) → description (optional). All via `prompt()`, consistent with the existing menu UX. |
| `ia3.js` `openSourceEditMenu` | "Rename…" → "Edit…" : prompts for name (default current), maker, description. Calls `updatePlaylistMeta`. On success recompute `playlist.label`, `refreshSources()`. |

## `playlist.label` vs `playlist.name`

Today `playlist.label` is both the stored title and the display string,
and rename does `playlist.label = next.trim()`. After this change they
diverge: `name` is the editable title, `label` is the composed display
(`name (maker)`). Every site that currently reads `playlist.label` for a
prompt/confirm message (rename, convert, delete) should read
`playlist.name` instead so the user sees the bare title, not
"Name (maker)", in those dialogs. ~6 call sites, mechanical.

## Edge cases

- **Existing playlists** (e.g. Nosaj Thing) have only `dcterms:title`.
  `parsePlaylists` → `name = "Nosaj Thing"`, `maker` undefined →
  `label = "Nosaj Thing"`, no hover. No migration needed.
- **Quotes / angle brackets** in maker or description → `escapeHTML`
  for the `title` attribute (createListbox already escapes the label;
  apply the same to the new title).
- **Maker as a literal** technically fails the `foaf:maker → foaf:Agent`
  SHACL constraint. Acceptable and consistent with current Release
  behavior; note it. A later reconciliation pass could promote curator
  literals to Agents if we ever want playlist-curator entities.
- **Convert-to-artist** already derives the artist name from the
  playlist title; unaffected. It ignores `maker`/`description` (a
  playlist's curator isn't the music's artist).
- **Empty name on edit** → keep the old name (no-op), like the current
  rename guard.

## Steps + time estimates

| # | Step | Time |
|---|---|---|
| 1 | `parsePlaylists` returns name/maker/description/label | 15m |
| 2 | `addPlaylist` accepts `{name,maker,description}`; PUT body | 20m |
| 3 | `updatePlaylistMeta` + `renamePlaylist` wrapper | 25m |
| 4 | `createListbox` optional per-item `title` attr | 15m |
| 5 | `refreshSources` + `playlists[]` model (name/maker/description/label); fix `playlist.label`→`playlist.name` in prompts | 25m |
| 6 | `addPlaylistBtn` 3-prompt sequence | 15m |
| 7 | `openSourceEditMenu` Rename→Edit (name/maker/description) | 25m |
| 8 | Build + smoke test (create w/ maker+desc → reload → label + hover correct; edit; back-compat with metadata-less playlists) | 20m |

**Total ≈ 2.3 hours focused.**

## Risks

- Low. Additive RDF (two optional predicates), one additive listbox
  feature, mechanical `label`→`name` swaps in prompt strings. No
  migration. The multi-file PATCH path for the playlist file already
  works (rename uses it today).

## What does not change

- Track add/remove, dedup, convert-to-artist, the multi-file layout.
- Other columns' listbox rendering (title attr is opt-in).
- localStorage / library config.
