// Tests for the on-device MEDIA seeding (issue #74): the phone boot runs the
// same electron-config/seed.cjs#seedMediaPlugins desktop runs, so the pod gets
// dk-pod/dk/plugins/ia-player/… — above all assets/ia.css, the app's theme
// tokens, which index.html links from the pod. These assert the seeder itself
// against the real open-media-player package, and statically assert the two
// wiring points: the packer stages seed.cjs + ships the package's libraries
// and shapes in the engine, and main.js calls the seeder.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '..', '..', '..');
const { seedMediaPlugins } = require(path.join(REPO, 'electron-config', 'seed.cjs'));

const OMP_DIR = path.join(REPO, 'node_modules', 'open-media-player');

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('seedMediaPlugins plants ia.css (the theme tokens) and the media pod tree', () => {
  const podRoot = tmp('dk-media-seed-');
  try {
    const baselineFile = path.join(podRoot, 'media-seed-baseline.json');
    const m = seedMediaPlugins(OMP_DIR, podRoot, baselineFile);
    assert.ok(m.written > 0, `nothing seeded (written=${m.written})`);

    // The file the whole app's theming hangs on (index.html links it).
    const iaCss = path.join(podRoot, 'dk-pod', 'dk', 'plugins', 'ia-player', 'assets', 'ia.css');
    assert.ok(fs.existsSync(iaCss), 'ia.css missing from the seeded pod');
    assert.match(fs.readFileSync(iaCss, 'utf8'), /--ia-bg-elev/, 'ia.css lacks the theme tokens');

    // A second run against the same baseline is a quiet no-op (kept/unchanged).
    const again = seedMediaPlugins(OMP_DIR, podRoot, baselineFile);
    assert.equal(again.written, 0, 're-seed rewrote files it already wrote');
  } finally {
    fs.rmSync(podRoot, { recursive: true, force: true });
  }
});

test('the mobile packer stages seed.cjs and ships libraries + shapes in the engine', () => {
  const packer = fs.readFileSync(path.join(REPO, 'mobile', 'tool', 'prepare-node-project.sh'), 'utf8');
  assert.match(packer, /electron-config\/seed\.cjs/, 'packer does not stage seed.cjs');
  assert.match(packer, /open-media-player\/libraries/, 'engine payload lacks the media libraries');
  assert.match(packer, /open-media-player\/shapes/, 'engine payload lacks the media shapes');
});

test('the mobile boot calls the media seeder', () => {
  const main = fs.readFileSync(path.join(REPO, 'mobile', 'nodejs-src', 'main.js'), 'utf8');
  assert.match(main, /require\('\.\/seed\.cjs'\)/, 'main.js does not load seed.cjs');
  assert.match(main, /seedMediaPlugins\(/, 'main.js does not call seedMediaPlugins');
});
