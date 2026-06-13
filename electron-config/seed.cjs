// Seed-or-update the editable app DEFINITION in the user's pod root.
//
// dk ships a pristine copy of the definition inside the executable (the engine
// dir). It must exist in the writable pod root so the user can redesign it and
// the pivot CSS can serve it. On every launch we reconcile each definition file
// against the engine, tracking a per-file baseline in userData (see seed-core).
//
// LAYOUT (so the served pod root stays clean — important when POD_ROOT is a
// folder shared with other things): only `index.html` and the loader descriptor
// `dk.manifest.json` are seeded at the root; everything else dk uses (data/,
// pages/, help/, shapes/, favourites/, plugins/ content) goes under `dk-pod/dk/`.
// Because the destination differs from the engine source, this is meaningful
// even in dev (engineDir === podRoot) — repo/data → repo/dk-pod/dk/data — so it
// is NOT a no-op there any more. NOT seeded: the engine (node_modules, dist,
// src, assets, plugins/*/dist — served read-only by the router at their ROOT
// URLs; their refs are left unchanged).

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

// Map an engine-relative path to its destination in the pod. index.html and
// dk.manifest.json stay at the served root (both are loader-critical and their
// internal refs assume root); all other content is tucked under dk-pod/dk/.
const ROOT_FILES = new Set(['index.html', 'dk.manifest.json']);
function podDestRel(rel) {
  return ROOT_FILES.has(rel) ? rel : path.join('dk-pod', 'dk', rel);
}

/**
 * Reconcile the definition from engineDir into podRoot, tracking the baseline in
 * baselineFile (a JSON map relPath → hash | 'USER'). Returns counts.
 */
function seedDefinition(engineDir, podRoot, baselineFile) {
  return reconcileTree(engineDir, podRoot, {
    entries: SEED_ENTRIES,
    skipDirs: SKIP_DIR_NAMES,
    destRel: podDestRel,
    baselineFile,
  });
}

module.exports = { seedDefinition, SEED_ENTRIES };
