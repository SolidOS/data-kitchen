# Convert omp chrome to sol-tabs (from-rdf) + sol-button

Goal (user, 2026-06-01): make the tab/button data sources visible in markup
instead of hidden in JS. Tabs → `<sol-tabs from-rdf>`; the two content-launcher
menu items (About, Solid login help) → `<sol-button>` with their source URLs in
`index.html`. Theme/text-size toggles stay plain (no data URL). Keep-alive added
to sol-tabs so audio continuity + player state survive tab switches.

## Pieces
1. **swc `web/sol-tabs.js`** — add `keep-alive`: eager-render every tab into a
   persistent `.sol-tabs-pane`, switch = toggle visibility (no teardown). Thread
   the RDF item id onto each bar button as `data-tab-id` (for per-room colours).
   `web/styles/sol-tabs-css.js` — `.sol-tabs-pane` fill + `[hidden]` rule.
2. **`data/tabs.ttl`** — `ui:Menu #Tabs`, parts = 5 `ui:Component`s
   (News sol-feed · Music/Movies ia-player · Images omp-images · Favourites
   omp-favourites). Per-tab attrs (id=panel-*, source/src, view, etc.) as
   `ui:attribute [schema:name;schema:value]`. id fragments = News/Music/…
3. **`src/bundle-entry.js`** — import sol-tabs, sol-button, sol-include, sol-modal
   (so sol-button's lazy ensureHandler no-ops in the bundle).
4. **`index.html`** — replace `.omp-tab` buttons with `<sol-tabs id="omp-tabs"
   keep-alive from-rdf="./data/tabs.ttl#Tabs">` inside `.omp-panels`; chrome
   (mini + buttons + login + menu) becomes its own bar above. About + login-help
   menu items → `<sol-button handler="sol-include" region="modal" source="./assets/ia-*.html">`.
5. **`assets/omp.css`** — chrome-only top bar; per-room colours on
   `#omp-tabs .sol-tabs-bar > button[data-tab-id="…"].active`; panes fill (flex
   chain), content padding 0; sol-button trigger styled like menu items.
6. **`src/omp-shell.js`** — drop `.omp-tab` click wiring + hidden toggling; listen
   to `sol-tab-change`, map active pane's `#panel-*` id → key; keep pause-on-leave,
   mini-player, gating, favourites routing; resolve panels lazily / on tab ready.
7. **rebuild** `npm run build`; verify with e2e-coldstart + a screenshot.

## Notes
- Source URLs live in `data/tabs.ttl` (required by `from-rdf`); the tabs.ttl URL
  itself is the visible attribute in index.html.
- Eager keep-alive = behaviour parity with today's "mount all 5, toggle hidden".
- Backups: `claude/backups/*.pre-soltabs-2026-06-01`; swc `*.pre-keepalive-*`.

## SHIPPED + evolved (2026-06-01)
All of the above shipped, then the chrome + ⋮ menu evolved further the same day:
- **One-row header**: the chrome (mini + ?/A/🌙 + login + ⋮) is NOT a separate
  bar above — it's `position:absolute` floated over the right of the `<sol-tabs>`
  bar so it shares the tab row (body is `position:relative`).
- **Help `?`** is a `<sol-button handler="sol-include" region="modal"
  source="./assets/omp-help.html">` (content extracted from the old inline
  `.omp-help-overlay`, now deleted).
- **⋮ menu** is now `<sol-dropdown-button source="./data/menu.ttl#More">` (a swc
  `SolMenu` subclass — committed to swc main). Its items are **command items**:
  About/login-help open themed modals via omp's registry; Filters/View deleted/
  Install/Update/View-as-guest dispatch `sol-command`→omp `COMMANDS`. About/login-
  help are no longer `<sol-button>`s.
- **`sol-modal`** now follows light/dark + app font (omp `body{}` token bridge +
  swc `--font-body`).
- **Gating** is capability-based: items declare `acl:mode acl:Write` →
  `part="requires-write"` → omp hides them via `.omp-chrome.no-write` CSS
  (`ownerNow()` renamed `canWrite()`). NOT identity/"owner".
- Full design dialogue + commits: see memory [[project_menu_commands]] and
  [[project_soltabs_solbuttons]]. swc commits: `6cac340`/`6ae8f8e` (keep-alive,
  modal font), `5105285`/`a0e1ae7` (commands, dropdown), `8d41e50` (source),
  `c9d7262` (acl:Write gating), `b13bfab` (menu shape).
