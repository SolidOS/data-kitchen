# conversion/ — edit the shell as HTML (rdf2html ⇄ html2rdf)

The dk shell is **rdf-first**: `data/data-kitchen-main-menu.ttl` is the only live artifact —
the topmost tabset renders from it at runtime (the inline
`<sol-tabs from-rdf="./data/data-kitchen-main-menu.ttl#Tabs">` in `index.html` plus
`src/dk-tabs-rdf.js` for the `#Bar` / `#Chrome` launchers). These two scripts
exist for people who prefer editing the shell as declarative HTML:

```
npm run rdf2html      # data/data-kitchen-main-menu.ttl → tools/conversion/shell.html
(edit the snapshot)
npm run html2rdf      # tools/conversion/shell.html → data/data-kitchen-main-menu.ttl
```

## Scripts (run from the dk root)

| npm script | command | what it does |
|---|---|---|
| `rdf2html` | `node tools/conversion/rdf2html.mjs [out.html]` | emit the editable snapshot (default `tools/conversion/shell.html`, gitignored) |
| — | `… --verify` | compare the snapshot against what tabs.ttl generates, don't write |
| `html2rdf` | `node tools/conversion/html2rdf.mjs [in.html]` | merge the snapshot's tabs + bar back into `data/data-kitchen-main-menu.ttl` |

Both directions are sol-components core modules (`core/menu-generate.js` emits,
`core/menu-html.js` harvests — exact inverses), so the snapshot round-trips:
`rdf2html → html2rdf → rdf2html --verify` is clean.

## What round-trips

- **Tabs** (`#Tabs`) — lossless: label, id, handler, region, every attribute,
  submenus, and the documentary HTML comments (`rdfs:comment`).
- **Bar items** (`#Bar`) — best-effort: a non-button item's label is recovered
  from its `title`; edit bar labels via the Customize builder when it matters.
- **Chrome** (`#Chrome`) — emitted into the snapshot for reference, but **not
  imported** by html2rdf; edit `data/data-kitchen-main-menu.ttl#Chrome` directly (it self-heals
  if a mandatory item is dropped).
- **Pantry** — items not in any menu survive an import untouched
  (`updateMenuInStore` rebuilds only the two menus).

html2rdf needs a DOM for the harvester, so it runs it in a headless chrome
page (playwright-core from `../podz`, `/usr/bin/google-chrome` — the same
launch the smoke tests use).

*(The omp-era `html-to-rdf.mjs` / `rdf-to-html.mjs` pair that previously lived
here targeted the old single-menu RDF shape and an app that loaded either
variant at runtime; retired 2026-06-12 with the rdf-first switch — see git
history.)*
