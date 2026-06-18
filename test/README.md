# Data Kitchen test suite

Runs on the native Node test runner (`node --test`, like component-interop —
no Jest/jsdom). `npm test` is fast, deterministic, and needs **no running app**;
the live UI is covered separately by `npm run test:e2e`.

```
npm test            # unit + data + roundtrip + integration  (fast, no app)
npm run test:unit   # unit + data only
npm run test:integration
npm run test:roundtrip
npm run test:e2e    # drives the real shell — needs the pod/servers (see below)
```

## Layers

| Dir                | What it covers | Needs |
|--------------------|----------------|-------|
| `test/unit/`       | `electron-config/gate.cjs` (the security gate, black-box via `makeGate`); `src/shared/omp-favourites-store.js` builders + grouping (stubbed `fetch`). | nothing |
| `test/data/`       | RDF data contracts: every `plugins/*.ttl` is `ui:Link` XOR `ui:Component`; catalog ↔ manifests stay in sync; `#Tabs/#Bar/#Chrome` menu invariants; folder `manifest.jsonld` fields + paths resolve; sample data validates against the SHACL shapes (`rdf-validate-shacl`). | nothing |
| `test/roundtrip/`  | `rdf2html`/`html2rdf` conversion converges to a stable fixed point (idempotent), in-memory via the sol-components core modules. | chromium (auto-skips if absent) |
| `test/integration/`| Boots the real `router/index.cjs` and `proxy/index.cjs` on ephemeral ports and drives them over HTTP — gate pass/401/blessing, engine serving, proxy `<base>` injection + script-stripping. | nothing |
| `test/e2e/`        | Drives the real shell (`run.mjs`) and asserts the RDF-first UI paints, by sequencing the harnesses in `claude/smoke-tests/`. | running app or pod+servers |

`test/helpers/` holds shared doubles: `mock-http.mjs` (req/res for the gate),
`rdf.mjs` (the shared rdflib singleton + `loadGraph`), `spawn-server.mjs`
(spawn a real server on a free port and wait for it).

## E2E

`npm run test:e2e` auto-detects its environment:
- an Electron dk app already exposing CDP (`electron . --remote-debugging-port=9222`) → runs the CDP harnesses against it;
- otherwise it boots pivot (:3000) + proxy (:3002) from the repo and runs the headless-browser harnesses. This needs the pod to be seeded (pivot serves it) — see `skills.md`.

## Conventions

- Tests never mutate the repo: the round-trip works on in-memory copies, the
  seeder/`ui-data` files are read-only, integration servers run on temp ports.
- New `*.test.mjs` files are auto-discovered by the glob in the npm scripts.
