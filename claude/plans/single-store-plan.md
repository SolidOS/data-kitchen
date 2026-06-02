# Plan: converge to a single RDF store (restore "store model A")

Status: **S1 SHIPPED & live-confirmed 2026-05-20; Phase A
inconclusive; live save-via-bypass UNVERIFIED end-to-end; CRITICAL
"Update app on Pod" destructive-PUT bug open.** Bundle
`2026-05-20T14:34:54Z` (probe gate REMOVED — not opt-in, not one-shot,
removed; it kept intercepting real saves no matter how it was gated).

**What's confirmed working on the pod (console evidence):**
- `[omp] BUILD 0.1.0 2026-05-20T…`
- `[omp] sol-login handler upgrade fired: webId=…`
- `[omp] setSolidWriteAuthed → true`
- `[omp] runUpdate path: pod-bypass · isRdfStore=true solidWriteAuthed=true`
So: single-store load, in-place authed upgrade, write-path flag, and
runUpdate routing to the bypass — **all correct.**

**What's NOT verified end-to-end:** an actual rename via the bypass
persisting and reflecting in the UI. Every rename attempt up through
build 14:21:29 had the probe still firing (somehow re-armed between
clears — possibly via console history's setItem, or my own
instructions) and so was diverted to UpdateManager, which failed
"uneditable" in our integration. Build 14:34:54 removes the gate
entirely, but at that point the user stopped — no successful save
observed via the bypass on the live pod. The bypass is the same
authed-PATCH path `installToPod` uses successfully for every install,
so it is *expected* to work; not formally demonstrated end-to-end.

**Critical open bug — Update-app on Pod destructive PUTs.** Multiple
sessions ended with the pod's `index.html` displaced/missing after
running ⋮ → Update app on Pod from dev (status reports "2 written"
even when the console reports `[install] PUT FAIL …`). Cause not
isolated. Possibilities still on the table: (a) two-step prompt
defaults sometimes route PUTs to a wrong path on the chosen storage
(my own change tried to fix this but may have made it worse on a
later attempt); (b) `installToPod`'s success detection still accepts
some "soft-failure" responses as success (the `opaqueredirect /
redirected / 3xx` allowance); (c) an ACL/permissions situation
where a PUT silently lands somewhere else or 403s without status.
**Recovery**: ⋮ → Install on my Pod with the *explicit* destination
URL typed by hand (not accepting any default), so all files including
`index.html` are written fresh to the right place. **Do not use
Update-app on Pod until this is diagnosed and fixed.**

**Phase A — inconclusive, NOT verdict D.** Two probe runs showed
`UpdateManager.update` failing "uneditable" against the authed CSS
pod even after the v6 force-load remedy. Empirical counter-evidence
(other apps on solidcommunity.net write via UpdateManager) says
**our integration is broken, not UpdateManager**. The hypothesis is
the Fetcher wiring: `<sol-login>._integrateWithRdflib()` patches
`rdf.storeFetcher`, but rdflib's UpdateManager reads `store.fetcher`;
if those differ, UM probes unauthed. `ensureUpdater` now aligns
`store.fetcher = rdf.storeFetcher` before constructing UM. **Whether
that alignment fixes UM was never confirmed live** — the probe was
removed before a clean test was achieved.

**Shipped (S1a–c):**
- `ia-rdf.js`: `let solidWriteAuthed` + `export setSolidWriteAuthed()`;
  `runUpdate`'s pod sparql-update bypass branch is gated on
  `store === rdf.store && solidWriteAuthed` (NOT store identity). Dev
  /local & logged-out → UpdateManager (unchanged); authed pod → bypass.
- `ia3.js loadOneLibrary`: `shared = !!config.solid ||
  isLocalLibUrl(config.url)` → the same-origin lib (pod OR dev) loads
  ONCE into `rdf.store`; external (+Library cross-origin) keep
  `graph()`. `init()` skip dance (`_skipLocal`/`_pushFlow`/
  `BOOT_AUTH_PARAMS`) removed — single load always happens.
- `ia3.js` login: `sol-login` handler is now an **in-place upgrade,
  unconditional and first** — `setSolidWriteAuthed(true)` +
  `solidAuthed`/`!solidReadOnly`, `resyncLibFromStore` (same store),
  `softRedraw()` (preserves the current source/view: no wipe, no
  reset). The pending Install/Update-app resumes now run AFTER the
  upgrade (they used to early-return → "uneditable, no refresh").
  `sol-logout` mirrors it in place. Decision-A `userInitiated` gate +
  "Checking your pod library" `loadSolidLibrary` block **deleted**;
  `loadSolidLibrary`/`unloadSolidLibrary`/`loadPod` left defined but
  dead (later GC).
- Smokes: `shared-write` & `deleted-bin` now opt in via
  `setSolidWriteAuthed(true)` (proves the flag gates the bypass —
  they fail without it). Full suite + `validate-rdf-rework` green.

Build: `2026-05-20T00:39:24Z` (probe gate retired, TEMP instrumentation
stripped, bypass is the authed-pod write path).

## 13. Phase-A — NOT ratified (probe failed in OUR integration)

Live pod, two consecutive runs with the probe routing a rename through
`UpdateManager.update` instead of the bypass:

```
[omp][probeA] attempt 1 → {ok:false, err: Update: Can't make changes in
 uneditable <…/playlists/…>}
[omp][probeA] "uneditable" → force-loading then retry (v6 remedy)
[omp][probeA] attempt 2 (after force-load) → {ok:false, err: Update:
 Can't make changes in uneditable <…/agents.ttl>}
```

**Earlier verdict ("Phase D ratified, UpdateManager can't edit authed
CSS") is RETRACTED.** Empirical counter-evidence: forms apps and other
Solid clients write to solidcommunity.net with `UpdateManager` every
day. So UpdateManager IS capable here; **our integration of it is
broken**.

**Most likely cause (Fetcher-wiring hypothesis, unverified):**
`<sol-login>._integrateWithRdflib()` patches **`rdf.storeFetcher`** to
the authed Inrupt fetch, but rdflib's `UpdateManager` reads
**`store.fetcher`** (i.e. `rdf.store.fetcher`) internally for its
edit-protocol probe and for the PATCH itself. If those are *different*
objects, UM's probe goes through the default unauth Fetcher → can't
read Accept-Patch / Allow / Link → `editable()` returns false →
"uneditable." Our v6 force-load uses `ensureFetcher(store)` (returns
`rdf.storeFetcher`, authed) so the load itself succeeds — but the
subsequent `updater.update(...)` still uses the wrong fetcher and
still fails. Matches the probe trace exactly.

**Status & next:**
- Bypass kept — but as the known-working authed-pod write path, NOT
  as an evidence-backed permanent choice. `solidWriteAuthed` ⇒ bypass
  is provisional.
- Probe gate retired (was hijacking real saves whenever a stale
  `omp:um-probe` was set); probe code stays defined as documentation.
- **Real next step:** verify the Fetcher-wiring hypothesis on the pod
  — log `rdf.store.fetcher === rdf.storeFetcher`, dump
  `rdf.store.fetcher` identity vs the authed one, and on a force-load
  inspect the Link/Accept-Patch headers seen. If the hypothesis holds,
  fixing it (set `rdf.store.fetcher = rdf.storeFetcher` after sol-login
  integration, or pass the authed Fetcher to UpdateManager) will make
  UpdateManager work on the authed pod — at which point Phase B/C
  (collapse to UpdateManager) becomes viable and the bypass can go.

## 1. The agreed model, and the drift

Long-ago decision ("store model A", `rdf-shared.js:20`): **one** RDF
store — the `rdf` singleton (`rdf.store`) — whose Fetcher
(`rdf.storeFetcher`) `<sol-login>`'s `_integrateWithRdflib()` patches
to the authenticated Inrupt fetch on login.

The drift (`ia-rdf.js:136`): `const store = shared ? rdf.store :
graph()`. Every **non-solid** library gets its **own private
`graph()`** + its own `new Fetcher`. `ensureFetcher` (`ia-rdf.js:791`)
hands back per-store Fetchers. So the pod-hosted instance loads its
*own same-origin library twice*: logged-out as a private `graph()`,
then again into `rdf.store` on login.

**Key correction (user):** a store is just triples — it is neither
auth nor non-auth. **Auth lives in the Fetcher.** There is no reason
to load a second store on login; you load once and, when a session
appears, the *Fetcher* for that store becomes authed.

## 2. Root cause of the recent pod bugs

All the same drift:
- **Double-load on login / wipe / silent-restore reload** — because
  login *re-loads* the library into a different store instead of
  reusing the one already loaded.
- **"Saved but didn't show / probe silent"** — `libByArtist()` etc.
  resolved an edit to the **wrong store** (the stale logged-out
  private duplicate), so the write missed the authed path.
- **`loadSolidLibrary` self-hosted dedupe + the
  `init()` `_skipLocal`/`_pushFlow`/`BOOT_AUTH_PARAMS` machinery** —
  all scaffolding to manage a duplicate that **shouldn't exist**.

## 3. Target design

One store: `rdf.store`. The (same-origin / solid) library loads into
it **once**, logged-out, with the singleton Fetcher. Login changes
**only** the Fetcher: `_integrateWithRdflib()` points
`rdf.storeFetcher` at the authed Inrupt fetch. Same store, now
writable. No reload, no duplicate, no dedupe.

Logged-out: singleton Fetcher = default fetch → public reads work.
Writes are already gated logged-out by the existing read-only /
`requireSession` prompt.

## 4. The `runUpdate` discriminator problem (must decide)

`runUpdate` keys the **pod sparql-update bypass vs UpdateManager** on
`store === rdf.store`. Under single-store that is **always true**, so
*every* write — including **dev/localhost** — would take the pod
bypass (today dev uses the UpdateManager path). That conflates "which
store" with "which write protocol".

**Decision needed:** replace the discriminator with an explicit
signal, e.g. a per-library `solid`/`writableViaPodPatch` flag or
"is there an authed Solid session for this doc's origin", so:
- single-store does NOT force the bypass onto dev/local, and
- the Phase-A outcome (UpdateManager-everywhere vs keep-bypass) plugs
  into *that* signal cleanly.

This couples this refactor to `updatemanager-everywhere-plan.md`
Phase A — they should be reasoned about together (one write-path
decision, keyed off an explicit flag, not store identity).

## 5. Scope decision (review point)

Two honest scopes:

- **S1 — same-origin/solid library only (recommended first).** Only
  the app's own library (the pod-hosted / solid case) moves to always
  `rdf.store`. External libraries added via **+ Library** keep their
  own `graph()` for now (aggregation by separate graph still works;
  `parseBookmarks(store,baseURI)` scans the whole store, so a
  single-lib `rdf.store` parses cleanly). Fixes 100% of the reported
  pod bugs. Smallest blast radius.
- **S2 — full single-source (model-A complete).** ALL libraries share
  `rdf.store`; parse **once** over the store with per-document `why`
  scoping (rdflib already tags every triple with its source doc), and
  `recomputeAggregates` derives from the one store instead of
  flat-mapping per-lib parsed arrays. Truer to the agreed model;
  bigger change to parse/aggregation semantics + the +Library flow.

**DECIDED: S1.** External libraries keep their own `graph()` for now;
only the same-origin/solid library moves to always-`rdf.store`. S2
(full single-source, parse-once with `why`-scoping) is a later
follow-up, not part of this work.

## 6. Touch points

- `ia-rdf.js:136` `loadRDF` — same-origin/solid → `rdf.store` +
  `rdf.storeFetcher` even logged-out; keep `lazyReleases`,
  `isLoaded/markLoaded` (already shared-store aware).
- `ia-rdf.js:791` `ensureFetcher` — return `rdf.storeFetcher` for the
  single store; per-`graph()` Fetcher only for S1's external libs.
- `ia-rdf.js` `runUpdate` — replace `store === rdf.store` with the §4
  explicit signal; Phase-A probe gate rides on that.
- `ia3.js` `loadSolidLibrary` — **delete** the reload + self-hosted
  dedupe; login becomes "ensure session, Fetcher is now authed,
  re-derive views (`resyncLibFromStore`), redraw once" — no re-fetch.
- `ia3.js` `init()` — delete `_skipLocal`/`_pushFlow`/`BOOT_AUTH_PARAMS`
  skip (no duplicate to skip); the same-origin lib just loads once.
- `ia3.js` sol-login handler — Decision-A `userInitiated` gate, the
  "Checking your pod library" `localAlreadyHasIt` block, and the
  `omp:auth-inflight` marker: **mostly removable** — with one store
  there's nothing to avoid re-loading; on login just swap Fetcher +
  `resyncLibFromStore` + redraw. Keep the deep-link restore if wanted.
- `ia3.js` `loadOneLibrary`/`recomputeAggregates`/`libBy*` — S1: largely
  unchanged (the solid lib is the single store); S2: parse-once rework.

## 7. What gets deleted (net simplification)

The double-load fix, `_skipLocal`/`_pushFlow`, `BOOT_AUTH_PARAMS`, the
`omp:auth-inflight` marker, the self-hosted dedupe, the
`localAlreadyHasIt` skip, the Decision-A silent-restore gate, the
loadSolidLibrary failure re-load — **all become unnecessary**. This
refactor removes more code than it adds.

## 8. Login flow, after

1. Page load: library loads once into `rdf.store` (logged-out,
   unauth Fetcher) → spine renders read-only. No login needed to view.
2. User logs in (or silent restore): `_integrateWithRdflib()` patches
   `rdf.storeFetcher` → authed. No reload.
3. App: `resyncLibFromStore` (views unchanged — same store) + a status
   ("signed in — writable"); panels do NOT wipe. Lazy on-demand
   release fetches now go authed automatically (same Fetcher).
4. Logout: Fetcher reverts to default; store stays; read-only again.

## 9. Risks

- **Write-path coupling (§4)** — biggest. Don't ship single-store
  without deciding the `runUpdate` discriminator, or dev writes
  silently change protocol.
- `rdf.store` is shared with `<sol-login>`'s own rdflib use — confirm
  no collision when the library lives there pre-login (it already
  does post-login, so likely fine).
- Lazy loader `markLoaded`/`isLoaded` already keyed to the shared
  store — verify dedupe still correct when logged-out load + later
  authed on-demand fetches use the same store.
- One live-pod verify (the expensive cycle) — but it *replaces* the
  several live cycles the duplicate keeps costing.
- S2 only: parse-once + `why`-scoping is a real semantic change to
  multi-library aggregation; not needed for the bug fixes.

## 10. Test / verify

- Node: existing smokes (loader, lazy, pod-synth, install-ph5,
  deleted-bin, shared-write) must stay green; add a test that
  `loadRDF` for the same-origin lib uses `rdf.store` and that an
  authed-Fetcher swap makes the *same* store writable (mock fetch).
- Live pod (one session): fresh tab → spine read-only, no login
  (one load, `[omp] BUILD` current); log in → **no wipe, no
  re-fetch**, panels stay, becomes writable; rename a playlist →
  shows immediately, persists (re-load proves it); Phase-A probe
  fires (single write path).

## 11. Decision (locked 2026-05-19)

**S1 + explicit write-path flag, Phase A first.** Order:
1. **Phase A** — run the live probe (runbook §12). Verdict decides the
   write protocol (UpdateManager-everywhere vs keep the pod bypass).
2. **Wire §4** — replace `runUpdate`'s `store === rdf.store` check with
   an explicit per-library write-path flag carrying the Phase-A
   outcome (so single-store doesn't force a protocol on dev).
3. **S1 refactor** — same-origin/solid lib always `rdf.store`; delete
   the ~7 duplicate-management scaffolds (§7); login = Fetcher swap +
   `resyncLibFromStore` + one redraw, no reload.
4. One live-pod verify (§10).

S2 deferred. Net: one store, login = Fetcher swap, every recent pod
bug gone, more code deleted than added.

## 12. Phase-A runbook (do this next — live pod)

Precondition — the pod MUST run the probe build:
1. From **dev**: ⋮ → **Update app on Pod** (pushes `ia-player.js`
   ≥ build `2026-05-19T19:49:23Z` — has the probe AND the post-write
   resync) and ⋮ → **Install on my Pod** (writes the DCAT
   index/releases/playlists.ttl — the pending live-verify, same
   session so it isn't a separate pod cycle).
2. Hard-reload the pod; **confirm** `[omp] BUILD …19:49:23…` (or
   later) in the console. If not, the probe isn't there — stop.

Probe:
3. In the **pod page's own console** (origin = the pod, not a dev
   tab): `localStorage.setItem('omp:um-probe','1')`.
4. Do ONE pod write that routes through `runUpdate` — rename a
   playlist/artist, or add/remove a track in a playlist.
5. Read the `[omp][probeA]` lines. Then
   `localStorage.removeItem('omp:um-probe')`.

Interpreting:
- **`[omp][probeA]` logs + ✅** → UpdateManager works on the authed
  store → Phase C (collapse to one UpdateManager path); the §4 flag
  routes everything through it.
- **`[omp][probeA]` logs + ❌ even after force-load** → bypass is
  genuinely needed → Phase D (keep it, now evidence-backed); the §4
  flag selects bypass-for-pod / UpdateManager-for-local.
- **NOTHING logged at all** (no `[omp][probeA]`) → the write did NOT
  reach `store === rdf.store` → it hit the **unauth same-origin
  duplicate** (`store !== rdf.store`). That is itself the decisive
  evidence for this whole plan: the duplicate is misrouting writes.
  Capture it; S1 is then unambiguously the fix.

Paste the `[omp][probeA]` block (or "nothing logged") back to drive
steps 2–4 of §11.
