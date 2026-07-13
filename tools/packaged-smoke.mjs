// Packaged-app smoke test — catches "ships but cannot boot" packaging holes.
// Two of those reached users in one day (v2.1.0–2.1.4): server-core.cjs and
// pod-template/ were both missing from build.files, invisible in dev because
// the repo tree has them. Dev runs can never catch this class — only the
// PACKED tree can.
//
//   1. STATIC  — required files exist in release/linux-unpacked/resources/app
//                (fails on any build.files omission of a boot-critical path).
//   1b. MAC    — the same REQUIRED list against the unpacked mac .app in
//                release/mac/ (present between dist:cross and release:prep's
//                prune), plus mac-only shape checks: main binary + exec bit,
//                framework symlinks intact, extraResources landed, Info.plist
//                version matches package.json. A mac binary can't BOOT on
//                linux, so this static pass is the only LOCAL mac gate; the
//                mac-smoke GitHub workflow boots the shipped zip on a real
//                mac runner via SMOKE_MAC_APP mode (see Usage below).
//   2. BOOT    — launch the packed binary against a THROWAWAY pod home on
//                spare ports; assert the personal-pod seed plants files (the
//                WebID card — the v2.1.4 Windows 404), the app page loads,
//                and the servers came up. Never touches the real pod or
//                userData (env overrides + --user-data-dir).
//
// Usage:  node tools/packaged-smoke.mjs          (after `npm run dist:cross`)
//         SKIP_BOOT=1 node tools/packaged-smoke.mjs   (static checks only —
//                                                      e.g. headless CI without a display)
//         SMOKE_MAC_APP="/path/to/Solid Data Kitchen.app" node tools/packaged-smoke.mjs
//             mac-artifact mode (a real mac, e.g. the mac-smoke GitHub
//             workflow): skip the linux checks, run the mac static checks
//             against THAT .app and BOOT its binary. SMOKE_EXPECT_VERSION
//             overrides the Info.plist version to assert (defaults to
//             package.json's — pass it when testing an older release).
// Run automatically by tools/prepare-release.mjs while linux-unpacked exists.
import { spawn } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const MAC_APP = process.env.SMOKE_MAC_APP || '';
const unpacked = join(root, 'release', 'linux-unpacked');
const appDir = join(unpacked, 'resources', 'app');

const PORT = 18400;                       // spare ports — never the live 8000/8010/8001
const CSS_PORT = 18410;
const PROXY_PORT = 18401;

function fail(msg) { console.error(`[smoke] FAIL: ${msg}`); process.exit(1); }
function ok(msg) { console.log(`[smoke] ok — ${msg}`); }

if (!MAC_APP && !existsSync(appDir)) fail(`no ${appDir} — run \`npm run dist:cross\` first`);

// ── 1. static: every boot-critical path must be in the packed tree ──────────
// One entry per subsystem that dies silently when its files are missing.
const REQUIRED = [
  'electron-config/main.cjs',
  'server-core.cjs',                        // router+proxy shared core (v2.1.4 hole)
  'router/index.cjs',
  'proxy/index.cjs',
  'pivot/run-server.cjs',
  'pivot/dist/create-app.cjs',              // compiled server config
  'pod-template/profile/card$.ttl',         // the local WebID seed (v2.1.5 hole)
  'pod-template/settings/prefs.ttl',
  'index.html',
  'src/dk-wormhole-guard.js',
  'dist/dk.bundle.js',
  'ui-data/data-kitchen-settings.ttl',
  'pages/settings.html',
  'plugins/solidos/sol-solidos-host.html',
  'node_modules/sol-components/web/sol-form.js',
  'node_modules/component-interop/component-interop.js',
  'node_modules/mashlib/dist/mashlib.min.js',
  'node_modules/open-media-player/omp.manifest.json',
];
if (!MAC_APP) {
  const missing = REQUIRED.filter((r) => !existsSync(join(appDir, r)));
  if (missing.length) fail(`packed app is missing:\n  ${missing.join('\n  ')}\n→ check build.files in package.json`);
  ok(`all ${REQUIRED.length} boot-critical files present in the packed tree`);
}

// ── 1b. mac static: same holes + mac-only bundle shape ──────────────────────
// The mac zip ships with ZERO testing otherwise — a mac binary can't boot on
// linux, but every packaging-class failure so far (v2.1.4, v2.1.5) was
// STATICALLY visible. release/mac/ exists between dist:cross and the
// release:prep prune; when it's absent the mac build simply wasn't (re)built,
// which deserves a loud warning, not a fail. In SMOKE_MAC_APP mode the .app
// was named explicitly, so missing IS a failure.
const macApp = MAC_APP || join(root, 'release', 'mac', `${pkg.build.productName}.app`);
if (!existsSync(macApp)) {
  if (MAC_APP) fail(`SMOKE_MAC_APP points at ${macApp} but it does not exist`);
  console.warn(`[smoke] WARNING: ${macApp} missing — mac checks SKIPPED (run dist:cross to re-verify the mac build)`);
} else {
  const macAppDir = join(macApp, 'Contents', 'Resources', 'app');
  const macMissing = REQUIRED.filter((r) => !existsSync(join(macAppDir, r)));
  if (macMissing.length) fail(`mac .app is missing:\n  ${macMissing.join('\n  ')}\n→ check build.files in package.json`);
  ok(`mac: all ${REQUIRED.length} boot-critical files present in the .app`);

  // extraResources — the linux BOOT test covers this implicitly; mac never boots
  // here, so assert the CSS install landed where servers.cjs expects it.
  const cssPkg = join(macAppDir, 'pivot', 'node_modules', '@solid', 'community-server', 'package.json');
  if (!existsSync(cssPkg)) fail('mac .app has no pivot/node_modules — extraResources did not land');
  ok('mac: pivot/node_modules (extraResources) present');

  // The launchable binary must exist and be executable — a zip/copy step that
  // drops mode bits produces an .app that finder refuses to open.
  const macBin = join(macApp, 'Contents', 'MacOS', pkg.build.productName);
  if (!existsSync(macBin)) fail(`mac .app has no Contents/MacOS/${pkg.build.productName} binary`);
  if (!(statSync(macBin).mode & 0o111)) fail('mac main binary is not executable — mode bits were lost');
  ok('mac: main binary present and executable');

  // Framework symlinks (Versions/A indirection) must survive as REAL symlinks —
  // a copy that materializes or drops them yields a corrupt bundle after unzip.
  const fwLink = join(macApp, 'Contents', 'Frameworks',
    'Electron Framework.framework', 'Electron Framework');
  if (!existsSync(fwLink)) fail('Electron Framework symlink is missing or dangling in the mac .app');
  if (!lstatSync(fwLink).isSymbolicLink()) fail('Electron Framework is not a symlink — bundle structure was flattened');
  ok('mac: framework symlinks intact');

  // Version stamp — a stale release/mac/ from a previous build otherwise
  // passes every file check and ships the WRONG app.
  const expectVersion = process.env.SMOKE_EXPECT_VERSION || pkg.version;
  const plist = readFileSync(join(macApp, 'Contents', 'Info.plist'), 'utf8');
  const m = plist.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/);
  if (!m) fail('mac Info.plist has no CFBundleShortVersionString');
  if (m[1] !== expectVersion) fail(`mac .app is v${m[1]}, expected v${expectVersion} — stale build/artifact`);
  ok(`mac: Info.plist version ${m[1]} matches expected v${expectVersion}`);
}

if (process.env.SKIP_BOOT === '1') { console.log('[smoke] SKIP_BOOT=1 — boot test skipped'); process.exit(0); }

// ── 2. boot: packed binary, throwaway home, spare ports ─────────────────────
// linux: the binary is named after package.json "name" (electron-builder's
// linux executableName default) — never guess by mode bits alone, the dir is
// full of executable Electron helpers (chrome-sandbox, crashpad, *.so).
// SMOKE_MAC_APP mode: the bundle's Contents/MacOS/<productName> binary.
const appName = pkg.name;
const bin = MAC_APP
  ? join(macApp, 'Contents', 'MacOS', pkg.build.productName)
  : [appName, appName.toLowerCase()].map((n) => join(unpacked, n)).find((f) => existsSync(f));
if (!bin || !existsSync(bin)) fail(MAC_APP ? `no binary at ${bin}` : `no ${appName} binary found in linux-unpacked/`);

const tmp = mkdtempSync(join(tmpdir(), 'dk-smoke-'));
const podHome = join(tmp, 'pod');
const userData = join(tmp, 'userData');

console.log(`[smoke] booting ${bin}\n[smoke] pod home ${podHome}, ports ${PORT}/${CSS_PORT}/${PROXY_PORT}`);
const child = spawn(bin, ['--no-sandbox', '--disable-gpu', `--user-data-dir=${userData}`], {
  env: {
    ...process.env,
    DK_POD_ROOT: podHome,
    DK_PUBLIC_PORT: String(PORT),
    DK_CSS_INTERNAL_PORT: String(CSS_PORT),
    DK_PROXY_PORT: String(PROXY_PORT),
  },
});

let log = '';
const onData = (d) => { log += d.toString(); };
child.stdout.on('data', onData);
child.stderr.on('data', onData);

const DEADLINE = Date.now() + 120_000;
const until = async (name, test) => {
  while (Date.now() < DEADLINE) {
    const m = test();
    if (m) { ok(name); return m; }
    if (child.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  console.error(`[smoke] --- captured output (tail) ---\n${log.split('\n').slice(-40).join('\n')}`);
  child.kill('SIGKILL');
  fail(`timed out waiting for: ${name}`);
};

try {
  // The personal-pod seed must PLANT files into the fresh home (0 new means
  // the template is missing from the package — alain's Windows symptom).
  const seed = await until('personal-pod seed ran', () => log.match(/\[seed:pod\] (\d+) new/));
  if (Number(seed[1]) < 5) fail(`seed:pod planted only ${seed[1]} files into a FRESH home — template missing/incomplete`);
  ok(`seed planted ${seed[1]} files`);

  await until('WebID card exists on disk', () =>
    existsSync(join(podHome, 'dk-pod', 'profile', 'card$.ttl')) || null);

  await until('app page loaded from the packed servers', () =>
    log.includes(`[app] loaded http://localhost:${PORT}/index.html`) || null);

  // The front door answers (401 without the gate token IS the healthy signal
  // — it means the router is up and guarding).
  const res = await fetch(`http://localhost:${PORT}/`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (!res) fail(`router on :${PORT} did not answer`);
  ok(`router answers on :${PORT} (HTTP ${res.status})`);

  console.log('[smoke] PASS — packaged app boots, seeds, and serves');
} finally {
  child.kill('SIGTERM');
  setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 3000).unref();
  setTimeout(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} }, 4000).unref();
}
process.exit(0);
