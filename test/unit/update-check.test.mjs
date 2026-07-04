// Pure helpers of the startup update check (electron-config/update-check.cjs).
// In plain Node require('electron') resolves to the binary-path shim, so the
// module loads fine as long as only the pure exports are exercised.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseVersion, compareVersions, pickAsset, releasesLatestUrl } =
  require('../../electron-config/update-check.cjs');

test('parseVersion handles clean, prefixed, and malformed legacy tags', () => {
  assert.deepEqual(parseVersion('2.0.1'), [2, 0, 1]);
  assert.deepEqual(parseVersion('v2.0.1'), [2, 0, 1]);
  // Legacy junk tag "v.04" must be REJECTED — a bare "04" would parse as [4]
  // and look newer than 2.x (v.04 is the repo's current latest release).
  assert.equal(parseVersion('v.04'), null);
  assert.deepEqual(parseVersion('v.0.3'), [0, 3]);
  assert.equal(parseVersion('not-a-version'), null);
  assert.equal(parseVersion(''), null);
});

test('compareVersions is numeric per part, missing parts are zero', () => {
  assert.ok(compareVersions([2, 0, 1], [2, 0, 0]) > 0);
  assert.ok(compareVersions([2, 0], [2, 0, 0]) === 0);
  assert.ok(compareVersions([2, 10], [2, 9]) > 0);      // not lexicographic
  assert.ok(compareVersions([1, 9, 9], [2, 0]) < 0);
});

test('pickAsset selects the platform artifact by naming convention', () => {
  const assets = [
    { name: 'Solid_Data_Kitchen-2.0.1-linux.AppImage' },
    { name: 'Solid_Data_Kitchen-2.0.1-mac-x64.zip' },
    { name: 'Solid_Data_Kitchen-2.0.1-mac-x64.zip.blockmap' },
    { name: 'Solid_Data_Kitchen-2.0.1-win-x64.zip' },
    { name: 'Solid_Data_Kitchen-2.0.1-android.apk' },
    { name: 'latest.json' },
  ];
  assert.equal(pickAsset(assets, 'linux').name, 'Solid_Data_Kitchen-2.0.1-linux.AppImage');
  assert.equal(pickAsset(assets, 'darwin').name, 'Solid_Data_Kitchen-2.0.1-mac-x64.zip');
  assert.equal(pickAsset(assets, 'win32').name, 'Solid_Data_Kitchen-2.0.1-win-x64.zip');
  // the mac pick must be the zip, never the blockmap
  assert.ok(!pickAsset(assets, 'darwin').name.endsWith('.blockmap'));
  assert.equal(pickAsset(assets, 'freebsd'), null);
  assert.equal(pickAsset([], 'linux'), null);
});

test('releasesLatestUrl: owner/repo → GitHub API; http base → mock passthrough', () => {
  assert.equal(releasesLatestUrl('SolidOS/data-kitchen'),
    'https://api.github.com/repos/SolidOS/data-kitchen/releases/latest');
  assert.equal(releasesLatestUrl('http://127.0.0.1:9911'),
    'http://127.0.0.1:9911/releases/latest');
  assert.equal(releasesLatestUrl('http://127.0.0.1:9911/'),
    'http://127.0.0.1:9911/releases/latest');
});
