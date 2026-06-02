# News tab — plan & as-built

**Status: Implemented (code) 2026-05-30; browser e2e pending.**

## Goal
A third top-level tab, **News**, beside Music and Movies — a "newsstand":
**topics** (News / Sci-Tech / Culture) as columns, each listing its
**sources** (NY Times, Guardian, …); click a source to see its
**articles** as image cards; click a card to open the full article in a
shared `window.open` reader window.

## Approach — reuse `sol-feed`
The news viewer already exists: `sol-feed`
(`../../solid-web-components/web/sol-feed.js`), which OMP already consumes
by source (like `<sol-login>`). It has feed-catalog parsing
(`parseSourceList`), RSS/Atom fetch (`getFeedItems` → items with
`title/link/image/pubDate/source`), an article image-card renderer
(`newsCard`), and the shared reader window (`openInReader`).

Its three stock views (`feed`/`topic`/`all`) don't do the desired
topic-columns drill-down, so we added a **new `view="topics"` mode**
(additive — existing views and other consumers untouched).

## What was built

### In `solid-web-components` (additive)
- **`web/sol-feed.js`** — `renderTopics()` + a `view === 'topics'` branch
  in `connectedCallback`. Renders one `.feed-topic-column` per topic
  (header + scrollable `.feed-source-list`), with the shared
  `.feed-articles` card grid below. Clicking a source loads its articles
  (reusing `groupByTopic`/`resolveSources`/`ensureSource`/`newsCard`),
  newest-first. No source auto-selected on mount → **no feed network
  until the user clicks** (only the local `feeds.ttl` is parsed).
  - **Loading/error/empty messages** render in the articles area
    (via a local `showMsg`), not the status strip above the columns.
  - **Selection persisted**: `topicsSelectionKey`
    (`sol-feed:topic-source:<source>`) saves the chosen source URL; on
    mount the remembered source is re-selected, its articles reloaded,
    and it is `scrollIntoView({block:'nearest'})`'d within its column.
- **`web/styles/sol-feed-css.js`** — `.feed-topic-columns` /
  `.feed-topic-column` / `.feed-topic-head` / `.feed-topic-col-list`
  (column band reuses the all-view's top-bar tint). News card overrides
  (scoped to `.sol-feed-list.topics`): shorter cards
  `aspect-ratio: 9/4`, title `font-size: 1em` (tracks host `--font-size`)
  clamped to 3 lines. `.feed-link.selected` gained an optional
  `--selected-fg` token (defaults to old behaviour) so a host can set a
  readable text colour over a strong `--focus-bg` fill.

### In `open_media_player`
- **`libraries/news/feeds.ttl`** — copied from
  `../../solid-web-components/data/feeds.ttl` (bookmark ontology: `bk:Topic`
  + `ui:label` + `bk:subTopicOf`, root `#Feeds`; `ui:Link` + `bk:recalls`
  + `bk:hasTopic` + `ui:label` sources).
- **`src/bundle-entry.js`** — added `import …/web/sol-default.js` and
  `import …/web/sol-feed.js` next to the sol-login import.
- **`index.html`**:
  - `<sol-default proxy="http://localhost:3002/proxy?uri=">` at top of
    `<body>` — page-wide CORS proxy; `sol-feed` reads it via
    `getDefault('proxy')`; each fetch becomes `<proxy><feedURL>`.
  - `📰 News` tab + `<sol-feed id="panel-news" view="topics"
    source="./libraries/news/feeds.ttl#Feeds">` panel; `panels.news`
    entry in the switcher.
  - **Theme bridge** on `#panel-news` maps sol-feed's tokens
    (`--bg/--surface/--border/--text/--text-muted/--accent/--link/--hover`)
    onto OMP's `--ia-*`; selected source uses `--focus-bg: var(--tab-news)`
    + `--selected-fg: var(--tab-on)` (matches the tab).
  - **News room accent** `--tab-news` (dark `#6fae6f` / light `#2f7d4f`)
    + `.omp-tab[data-panel="news"].active` rule.
  - **Article title size tracks the A text-size setter**:
    `[data-fontsize="small|medium|large"] #panel-news { --font-size: 16/20/24px }`
    (medium = 20px). Title is `1em` of host `--font-size`.
  - Host sizing `.omp-panels sol-feed { width/height:100%; overflow:hidden }`
    — **no `display`** (a higher-specificity `display:block` would break
    `:host`'s flex chain → article grid wouldn't scroll). sol-feed scrolls
    only its `.feed-articles`; the topic columns stay pinned.

## Operational note
Live RSS is cross-origin → needs the proxy at
`http://localhost:3002/proxy?uri=` running. Without it the columns +
sources render, but clicking a source shows a CORS error in the articles
area.

## Verify (pending)
Build (`npm run build`), serve, open the News tab: green tab accent; three
topic columns with sources; click source → article image cards; click
card → reader window (reused on a second click); A button rescales titles
(medium 20px); reload restores + scrolls to the selected source; only the
article grid scrolls.
