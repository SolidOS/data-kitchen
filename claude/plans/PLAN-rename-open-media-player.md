> **OBSOLETE (2026-05-17).** Superseded by the libraries-layout refactor:
> the dev entry is now `index.html` (not `omp.html`), libraries live
> under `libraries/<slug>/index.ttl`, and a pod install lands in
> `open_media_player/`. The `ia*` source filenames are intentionally
> kept (see `skills.md`). Kept for history only — do not action.

# Renaming plan — Open Media Player

Two plans side-by-side: the **full** rebrand (rename every `ia*` to `omp*`)
and the **revised** title-only rebrand (keep file/class/component names as
`ia*`, just change visible titles to "Open Media Player"). Pick one to
implement.

---

## Scope inventory (shared)

- 11 files prefixed `ia*` (4 `.js`, 4 HTML/CSS, 3 supporting)
- 105 distinct `.ia-*` CSS class names
- 56 `--ia-*` CSS variables
- 14 files reference `ia-` / `Internet Archive` / `IaPlayer`
- 1 custom element `<ia-player>`
- 2 localStorage keys: `ia-player:state`, `ia-player:libraries`

Visible-text touchpoints (the only thing the revised plan touches):

| Location | Current | Becomes |
|---|---|---|
| `ia.html` `<title>` | `Internet Archive Music Player` | `Open Media Player` |
| `ia-help.html` `<title>` | `IA Player — Help` | `Open Media Player — Help` |
| `ia-help.html` `<h1>` | `IA Player — User actions` | `Open Media Player — User actions` |
| `ia-ui.js` root `aria-label` | `Internet Archive Music Player` | `Open Media Player` |
| `package.json` `description` | `Internet Archive Music Player web component` | `Open Media Player web component` |
| `build.js` generated `dist/example.html` `<title>` | `Internet Archive Music Player` | `Open Media Player` |
| `ia-about.html` body text | Mentions "Internet Archive" describing archive.org content | **Leave alone** — refers to the content source, not the player |

---

## Plan A — Full rename (`ia*` → `omp*`)

Touches files, classes, CSS vars, the custom element, localStorage keys,
and all visible titles. Bigger blast radius, cleaner end-state.

### Open questions before starting

1. **Data file `ia-music.ttl`** — keep its name (recommend yes; it's user
   data, the file URL is referenced in localStorage configs).
2. **localStorage migration** — write a one-shot shim that copies
   `ia-player:*` → `omp-player:*` on first load so returning users don't
   lose their session. Recommended (~20 min).
3. **Custom element name** — `<omp-player>` (matches the new prefix) or
   `<open-media-player>` (descriptive). Recommend `<omp-player>`.

### Steps

| # | Step | Notes | Time |
|---|---|---|---|
| 1 | **Rename files** | `git mv` (or `mv`): `ia.html → omp.html`, `ia.css → omp.css`, `ia3.js → omp.js`, `ia-rdf.js → omp-rdf.js`, `ia-ui.js → omp-ui.js`, `ia-utils.js → omp-utils.js`, `ia-about.html → omp-about.html`, `ia-help.html → omp-help.html`. Skip `ia-music.ttl`, `migrate-music-ttl.js`, `munge-music.js`. | 10m |
| 2 | **Update JS imports** | `from './ia-rdf.js'` → `from './omp-rdf.js'`, etc. Touches `omp.js`, `omp-ui.js`, both `smoke-test-*.mjs`, `src/bundle-init.js`, `src/bundle-entry.js`. | 15m |
| 3 | **Rename CSS classes (`.ia-*` → `.omp-*`)** | 105 classes in `omp.css`. Sed CSS then sed all HTML/JS references. Post-pass grep for any leftover `ia-`. | 40m |
| 4 | **Rename CSS vars (`--ia-*` → `--omp-*`)** | 56 vars. Single sed in `omp.css`. | 15m |
| 5 | **Rename custom element + class** | `<ia-player>` → `<omp-player>`; `customElements.define('ia-player', …)`; `IaPlayerElement` → `OmpPlayerElement`. Update `omp.html` and `build.js`'s `dist/example.html` template. | 10m |
| 6 | **localStorage migration shim** | On init, if `omp-player:state` missing but `ia-player:*` exists, copy values across. Validate `source` field is well-formed before migrating. | 20m |
| 7 | **`package.json`** | `name`: `ia-player` → `omp-player`. `description`: → `Open Media Player web component`. `main`: → `dist/omp-player.js`. Refresh `package-lock.json` with `npm install`. | 5m |
| 8 | **`build.js`** | Outfile paths (`dist/ia-player.js` → `dist/omp-player.js`), the banner string, and the generated `dist/example.html` template's `<ia-player>` and `<script>` tags. | 10m |
| 9 | **Visible titles** | `<title>` and `aria-label` updates per the inventory above. | 30m |
| 10 | **Smoke-test scripts** | `smoke-test-rdf*.mjs` → `smoke-test-omp-rdf*.mjs` (optional). Update internal imports. | 10m |
| 11 | **Build + manual sanity** | `npm run build`, run smoke tests, hard-refresh the app, exercise menus / drag / track removal / modals. | 30–60m |
| 12 | **`MEMORY.md` review** | Currently only references `feedback-ask-before-changes.md`; no project-path entries to update. | 5m |

**Total ~3.5–4 hours focused work.**

### What stays unchanged

- `ia-music.ttl` and its `.pre-migration` backup (pure data).
- Source comments + `omp-help.html` text referring to "archive.org" or
  "Internet Archive" as the *content source*.
- Solid-server URLs and `@prefix` declarations inside user TTL files.

### Risks

- **Class-rename misses.** Mitigation: grep for any `ia-` substring after
  step 3.
- **Stale dist bundles in user HTML.** Any consumer embedding
  `<script src="…/ia-player.js">` keeps loading old code silently.
  Mention in release notes.
- **Bad localStorage migration.** Old state from broken sessions could
  carry forward. Validate before copying.

---

## Plan B — Title-only rebrand (revised, minimal)

Leave `ia*` everywhere it appears in code (filenames, classes, vars, custom
element, localStorage). Only change the **visible product title** to
"Open Media Player" — in places a user actually sees.

### Steps

| # | Step | Notes | Time |
|---|---|---|---|
| 1 | **`package.json` `description`** | `Internet Archive Music Player web component` → `Open Media Player web component`. Leave `name`, `main`, `version` as-is. | 1m |
| 2 | **`ia.html` `<title>`** | `Internet Archive Music Player` → `Open Media Player`. | 1m |
| 3 | **`ia-help.html` `<title>` + `<h1>`** | `IA Player — *` → `Open Media Player — *`. | 1m |
| 4 | **`ia-ui.js` root `aria-label`** | The string passed to `container.setAttribute('aria-label', …)`. | 1m |
| 5 | **`build.js` template `<title>`** | In the heredoc that writes `dist/example.html`. | 1m |
| 6 | **`ia-about.html`** | Optional: add a clear heading at the top calling the player by its new name. Leave body references to "Internet Archive" (the content source) intact. | 5m |
| 7 | **Rebuild + verify** | `npm run build`. Hard-refresh the player. Confirm tab title + aria-label + Help/About modal headers all show "Open Media Player". | 5–10m |

**Total ~15–20 minutes.**

### What stays unchanged

- Every file name (`ia.html`, `ia.css`, `ia3.js`, `ia-rdf.js`, …).
- Every CSS class (`.ia-*`) and CSS var (`--ia-*`).
- Custom element `<ia-player>` and its JS class `IaPlayerElement`.
- localStorage keys `ia-player:state`, `ia-player:libraries`.
- `package.json` `name` field (`ia-player`) — keeps it consistent with the
  filenames and the dist output.
- `build.js` `dist/ia-player.js` / `dist/ia-player.esm.js` outputs.
- Internal `aria-label`s, ids, and class names like `ia-player-app`,
  `ia-player-styles`.
- All `ia-about.html` body references to archive.org / Internet Archive
  (those describe what the player *plays*, not the player itself).

### Risks

- **Brand/code drift.** The user-facing name will say "Open Media Player"
  while every internal identifier still says `ia-player`. Fine for now;
  graduate to Plan A whenever the inconsistency starts to bite.

---

## Recommendation

Start with **Plan B** (15–20 min, no risk to user data) for the immediate
rebrand. Plan A becomes the right move when the codebase is otherwise
quiet and a few hours of mechanical-but-careful work won't disrupt
in-flight work.
