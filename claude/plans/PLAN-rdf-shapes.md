# Plan (revised): RDF shapes for ia-music.ttl

## Locked-in decisions

- **Artist credit**: `foaf:maker`, no `dcterms:publisher`. Range constrained to `foaf:Agent`. The Agent itself is typed with a specific subclass only when known (`mo:MusicArtist`, `mo:MusicGroup`, `mo:SoloMusicArtist`, `mo:Label`, `foaf:Organization`); otherwise plain `foaf:Agent`.
- **Vocabulary**: `dcterms:` throughout — `dc:rights` becomes `dcterms:rights`, `dc:title` is already `dcterms:title`, etc. `dc:` (Elements 1.1) is read-only legacy.
- **Release extras**: add `dcterms:date`, `dcterms:rights`, `foaf:depiction`, `schema:ratingValue`. Nothing else from the conversion.md "missing" list.
- **Track extras**: add `mo:bpm`, `schema:ratingValue`. Do NOT add `mo:composer`, `mo:disc_number`.
- **Duration**: `xsd:decimal` seconds (was `xsd:string`).
- **AudioFile layer**: stay flat — each Track has one `dcat:downloadUrl`. No `mo:available_as` blank nodes. Multiple formats per track is out of scope.
- **Agent reconciliation**: eager — at ingest, an artist string becomes an IRI to an `mo:MusicArtist` (or other Agent), deduped by name. Releases reference Agents by IRI, not literal.

## Shape summary

**Genre** — `skos:Concept` + `mo:Genre`. `skos:prefLabel`, `skos:topConceptOf`.

**Agent** (catalog row OR maker referenced from Release/Track) — `foaf:Agent` or subclass (`mo:MusicArtist` default; `mo:MusicGroup`, `mo:SoloMusicArtist`, `mo:Label`, `foaf:Organization` when known). Properties:
- `foaf:name` (required)
- `dcat:landingPage` (optional — IA collection URL, homepage, etc.)
- `mo:genre` (optional — repeatable)

**Release** — `mo:Release`. Properties:
- `dcterms:title` (required)
- `foaf:maker` → Agent (1..*)
- `mo:genre` (0..*)
- `dcat:landingPage` (0..1 — IA details URL)
- `dcat:downloadUrl` (0..1 — single-file albums; otherwise tracks carry the URLs)
- `dcterms:isPartOf` → Playlist (0..*)
- `mo:track` → Track (0..*)
- `dcterms:date` (0..1, `xsd:gYear` or `xsd:date`)
- `dcterms:rights` (0..1)
- `foaf:depiction` (0..*)
- `schema:ratingValue` (0..1)
- `rdfs:comment` (0..1)

**Track** — `mo:Track`, skolem IRI (not blank node). Properties:
- `dcterms:title` (required)
- `foaf:maker` → Agent (0..*)
- `mo:duration` (`xsd:decimal` seconds, 0..1)
- `mo:track_number` (`xsd:integer`, 0..1)
- `mo:bpm` (`xsd:decimal`, 0..1)
- `schema:ratingValue` (0..1)
- `dcat:downloadUrl` (0..1)

**Playlist** — `dctypes:Collection` + `mo:Playlist`. Properties:
- `dcterms:title` (required)
- `dcterms:description` (0..1)
- `dcterms:hasPart` (0..*, inverse of Release's `dcterms:isPartOf`)

## Forward fit for future imports

- **MP3 ID3 tags**: title→`dcterms:title`, artist→`foaf:maker` (mint Agent), album→Release `dcterms:title`, year→`dcterms:date`, genre→`mo:genre`, track#→`mo:track_number`, length→`mo:duration`, BPM→`mo:bpm`, comment→`rdfs:comment`, copyright→`dcterms:rights`, cover→`foaf:depiction`, rating→`schema:ratingValue`, file→`dcat:downloadUrl`. Composer / disc# / publisher / bitrate / sample-rate / MIME-type get dropped at import time per the decisions above.
- **Rhythmbox** (`~/.local/share/rhythmbox/rhythmdb.xml`): same mapping. play-count and date-added would need additional predicates if we want them later — not in scope now.
- **Multi-format catch**: when we eventually need it, add a `mo:available_as → mo:AudioFile` layer on Track alongside `dcat:downloadUrl`. The flat path stays valid; the layered path becomes additive. No reshuffling needed.

## Steps (this round)

**1. Shapes** — `drafts/music.shaclc`, `drafts/music.shacl`, `drafts/music-example.ttl` rewritten with the locked-in decisions. AgentShape added.

**2. Migration** — `migrate-music-ttl.js` revised:
- Restore from `ia-music.ttl.pre-migration`.
- Build name → catalog-URN map from existing `ui:Link` rows that are catalog (i.e. `dct:subject` is a regular genre).
- Catalog `ui:Link` rows become `mo:MusicArtist` Agents (as before).
- Favorites/Playlist `ui:Link` rows become `mo:Release` with `foaf:maker <urn:uuid:…>` (the catalog Agent URN) instead of `dcterms:publisher "Name"`. If the extracted name doesn't match any catalog row, mint a new local `<#Agent_Slug>` typed `mo:MusicArtist` with `foaf:name`.
- Inverse `dcterms:hasPart` on playlists, as before.

**3. `ia-rdf.js` read path** — `parseBookmarks` now reads `mo:MusicArtist` (and other Agent subclasses) for catalog rows, `mo:Release` for playlist/favorites entries. Returns the same `{ genres, bookmarks }` shape so the UI keeps working. `parsePlaylists` reads `mo:Playlist` instead of the old local `<#Playlist>` class.

**4. `ia-rdf.js` write path** — every mutation emits the new shapes:
- `addArtist` → `mo:MusicArtist` with `foaf:name` + `dcat:landingPage` + `mo:genre`.
- `addFavorite` / `addTrackToPlaylist` / `addTracksToPlaylist` → `mo:Release` with `dcterms:title` + `foaf:maker` (resolved against existing catalog Agents, minting new ones when needed) + `dcat:landingPage` + `dcat:downloadUrl` + `dcterms:isPartOf` + inverse `dcterms:hasPart` on the playlist.
- `addPlaylist` → `dctypes:Collection, mo:Playlist` with `dcterms:title`.
- Remove/rename/move helpers updated to use the right predicates.
- `isFavorited(trackUrl)` checks for a `mo:Release` with `dcat:downloadUrl <trackUrl>` and `dcterms:isPartOf <#Favorites>`.

Steps 5 (UI tweaks for richer rendering) and 6 (runtime SHACL validation) remain deferred.
