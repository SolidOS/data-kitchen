# Claude-authored artifacts for data-kitchen

## `plans/`

- **`data-kitchen-consolidation-plan.md`** — the approved consolidation plan
  (2026-06-10): electron shell + old dk + open_media_player merge into this
  repo; mini-app self-containment; builders in sol-components; eventual
  landing on solidOS/data-kitchen (execute-only-on-GO).
- **`PLAN-architecture.md`** — earlier canonical plan file. Includes
  status, goal, repo layout, all sub-system designs (auth sharing,
  sol-default, theming, shared editor system with two modes,
  package dedup), UI sketches, build order across all phases, and
  a "Next steps" section listing outstanding work.

## `smoke-tests/`

Puppeteer-driven diagnostic scripts. Each opens
`http://localhost:8081/` (run `npm run serve` first), inspects the
DOM, and prints results + drops a screenshot. Useful for
regression-checking after refactors.

- `diag-customElements.mjs` — verifies every expected sol-* and
  dk-* class is registered, plus rendered shadow content for a
  basic sol-time.
- `diag-layout.mjs` — element bounding-box measurements for the
  dashboard layout.
- `diag-podz.mjs` — clicks the Podz menu item, verifies the pod
  panels and splitter mount, and grabs `phase1-podz.png`.
- `diag-default.mjs` — exercises `<sol-default>` cascade: confirms
  sol-feed picks up the proxy from sol-default, dispatches one
  `sol-default-change` event on mutation, and that consumers
  reload.
- `diag-phase2.mjs` — chrome chip checks (dk-account, theme
  toggles, font toggle, persistence, `#auth` parsing, `dkFetch`).
- `diag-editor-self.mjs` — toggling `editor-self` on a sol-time
  renders the gear; click opens modal.
- `diag-settings.mjs` — sol-settings → sol-accordion shape:
  exactly one accordion, one details panel per editable widget,
  feeds excluded, no `[Edit]` buttons or `sol-modal`, first panel
  lazy-mounts a sol-form. Drops `settings-accordion.png`.
- `diag-podz-theme-leak.mjs` — visits Podz then returns Home;
  snapshots computed `--bg`/`--text`/`--accent` + body & chrome
  padding before/during/after to confirm podz.css's scoped rules
  don't bleed. Drops `podz-theme-leak.png`.
- `diag-podz-keepalive.mjs` — three Home↔Podz round trips;
  asserts a single `<dk-podz>` is reused throughout, sol-pod
  count stable, remount warning never fires. Drops
  `podz-keepalive.png`.
- `diag-rename-and-search.mjs` — confirms data-kitchen-settings.ttl
  / `#Settings` is wired through sol-default + sol-form + the
  applier, and that sol-search reads engines from the
  `schema:ItemList` source with `hydra:template` expansion.
- `diag-calendar-prefetch.mjs` — ICS fetches kick off at page load
  while the calendar popout is still closed; status text remains
  invisible until the user opens the popout.
- `diag-accordion-closed.mjs` — Settings accordion opens with every
  panel collapsed (`start-closed` on `<sol-accordion>`).
- `diag-solfetch.mjs` — `solFetch` contract: 401 with no
  `<sol-login>` → returns 401 immediately; 401 with a listener →
  retries and gets 200. Also checks the "Preferences" label
  override on `<sol-default>`.
- `diag-auth-integration.mjs` — chrome wiring after steps 3–5:
  `<sol-login mode="popup">` mounted with issuers,
  `<sol-default default-issuer>` carried, `dkFetch` routes through
  `solFetch`, prior smokes (engines, accordion, labels) still pass.
- `diag-auth-indicator.mjs` — sol-login hidden by default; fake
  `sol-login` event paints the Settings gear green +
  WebID-as-title; `sol-logout` reverts; `sol-auth-needed` toggles
  `:host([active])` during the prompt.
- `phase{1,2}-*.png` — last screenshot for each phase. Useful
  as a visual baseline.

### sol-components migration verifiers (2026-06-08, Playwright)

Added with the `solid-web-components` → `sol-components` migration. Unlike the
older `diag-*` scripts these assert **behavior, not just registration**
(`customElements.get` passing while nothing renders is exactly how the first
pass missed a broken menu + dead buttons). They drive Chrome via Playwright
(imported from podz's `node_modules/playwright-core`), so run with the dev
server up (`npm run serve`) — `node claude/smoke-tests/<file>`.

- `verify-sol-components-migration.mjs` — PASS/FAIL functional check (exits
  nonzero on failure): component-interop ready + `SolidWebComponents` alias,
  AuthManager published, the menu **renders its items** (tabs), clicking the
  Podz tab mounts `dk-podz`, the SolidResources dropdown opens, Help + Settings
  buttons mount their panes, a **single** rdflib instance loads, and no
  `solid-web-components` (old-name) requests / unexpected console errors.
- `verify-podz-tab.mjs` — mounts `<dk-podz>` and confirms the refreshed ESM
  podz bundle loads, both `sol-pod`s upgrade, and rdflib stays a single shared
  instance (no second copy).

## What's not here

- Application source (`src/`), data (`data/`), build config
  (`esbuild.config.mjs`), or the importmap — those are dk's own
  code at the project root, not Claude artifacts.
- User notes / drafts. None in this project so far; if any are
  authored later they live wherever the user keeps them (often
  `drafts/` or project root), not under `claude/`.
