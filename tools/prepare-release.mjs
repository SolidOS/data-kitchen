// Release-folder freshness for the in-app updater (electron-config/update-check.cjs).
//
//   node tools/prepare-release.mjs            normalize + prune + write latest.json
//   node tools/prepare-release.mjs --check    verify only (exit 1 when stale)
//
// For the CURRENT package.json version this script:
//   1. finds the four user-download artifacts in release/ and normalizes their
//      names to the convention  Solid_Data_Kitchen-<ver>-<platform>.<ext>
//      (electron-builder emits arch-suffixed stems for some targets — e.g.
//      -linux-x86_64.AppImage — which we strip; mac/win keep their -x64);
//      a renamed mac zip also renames its .blockmap and rewrites latest-mac.yml
//      in lockstep;
//   1.5 injects "READ ME FIRST.txt" (tools/mac-first-open.txt — the
//      Gatekeeper first-launch guide for the unsigned app) into the mac zip
//      and refreshes latest-mac.yml's sha512/size;
//   2. prunes electron-builder intermediates (unpacked dirs, nsis.7z,
//      builder-debug.yml, a stray data-kitchen-home/) so release/ holds ONLY
//      user downloads + updater metadata;
//   3. writes release/latest.json — { version, date, files: { linux|mac|win|
//      android: { name, size, sha512 } } } (hex sha512; the updater's
//      checksum source);
//   4. prints the gh release create command to publish — NOT run here:
//      publishing is always an explicit, separate action.
//
// Run this before any dk push that ships user-facing changes (see skills.md
// "Release workflow"); `npm run release:check` is the cheap staleness probe.
import { createHash } from 'node:crypto';
import { createReadStream, readdirSync, readFileSync, writeFileSync, renameSync,
         rmSync, statSync, existsSync, copyFileSync, mkdtempSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = join(root, 'release');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const checkOnly = process.argv.includes('--check');
const stem = `Solid_Data_Kitchen-${version}`;

// platform key → { canonical name, patterns electron-builder may emit }
const PLATFORMS = {
  linux:   { name: `${stem}-linux.AppImage`, alt: new RegExp(`^${stem}-linux(-[\\w_]+)?\\.AppImage$`) },
  mac:     { name: `${stem}-mac-x64.zip`,    alt: new RegExp(`^${stem}-mac(-[\\w_]+)?\\.zip$`) },
  win:     { name: `${stem}-win-x64.zip`,    alt: new RegExp(`^${stem}-win(-[\\w_]+)?\\.zip$`) },
  android: { name: `${stem}-android.apk`,    alt: new RegExp(`^${stem}(-[\\w_]+)?\\.apk$`) },
};

const PRUNE = [/-unpacked$/, /^mac$/, /\.nsis\.7z$/, /^builder-debug\.yml$/,
               /^data-kitchen-home$/, /\.(deb|rpm|dmg|exe)\.blockmap$/];

function fail(msg) { console.error(`[release] STALE: ${msg}`); process.exit(1); }

async function sha512(file, encoding = 'hex') {
  const h = createHash('sha512');
  await pipeline(createReadStream(file), h);
  return h.digest(encoding);
}

if (!existsSync(releaseDir)) fail(`release/ does not exist — build first (npm run dist:cross / dist:android)`);

// ── 0. packaged-app smoke test (tools/packaged-smoke.mjs) ───────────────────
// Runs while linux-unpacked still exists (step 2 prunes it). Catches
// "ships but cannot boot" holes — two build.files omissions (server-core.cjs,
// pod-template/) reached users before this existed. Skip with --no-smoke.
if (!checkOnly && !process.argv.includes('--no-smoke')) {
  if (existsSync(join(releaseDir, 'linux-unpacked'))) {
    const { spawnSync } = await import('node:child_process');
    const r = spawnSync(process.execPath, [join(root, 'tools', 'packaged-smoke.mjs')], { stdio: 'inherit' });
    if (r.status !== 0) fail('packaged smoke test FAILED — do not release this build');
  } else {
    console.warn('[release] WARNING: linux-unpacked/ missing — packaged smoke test SKIPPED (rebuild with dist:cross to re-verify)');
  }
}
let entries = readdirSync(releaseDir);

// ── 1. locate + normalize names ─────────────────────────────────────────────
const found = {};
for (const [key, p] of Object.entries(PLATFORMS)) {
  let f = entries.find((e) => e === p.name) || entries.find((e) => p.alt.test(e));
  if (!f) {
    if (checkOnly) fail(`no ${key} artifact for v${version} in release/`);
    fail(`no ${key} artifact for v${version} — build it, then re-run`);
  }
  if (f !== p.name && !checkOnly) {
    renameSync(join(releaseDir, f), join(releaseDir, p.name));
    // mac zip rename → blockmap + latest-mac.yml must follow in lockstep.
    if (existsSync(join(releaseDir, `${f}.blockmap`))) {
      renameSync(join(releaseDir, `${f}.blockmap`), join(releaseDir, `${p.name}.blockmap`));
    }
    const yml = join(releaseDir, 'latest-mac.yml');
    if (key === 'mac' && existsSync(yml)) {
      writeFileSync(yml, readFileSync(yml, 'utf8').replaceAll(f, p.name));
    }
    console.log(`[release] renamed ${f} → ${p.name}`);
    f = p.name;
  }
  found[key] = f;
}

// ── 1.5 mac zip: ship the first-launch guide next to the .app ───────────────
// The mac build is unsigned (cross-built on linux — signing needs a mac or
// rcodesign), so the FIRST launch is always Gatekeeper-blocked and there are
// no testers to warn anyone. "READ ME FIRST.txt" at the zip root (source:
// tools/mac-first-open.txt) walks the user through it per macOS version.
// Must run before step 3 so latest.json hashes the final bytes; latest-mac.yml
// is rewritten to match. `zip` replaces an existing entry, so re-running prep
// is harmless. (The .blockmap is NOT regenerated — only electron-updater
// differential downloads read it, and dk's updater uses latest.json.)
if (!checkOnly) {
  const readmeSrc = join(root, 'tools', 'mac-first-open.txt');
  if (!existsSync(readmeSrc)) fail('tools/mac-first-open.txt missing — cannot ship the mac first-launch guide');
  const macZip = join(releaseDir, found.mac);
  const staging = mkdtempSync(join(tmpdir(), 'dk-mac-readme-'));
  copyFileSync(readmeSrc, join(staging, 'READ ME FIRST.txt'));
  const r = spawnSync('zip', ['-X', macZip, 'READ ME FIRST.txt'], { cwd: staging, stdio: 'inherit' });
  rmSync(staging, { recursive: true, force: true });
  if (r.status !== 0) fail(`could not add READ ME FIRST.txt to ${found.mac} (is \`zip\` installed?)`);
  console.log(`[release] added READ ME FIRST.txt to ${found.mac}`);
  const yml = join(releaseDir, 'latest-mac.yml');
  if (existsSync(yml)) {
    const b64 = await sha512(macZip, 'base64');
    writeFileSync(yml, readFileSync(yml, 'utf8')
      .replace(/sha512: \S+/g, `sha512: ${b64}`)
      .replace(/size: \d+/, `size: ${statSync(macZip).size}`));
    console.log('[release] latest-mac.yml sha512/size updated for the modified zip');
  }
}

// ── 2. prune intermediates ──────────────────────────────────────────────────
if (!checkOnly) {
  for (const e of readdirSync(releaseDir)) {
    if (PRUNE.some((rx) => rx.test(e))) {
      rmSync(join(releaseDir, e), { recursive: true, force: true });
      console.log(`[release] pruned ${e}`);
    }
  }
}

// ── 3. latest.json ──────────────────────────────────────────────────────────
const manifestPath = join(releaseDir, 'latest.json');
if (checkOnly) {
  if (!existsSync(manifestPath)) fail('release/latest.json missing — run npm run release:prep');
  const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (m.version !== version) fail(`latest.json is for v${m.version}, package.json is v${version}`);
  for (const [key, p] of Object.entries(PLATFORMS)) {
    if (m.files?.[key]?.name !== p.name) fail(`latest.json ${key} entry doesn't match ${p.name}`);
    if (m.files[key].size !== statSync(join(releaseDir, p.name)).size) {
      fail(`${p.name} changed since latest.json was written — re-run release:prep`);
    }
  }
  console.log(`[release] OK — release/ is current for v${version}`);
  process.exit(0);
}

const files = {};
for (const [key, p] of Object.entries(PLATFORMS)) {
  const full = join(releaseDir, p.name);
  files[key] = { name: p.name, size: statSync(full).size, sha512: await sha512(full) };
  console.log(`[release] hashed ${p.name}`);
}
writeFileSync(manifestPath, JSON.stringify(
  { version, date: new Date().toISOString(), files }, null, 2) + '\n');
console.log(`[release] wrote latest.json for v${version}`);

// ── 4. the publish command (printed, never run) ─────────────────────────────
// ── 4. release notes ────────────────────────────────────────────────────────
// The release BODY is the per-platform install & run guide — the tracked
// repo-root INSTALL.md (user-facing, not a developer changelog; not an
// asset). Its download links carry <version> tokens; substitute them so the
// notes link the release's own artifacts directly.
const installMd = join(root, 'INSTALL.md');
if (!existsSync(installMd)) {
  console.warn('[release] WARNING: INSTALL.md is missing at repo root — the release-notes body needs it.');
} else if (!checkOnly) {
  writeFileSync(join(releaseDir, 'RELEASE_NOTES.md'),
    readFileSync(installMd, 'utf8').replaceAll('<version>', version));
  console.log(`[release] wrote RELEASE_NOTES.md (INSTALL.md with <version> → ${version})`);
}

console.log(`
To publish (explicit step — run it yourself when ready):

  gh release create v${version} \\
    release/${PLATFORMS.linux.name} release/${PLATFORMS.mac.name} \\
    release/${PLATFORMS.win.name} release/${PLATFORMS.android.name} \\
    release/latest.json \\
    --repo SolidOS/data-kitchen --title "v${version}" --notes-file release/RELEASE_NOTES.md
`);
