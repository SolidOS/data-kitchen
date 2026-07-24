// Drift guard: index.html's shell region (between the shell:begin/end markers)
// is GENERATED from ui-data/data-kitchen-shell.ttl by tools/build-shell.mjs.
// This fails if the TTL changed without regenerating, or index.html was
// hand-edited inside the markers — run `node tools/build-shell.mjs`.
//
// Mirrors sol-components' shaclc-generated drift guard: --check compares
// without writing and exits 1 on drift.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('index.html shell region is up to date with data-kitchen-shell.ttl', () => {
  execFileSync(process.execPath, [resolve(ROOT, 'tools/build-shell.mjs'), '--check'], {
    cwd: ROOT, stdio: 'pipe',
  });
});

test('the generated region keeps the anchors dk CSS + runtime depend on', () => {
  const region = readFileSync(resolve(ROOT, 'index.html'), 'utf8')
    .match(/<!-- shell:begin[\s\S]*?<!-- shell:end -->/)[0];
  // dk-chrome.css / dk-tabs-shell key off these — a regeneration must not drop them.
  // (The ☰ menu targets #dk-menu-pane via `ui:region` now, so the pane carries
  // its id, not data-for.)
  for (const anchor of [
    'class="omp-chrome-bar', 'id="dk-content"', 'class="omp-panels',
    'id="dk-tabs"', 'from-rdf="./dk-pod/dk/ui-data/data-kitchen-main-menu.ttl#Tabs"',
    'id="dk-menu-pane"',
  ]) {
    assert.ok(region.includes(anchor), `shell region lost anchor: ${anchor}`);
  }
});
