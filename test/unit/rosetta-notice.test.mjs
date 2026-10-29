// When the Intel mac build shows its Apple Silicon notice
// (electron-config/rosetta-notice.cjs). In plain Node require('electron')
// resolves to the binary-path shim, so only the pure export is exercised.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { needsRosettaNotice } = require('../../electron-config/rosetta-notice.cjs');

test('the notice is for the x64 mac build running translated on Apple Silicon only', () => {
  assert.equal(needsRosettaNotice({ platform: 'darwin', arch: 'x64', translated: true }), true);
  // Intel Mac running the Intel build
  assert.equal(needsRosettaNotice({ platform: 'darwin', arch: 'x64', translated: false }), false);
  // the Apple Silicon build
  assert.equal(needsRosettaNotice({ platform: 'darwin', arch: 'arm64', translated: false }), false);
  // Windows on ARM running the x64 build is not a mac
  assert.equal(needsRosettaNotice({ platform: 'win32', arch: 'x64', translated: true }), false);
  assert.equal(needsRosettaNotice({ platform: 'linux', arch: 'x64', translated: undefined }), false);
});
