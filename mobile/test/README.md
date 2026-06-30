# dk-pod mobile tests

Tests for the Android build's two own-code surfaces. Both run **on the host —
no device or emulator** — so they're fast and CI-friendly.

| Suite | What it covers | Run |
|---|---|---|
| **Node** (`test/node/*.test.mjs`) | the in-process server stack (`nodejs-src/`): tar extractor, single-origin router, CORS proxy, outbound CONNECT agent | `npm run test:mobile` (from repo root) |
| **Dart** (`test/*.dart`) | the Dart outbound forward proxy + the frontend wiring constants | `flutter test` (from `mobile/`) |

## Node suite (`node --test`)

Same runner as the desktop suite (`node:test` + `node:assert`, zero deps). The
mobile server modules use only Node core, so each test `require`s them directly
and drives them over real loopback HTTP on ephemeral ports.

```bash
npm run test:mobile                                   # all of them, from repo root
node --test "mobile/test/node/router.test.mjs"        # one file
```

- **`untar.test.mjs`** — `untar.cjs`: builds real `tar`/`tar.gz` fixtures and
  asserts regular files, directories, binary fidelity, GNU long names, the
  ustar name/prefix split, raw-vs-gzip auto-detection, symlink skipping, and the
  end-of-archive stop.
- **`router.test.mjs`** — `router.js`: engine files served from disk with the
  right MIME, HEAD, the `%2f`-encoded path-traversal guard (403), 404s,
  reverse-proxy pass-through to a fake CSS upstream, and 502 when the pod is down.
- **`proxy.test.mjs`** — `proxy.js`: `/proxy?uri=…` fetch + content-type
  pass-through, the `uri`/`url` aliases, redirect following, CORS headers, the
  OPTIONS preflight (204), and the 400 / 404 / 502 error paths.
- **`connect-agent.test.mjs`** — `connect-agent.js`: an external host tunnels
  through a fake CONNECT proxy bound at `127.0.0.1:8011`, loopback/`localhost`/
  private-range hosts connect direct (no CONNECT emitted), and a refused CONNECT
  surfaces as a request error. *(Binds port 8011 — the proxy port the agent
  hardcodes — so don't run it while the Dart suite or a device tunnel holds it.)*

`main.js` (the boot orchestrator) isn't unit-tested directly: it has top-level
side effects (installs DNS/agent shims, monkeypatches `net.Server.listen`, then
`main()` boots CSS), so importing it would start a server. Its logic is the four
modules above plus CSS itself; the on-device `Verify` section of `mobile/README.md`
covers the assembled whole.

## Dart suite (`flutter test`)

```bash
cd mobile && flutter test
```

- **`forward_proxy_test.dart`** — `lib/forward_proxy.dart`: starts the proxy,
  opens a real CONNECT tunnel to a local target, and asserts bytes flow both
  ways, plus the 405 (non-CONNECT) and 502 (dead upstream) paths.
  `ForwardProxy.start()` runs a one-time `example.com:443` self-test; it's
  non-fatal offline but costs its ~8s timeout once before the suite proceeds.
- **`frontend_config_test.dart`** — `lib/main.dart`: pins the `kPodOrigin` /
  `kFrontendUrl` wiring (the README's documented frontend swap point). It does
  **not** `pumpWidget(DkPodApp)` — `PodPage.initState` launches the real boot
  pipeline (Node start, proxy bind, polling timers), which can't run in a
  host-VM widget test; the live UI is verified on-device.

## On-device (manual)

End-to-end verification on a connected phone — the `curl` probes against the
running pod, router, and proxy — lives in the **Verify** section of
`mobile/README.md`.
