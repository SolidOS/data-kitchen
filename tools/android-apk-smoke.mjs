// Android APK smoke — the static layer of the packaged-app gate, for the
// artifact GitHub runners cannot boot: the APK ships full native payloads
// only for the arm ABIs (x86_64 has no libnode.so), and GH runners can't
// emulate arm64 Android, so a real boot needs a device (the S23 sideload
// checks). Every packaging failure that reached users (v2.1.0–2.1.5) was
// STATICALLY visible, and this asserts exactly that class:
//   - each shipped arm ABI carries the full native set (libnode etc.)
//   - the nodejs-mobile project payload is present and non-trivial
//     (engine/node_modules/pod-seed tarballs, the WebID card seed)
//   - versionName matches the release tag (stale-artifact guard), via
//     aapt when available (AAPT env or $ANDROID_HOME/build-tools)
//
// Usage:  SMOKE_APK=release/Solid_Data_Kitchen-<ver>-android.apk \
//         [SMOKE_EXPECT_VERSION=<ver>] [AAPT=/path/to/aapt] \
//         node tools/android-apk-smoke.mjs
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const APK = process.env.SMOKE_APK || '';

function fail(msg) { console.error(`[apk-smoke] FAIL: ${msg}`); process.exit(1); }
function ok(msg) { console.log(`[apk-smoke] ok — ${msg}`); }

if (!APK) fail('set SMOKE_APK=<path to the android apk>');
if (!existsSync(APK)) fail(`${APK} does not exist`);

// ── listing (an APK is a zip; unzip -l gives size + name per entry) ─────────
const uz = spawnSync('unzip', ['-l', APK], { encoding: 'utf8' });
if (uz.status !== 0) fail(`unzip -l failed: ${uz.stderr || uz.status}`);
const entries = new Map();
for (const line of uz.stdout.split('\n')) {
  const m = line.match(/^\s*(\d+)\s+\S+\s+\S+\s+(\S.*)$/);
  if (m) entries.set(m[2], Number(m[1]));
}
if (!entries.size) fail('could not parse the APK listing');

const need = (name, minBytes = 1) => {
  const size = entries.get(name);
  if (size === undefined) fail(`APK is missing ${name}`);
  if (size < minBytes) fail(`${name} is only ${size} bytes (expected ≥ ${minBytes}) — truncated payload`);
};

// Shipped arm ABIs must each carry the FULL native set — a partial set means
// fetch-libnode / gradle packaging dropped a piece and the app dies at boot.
const NATIVE = ['libnode.so', 'libflutter.so', 'libapp.so',
  'libnodejs-mobile-flutter-native-lib.so', 'libc++_shared.so'];
for (const abi of ['arm64-v8a', 'armeabi-v7a']) {
  for (const so of NATIVE) need(`lib/${abi}/${so}`);
  need(`lib/${abi}/libnode.so`, 20_000_000);   // the runtime — truncation guard
  ok(`${abi}: full native set (libnode ${Math.round(entries.get(`lib/${abi}/libnode.so`) / 1e6)}MB)`);
}

// The nodejs-mobile project payload — servers, engine, pod seeds.
const NP = 'assets/nodejs-project/';
need(NP + 'main.js');
need(NP + 'package.json');
need(NP + 'dist/create-app.cjs', 10_000);      // compiled CSS config
need(NP + 'connect-agent.js');
need(NP + 'pod-template.cjs');
need(NP + 'pod-template/profile/card$.ttl');   // the WebID seed (v2.1.5 hole)
need(NP + 'engine.nmz', 1_000_000);
need(NP + 'node_modules.nmz', 10_000_000);
need(NP + 'pod-seed.nmz', 10_000);
ok('nodejs-project payload complete (engine/node_modules/pod-seed + WebID seed)');

need('assets/flutter_assets/AssetManifest.bin');
need('AndroidManifest.xml');
ok('flutter assets + manifest present');

// ── versionName via aapt (stale-artifact guard) ─────────────────────────────
const expect = process.env.SMOKE_EXPECT_VERSION || pkg.version;
let aapt = process.env.AAPT || '';
if (!aapt && process.env.ANDROID_HOME) {
  const bt = join(process.env.ANDROID_HOME, 'build-tools');
  if (existsSync(bt)) {
    const latest = readdirSync(bt).sort().pop();
    if (latest) aapt = join(bt, latest, 'aapt');
  }
}
if (aapt && existsSync(aapt)) {
  const dump = spawnSync(aapt, ['dump', 'badging', APK], { encoding: 'utf8' });
  const vm = (dump.stdout || '').match(/versionName='([^']+)'/);
  if (!vm) fail('aapt gave no versionName');
  if (vm[1] !== expect) fail(`APK is v${vm[1]}, expected v${expect} — stale build/artifact`);
  ok(`versionName ${vm[1]} matches expected v${expect}`);
} else {
  console.warn('[apk-smoke] WARNING: no aapt found (set AAPT or ANDROID_HOME) — versionName check skipped');
}

console.log('[apk-smoke] PASS — APK payload is complete');
