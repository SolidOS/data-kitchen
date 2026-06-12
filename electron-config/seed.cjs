// Seed-or-update the editable app DEFINITION in the user's pod root.
//
// dk ships a pristine copy of the definition inside the executable (the engine
// dir). It must exist in the writable pod root so the user can redesign it and
// the pivot CSS can serve it. On every launch we reconcile each definition file
// against the engine, tracking a per-file BASELINE (the hash we last wrote) in
// userData so we can tell "the user edited this" from "this is an old default":
//
//   - absent in pod                         → copy it in (seed).
//   - unmodified since we wrote it AND the   → copy the new version (update),
//     engine version changed                   so engine/dev changes propagate.
//   - edited by the user (pod ≠ our baseline) → left alone, marked 'USER'.
//   - pre-existing file with no baseline yet  → adopted: tracked for updates only
//                                               if it already matches the engine;
//                                               otherwise assumed user-owned.
//
// No-op when engineDir === podRoot (dev). NOT seeded: the engine (node_modules,
// dist, src, assets, plugins/*/dist — served read-only by the router) and the
// shell/build/meta dirs (never web-served).

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Definition entries (relative to the engine dir) making up the editable surface.
const SEED_ENTRIES = [
  'index.html', 'dk.manifest.json',
  'data', 'favourites', 'pages', 'help', 'shapes', 'plugins',
];

// Within a seeded dir, never copy these subdirs — engine (plugins/<name>/dist),
// served from the executable, or never web content (node_modules).
const SKIP_DIR_NAMES = new Set(['dist', 'node_modules']);

const USER = 'USER';   // baseline sentinel: the user owns this file; don't update it.

function hashFile(p) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
  catch { return null; }
}

// Yield each definition file's path relative to `root`.
function* defFiles(root) {
  function* walk(rel) {
    const abs = path.join(root, rel);
    let st; try { st = fs.statSync(abs); } catch { return; }
    if (st.isDirectory()) {
      if (SKIP_DIR_NAMES.has(path.basename(abs))) return;
      for (const name of fs.readdirSync(abs)) yield* walk(path.join(rel, name));
    } else {
      yield rel;
    }
  }
  for (const entry of SEED_ENTRIES) yield* walk(entry);
}

/**
 * Reconcile the definition from engineDir into podRoot, tracking the baseline in
 * baselineFile (a JSON map relPath → hash | 'USER'). Returns counts.
 */
function seedDefinition(engineDir, podRoot, baselineFile) {
  if (path.resolve(engineDir) === path.resolve(podRoot)) {
    return { written: 0, updated: 0, kept: 0 };
  }
  let baseline = {};
  if (baselineFile) { try { baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8')); } catch {} }

  let written = 0, updated = 0, kept = 0;
  for (const rel of defFiles(engineDir)) {
    const enginePath = path.join(engineDir, rel);
    const podPath = path.join(podRoot, rel);
    const engineHash = hashFile(enginePath);

    if (!fs.existsSync(podPath)) {                         // seed
      fs.mkdirSync(path.dirname(podPath), { recursive: true });
      fs.copyFileSync(enginePath, podPath);
      baseline[rel] = engineHash;
      written++;
      continue;
    }

    const podHash = hashFile(podPath);
    if (!(rel in baseline)) {                              // first sight, no baseline
      baseline[rel] = (podHash === engineHash) ? engineHash : USER;
      continue;
    }
    if (baseline[rel] !== USER && podHash === baseline[rel]) {
      if (engineHash !== podHash) {                        // unmodified → update
        fs.copyFileSync(enginePath, podPath);
        baseline[rel] = engineHash;
        updated++;
      }
    } else if (podHash !== baseline[rel]) {                // user edited since our write
      baseline[rel] = USER;
      kept++;
    }
  }

  if (baselineFile) {
    try {
      fs.mkdirSync(path.dirname(baselineFile), { recursive: true });
      fs.writeFileSync(baselineFile, JSON.stringify(baseline));
    } catch { /* best-effort */ }
  }
  return { written, updated, kept };
}

module.exports = { seedDefinition, SEED_ENTRIES };
