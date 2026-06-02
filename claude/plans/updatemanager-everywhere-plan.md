# Plan: use rdflib UpdateManager everywhere again

Status: **Phase A inconclusive — probe failed in OUR integration; not
a vindication of the bypass (2026-05-20).** The probe ran twice on
the pod (rename → `UpdateManager.update`); both attempts (including
the v6 force-load retry) returned *"Can't make changes in
uneditable"*. An earlier conclusion called this Phase-D-ratified; that
is **RETRACTED** — UpdateManager *does* successfully edit on
solidcommunity.net for other Solid clients (forms etc.), so the
failure means **our integration of UpdateManager is broken**, not
UpdateManager.

Most likely cause (Fetcher-wiring, unverified): `<sol-login>`'s
`_integrateWithRdflib()` patches `rdf.storeFetcher` to the authed
Inrupt fetch, but rdflib's `UpdateManager` reads `store.fetcher`
(i.e. `rdf.store.fetcher`) internally. If those are different objects
UM's edit-protocol probe goes unauthed → `editable()` false →
"uneditable", even though the v6 force-load (which uses
`ensureFetcher(store) → rdf.storeFetcher`) succeeds. See
`single-store-plan.md` §13 for the trace + diagnostic plan.

What landed in `single-store-plan.md`:
- `runUpdate` gates the bypass on the explicit `solidWriteAuthed`
  flag, not `store === rdf.store` — so dev/local & logged-out keep
  UpdateManager. Authed pod ⇒ bypass *provisionally* (known-working
  authed write path; not an evidence-backed permanent choice).
- Probe retired (`probeUpdateManager`/`probeAEnabled` left defined as
  documentation, no longer gates writes — a stale `omp:um-probe` kept
  intercepting real saves).

So Phase B/C are NOT rejected — they're **blocked on the
Fetcher-wiring fix**. If that hypothesis holds and `UpdateManager`
then works against the authed pod, the bypass can go (Phase C). The
original §1–§7 commentary below is kept for the decision trail.

---

## 1. The two questions, answered honestly

**"Did we remove it for false reasons during debugging?"**
*Partly — the premise is unverified, not proven.* The bypass
(`runUpdate`'s `store === rdf.store` branch → hand-rolled
`application/sparql-update` PATCH) was added (v7) to dodge rdflib's
`UpdateManager.editable()` returning false ("Can't make changes in
uneditable") on the pod. But the root cause we ultimately found (v9–v11)
was different: the pod instance was editing the **unauthenticated
same-origin private duplicate store**, not the authed shared store. The
final failing logs even said `[runUpdate] local UpdateManager path
(store !== rdf.store)` — i.e. UpdateManager on the *wrong, unauth*
store. We **never isolated** UpdateManager running against a *correctly
authenticated* shared store with the resource's edit-protocol metadata
loaded. So the bypass may be solving a problem the v9–v11 store-routing
fixes already solved. It also may not — there is a real, separate,
documented rdflib quirk (see §3). Honest status: **untested premise.**

**"Isn't it more consistent to always use it?"** *Yes — strongly.* One
strict write path means: uniform `checkSaved` semantics, rdflib-managed
store↔disk sync, and no bespoke SPARQL serialisation. The hand-rolled
path has real edge-cases UpdateManager handles for us (below). Two
divergent write paths is a maintenance and correctness smell.

## 2. What the hand-rolled pod path risks (the consistency cost)

`runUpdate`'s pod branch builds `DELETE DATA { … } ; INSERT DATA { … }`
from `stmt.toNT()` and manually `store.remove`/`store.add`s. Versus
UpdateManager's `DELETE/INSERT … WHERE`:

- **`DELETE DATA` requires exact-match triples to exist**; UpdateManager's
  WHERE form is tolerant. Stale/slightly-mismatched deletes can 4xx.
- **Blank nodes / datatyped literals**: `toNT()` round-trips are mostly
  fine but UpdateManager's canonicalisation is the tested path.
- **Store↔disk sync**: we do it by hand (remove/add); UpdateManager keeps
  the in-memory store and the response handling consistent, incl. the
  `.why` graph bookkeeping the rest of the code relies on.
- **Patch dialect**: UpdateManager negotiates n3-patch vs sparql-update
  per the server's advertised protocol; we hard-code sparql-update.
- Divergence risk: a bug fixed in one path silently persists in the other.

## 3. The real rdflib issue this must still handle

`UpdateManager.editable(uri)` returns false unless rdflib captured the
resource's editing-protocol metadata (`Accept-Patch` / `Allow` / `Link`
/ `wac-allow`) when it fetched it. The codebase already documents this:
`addPlaylist` force-loads a brand-new file before its first PATCH for
exactly this reason. Open question: over the **Inrupt-authenticated
Fetcher** on CSS, does rdflib reliably record that metadata on the
recursive seeAlso load? If yes → UpdateManager-everywhere just works.
If no → we need a remedy (force-load-then-retry, the old v6 idea, kept
in the local branch today) generalised to all stores.

## 4. Plan (phased; gated on a live experiment)

**Phase A — Verify (decision gate, do first, no refactor yet).**
On the working v11 pod instance (library correctly loaded
authenticated, duplicate removed), temporarily route one pod write
through UpdateManager (feature-flag or a console-triggered probe) and
observe:
- Does `UpdateManager.update` succeed against the authed shared store?
- If it fails "uneditable", does a `fetcher.load(doc,{force:true})` +
  retry then succeed? (the v6 remedy)
- Capture the actual server PATCH (status, dialect) for the record.
Not Node-reproducible — same live-CSS caveat as the whole install saga.
This phase produces the *evidence we never had*.

**Phase B — Generalise the editability remedy.** Make the
force-load-then-retry (currently only the local/private branch's
fallback) apply to every store, and/or have the recursive loader capture
edit-protocol metadata at load (force-load library docs so the first
edit needs no retry). This is the safety net that makes a single path
robust regardless of when metadata was captured.

**Phase C — Collapse to one path.** Delete `runUpdate`'s
`store === rdf.store` branch (the hand-rolled sparql-update + manual
store sync). All writes → `UpdateManager` + the Phase-B remedy. Keep
`runUpdate`'s strict contract and `checkSaved` gating unchanged.

**Phase D — Keep direct-PATCH only as a *documented, evidence-backed*
fallback** — *iff* Phase A proves UpdateManager genuinely cannot work on
the authed path even with Phase B. Then it stays, but behind a clear
comment citing the verified reason (not "added during debugging").

**Phase E — Regression.** Existing 7 smokes (cover the local/private
UpdateManager path) + a live pod write test (create/add/rename/delete a
playlist on the pod instance) since the authed path isn't Node-testable.

**Phase F — Docs/memory.** Update `skills.md` (it currently documents
the bypass as the pod write path) and the project memory; mark
`reference-solid-servers` / the libraries plan accordingly.

## 5. Risks of reverting

- If Phase A shows rdflib editability really is flaky over the authed
  Fetcher and Phase B doesn't fully fix it, we reintroduce the
  "uneditable" class of failure. Mitigation: Phase A is a gate — don't
  delete the bypass until UpdateManager is *demonstrated* working.
- Behavioural drift: UpdateManager's WHERE-based patches differ subtly
  from our `DELETE DATA`; a full create/add/rename/delete pass on a pod
  must be re-verified live, not assumed from smokes.
- Cost: another live-pod debug cycle (the expensive, non-Node-testable
  kind). Budget for it explicitly rather than discovering it mid-change.

## 6. Recommendation

**Pursue it — consistency strongly favours one UpdateManager path — but
strictly gate on Phase A.** The bypass rests on an *unverified* premise
that the later v9–v11 store-routing fixes may have already invalidated;
that's reason enough to re-test, not reason enough to rip it out blind.
Concretely: do Phase A (cheap: one probe on the already-working pod
instance), and let the evidence decide. If UpdateManager works on the
authed store (with the Phase-B force-load remedy), collapse to one path
and delete the bespoke SPARQL — the cleaner, more consistent, less
bug-surface design. If it genuinely fails, we finally have the evidence
to justify the bypass honestly. Either outcome is better than the
current "two paths, one on an unproven assumption."

## 7. Action plan & estimates

Grounded in the actual `runUpdate` (the `store === rdf.store`
hand-rolled `DELETE DATA/INSERT DATA` branch vs. the local
`UpdateManager` path, which already carries a force-load-then-retry
remedy).

**Precondition:** a working, authenticated CSS pod instance in the v11
state (library loaded authed, no unauth duplicate store). If it must be
re-stood-up, add ~1h before Phase A.

| Phase | Actions | Est. | Live pod? |
|---|---|---|---|
| **A — Verify (gate)** | Feature-flag/console probe routing *one* pod write through `updater.update()` instead of the bypass. Live: (1) succeeds vs. authed shared store? (2) if "uneditable", does `fetcher.load(doc,{force:true})`+retry fix it? (3) capture server PATCH status + dialect. Record the evidence. | **3–4h** (probe ~1h; live observe/document ~2–3h) | **Yes** (non-Node) |
| **B — Generalise editability remedy** | Lift the existing force-load-then-retry out of the local-only branch so it covers *all* stores; optionally force-load library docs in the recursive seeAlso loader so the first edit needs no retry. Node-testable on the private store. | **2–3h** | No |
| **C — Collapse to one path** | Delete the `if (store === rdf.store)` block (~35 lines: hand-rolled SPARQL + manual `store.remove/add`). All writes → `UpdateManager` + Phase-B remedy. Audit `.why`-graph bookkeeping callers rely on (`docOf`, release de-index, Deleted-bin GC) under UpdateManager's WHERE patches. Keep `runUpdate`'s strict contract + `checkSaved` unchanged. | **2h** | No |
| **E — Regression** | Existing Node smokes (cover the UpdateManager path) ~0.5h, then a live create/add/rename/delete + Deleted-bin pass on the pod (authed path isn't Node-testable). | **2.5h** | **Yes** (pod pass) |
| **F — Docs/memory** | `skills.md` (documents the bypass as *the* pod write path), `reference-solid-servers`, libraries-layout plan, project memory. | **1h** | No |

**Phase D** is contingent, not baseline: *only if Phase A proves
UpdateManager genuinely cannot work on the authed path even with B* —
keep the direct-PATCH branch behind a comment citing the verified
reason (~0.5h), then stop after F.

### Totals (branch on the Phase-A gate)

- **If UpdateManager works** (A→B→C→E→F): **≈11–12h**, dominated by two
  live-pod sessions (A and the E pod pass) — the expensive,
  non-Node-testable kind; budget a debug-cycle buffer.
- **If A proves the bypass is genuinely needed** (A→D→F): **≈5h**, and
  stop with honest evidence backing the bypass.

### Sequencing

- **Phase A is a hard gate** — do not touch `runUpdate` until the probe
  produces the evidence the bypass currently lacks. Cheap relative to
  the rest (one probe on an already-working instance).
- B and C are pure-Node and low-risk; cost/risk concentrate entirely in
  the live-pod phases (A, E), consistent with the install/pod-debug
  history.
- Independent of the other active items; schedule whenever a live pod
  instance is available.
