# claude/

All Claude-authored artifacts for this project. Created 2026-05-20 by
relocating Claude scratch out of project root and `drafts/`.

**Start here:** [`plans/INDEX.md`](plans/INDEX.md) — authoritative status
table for every plan, with cross-refs into the other subfolders below.

## Layout

| folder | contents |
|---|---|
| `plans/` | `INDEX.md` + every `PLAN-*.md` / `*-plan.md` (design docs, status table) |
| `smoke-tests/` | `smoke-test-*.mjs` — RDF read/write checks; `smoke-test-commons.mjs` — live Wikimedia Commons API check; **headless-browser** e2e (puppeteer-core + system Chrome): `e2e-soltabs.mjs` (the `<sol-tabs from-rdf keep-alive>` shell + `?`Help `<sol-button>` modal + `⋮` `<sol-dropdown-button source=menu.ttl>` whose command items route to the `sol-command`→`COMMANDS` registry, incl. `acl:Write`→`part="requires-write"` gating), `e2e-images.mjs` (3-tier Images + favourites column), `e2e-coldstart.mjs`, `e2e-favourites.mjs` + **`run-favourites.sh`** (communal favourites — wrapper clears the `favourites/` folder before+after), `e2e-news-edit.mjs` + **`run-news-edit.sh`** (sol-feed editing — wrapper snapshots/restores `feeds.ttl`); `parse-dcat-sources.mjs` — dual-format parser unit check. **Run from project root**: `node claude/smoke-tests/<file>` or `bash …/run-*.sh` (needs the dev server up). **OBSOLETE** (the sol-form/sol-settings feature they tested was removed 2026-05-31): `e2e-settings.mjs`, `e2e-settings-save.mjs`, `e2e-image-edit.mjs`, `e2e-skos.mjs`. |
| `validation/` | `validate-rdf-rework.mjs`, `validate-shared-releases.mjs`, `validate-rewritten-sources.mjs` (DCAT feeds/images parse), `check-triple-conservation.mjs`, `analyze-shared-releases.mjs` — guards; `images-e2e/` — screenshots from the e2e harnesses |
| `migration-scripts/` | `migrate-*.js` one-shots (kept for history); `migrate-bookmark-to-dcat.mjs` — **reusable**, rewrites feeds.ttl + images.ttl from `bk:`→SKOS/DCAT (reads in-place — `cp` both `backups/*.pre-dcat-*` first or it wipes already-migrated files); `relativize-library-iris.mjs`; `import-images-ttl.mjs` (pre-DCAT importer) |
| _(moved out)_ | the former `rdf-model/` shapes live at top-level **`shapes/`**. The settings/editing shapes (`omp-settings.shacl`+`ui-choices.ttl`, `feeds.shacl`, `images.shacl`, `image-libraries.shacl`, `image-topics.shacl`) are now **UNUSED** — they drove the `sol-form`/`sol-settings` editors, removed 2026-05-31 (editing is now hand-rolled per tab). The music model (`music.shacl(c)`, `music-example.ttl`, `music-shape*.mmd`) remains as the data-model reference. |
| `backups/` | `*.pre-*` migration backups + `pre-libraries-backup-*/` |
| `scratch/` | `link2mo.js`, `munge-music.js` — early ad-hoc converters |

## Running scripts

Smoke tests and validation scripts use `../../` prefixes to reach
`ia-rdf.js`, `rdf-shared.js`, and `libraries/` at project root, so they
work when invoked as `node claude/smoke-tests/<file>` from the project
root. Most migration scripts in `migration-scripts/` were **not**
path-edited — they're historical artifacts (already applied). Exception:
`relativize-library-iris.mjs` is a reusable tool — it uses the `../../`
prefix and runs from the project root, like the smoke tests.

## What's NOT here

- **User notes live in `drafts/notes/`**, not here. `notes.md`,
  `notes2.md`, `thoughts.md`, `rdf-how2.md`, `conversion.{md,csv}` are
  the user's own files — read them, but treat them as user-owned.
- Project root keeps the app code: `src/`, `assets/`, `bin/`,
  `index.html`, `dist/`, `libraries/`, `package*.json`.
- `skills.md` (the project guide) stays at project root.
- `drafts/` also contains pre-Claude scratch (May 2026 early
  exploration: `ia2.html`, `ia-fetch*.js`, `albums.json`, old
  `ia-music*.ttl` variants) — not moved.
