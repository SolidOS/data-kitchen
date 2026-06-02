# PLAN — Images (Wikimedia Commons) as OMP's 4th library

Status: **IMPLEMENTED + browser e2e PASSED.** Shipped layout evolved past the
original "Option B tree" — see the Update log below for the as-built state.

Browser e2e: `claude/smoke-tests/e2e-images.mjs` (puppeteer-core → system Google Chrome, no bundled browser) drives the live app — Images tab → Art → Tarot Decks → Tarot 1JJ → 18 thumbnails → lightbox → ←/→ paging → click-to-100% zoom — **all checks pass, no console errors**. Screenshots in `claude/validation/images-e2e/`.

## Update log (as-built, post-plan deltas)

- **Selector layout changed: tree → two-column Miller browser** (per user).
  Col 1 stacks the groups (Art / Life) over the selected group's sub-topics;
  col 2 lists the selected sub-topic's collections; a collection click fills
  the masonry grid. (`renderSelector`/`selectGroup`/`selectSubtopic` replaced
  the old `<details>` `renderTree`/`treeNode`.)
- **Lightbox click-to-zoom**: clicking the image toggles a full-bleed,
  actual-size (100%) view that pans via scroll; click again / arrow-key / Esc
  returns to fit. (`setZoom`, `.gallery-lightbox.zoomed` CSS.)
- **Curated regrouping**: Tarot Decks, Tarot Major Arcana, Circus, Water
  Sculpture Gardens moved Life→Art. Held in the served `images.ttl` **and** as
  a `REPARENT` map in the importer (re-import reproduces it). Art 21 / Life 13.
- **Shell (News-side, same work session)**: tab order is now
  **News · Music · Images · Movies**; News is the cold-start landing tab and
  auto-selects its first source via a new `select-first` attr on `<sol-feed>`.
  See [[project_news_tab]]. Also fixed `.omp-tab { line-height: 1.2 }` so the
  taller 🖼 emoji glyph couldn't inflate the Images tab's height.
- **Headless e2e is now available** (resolves the long-standing "browser e2e
  pending" caveat): `puppeteer-core` (omp devDep) + system Chrome. Harnesses:
  `e2e-images.mjs`, `e2e-coldstart.mjs`; see [[reference_headless_e2e]].
- **Committed** to the `solid-web-components` repo (`main`): `sol-feed`
  topics+select-first; `sol-gallery` + `commons-fetch` + `parseBookmarkTree`;
  lightbox-zoom. The `open_media_player` repo is **not** under git.

## What shipped (all four decisions = first choice)
- Data: `claude/migration-scripts/import-images-ttl.mjs` → `libraries/wikimedia_images/images.ttl` (root `#Images`; 2 groups, 34 sub-topics, 758 collections; 15 numeric/malformed `European_Art_Museums` URLs skipped + logged).
- `solid-web-components/web/utils/feed-fetch.js`: added `parseBookmarkTree()` (nested tree, keeps the Art/Life tier the flat `parseSourceList` drops).
- `solid-web-components/web/utils/commons-fetch.js`: `categoryTitleFromUrl` + `getCategoryImages` (CORS-direct, no proxy; thumb/full/license/paging). Smoke test: `claude/smoke-tests/smoke-test-commons.mjs` (passes against live API).
- `solid-web-components/web/sol-gallery.js` + `styles/sol-gallery-css.js`: tree → masonry (CSS multicol) → in-page lightbox (←/→, Esc, license caption, link to Commons). Remembers last collection; auto-opens first group on first visit; hides empty topics (European Art Museums).
- OMP wiring: `src/bundle-entry.js` import; `index.html` 🖼 Images tab, `--tab-images` (violet `#b07cc6`/`#7d4f9e`), `#panel-images` token bridge, panel element, `panels.images`. `npm run build` regenerates both dist bundles.
- Verified: importer round-trips; Commons API live; bundle contains `sol-gallery`; HTTP 200 for index/bundle/images.ttl at `localhost:3000/solid/open_media_player/…` with served bundle md5 == local.

## Next
Nothing outstanding for this feature. (Possible future polish: vertical
centering of the zoomed image; a way to add/edit collections from the UI,
mirroring sol-feed's add forms.)

## 1. Source data

Origin: `/home/jeff/solid-more/MyOldApps/linked-bookmarks/data/images.ttl`
(~773 bookmarks → 758 kept + 15 skipped, 34 sub‑topics, 2 top groups).

Shape (W3C bookmark vocab):
- Two roots: `:Art` ("Images - Art"), `:More` ("Images - Life").
- Sub‑topics `bk:subTopicOf` a root (e.g. `:Photographic_Collections`, `:Tarot_Decks`, `:Circus`…).
- Leaves: `[ a bk:BookMark; bk:hasTopic <subtopic>; rdfs:label "…"; bk:recalls <CommonsCategoryURL> ]`.

### Mismatch vs. the shared parser (`utils/feed-fetch.js → parseSourceList`)
The News tab's parser only recognises leaves typed **`a ui:Link`** with **`ui:label`**, under a **single** `#root`. `images.ttl` uses `a bk:BookMark` + `rdfs:label`, blank nodes, and two roots. Left as‑is it would parse to nothing.

### Decision: normalize on copy (don't bend the shared parser for News)
One‑shot transform `claude/migration-scripts/import-images-ttl.mjs` reads the origin file and emits the canonical bookmark shape into the repo:

- Add a single root `:Images a bk:Topic; ui:label "Images"`.
- Re‑parent `:Art` and `:More` → `bk:subTopicOf :Images` (keep their labels, switch `rdfs:label`→`ui:label`).
- Every sub‑topic: `rdfs:label`→`ui:label` (parser reads `ui:label`/`skos:prefLabel`).
- Every bookmark: give it a stable fragment URI (`:img-0001` …), retype `a ui:Link`, `rdfs:label`→`ui:label`, keep `bk:recalls` + `bk:hasTopic`.

This makes the file consumable by the existing `parseSourceList` **and** by the new tree parser, and keeps future add/edit forms working.

Target: **`libraries/wikimedia_images/images.ttl`** (these are Wikimedia Commons categories, not Internet Archive — folder name reflects that; root IRI `…/images.ttl#Images`).

Data‑quality note: a handful of `European_Art_Museums` leaves use numeric category URLs (`Category:38661163`) that won't resolve to a Commons category — flag/skip in the importer, list them for manual fix later. Not a blocker.

## 2. New component: `<sol-gallery>` (in `solid-web-components/web/`)

Option B isn't a `view` of `sol-feed` (no tree, no lightbox), so it's a new sibling element. It **reuses** sol‑feed's plumbing rather than duplicating it.

Reuse as‑is:
- `core/rdf.js` (rdflib singleton), `core/defaults.js` (`getDefault`/`onDefaultChange`), `core/adopt.js`/`define.js`.
- The CSS‑token bridge pattern (host maps `--bg/--surface/--accent/…`, same as `#panel-news`).

New code:
- **`utils/commons-fetch.js`** — `getCategoryImages(categoryUrl, { thumbWidth })`: parse `Category:Title` out of the wiki URL, call
  `commons…/w/api.php?action=query&generator=categorymembers&gcmtype=file&gcmlimit=N&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=<thumb>&format=json&origin=*`,
  return `[{ title, thumb, full, descUrl, artist?, license? }]`. Handle `continue` for paging; cache per category. CORS‑direct (verified), no proxy.
- **`utils/feed-fetch.js` addition** — `parseBookmarkTree(sourceUri)`: like `parseSourceList` but returns the **nested** tree `{ label, children:[…subtopics…], leaves:[{label,url}] }` so the Art/Life tier survives. (Or a small standalone parser inside the component reusing `core/rdf.js`.) Preference: add the helper so it's testable + reusable.
- **`web/sol-gallery.js`** + **`web/styles/sol-gallery-css.js`** implementing Option B:
  - Left: collapsible tree (Group → Sub‑topic → Collection). Click a collection → load images.
  - Main: justified/masonry grid of lazy `<img>` thumbnails (`loading="lazy"`, IntersectionObserver for paging).
  - Click thumb → **in‑page lightbox overlay** (full image via `iiprop=url`, ← → paging within the collection, Esc to close, caption = title + license/attribution from `extmetadata`, link out to the Commons file page). This replaces sol‑feed's separate `openInReader` window.
  - Remember last‑opened collection in `localStorage` (mirror sol‑feed's `topicsSelectionKey`), scroll it into view.
  - Lazy: mounting only parses the local TTL; no Commons calls until a collection is clicked.

## 3. OMP shell integration (`open_media_player`)

- **`src/bundle-entry.js`**: add `import '../../solid-web-components/web/sol-gallery.js';` (path resolves to the real `solid/solid-web-components`, same as the existing sol‑feed import).
- **`index.html`**:
  - 4th tab button: `🖼 Images`, `data-panel="images"`.
  - Accent: add `--tab-images` (dark + light) — proposal: violet `#b07cc6` / `#7d4f9e`. Add the `.omp-tab[data-panel="images"].active` rule.
  - Panel: `<sol-gallery id="panel-images" source="./libraries/wikimedia_images/images.ttl#Images" hidden></sol-gallery>` in `<main class="omp-panels">`.
  - Token bridge `#panel-images { --bg…; --accent: var(--tab-images); … }` mirroring `#panel-news`, plus the `[data-fontsize]` rules. Give `sol-gallery` the same host sizing rule as `sol-feed` (`width/height 100%; overflow:hidden`).
  - JS: add `images:` to `panels`; it behaves like News (no media element → no pause/mini logic, `show()` already guards with `getMediaElement?.()`). Include in idle‑prefetch loop.
- **Build**: `npm run build` (esbuild via `bin/build.js`) to regenerate `dist/ia-player.js`. Confirm `bin/build.js` bundles whatever `bundle-entry.js` imports (it already pulls sol‑feed from the sibling project).

## 4. Theme

Add `--tab-images` to both `:root` and `[data-theme="light"]`; the per‑panel token bridge derives the gallery's accent from it. Follows the existing per‑media palette system (warm Music / cool Movies / green News / + violet Images). Cross‑reference project memory `project_theme_system`.

## 5. Build / verify order

1. `import-images-ttl.mjs` → `libraries/wikimedia_images/images.ttl`; eyeball it parses (node smoke test using `parseBookmarkTree`).
2. `commons-fetch.js` + a `claude/smoke-tests/smoke-test-commons.mjs` hitting 2–3 real categories.
3. `parseBookmarkTree` helper (+ smoke test on the new ttl).
4. `sol-gallery.js` + css.
5. Wire `bundle-entry.js` + `index.html`; `npm run build`.
6. Browser e2e: switch to 🖼 Images, drill Art → Tarot Decks → Visconti, thumbnails load, lightbox pages, theme + text‑size follow. (Browser e2e has been the standing "pending" step for prior tabs.)

## 6. Open questions for the user — RESOLVED
All resolved to the plan's assumption (user: "your first choice in each case"):
- Folder name → **`wikimedia_images`**.
- Tab label/accent → **`🖼 Images`**, violet (`#b07cc6` / `#7d4f9e`).
- **In-page lightbox** (not the reader window) — later gained click-to-100% zoom.
- `sol-gallery` lives in the shared **`solid-web-components`** repo.

> NB: §2's "collapsible tree" and §5's drill path are the *original* design;
> the shipped selector is a two-column Miller browser (see Update log).
