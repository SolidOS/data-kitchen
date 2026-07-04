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
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ version }));
  return dir;
}
const run = (dir, ...args) =>
  execFileSync(process.execPath, [join(dir, 'tools', 'prepare-release.mjs'), ...args],
    { encoding: 'utf8' });

test('prep normalizes stems, prunes intermediates, writes latest.json; check passes after', () => {
  const dir = scratchRepo();
  const rel = join(dir, 'release');
  // electron-builder-style names (arch-suffixed linux stem), small fake bytes
  writeFileSync(join(rel, 'Solid_Data_Kitchen-9.9.9-linux-x86_64.AppImage'), 'L');
  writeFileSync(join(rel, 'Solid_Data_Kitchen-9.9.9-mac-x64.zip'), 'M');
  writeFileSync(join(rel, 'Solid_Data_Kitchen-9.9.9-mac-x64.zip.blockmap'), 'B');
  writeFileSync(join(rel, 'Solid_Data_Kitchen-9.9.9-win-x64.zip'), 'W');
  writeFileSync(join(rel, 'Solid_Data_Kitchen-9.9.9-android.apk'), 'A');
  writeFileSync(join(rel, 'builder-debug.yml'), 'junk');
  mkdirSync(join(rel, 'linux-unpacked'));

  const out = run(dir);
  assert.ok(existsSync(join(rel, 'Solid_Data_Kitchen-9.9.9-linux.AppImage')), 'linux stem normalized');
  assert.ok(!existsSync(join(rel, 'builder-debug.yml')), 'intermediates pruned');
  assert.ok(!existsSync(join(rel, 'linux-unpacked')), 'unpacked dir pruned');
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
