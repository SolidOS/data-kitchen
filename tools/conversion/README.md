# conversion/ — HTML ⇄ RDF UI authoring converter

A standalone tool that converts an app's tabs / ⋮-menu / settings UI between
**declarative HTML** and **`ui:` RDF/Turtle**. It was extracted from omp's
runtime when the player went **html-first only** — omp now authors its UI in
`html-first.html` and no longer loads the RDF variant at runtime, so this is a
build-time/offline tool, not part of the app bundle.

## Scripts (run from the omp root)

| npm script | command | what it does |
|---|---|---|
| `gen:rdf` | `node conversion/html-to-rdf.mjs [src.html] [outdir]` | HTML → RDF: derive `data/generated/{tabs,menu,settings}.ttl` from `html-first.html` + `index.html` |
| `gen:rdf:verify` | `… --verify` | diff the output against hand-authored `data/{tabs,menu}.ttl` |
| `gen:html` | `node conversion/rdf-to-html.mjs [rdfdir] [outdir]` | RDF → HTML: emit `*.fragment.html` for inspection/copy-paste |
| `gen:html:verify` | `… --verify` | round-trip stability: HTML → RDF → HTML → RDF |

## Files
- `html-to-rdf.mjs` — HTML → RDF.
- `rdf-to-html.mjs` — RDF → HTML.
- `lib/html-rdf.mjs` — shared mappings + the puppeteer-based DOM parser.

Paths are resolved relative to the omp root (one level up), so the scripts must
be run from the omp project root (the npm scripts already do). `puppeteer-core`
is the only runtime dependency.
