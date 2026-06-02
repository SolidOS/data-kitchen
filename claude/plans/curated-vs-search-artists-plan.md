# Plan: distinguish curated vs search-based artists

Status: **IMPLEMENTED** (2-tier curated-vs-raw). Presentation-only,
read-only — no data-model change, no migration, no pod writes.

Curated = `localData` OR `sourcePlaylist` OR the artist's name/maker
matches a curated playlist's `dcterms:title`/`foaf:maker`
(case-insensitive). The last clause was added because un-converted
agents (e.g. Madlib) are archive.org-search stubs yet have a curated
playlist of that name — the user considers those curated. Possible
follow-up: slug-insensitive name match if title↔name spacing differs.

## 1. Goal

In the Artists column, visually separate **curated** artists (backed by
RDF the user manually curated) from **search-based** artists (albums /
tracks fetched live from archive.org by name). Search-based artists
sort **after** curated ones and render in a **less prominent but still
accessible** style — never hidden, always clickable.

## 2. Classification (from the loaded store, per Agent)

Signals already in `agents.ttl` (no new data):
- `omp:sourcePlaylist <playlist>` → **curated (playlist-derived)** —
  the artist *is* a manually curated playlist.
- `omp:localData true`, no `sourcePlaylist` → **catalogue (RDF-backed)**
  — albums/tracks come from `releases/*`, not search.
- neither → **search-based** — `getLocalArtistAlbums` finds nothing in
  RDF, so albums/tracks resolve via `ia-utils.js` archive.org search by
  `foaf:name`.

Precedence: `sourcePlaylist` → curated even if `localData` also set.

**Open decision (Q):** 2-tier or 3-tier?
- **2-tier (recommended):** {curated ∪ catalogue} = "known", shown
  normally; {search} = de-emphasized. Matches the user's ask
  ("curated vs search") and is the simplest honest split.
- **3-tier:** playlist-curated (most prominent) · catalogue (normal) ·
  search (muted). More faithful but more visual noise.

## 3. Where it changes

- **`ia3.js`** (artist aggregation / `refreshArtistsColumn`): tag each
  artist item with `kind: 'curated'|'catalog'|'search'`, derived once
  from `store.any(agent, OMP('sourcePlaylist'))` /
  `store.holds(agent, OMP('localData'), true)`. Cheap, render-time,
  read-only.
- **Sort:** within the selected genre, stable-sort `kind` rank
  (curated/catalog before search), alphabetical within each group —
  preserve the current ordering inside a group.
- **`ia-ui.js`** (`createListbox`): support a per-item class and an
  optional non-interactive **section divider** row ("Search results").
  Small, additive hook; reuse existing listbox rendering.
- **`ia.css`**: a `.ia-artist--search` class → muted text using the
  existing `--text-muted` token (already used by `sol-login`), plus the
  divider style. No layout change.

## 4. Accessibility (the part to get right)

"Less prominent but still accessible" must not become **colour-only
meaning** (fails WCAG 1.4.1 + colour-blind/screen-reader users):
- Keep contrast for the muted rows at **≥ 4.5:1** (they're interactive —
  don't go ghostly); `--text-muted` (#666 on light) ≈ 5.7:1, OK. Verify
  in the dark theme too.
- Pair colour with a **structural cue**: a section header/divider row
  ("Curated" / "From search") and/or an `aria-label` suffix on
  search-based rows (e.g. "(search result)"). That way the distinction
  survives greyscale, high-contrast mode, and screen readers.
- Keep full keyboard/listbox semantics for the muted rows (same
  `role=option`, tab order); only the visual weight differs.

## 5. Edge cases

- Agent with both `sourcePlaylist` + `localData` → curated (precedence).
- Search-based artists still have `mo:genre`, so they appear under the
  right genre — just at the end, muted.
- No genre selected / library cascade: apply the same split in whatever
  artist list is shown.
- Favorites / playlist *sources* columns unaffected (this is the
  Artists column only).
- A genre with only search-based artists: show them (muted) — the
  divider header is optional/suppressed if a group is empty.

## 6. Risks / commentary

- **Lowest-risk of the recent plans:** purely presentation + a derived
  flag. No writes, no migration, no pod/auth surface, no schema change.
  Reversible by reverting CSS/JS. Smokes already cover parsing; add a
  tiny unit asserting the classifier (sourcePlaylist/localData/neither →
  expected kind).
- **Colour-only is the one real trap** — §4 must ship with the
  structural cue, not just a class. If only one thing lands, it should
  be the divider/section, not the colour.
- **Taxonomy honesty:** "curated" should mean *user-curated*. Pure
  `localData` catalogue artists (the bundled IA catalogue) are
  RDF-backed but not necessarily *user*-curated — hence the 2-tier vs
  3-tier question. Don't silently label shipped-catalogue artists as
  "curated by you"; the 2-tier "known vs search" framing avoids
  overclaiming.
- **Composes with** the shared-releases plan (both reason about
  "known/RDF-backed vs search"), but is independent and can ship first;
  it doesn't depend on that refactor.
- **Perf:** classification is O(artists) reads from an already-loaded
  store at render — negligible.

## 7. Recommendation

Do it — it's cheap, safe, and genuinely useful for signalling data
provenance. Ship the **2-tier** split first (known vs search) with a
**section divider + muted colour + aria cue** (not colour alone).
Treat 3-tier and a "hide search results" toggle as easy follow-ups once
the basic split is in. The only firm guidance: never encode the
distinction in colour alone, and don't mislabel the shipped catalogue
as "user-curated."
