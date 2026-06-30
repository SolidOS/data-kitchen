# dk-pod — Data Kitchen on Android

A standalone Android app that runs the **Data Kitchen server stack on the phone**
— Community Solid Server (CSS/pivot) + a single-origin router + a CORS proxy —
inside an embedded Node.js runtime, and renders a Solid frontend in a WebView.
A writable Solid pod, served and browsed entirely on-device.

This reuses the desktop dk server code (`../pivot`, the router/proxy logic) with
no source fork: the same pre-compiled CSS config approach, just bundled for
mobile.

## Architecture

```
Flutter app (one process)
├─ WebView ─────────────► http://localhost:8000/…           the frontend
│                          • /index.html → dk shell
│                          • /          → SolidOS (mashlib) databrowser
├─ ForwardProxy (Dart) ── 127.0.0.1:8011  CONNECT tunnel → external (outbound fix)
└─ nodejs-mobile (node_flutter) — one Node 18.20.4 process:
   ├─ CSS / pivot      127.0.0.1:8010   the Solid pod (file-backed, no-auth)
   ├─ router           127.0.0.1:8000   engine static + reverse-proxy to CSS
   └─ CORS proxy       127.0.0.1:8001   /proxy?uri=… (routes out via ForwardProxy)
```

- **Node** runs via [`node_flutter`](https://pub.dev/packages/node_flutter)
  (vendored + patched in `third_party/node_flutter`), which embeds
  [`nodejs-mobile`](https://github.com/nodejs-mobile/nodejs-mobile) — we supply
  the **Node 18.20.4** community build (CSS 7.x needs Node ≥18).
- Desktop dk spawns 3 child Node processes; mobile has no `node` binary to exec,
  so `nodejs-src/main.js` starts CSS + router + proxy **in one process**.
- Two **frontends** coexist, picked by `kFrontendUrl` in `lib/main.dart`:
  the **dk shell** (`/index.html`) and **SolidOS/mashlib** (`/`, the CSS
  databrowser). mashlib is served by a mobile-only CSS config variant
  (`../pivot-config/dk-pivot-mobile.json`).

## Build & run

Prereqs: Flutter SDK, Android SDK + **NDK 27.0.12077973** (the vendored plugin
pins it), and a JDK 17+ (Flutter's Gradle build needs `javac`).

```bash
# 1. one-time: fetch the nodejs-mobile prebuilt (libnode.so, gitignored)
bash mobile/tool/fetch-libnode.sh

# 2. one-time / when pivot config changes: compile the mobile CSS config
bash pivot/build-compiled-config.sh mobile      # -> pivot/dist/create-app-mobile.cjs

# 3. assemble the Node project bundle (gitignored; re-run after editing nodejs-src/)
bash mobile/tool/prepare-node-project.sh

# 4. build + install
cd mobile && flutter pub get && flutter build apk --debug
adb install -r build/app/outputs/flutter-apk/app-debug.apk
```

First launch extracts the bundled CSS `node_modules` (~19.5k files) on-device
(~8 s) and seeds the pod, then the WebView loads the frontend.

**Iterating:** after changing shell assets (re-run `prepare-node-project.sh` +
rebuild), a plain `adb install -r` is enough — **no `pm clear` needed**. The
on-device extraction sentinels (`.engine-extracted`, `.dk-seeded`,
`node_modules/.extracted`) record the **source tarball's byte size**, so a
changed bundle re-extracts itself on the next launch. (The engine and pod live
outside `nodejs-project`, which `node_flutter` resets on reinstall, so a bare
"done" flag there used to survive updates and serve a stale tree — see
`ensureExtract` in `nodejs-src/main.js`. The engine is wiped+re-extracted; the
pod is overlaid so CSS's account store and user data survive.)

## Mobile UI (phone look & feel)

The dk shell is the **same** `index.html` the desktop Electron app loads — the
phone styling is layered on without touching desktop, scoped entirely behind a
touch media query (`@media (hover: none) and (pointer: coarse)`): desktop is a
mouse pointer, so those rules are unreachable there by construction. Pieces:

- **Shell chrome** (`../assets/dk-chrome.css`): room tabs → a horizontal-scroll
  strip; chrome actions (`.sol-tabs-launch`) → a fixed bottom dock; mini-player
  → sticky above it; safe-area insets via `env()` (needs `viewport-fit=cover`
  on the `<meta name=viewport>` in `../index.html`).
- **Phone text tiers**: 14 / 16 / 18px (small/medium/large), down from desktop's
  16/20/24, also in `dk-chrome.css`. The phone has no "A" button, so
  `../src/dk-settings-applier.js` **defaults a touch device to the small tier**
  (14px) when there's no saved `dk:fontsize` choice.
- **News feed** (`sol-feed`, in sol-components): on touch, `_readerInline()` is
  off → full-width article list + pop-out reader instead of the desktop's
  side-by-side reading pane; the source picker is a horizontal scroll strip.

Verify the phone look from the desktop app via CDP by emulating the touch media
features (`pointer:coarse` / `hover:none`) — both the CSS and the `matchMedia()`
gates respond to it, so it faithfully reproduces the phone path. See
`../claude/smoke-tests/cdp-verify-mobile.mjs`.

## Verify (on a connected device)

```bash
adb forward tcp:8000 tcp:8000 && adb forward tcp:8001 tcp:8001
curl -H 'Accept: text/turtle' http://localhost:8000/            # pod root (LDP container)
curl http://localhost:8000/index.html                            # dk shell HTML
curl 'http://localhost:8001/proxy?uri=https://example.com/'      # outbound via Dart proxy → 200
```
Use `localhost` (not `127.0.0.1`) so the Host header matches CSS's `baseUrl`.

## How the pieces map to files

| Concern | File |
|---|---|
| In-process boot (CSS + router + proxy, extraction, DNS/agent setup) | `nodejs-src/main.js` |
| Router (engine static + proxy to CSS) | `nodejs-src/router.js` |
| CORS proxy | `nodejs-src/proxy.js` |
| Outbound routing (CONNECT agents → Dart proxy) | `nodejs-src/connect-agent.js` |
| Dart loopback CONNECT proxy (the outbound fix) | `lib/forward_proxy.dart` |
| Flutter UI + WebView | `lib/main.dart` |
| no-ICU `marked` stub | `nodejs-src/patches/marked.cjs` |
| Tar extractor (gunzip + ustar/GNU) | `nodejs-src/untar.cjs` |
| Bundle assembler (engine.nmz, pod-seed.nmz, node_modules.nmz) | `tool/prepare-node-project.sh` |
| nodejs-mobile prebuilt fetch | `tool/fetch-libnode.sh` |

## nodejs-mobile workarounds (this is the interesting part)

nodejs-mobile is a constrained runtime; several things needed solving:

- **No ICU** (`v8_enable_i18n_support=0`) → `\p{…}` Unicode regexes throw. CSS's
  MarkdownToHtmlConverter requires `marked`, which uses them → stubbed
  (`patches/marked.cjs`). mashlib's `\p{…}` is client-side (WebView has ICU), fine.
- **AAPT mangles `.gz` assets** (gunzips + renames) → ship the bundle as
  `node_modules.nmz`/`engine.nmz`/`pod-seed.nmz` (neutral ext) + `noCompress` in
  `android/app/build.gradle.kts`; `untar.cjs` auto-detects gzip.
- **Broken DNS + outbound sockets** → node can't reach the internet directly
  (sockets don't route on a multi-network device; `bindProcessToNetwork` made it
  worse and broke loopback). Fix: route node outbound through the **Dart**
  `ForwardProxy` (CONNECT tunnel on loopback); Dart sockets route fine on Android.
- **Broken global `fetch` (undici)** → unused; CSS uses node-fetch/http, routed
  via the global agents.

## Known limitations / TODO

- dk shell runs in **degraded mode**: no Electron bridge, so settings save,
  music import, the IdP vault, and the inline native reader pane show notices /
  don't render. A Flutter↔JS bridge would restore them. One unguarded
  `window.dkElectron.restart()` (`../src/dk-config-settings.js`) can throw on the
  settings page. (The news feed works regardless: on touch it uses the pop-out
  reader, so tapping an article navigates the WebView to it — use the Flutter
  home button to return.)
- `node_flutter`'s `flutter-bridge` linked binding doesn't register (readiness is
  done by HTTP polling instead).
- Node runs via `Nodejs.start()` (app-process), not the foreground service —
  background survival is unaddressed.
- Debug APKs trigger a Samsung "16 KB page-size" warning (`libnode.so` isn't
  16 KB-aligned) — harmless for testing; matters for a Play-Store release build.
- Remote login (CSS server-side OIDC) should work now that outbound is fixed, but
  isn't live-tested.
