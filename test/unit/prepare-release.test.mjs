// tools/prepare-release.mjs against a scratch repo layout: normalization of
// electron-builder stems, latest.json generation, --check staleness gating.
// The script resolves everything relative to its own location, so we run it
// via a child process from a COPY placed inside a temp tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function scratchRepo(version = '9.9.9') {
  const dir = mkdtempSync(join(tmpdir(), 'dk-release-'));
  mkdirSync(join(dir, 'tools'));
  mkdirSync(join(dir, 'release'));
  cpSync(join(repoRoot, 'tools', 'prepare-release.mjs'), join(dir, 'tools', 'prepare-release.mjs'));
  cpSync(join(repoRoot, 'tools', 'mac-first-open.txt'), join(dir, 'tools', 'mac-first-open.txt'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ version }));
  return dir;
}

// A minimal VALID (empty) zip — bare end-of-central-directory record. Step 1.5
// runs `zip` against the mac artifact to inject READ ME FIRST.txt, so the fake
// must be a real zip, not a text byte.
const EMPTY_ZIP = Buffer.concat([Buffer.from('PK\x05\x06', 'latin1'), Buffer.alloc(18)]);
// --no-smoke: the packaged-boot smoke test (tools/packaged-smoke.mjs) is out
// of scope here — this suite exercises normalize/prune/latest.json against a
// scratch layout whose fake linux-unpacked/ could never boot.
const run = (dir, ...args) =>
  execFileSync(process.execPath, [join(dir, 'tools', 'prepare-release.mjs'), '--no-smoke', ...args],
    { encoding: 'utf8' });

test('prep normalizes stems, prunes intermediates, writes latest.json; check passes after', () => {
  const dir = scratchRepo();
  const rel = join(dir, 'release');
  // electron-builder-style names (arch-suffixed linux stem), small fake bytes
  writeFileSync(join(rel, 'Solid_Data_Kitchen-9.9.9-linux-x86_64.AppImage'), 'L');
  writeFileSync(join(rel, 'Solid_Data_Kitchen-9.9.9-mac-x64.zip'), EMPTY_ZIP);
  writeFileSync(join(rel, 'Solid_Data_Kitchen-9.9.9-mac-x64.zip.blockmap'), 'B');
  writeFileSync(join(rel, 'Solid_Data_Kitchen-9.9.9-win-x64.zip'), 'W');
  writeFileSync(join(rel, 'Solid_Data_Kitchen-9.9.9-android.apk'), 'A');
  writeFileSync(join(rel, 'builder-debug.yml'), 'junk');
  writeFileSync(join(rel, 'latest-mac.yml'),
    'url: Solid_Data_Kitchen-9.9.9-mac-x64.zip\nsha512: FAKEHASH==\nsize: 1\n');
  mkdirSync(join(rel, 'linux-unpacked'));

  const out = run(dir);
  assert.ok(existsSync(join(rel, 'Solid_Data_Kitchen-9.9.9-linux.AppImage')), 'linux stem normalized');
  assert.ok(!existsSync(join(rel, 'builder-debug.yml')), 'intermediates pruned');
  assert.ok(!existsSync(join(rel, 'linux-unpacked')), 'unpacked dir pruned');

  // step 1.5 — the mac first-launch guide landed in the zip, yml follows
  assert.match(out, /added READ ME FIRST\.txt/);
  assert.match(execFileSync('unzip', ['-l', join(rel, 'Solid_Data_Kitchen-9.9.9-mac-x64.zip')],
    { encoding: 'utf8' }), /READ ME FIRST\.txt/);
  const yml = readFileSync(join(rel, 'latest-mac.yml'), 'utf8');
  assert.ok(!yml.includes('FAKEHASH=='), 'latest-mac.yml sha512 refreshed');
  assert.ok(!yml.includes('size: 1\n'), 'latest-mac.yml size refreshed');
  const m = JSON.parse(readFileSync(join(rel, 'latest.json'), 'utf8'));
  assert.equal(m.version, '9.9.9');
  for (const key of ['linux', 'mac', 'win', 'android']) {
    assert.ok(m.files[key].sha512.length === 128, `${key} sha512 hex present`);
    assert.ok(m.files[key].size > 0);
  }
  assert.match(out, /gh release create v9\.9\.9/);

  // --check is green right after prep
  assert.match(run(dir, '--check'), /OK — release\/ is current/);
  rmSync(dir, { recursive: true, force: true });
});

test('prep fails when the mac first-launch guide source is missing', () => {
  const dir = scratchRepo();
  rmSync(join(dir, 'tools', 'mac-first-open.txt'));
  const rel = join(dir, 'release');
  writeFileSync(join(rel, 'Solid_Data_Kitchen-9.9.9-linux.AppImage'), 'L');
  writeFileSync(join(rel, 'Solid_Data_Kitchen-9.9.9-mac-x64.zip'), EMPTY_ZIP);
  writeFileSync(join(rel, 'Solid_Data_Kitchen-9.9.9-win-x64.zip'), 'W');
  writeFileSync(join(rel, 'Solid_Data_Kitchen-9.9.9-android.apk'), 'A');
  assert.throws(() => run(dir), /mac-first-open\.txt missing|Command failed|status 1/);
  rmSync(dir, { recursive: true, force: true });
});

test('check fails when an artifact is missing or latest.json is for another version', () => {
  const dir = scratchRepo();
  const rel = join(dir, 'release');
  writeFileSync(join(rel, 'Solid_Data_Kitchen-9.9.9-linux.AppImage'), 'L');
  // missing mac/win/android → check must exit 1
  assert.throws(() => run(dir, '--check'), /STALE|Command failed|status 1/);

  // now complete the set but plant a stale manifest
  writeFileSync(join(rel, 'Solid_Data_Kitchen-9.9.9-mac-x64.zip'), 'M');
  writeFileSync(join(rel, 'Solid_Data_Kitchen-9.9.9-win-x64.zip'), 'W');
  writeFileSync(join(rel, 'Solid_Data_Kitchen-9.9.9-android.apk'), 'A');
  writeFileSync(join(rel, 'latest.json'), JSON.stringify({ version: '9.9.8', files: {} }));
  assert.throws(() => run(dir, '--check'), /STALE|Command failed|status 1/);
  rmSync(dir, { recursive: true, force: true });
});
