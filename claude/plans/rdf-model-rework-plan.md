# Plan: RDF relationship remodel (release identity, catalog edges, playlist order)

Status: **IMPLEMENTED on dev data 2026-05-19 — P1+P2+P3+P4 all shipped.**
(stepped-back review 2026-05-18 → built 2026-05-19). Chunk A (P1+P3)
and Chunk B (P2+P4) applied in one combined `migrate-rdf-rework.js`
pass; `ia-rdf.js` read/write paths on the new model; validator +
content-conservation guard + full smoke suite green; dev bundle
rebuilt. **Pod NOT updated** (user-scoped out — consistent with the
deferred shared-releases Ph5). See §Post-implementation.

Companion to `shared-releases-plan.md` — shared the root cause (P1).
That plan's Ph1/Ph2 `dcat:landingPage` sync hazard is now **retired**:
releases.ttl is seeAlso-only and the dedup key is `dcterms:identifier`
in the release file (regenerable, no hand-sync).

---

## Current model (as built)

- **index.ttl** — `:Library`; `rdfs:seeAlso` → agents/genres/releases
  + every playlist file.
- **releases.ttl** — `rdfs:seeAlso` → each `releases/<slug>` doc,
  **plus** a parallel hand-maintained list of
  `<slug> dcat:landingPage <archive.org/details/…>` dedup keys
  (the "# --- Phase 1 ---" comment blocks).
- **releases/<slug>$.ttl** — `<urn:uuid:…> a mo:Release`;
  `dct:title`; `mo:track → <urn:uuid:…>`; `dcat:landingPage`;
  `foaf:maker → <artist urn:uuid:…>`. Tracks:
  `a mo:Track; dct:title; mo:duration; dcat:downloadUrl`.
- **agents.ttl / genres.ttl** — `mo:MusicArtist` (uuid) /
  `skos:Concept, mo:Genre`.
- **playlists/<name>$.ttl** — `mo:Playlist; dcterms:hasPart →
  <track urn:uuid:…>` (pointer-only since `shared-releases-plan.md`
  Ph4). Track triples live in the release file; the app resolves the
  owning release by a reverse `mo:track` scan over the loaded store.

It works. Four relationships are modeled in ways that fight us,
ordered by payoff.

---

## RDF authoring conventions (apply to EVERY rewrite below)

From `rdf-how2.md` — these are house rules for all emitted Turtle, and
every migration pass below is also the chance to bring rewritten files
into compliance (current data violates 1 & 4):

1. **No `mo:Playlist`** — it is not a real term. A playlist is
   `dctypes:Collection` only. (P3 rewrites every playlist → drop the
   `, mo:Playlist` there.)
2. **CURIEs for every subject & predicate IRI** (declare a `@prefix`),
   *except* URNs (`urn:uuid:…` stays full — but P1 removes the only
   URN subjects anyway).
3. **Style:** subject alone on its line; `a <type> ;` then each
   predicate indented; space before `;` and `.`; blank line after each
   subject block's closing `.`.
4. **Relative URLs for everything under `./libraries`** — declare
   `@prefix releases: <./releases/> .`, write `<./releases.ttl>
   rdfs:seeAlso releases:slug .`. Never absolute `http://localhost…`
   IRIs in stored data. External IRIs (archive.org) stay absolute.

So the P1 "after" data, in house style:
```
# releases.ttl  — index edge ONLY (regenerable, not authored)
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix releases: <./releases/> .

<./releases.ttl>
    rdfs:seeAlso releases:wutang_forever .

# releases/wutang_forever$.ttl
@prefix agents: <../agents.ttl#> .

<#it>
    a mo:Release ;
    dct:title "Wu-Tang Forever" ;
    dcterms:identifier "wu-tang-clan-wu-tang-forever_202401" ;
    dcat:landingPage <https://archive.org/details/wu-tang-clan-wu-tang-forever_202401> ;
    mo:track <#t01>, <#t02> ;
    foaf:maker agents:a1 .
```

---

## P1 — Collapse dual release identity; split the dedup key from `landingPage`

**Problem.** A release has two IRIs: the document slug
(`…/releases/wutang_forever`, used in releases.ttl) and an internal
`<urn:uuid:…>` (the actual `mo:Release` subject). Nothing outside the
file references the uuid. Meanwhile `dcat:landingPage` is overloaded:
it is both the human "page about this" *and* the canonical
Internet-Archive dedup identity. So it is written **twice** — on the
slug in releases.ttl and on the uuid in the file — and the two must be
hand-kept in sync. That sync **is** the Phase-1/Phase-2 comment
sections of releases.ttl and the validation burden in
`validate-shared-releases.mjs`.

**Change.**
- The release entity IRI *is* the document IRI. Drop the per-release
  `urn:uuid:`. Subject becomes `<…/releases/wutang_forever#it>` (hash)
  or the bare doc IRI.
- Add a dedicated identity property for the Archive item, distinct
  from the human page:
  - `dcterms:identifier "wu-tang-clan-wu-tang-forever_202401"` — the
    bare IA identifier, **or**
  - `omp:archiveItem <https://archive.org/details/…>`.
- Keep `dcat:landingPage` for its real meaning (human page) only.

Before:
```
# releases.ttl
<…/releases/wutang_forever> dcat:landingPage <https://archive.org/details/wu-tang-clan-wu-tang-forever_202401> .
# releases/wutang_forever$.ttl
<urn:uuid:226c8e7e-…> a mo:Release; dct:title "Wu-Tang Forever";
    mo:track <urn:uuid:…>, … ; dcat:landingPage <…/details/…> ;
    foaf:maker <urn:uuid:…> .
```
After: see the house-style block in "RDF authoring conventions"
above — `<#it> a mo:Release` with `dcterms:identifier`, relative
`releases:`/`agents:` CURIEs, no `urn:uuid:`, regenerable
`releases.ttl`.

**Payoff.** Dedup is a one-property lookup over the loaded store
(`?r dcterms:identifier ?id`) — no parallel triples, no hand-sync.
**releases.ttl becomes a derived artifact** (regenerable from the
`releases/` container's seeAlso closure) rather than a hand-authored
one — the index/file drift hazard `shared-releases-plan.md` is
guarding against simply disappears.

**Touches.** `ia-rdf.js` release-resolution + dedup
(`addTracksToPlaylist` resolve-by-landingPage → resolve-by-identifier;
`uniqueReleaseSlug` unaffected); the reverse `mo:track` playlist
resolution (P3 supersedes it). One-shot migration: per file, rewrite
`urn:uuid:` release subject → `#it`, add `dcterms:identifier` from the
existing landingPage tail, rewrite intra-file `mo:track` /
`foaf:maker` object IRIs, regenerate releases.ttl. Track UUIDs are
NOT touched here (see P3) so playlists keep resolving mid-migration.
Risk: medium (rewrites every release file + the resolver); fully
offline-validatable against a backup the way Ph4 was.

---

## P2 — Use DCAT for the catalog edges instead of `rdfs:seeAlso`

**Problem.** `rdfs:seeAlso` is a weak "might be relevant" hint, but
it is carrying *structural containment*: library→agents/genres/
releases, releases.ttl→each release, and releases.ttl self-`seeAlso`
for migrated entries. There is no predicate-level distinction between
"is a member of this catalog" and "see also."

**Change.** Model the catalog with DCAT, which fits this shape
natively:
- `index.ttl` — `<lib> a dcat:Catalog`.
- release index — `<lib> dcat:dataset <…/releases/slug>`.
- release — `<#it> a dcat:Dataset, mo:Release`.
- track download — `dcat:distribution [ dcat:downloadUrl … ]`
  (or keep `dcat:downloadUrl` directly on the Track; lighter).

Keep `rdfs:seeAlso` only where it is genuinely "see also"
(agents/genres cross-refs). The recursive loader in `ia-rdf.js`
(currently "follow `seeAlso`") learns one more predicate
(`dcat:dataset` / a configurable include-list) — small, localized.

**The library stays unordered (`dcat:Catalog`), not an
`as:OrderedCollection`.** A catalog has no intrinsic order — its
ordering is a UI *view* concern (sort by artist/title/date), not
data. Making it ordered would force minting and renumbering position
integers across hundreds of releases to encode an order with no
semantic meaning. The model's uniformity comes from the shared P3
`dcterms:isPartOf` spine, **not** from forcing both containers to the
same collection type; only playlists are `Ordered`.

**`dcterms:isPartOf` (P3) is additive for query/resolution and does
NOT replace this forward index edge.** The loader cannot follow
`isPartOf`: that triple lives in the leaf release file, which is not
fetched until the loader already knows to fetch it. So the forward,
in-the-index-document edge (`dcat:dataset`, or `seeAlso`) is what
*drives loading*; `isPartOf` is what resolves containment *once
loaded*. Both are needed; they are not redundant.

**Payoff.** Standard vocabulary → standard tooling; the loader's
"what do I fetch" edge is semantically honest. Mostly an additive
relabel; can run as dual-predicate (emit both, read both) for a
release window, then drop `seeAlso` once nothing depends on it.

**Touches.** `ia-rdf.js` loader predicate set + index-write helpers;
SHACL shapes in `drafts/music.shaclc`. Risk: low–medium (loader is
load-bearing; dual-predicate transition de-risks it). Independent of
P1 but cleaner done after P1 (so the index is already regenerable).

---

## P3 — Universal `dcterms:isPartOf` structural spine + explicit playlist order

**Problem.** Two distinct losses:
1. **Resolution.** A playlist member (`dcterms:hasPart → track-uuid`)
   has no edge to its release. The app finds the owner by scanning
   reverse `mo:track` across whatever release files happen to be
   loaded — so a playlist is meaningless unless the right files are
   present, and it is an O(store) scan per member.
2. **Order.** `dcterms:hasPart` is an unordered bag. **A playlist's
   track order is currently not represented at all** — it survives
   only as incidental serialization order.

**Change.**
- **One universal structural inverse — `dcterms:isPartOf` — for the
  whole containment spine:** `track dcterms:isPartOf release`
  *and* `release dcterms:isPartOf <./index.ttl#it>` (the library).
  From any node you walk to its container with the same predicate,
  recursively (track → release → library). This replaces *both* the
  reverse-`mo:track` scan *and* (for query/resolution) the
  `dcat:dataset` traversal with a single resolution rule.
  - **Keep `isPartOf` single-valued and structural only.** A track is
    structurally part of exactly one release; a release of one
    library. Playlist membership is **not** modeled with `isPartOf` —
    a track is *curated into* a playlist, not "part of" it, and
    forcing it through `isPartOf` would make the predicate
    multi-valued and destroy the clean one-hop "walk to my single
    container" guarantee. Playlist → track stays a **separate forward
    membership edge** (below).
- **Playlist type → `as:OrderedCollection`** (not `dctypes:Collection`
  alone; rdf-how2 only bans `mo:Playlist`, and an ordered collection
  is exactly what a playlist is). The *type* is the standard label;
  the *ordering mechanism* is the real decision and is independent of
  it. In RDF, `as:OrderedCollection` does not give ordering for free —
  it bottoms out in either an `rdf:List` (clean, but painful to
  edit-in-place over Solid PATCH) or explicit position integers.
  Choose **explicit positions** for PATCH-friendliness:
  `<pl> a as:OrderedCollection ; omp:entry [ omp:position 1 ;
  omp:track releases:slug#t01 ]` (add/remove/reorder = single-triple
  PATCH, matching the existing pointer-edge write model). Renaming
  `omp:entry`/`omp:position` to `as:` equivalents only if it buys
  real interop; otherwise keep the omp terms under the `as:` type.
- The library stays unordered (see P2) — its order is a UI *view*
  concern, not data; only playlists are `Ordered`.

**Payoff.** Playlists become self-resolving and order-stable, and the
**entire model collapses to one upward-resolution rule** (`isPartOf`,
recursive) plus one ordered forward membership edge. Removes the most
fragile read path in the app (`parseBookmarks` reverse-`mo:track`
scan) and the separate `dcat:dataset` traversal for resolution.

**Touches.** `ia-rdf.js` `parseBookmarks` (resolution + ordering),
`addTracksToPlaylist` / `removeTrackFromPlaylist` (write
position triples), playlist render (consume order). Migration:
backfill `track dcterms:isPartOf release` into every release file
(derive from existing intra-file `mo:track`) **and** `release
dcterms:isPartOf <./index.ttl#it>` into each release file; backfill
`omp:position` onto existing `hasPart` from current serialization
order (best-effort — this is the one bit of ordering info we can
never perfectly recover, so do it once, carefully, and let the user
spot-check). The playlist rewrite is **the** moment to also apply
convention 1 (strip `, mo:Playlist`; type becomes
`as:OrderedCollection`) and convention 4
(relativize the absolute `…/playlists/…` and `urn:uuid:` IRIs that
remain). Risk: medium
(rewrites playlists + release files + the core read path). Best done
**with or after P1** (both rewrite release files — combine the passes).

---

## P4 — Track-level artist / performer (smallest, optional)

**Problem.** `foaf:maker` sits only on the Release. Per-track guests
("feat."), and Various-Artists compilations (there is a
`Various_Blues_Artists` playlist) cannot be expressed; `wutang_forever`
lists 2 release makers but track-level guests are lost.

**Change.** Allow `foaf:maker` (or `mo:performer`) on `mo:Track`,
falling back to the Release maker when absent. Purely additive — no
migration; backfill opportunistically when known.

**Payoff.** Correct VA / featured-artist modeling. Low priority,
zero-risk, do anytime.

**Touches.** `ia-rdf.js` artist-resolution fallback; `music.shaclc`;
the Edit-track-metadata path (`PLAN-edit-track-metadata.md`) gains a
per-track artist field naturally.

---

## Lower-priority hygiene (not phased)

- `omp:sourcePlaylist` / `omp:localData` is provenance — `prov:
  wasDerivedFrom` / `dcterms:source` say it in a standard vocab.
- Playlist files spell out full `<http://purl.org/dc/terms/title>`
  despite declaring `dcterms:` — cosmetic, fix on next rewrite pass.

## Sequencing & interaction with shared-releases

```
P1  ─┐ (collapse identity; releases.ttl becomes derived)
     ├─ combine release-file rewrite passes
P3  ─┘ (track→release edge + playlist order)
P2     (DCAT edges — after P1 so the index is already regenerable)
P4     (anytime, additive, zero migration)
```

- **P1 directly retires the sync hazard** `shared-releases-plan.md`
  Ph1/Ph2 manage. If P1 ships, revisit whether that plan's deferred
  Ph3 refcount needs the landingPage index at all.
- P1 + P3 both rewrite every `releases/<slug>` file — do them in one
  migration pass to halve the rewrite/validate cost.
- Each phase ships behind the same offline-validate-against-backup
  discipline used for Ph4 (`validate-shared-releases.mjs` extended
  with the new invariants: one identity per release, no `urn:uuid:`
  release subjects, every Track has exactly one `dcterms:isPartOf`
  (its release), every release has exactly one `dcterms:isPartOf`
  (the library), every playlist is an `as:OrderedCollection` with a
  unique integer `omp:position` per entry).

## Actionable plan

Two chunks. Ship **Chunk A** then **Chunk B**; all four phases land
eventually. Same discipline as `shared-releases-plan.md` Ph4:
one timestamped backup dir per chunk, build the migration as an
idempotent `migrate-*.js`, dry-run against a copy, extend
`validate-*.mjs` with the new invariants, keep the full
`smoke-test-rdf-*.mjs` suite green before touching dev data.
Rollback = restore the backup dir (Ph4 pattern).

### Chunk A — P1 + P3 (one combined release-file rewrite pass)

- **A0.** Backup `.pre-rdfrework-<ts>/` = full `libraries/<lib>/`
  (releases/ + playlists/ + releases.ttl + index.ttl).
- **A1. `migrate-rdf-rework.js`** (idempotent), per `releases/<slug>`:
  - release subject `urn:uuid:…` → `<#it>`; type stays `mo:Release`.
  - add `dcterms:identifier` = IA id parsed from the existing
    `dcat:landingPage` tail; keep `landingPage` (human page).
  - each track `urn:uuid:…` → `<#tNN>` (NN = serialization order,
    zero-padded); add `<#tNN> dcterms:isPartOf <#it>`.
  - add the upward spine link `<#it> dcterms:isPartOf
    <../index.ttl#it>` (release → library).
  - `foaf:maker` objects → `agents:` CURIE (`@prefix agents:
    <../agents.ttl#>`); strip absolute `…/libraries/…` IRIs →
    relative per convention 4; serialize in house style (conv. 3).
  - **build a `urn:uuid: → (slug, #tNN)` map** while rewriting — P3's
    playlist pass needs it.
- **A2. Playlist rewrite** (same script, second pass): for each
  `playlists/<name>`: type becomes `as:OrderedCollection` (drop
  `mo:Playlist` *and* `dctypes:Collection`, conv. 1); resolve every
  `dcterms:hasPart <urn:uuid:>` via the A1 map → emit ordered
  `<pl> a as:OrderedCollection ; omp:entry [ omp:position N ;
  omp:track releases:slug#tNN ]` from current serialization order;
  drop the bare `hasPart`; relativize remaining absolute IRIs
  (conv. 4); house style. (Playlist→track stays a forward membership
  edge — NOT `isPartOf`.)
- **A3.** Regenerate `releases.ttl` from the `releases/` `seeAlso`
  closure ONLY — delete the hand-maintained `landingPage` dedup
  blocks (now derived/unneeded). Relative `releases:` CURIEs.
- **A4.** Extend `validate-shared-releases.mjs` (or a new
  `validate-rdf-rework.mjs`): invariants — 0 `urn:uuid:` release
  subjects; exactly one `dcterms:identifier` per release & globally
  unique; every Track has exactly one `dcterms:isPartOf` (its
  release); every release has exactly one `dcterms:isPartOf` (the
  library, `../index.ttl#it`); every playlist is
  `a as:OrderedCollection` with a unique integer `omp:position` per
  entry and no `dcterms:hasPart`/`mo:Playlist`; 0 dangling
  `omp:track`; 0 absolute `…/libraries/…` IRIs in stored data.
- **A5.** Dry-run A1–A3 into a scratch copy; mechanical diff vs
  backup; **user spot-checks playlist ordering** on 2–3 known
  playlists (the one irrecoverable bit).
- **A6. `ia-rdf.js`:** dedup/resolution `landingPage` →
  `dcterms:identifier`; `parseBookmarks` — replace the reverse-
  `mo:track` scan with the one-hop `omp:entry`→`omp:track`→
  (track) `dcterms:isPartOf`→release resolution **and** consume
  `omp:position` for order; treat the playlist type as
  `as:OrderedCollection`; `addTracksToPlaylist`/
  `removeTrackFromPlaylist` write/drop `omp:entry`+`omp:position`
  (renumber on remove); index-write helpers stop emitting the
  `landingPage` dedup triple; index loader unchanged (still
  `seeAlso` — the forward loader edge, NOT `isPartOf`).
  `uniqueReleaseSlug` unaffected.
- **A7.** Full smoke suite green offline → run migration on dev data
  → re-validate (A4) → manual UI pass (load library, play a
  playlist in order, add/remove a track, edit metadata).
- **A8.** Update `INDEX.md` (P1+P3 → Implemented); cross-ref
  `shared-releases-plan.md` (Ph1/Ph2 sync hazard retired — note Ph3
  refcount no longer needs the landingPage index); refresh
  `music.shaclc` + the `music-shape*.mmd` diagrams.

### Chunk B — P2 + P4 (additive, dual-predicate transition)

- **B1.** `ia-rdf.js` index writers **dual-emit**: alongside
  `rdfs:seeAlso`, write `dcat:dataset` (releases) / `<lib> a
  dcat:Catalog`; loader's include-edge set learns `dcat:dataset`
  (reads both during the window).
- **B2. `migrate-dcat-edges.js`** (idempotent, additive): add
  `a dcat:Catalog` / `dcat:dataset` / `a dcat:Dataset` to existing
  index + release files; **keep `seeAlso`** for the release window.
- **B3. P4:** allow `foaf:maker` on `mo:Track`; `ia-rdf.js` artist
  resolution falls back Track→Release when absent; add the per-track
  artist field to the Edit-track path (`PLAN-edit-track-metadata.md`);
  no migration (backfill opportunistically). Update `music.shaclc`.
- **B4.** Validate + full smoke green; run on dev data.
- **B5.** After one clean release window with nothing reading
  `seeAlso` for catalog membership, a final `migrate-drop-seealso.js`
  removes the now-redundant structural `seeAlso`; loader drops the
  `seeAlso` include path. Update `INDEX.md` + diagrams.

Each step above is independently revertible; A and B are independent
(B does not depend on A, but doing A first means B emits DCAT over an
already-regenerable index).

## Decision needed — RESOLVED

User approved full scope and "do all the remaining". Chunks A **and**
B were combined into one `migrate-rdf-rework.js` pass (re-running from
the pristine A0 backup each iteration), rather than the staged
dual-predicate window B1/B2/B5 — acceptable because this is dev data
with backups, no live pod (B5's seeAlso-drop is therefore moot:
`rdfs:seeAlso` is **kept** on the index doc node as the loader anchor;
`dcat:dataset` was *added* on `<#it>`, not used to replace seeAlso).

## Post-implementation (2026-05-19)

**Shipped:** P1 (identity = doc `<#it>`, `dcterms:identifier` dedup
key, `releases.ttl` seeAlso-only/derived), P2 (`<index.ttl#it> a
dcat:Catalog` + `dcat:dataset` spine target; releases also
`dcat:Dataset`; loader follows `seeAlso` *and* `dcat:dataset`), P3
(`dcterms:isPartOf` spine track→release→catalog; playlists
`as:OrderedCollection` with `<#eNN>` `omp:entry`/`omp:position`/
`omp:track`), P4 (per-track `foaf:maker` — read-side fallback +
`updateTrackMeta` write already existed; now in SHACL).

**Deviations from the staged plan, and why:**
- A+B combined in one migration, re-run from the A0 backup — simpler
  and safe on dev data; no dual-predicate release window needed.
- `seeAlso` retained as the loader's forward edge (B5 drop **not**
  done) — the plan itself flagged `isPartOf`/`dcat:dataset` cannot
  replace the loader edge; keeping it is correct, not debt.
- Hash-IRI playlist entries `<#eNN>` (not blank nodes) — user choice,
  PATCH-friendly.
- Runtime new-release path types `dcat:Dataset` + writes the
  `dct:identifier`/`isPartOf` spine, but does **not** add a
  `<#it> dcat:dataset` edge to index.ttl per add (would be a new
  failure-prone PATCH path); `releases.ttl` `seeAlso` still indexes
  it and `index.ttl` `dcat:dataset` is regenerable. Minor known
  follow-up, not a correctness gap.
- **Pod not updated** (user scoped out; matches deferred Ph5).

**Two serializer bugs caught by the gates (fixed, then re-run from
pristine):** (1) releases with no `foaf:maker` emitted invalid
`foaf:maker .` — caught by A4 validator before any real write;
(2) `serialisePlaylist` dropped `omp:hidePlaylist` (22 hidden
converted-artist playlists reappeared) — caught in the running UI.
Both motivated the new **`check-triple-conservation.mjs`** guard
(identity-aware content diff: every release/track/playlist's
titles, durations, download URLs, ordered membership, and *all*
literal flags conserved backup→migrated).

**Build gotcha:** the app runs the bundled `dist/ia-player.js`; any
`ia-rdf.js`/`ia3.js`/`ia-ui.js` edit needs `node build.js` or the
browser runs stale code. Bundle rebuilt.

**Artifacts:** `migrate-rdf-rework.js`, `validate-rdf-rework.mjs`,
`check-triple-conservation.mjs`; `ia-rdf.js.pre-rdfrework` backup;
pristine data backup `libraries/internet_archive_music/`
`.pre-rdfrework-2026-05-19T00-45-46-538Z`. Smoke `smoke-test-rdf-
catalog.mjs` + `smoke-test-shared-write.mjs` rewritten to the new
model; SHACL `music.shaclc` + `music-shape.mmd` updated;
`music-shape-track-route.mmd` marked superseded.

## Follow-up refactor 2026-05-19b — recursive DCAT spine, NO rdfs:seeAlso

User pushed further: eliminate `rdfs:seeAlso` entirely and make the
load mechanism *be* the semantic structure. **Shipped.** This
**supersedes** the "seeAlso retained as loader anchor / B5 moot"
notes above — there is now no `rdfs:seeAlso` anywhere in the library.

Final structure:
- `<index.ttl#it> a dcat:Catalog` — `dcat:catalog` → `releases.ttl#it`,
  `playlists.ttl#it`; `dcat:dataset` → `agents.ttl#it`;
  `dcat:themeTaxonomy` → `genres.ttl#Music`.
- `<releases.ttl#it> a dcat:Catalog ; dcat:dataset` → each
  `releases/<slug>#it`. **NEW `<playlists.ttl#it> a dcat:Catalog ;
  dcat:dataset`** → each playlist (playlists were previously
  seeAlso'd individually from index.ttl).
- `<agents.ttl#it> a dcat:Dataset` ("Artists" — the file is the
  dataset; agents NOT enumerated, so no re-duplication). `genres.ttl`
  `<#Music> a skos:ConceptScheme` (was `skos:Concept` — `themeTaxonomy`
  range is `ConceptScheme`; per-genre `skos:topConceptOf <#Music>`
  unchanged and now exactly correct; genre read path matches
  `?g skos:topConceptOf <#Music>`, not Music's type, so unaffected).
- Each release `dct:isPartOf <../releases.ttl#it>` (its *direct*
  catalog, not the top index). Each playlist `a as:OrderedCollection,
  dcat:Dataset ; dct:isPartOf <../playlists.ttl#it>`.
- Loader follows `dcat:catalog`/`dcat:dataset`/`dcat:themeTaxonomy`
  (+ `rdfs:seeAlso` still honoured for flat/pre-rework libs) on both
  the doc and its `#it`. `createLibrary` skeleton, `addPlaylist`/
  `removePlaylist` (→ `playlists.ttl#it dcat:dataset`),
  `addTracksToPlaylist` (→ `releases.ttl#it dcat:dataset`, release
  spine → `releases.ttl#it`), `uniquePlaylistSlug`/`uniqueReleaseSlug`
  all moved off `seeAlso`. Why agents→`dcat:dataset` not
  `dcat:themeTaxonomy`: that predicate's range is `skos:ConceptScheme`
  and agents are `foaf:Agent`s, not a concept scheme — typing
  `agents.ttl` itself as one Dataset is correct and avoids per-agent
  enumeration duplication.

Verified (restore-from-A0 → migrate → validate → conserve → smoke →
rebuild → probe): validator PASS (incl. new catalog/scheme/dataset
invariants), conservation PASS, 8/8 smoke PASS, probe shows 259 docs
loaded with **0 seeAlso edges**, 31 playlists/22 hidden, genres+
bookmarks intact. Pod still untouched.

## Considered & rejected: one file per Track

Raised 2026-05-19 ("split tracks out too — mpegs will mostly come in
tracks"). **Rejected unless write-contention is *measured*.** Don't
re-litigate without that evidence.

Idea: each Track its own resource (`tracks/<id>` or
`releases/<slug>/<tNN>`) instead of a `<#tNN>` fragment inside the
release file, mirroring the release/playlist splits.

Reasons not to:

1. **Cold-load fan-out.** 1700 tracks → 1700 files; the recursive
   `seeAlso`/`dcat:dataset` loader would fetch ~1700 resources per
   library load vs ~223 release files + index. Over a pod that's an
   order-of-magnitude more round trips — the exact fan-out the
   libraries-layout → shared-releases arc exists to bound.
2. **Re-introduces the P1 sync hazard one level down.** Rendering an
   album/list without N track GETs needs an index inlining track
   summaries → duplicated, hand-synced data = the `releases.ttl`
   landingPage hazard P1 just killed. The release file is today the
   natural zero-duplication aggregate (tracks present exactly once).
3. **Album atomicity.** A 22-track release is one PUT now; per-track
   = 22 PUTs + index edits, non-atomic — reopens the partial-failure
   surface the I1 release→index→pointer ordering closed. Album adds
   still happen (discographies, 24-album Wu-Tang, concert rips).
4. **Co-location matches the dominant read** (release/playlist-scoped
   playback) — one file = one fetch; splitting optimises the write at
   the read's expense.

Why the win is smaller than it looks: the write path already adapts
to track-dominant adds — a single-track add is a one-line `#tNN`
PATCH-append or a fresh 1-track release file, so loose single-track
adds organically produce near-per-track files anyway, while albums
stay compact. And triple-level write + addressability already exist
without a file split: playlists point at `…/releases/slug#tNN`
fragment IRIs and `updateTrackMeta`/add/remove issue sparql-update
PATCHes touching only that track's triples. The *only* thing a
separate file buys is avoiding lock contention when two writers PATCH
the same release doc concurrently (the `PLAN-self-contained-playlists`
CSS lock-timeout class of problem).

If that contention is ever measured as real, prefer a narrow fix
(serialise writes per release doc, or split only the loose-single-
track path — which already trends to 1-track files) over a global
per-track split. The fan-out (1) and re-duplication (2) are the
deciders and both cut against splitting.
