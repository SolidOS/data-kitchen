// Seed-or-update the editable app DEFINITION in the user's pod root.
//
// dk ships a pristine copy of the definition inside the executable (the engine
// dir). It must exist in the writable pod root so the user can redesign it and
// the pivot CSS can serve it. On every launch we reconcile each definition file
// against the engine, tracking a per-file baseline in userData (see seed-core).
//
// No-op when engineDir === podRoot (dev). NOT seeded: the engine (node_modules,
// dist, src, assets, plugins/*/dist — served read-only by the router) and the
// shell/build/meta dirs (never web-served).

'use strict';

const path = require('node:path');
const { reconcileTree } = require('./seed-core.cjs');

// Definition entries (relative to the engine dir) making up the editable surface.
const SEED_ENTRIES = [
  'index.html', 'dk.manifest.json',
  'data', 'favourites', 'pages', 'help', 'shapes', 'plugins',
];

// Within a seeded dir, never copy these subdirs — engine (plugins/<name>/dist),
// served from the executable, or never web content (node_modules).
const SKIP_DIR_NAMES = new Set(['dist', 'node_modules']);

/**
 * Reconcile the definition from engineDir into podRoot, tracking the baseline in
 * baselineFile (a JSON map relPath → hash | 'USER'). Returns counts.
 */
function seedDefinition(engineDir, podRoot, baselineFile) {
  if (path.resolve(engineDir) === path.resolve(podRoot)) {
    return { written: 0, updated: 0, kept: 0 };
  }
  return reconcileTree(engineDir, podRoot, {
    entries: SEED_ENTRIES,
    skipDirs: SKIP_DIR_NAMES,
    baselineFile,
  });
}

module.exports = { seedDefinition, SEED_ENTRIES };
