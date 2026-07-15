// The dk-own plugins (podz, solidos, news; ia-player/omp-images moved to the
// open-media-player package) carry a
// folder manifest.jsonld (the plugin standard: help, shapes, parts). Each must
// be valid JSON, declare the required component fields, and every file it
// references must exist on disk — a stale path means a broken help link or an
// unloadable settings shape at runtime.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pluginsDir = join(root, 'plugins');

const manifestDirs = readdirSync(pluginsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(pluginsDir, d.name, 'manifest.jsonld')))
  .map((d) => d.name);

test('found folder manifests to validate', () => {
  assert.ok(manifestDirs.length >= 3, `expected the dk-own plugin manifests, got ${manifestDirs.length}`);
});

for (const name of manifestDirs) {
  const dir = join(pluginsDir, name);
  test(`plugins/${name}/manifest.jsonld is valid and complete`, () => {
    let m;
    assert.doesNotThrow(() => { m = JSON.parse(readFileSync(join(dir, 'manifest.jsonld'), 'utf8')); },
      'manifest.jsonld must be valid JSON');

    assert.equal(m['@type'], 'Component', '@type must be "Component"');
    assert.ok(typeof m.label === 'string' && m.label, 'needs a label');
    assert.ok(typeof m.name === 'string' && m.name, 'needs a component name');
    assert.ok(typeof m.publisher === 'string' && m.publisher, 'needs a publisher');

    // Every referenced resource must resolve. Absolute paths (e.g. a shared
    // sol-components shape) resolve against the repo root; relative ones against
    // the manifest's own folder; http(s) refs are external and skipped.
    for (const key of ['hasPart', 'requires', 'shape', 'help']) {
      const v = m[key];
      if (!v) continue;
      for (const p of (Array.isArray(v) ? v : [v])) {
        if (/^https?:/.test(p)) continue;
        const abs = p.startsWith('/') ? join(root, p) : resolve(dir, p);
        assert.ok(existsSync(abs), `${key} references a missing file: ${p}`);
      }
    }
  });
}
