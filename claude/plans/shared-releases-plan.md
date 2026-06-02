# Plan: shared releases/* + pointer playlists + safe-delete prompt

Status: **Phases 1 + 2 + 4 SHIPPED & VALIDATED. Ph5 SHIPPED &
LIVE-VERIFIED on a CSS pod 2026-05-19 (now installs ALL playlists +
their release files; no dangling pointers).
Ph3 REDESIGNED → "Deleted-bin" model, IN PROGRESS** (user decision
2026-05-18; Ph3 redesign 2026-05-18 — see "## Ph3 REVISED" at end;
the §4 delete-prompt / refcount-partition design below is SUPERSEDED).

> **SUPERSEDED IN PART by `rdf-model-rework-plan.md` (impl. 2026-05-19).**
> Its P1 retired the Ph1/Ph2 `dcat:landingPage` dedup-index sync
> hazard: `releases.ttl` is now seeAlso-only and the dedup key is
> `dcterms:identifier` in each release file (derived, not
> hand-synced). Ph3's refcount no longer needs a landingPage index.
> Ph5 (pod-install) still deferred; the rework also did **not** touch
> the pod, so "don't pod-install a migrated library" still holds.

Phase 1
(resolvable landingPage index), Phase 4 (one-shot un-clone migration),
and Phase 2 (shared-model write path) are done and live on dev data.
Deferred: Phase 3 (playlist-delete refcount + delete/keep-Unsorted
prompt — orphaned release files accumulate meanwhile; harmless),
Phase 5 (pod-install copies referenced `releases/<slug>` — pod
installs would get dangling pointers until done, so don't pod-install
a migrated library until Ph5).

### Progress (2026-05-18)

- **Phase 1** — `migrate-shared-releases-index.js` (additive,
  idempotent): backfilled `releases.ttl` with 50 `<file>
  dcat:landingPage <lp>` dedup keys. `<#Unsorted>` SKOS concept already
  existed & Music-rooted. Backup `releases.ttl.pre-sharedidx-*`.
- **Phase 4** — `migrate-shared-releases.js`: un-cloned all 31
  self-contained playlists into shared `releases/<slug>` (173 new
  files; 23 landingPages reused from existing catalog; 1
  cross-playlist shared release Otis_Spann∩Various_Blues_Artists),
  rewrote every playlist to **pointer-only** `hasPart`. Backup
  `.pre-sharedreleases-<ts>/` (full playlists/ + releases/ +
  releases.ttl). Validation (`validate-shared-releases.mjs`): 223
  release files, 0 parse errors, 0 duplicate-landingPage files, index
  consistent (223 seeAlso + 223 landingPage), all 31 playlists
  pointer-only, 1358 hasPart pointers, **0 dangling** (invariant I1).
- **Read path needs NO code change** — `parseBookmarks` already reads
  playlist tracks store-globally (hasPart → reverse `mo:track` →
  Release → maker) and the recursive `seeAlso` loader merges every
  release file (index.ttl → releases.ttl → releases/<slug>) into one
  store. Verified: Tupac_Shakur 127/127 hasPart resolved; full smoke
  suite green (`smoke-test-rdf-catalog.mjs` rescoped: original catalog
  preserved triple-for-triple, union is the expected superset).
- **Phase 2 — SHIPPED.** `addTracksToPlaylist` reworked to §4:
  resolve release by `landingPage` in the loaded store → reuse the
  canonical Track if present; else append the Track to the existing
  `releases/<slug>` file; else mint a new `releases/<slug>` (PUT) +
  PATCH `releases.ttl` (seeAlso+landingPage) + force-load + seed store.
  Playlist gets ONLY the pointer `hasPart`, written LAST (release →
  index → pointer ordering = I1 crash-safety). `removeTrackFromPlaylist`
  now drops ONLY the playlist's `hasPart` edge — the shared
  release/track triples are never deleted (Phase-3's job). New helper
  `uniqueReleaseSlug`. Validated offline against the real pod
  direct-sparql-update-PATCH branch by `smoke-test-shared-write.mjs`
  (20 assertions: dedup-reuse / new-file mint+index / pointer-only
  playlist / remove-only-pointer); all read smokes still green. The
  edit-corruption gap on migrated playlists is **closed**.
- **Phase 3 (delete-prompt + refcount) is the next gated step**:
  removing a track leaves the release file in place by design, so
  orphaned releases accumulate until a playlist is deleted. Phase 3
  adds the refcount partition + "delete files / keep as Unsorted /
  cancel" prompt on playlist delete (plan §4). `removePlaylist`
  currently still just drops the file + index seeAlso (no release
  cleanup) — safe (no corruption), just leaves orphans.

---

Original proposal below (unchanged).

## 1. Goal

- **All** `mo:Release` + `mo:Track` triples live once, in `releases/<slug>`
  files (the Phase-2 per-release folder), indexed by `releases.ttl`.
- **Playlists become pointer files**: `mo:Playlist` + `dcterms:hasPart`
  → Track IRIs that live in `releases/<slug>`. No cloned release/track
  triples inside playlist files.
- **On playlist delete**: for releases that become orphaned, prompt the
  user — *delete the release files* OR *keep them in the catalog under a
  genre* (default **Unsorted**).

## 2. Why this is OK now (the key point)

Self-containment exists because PATCHing the **one monolithic 470 KB
`releases.ttl`** on every playlist add caused CSS lock-timeout 500s
(`migrate-selfcontained-playlists.js`). **Phase 2 already split releases
into one small file per release.** So a shared model now means small,
independent PUT/PATCH per release file — the lock-timeout cannot recur.
Self-containment was a workaround for a problem the per-release-file
refactor eliminated; the shared model is the cleaner end state Phase 2
unlocked. Net wins: no duplication (a release in 5 playlists stored
once, not 5 clones), single source of truth (fix a track once),
catalog-browse and playlists share one releases store.

## 3. Schema / invariants

- `releases/<slug>`: one `mo:Release` (stable identity), its `mo:Track`s
  + `dcat:downloadUrl`/duration, `dcat:landingPage`, optional
  `foaf:maker`→agent, optional `mo:genre`.
- `releases.ttl`: index; `rdfs:seeAlso` each release file **and**
  `<file> dcat:landingPage <lp>` so the dedup key is resolvable without
  fetching every file.
- Playlist file: `mo:Playlist` + `dcterms:hasPart` → Track IRIs only.
- **Dedup identity = `dcat:landingPage`** (archive.org item). Adding a
  track whose release already has a file reuses that file.
- **Invariants:** (I1) every Track a playlist points to lives in some
  `releases/<slug>` that `releases.ttl` seeAlsos; (I2) a release file is
  deleted only when its refcount is 0 (no playlist `hasPart` into it AND
  no catalog `mo:genre`/`foaf:maker` making it browse-reachable).

## 4. Write algorithms

**Add track(s) to playlist** (replaces clone-into-playlist):
1. Resolve release by `landingPage` via the `releases.ttl` index.
2. If no file: `PUT releases/<slug>` (Release+Tracks); `PATCH
   releases.ttl` add seeAlso + landingPage. If file exists but missing
   this Track: `PATCH releases/<slug>` add the Track.
3. `PATCH playlists/<slug>` add `dcterms:hasPart → <trackIRI>`.
   Order 2→3 so a mid-failure leaves an unreferenced release (harmless),
   never a dangling pointer. Idempotent: re-run skips existing.

**Delete playlist** (the prompt):
1. Collect releases reachable from this playlist's tracks.
2. Partition via refcount over the loaded store:
   - **shared** (another playlist's `hasPart`, or has catalog
     `mo:genre`/`foaf:maker`): keep silently — deleting would corrupt
     others / the catalog.
   - **orphaned** (only this playlist references it, no catalog membership).
3. If orphaned set non-empty, prompt: *“N albums are only in this
   playlist:”* → **[Delete files]** | **[Keep in catalog under genre __
   (default: Unsorted)]** | **[Cancel]**.
   - Keep: `PATCH` each release file add `mo:genre <…#Unsorted>` (mint
     the Unsorted SKOS concept in `genres.ttl` once) → it becomes a
     normal catalog album.
   - Delete: `DELETE releases/<slug>` + `PATCH releases.ttl` drop its
     seeAlso/landingPage, for each orphaned release.
4. Always: `PATCH index.ttl` drop playlist seeAlso + `DELETE` playlist
   file (current behaviour).

**Edit/remove track**: edit a Track = `PATCH releases/<slug>` (reflects
everywhere — feature, but warn on shared releases as today). Remove from
playlist = `PATCH playlists/<slug>` drop the `hasPart` only; the release
file stays (refcounted; cleaned on playlist delete or a sweep).

## 5. Migration (one-shot, `migrate-shared-releases.js`)

Per `migrate-*` conventions (dry-run/--apply/backup):
- For every self-contained playlist: extract its cloned Release/Track;
  dedupe by `landingPage` into shared `releases/<slug>` (merge clones
  across playlists into one file; **reconcile with Phase-2 catalog
  releases** — don't duplicate an existing catalog release).
- Rewrite each playlist file to pointer-only `hasPart`.
- Rebuild `releases.ttl` index (+ landingPage triples).
- Track-IRI strategy: keep one canonical Track IRI per
  (landingPage, downloadUrl); rewrite playlist `hasPart` to it.

## 6. Pod-install impact

Minimal install currently copies only converted-artist playlists
(self-contained). Shared model ⇒ install must also copy every
`releases/<slug>` those playlists point to (else dangling pointers) +
the `releases.ttl` index. More files than today’s minimal — but small,
idempotent PUTs (the Phase-2 property). Acceptable; note it.

**IMPLEMENTED 2026-05-19 (code, Node-tested; live pod install still
pending — needs user login + pod).** Kept the live-debugged *minimal*
install design (project-libraries-layout): scope is still skeleton +
agents/genres + converted-artist playlists, just no longer dangling.
- `ia-rdf.js`: new exported `releaseDocsForPlaylistDocs(store,
  playlistDocUrls)` → the unique `releases/<slug>` docs the given
  playlist files point into, restricted by `statement.why` to those
  playlist docs (so an install only carries the release files its
  playlists actually reference — NOT the whole 223-file catalogue).
- `ia3.js installOnPod`: after gathering the converted-artist playlist
  files, also fetch + IRI-rewrite (libContainer→podLibBase, same
  mechanism as agents/genres/playlists) + upload each referenced
  release file; synthesised `releases.ttl` now `rdfs:seeAlso`s exactly
  those files (was title-only) so the loader's forward spine resolves
  every `omp:track` pointer. `rdfs:seeAlso` chosen over a DCAT edge:
  the synthesised index already rides the legacy-but-honoured
  rdfs:seeAlso path; lowest live-pod risk, single mechanism.
- Guard: new `smoke-test-rdf-install-ph5.mjs` (6 ✓ — why-filtered set,
  exclusion of non-installed playlists' releases, frag-stripped doc
  URLs, union/dedup, empty-input). Existing install/shared/rdf smokes
  + validate-rdf-rework still green. Bundle rebuilt (BUILD GOTCHA).
- **Live pod install DONE & verified 2026-05-19** (user, authed, on
  CSS): installed clean, playlists resolve, no dangling pointers.
- **Scope widened (user request, same session): ALL playlists**, not
  just converted-artist ones. `playlistSourceDocs` → new
  `allPlaylistDocs(store, baseURI)` (every `as:OrderedCollection` doc,
  Deleted bin excluded). Plain playlists ("Penguin Cafe Orchestra",
  "Kronos Quartet") + their release files now install too. Final set
  ≈ 232 files (6 + 31 playlists + 195 release docs). This **retires
  the old "Import playlists for non-converted" follow-up**
  (project-libraries-layout). `smoke-test-rdf-install-ph5.mjs` extended
  (11 ✓ incl. plain-playlist inclusion + bin exclusion); all smokes +
  validate-rdf-rework green; bundle rebuilt.

## 7. Risks / commentary

- **Multi-file writes return.** Add-track is now 1–3 small writes
  across release file + index + playlist, with no LDP transaction.
  Self-containment’s single-PATCH simplicity is lost. Mitigation:
  strict ordering + idempotency (I1); a mid-failure yields a harmless
  unreferenced release, never corruption. This is real added complexity
  but bounded — and small files, so no lock-timeout.
- **Refcounting for safe delete is mandatory.** Deleting a release a
  second playlist still uses would corrupt it. The partition in §4 is
  the safety net; it must run over the fully-loaded store and be
  conservative (when unsure → treat as shared, keep).
- **Shared-edit blast radius.** Fixing a track title now changes it in
  every playlist using that release. Already true for catalog; extend
  the existing sibling-count warning to playlists.
- **Migration is non-trivial** (clone-merge + catalog reconciliation +
  Track-IRI canonicalisation) and irreversible without the backup.
- **“Unsorted” genre** needs a one-time SKOS concept in `genres.ttl`
  under the Music root; the keep-on-delete path depends on it.

## 8. Recommendation

**Do it — it’s the correct end state Phase 2 made safe — but treat it
as its own phased project** (schema+index landingPage → write path →
delete/prompt → migration → pod-install), behind the one-shot migration
with backups, and with the §3 invariants enforced in code. The
standout good idea is the **delete prompt**: “promote orphaned albums to
the catalog (Unsorted) or discard” turns playlists into a safe staging
area and prevents the silent-orphan problem the *current* code already
has (deleting a converted-artist playlist already orphans its agent).
The one thing I’d push back on: don’t offer “delete” for releases that
are still shared — only ever prompt for the genuinely-orphaned set, or
you hand the user a footgun that corrupts other playlists.

---

## Ph3 REVISED — the "Deleted bin" model (supersedes §4)

User decision (2026-05-18): drop the delete-time prompt and the
conservative shared-vs-orphan **partition** entirely. On playlist
delete, move **all** the playlist's tracks — regardless of whether
they're duplicated elsewhere — into a single reserved **"Deleted"**
collection. It is a normal playlist (`as:OrderedCollection`) with a
fixed slug, hidden from the Sources column and reached only from the
upper-right **⋮ menu → "View deleted"**. There it renders and edits
with the *existing playlist UI* (no new screen): move tracks to other
playlists, remove tracks. Removing a track *from the bin* is the only
place that reclaims disk.

Why this is simpler & safe: the bin only ever holds *pointers*; the
delete path never touches release files, so duplicating a pointer into
it cannot corrupt anything (I1 holds trivially). The risky
partition/prompt (~the 3 deleted hours) is gone. The single remaining
safety check is at bin-remove time and is automatic (no prompt).

**`removePlaylist` (new order, crash-safe):**
1. `ensureDeletedBin` (find-or-create `playlists/deleted`, mirror
   `addPlaylist`: PUT body + PATCH `playlists.ttl` `dcat:dataset` + seed).
2. `addTracksToPlaylist(bin, <this playlist's tracks>)` **first** —
   idempotent (dedups by downloadUrl), resolves the already-existing
   shared release, so it only mints `omp:entry` pointers, never a
   release file. A crash here leaves the source playlist intact + some
   bin pointers (harmless on re-run); never a dangling pointer.
3. Then today's behaviour: drop the `playlists.ttl dcat:dataset` edge,
   `DELETE` the playlist file, purge in-memory triples.
   (Guard: if the target *is* the bin, skip step 1–2.)

**`removeTrackFromPlaylist`, when `playlistId` is the bin** (this is the
only disk-reclaiming path; automatic, conservative, no prompt):
after the entry is dropped, let `R` = the removed Track's parent
`mo:Release`. If **no other (non-bin) playlist `omp:entry` points at any
`mo:track` of `R`** → `DELETE` `R`'s release file + drop its
`releases.ttl#it dcat:dataset <…#it>` (and back-compat `rdfs:seeAlso`)
index edge + purge in-memory. If *any* other playlist still references
`R` → keep the file (just drop the bin pointer). The safety line is
**I1 only** (no other *playlist* pointer may dangle); a curated-artist
/ genre node losing an album degrades gracefully (it's not corruption),
which matches the user's "get rid of them" intent.

**UI:** `ia-ui.js` adds one `gear-view-deleted` menu item; `ia3.js`
wires it to `switchSource(deletedBinUri(lib.baseURI))`, excludes the
bin id from `refreshSources()` and from playlist-target pickers.
Everything else is the existing playlist view, unchanged.

**Disk-reclamation tradeoff (accepted):** the normal delete path never
frees disk; only an explicit bin-remove (or the existing refcount
`sweep-orphan-tracks.js`, run rarely) does. Matches "user manually gets
rid of them".

Steps: (1) bin helpers; (2) `removePlaylist` rewrite; (3) bin disk-GC
in `removeTrackFromPlaylist`; (4) menu item + bin reuse; (5) tests.

**STATUS: IMPLEMENTED on dev (code only) 2026-05-18.** Steps 1–4 done
in `ia-rdf.js` (`deletedBinUri`/`ensureDeletedBin`, `removePlaylist`
re-point-first, bin-only disk-GC in `removeTrackFromPlaylist`),
`ia-ui.js` (`gear-view-deleted`), `ia3.js` (wire + `resyncLibFromStore`
+ Sources-column exclusion). Guard = new **`smoke-test-deleted-bin.mjs`**
(22 checks: crash-order, dedupe, orphan-reclaim, still-referenced
safety) — ALL PASS; `smoke-test-shared-write` / `rdf-catalog` /
`rdf-recursive` / `validate-rdf-rework` still green. NOT extending
`validate-shared-releases.mjs` — it is **pre-rework/stale** (asserts
`mo:Playlist`+`dct:hasPart`, both retired by the 2026-05-19 rework);
superseded by `validate-rdf-rework.mjs`. Known limitation: the
`removePlaylist`→bin re-point resolves the canonical Track via the
release's `dcat:landingPage`; a release lacking a landingPage would
fall through addTracksToPlaylist's mint-new path. All dev catalog
releases carry one (migration set it as the dedup key), so this is a
latent edge, not a live bug — a downloadUrl-only resolver is the
follow-up if a no-landingPage source is ever imported. **Not run
against the pod** (matches deferred Ph5 — don't pod-install a migrated
library until Ph5).
