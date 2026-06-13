// Shared seed/reconcile engine used by both the app-definition seeder
// (seed.cjs) and the personal-pod template seeder (pod-template.cjs).
//
// reconcileTree copies files from a source dir into a destination dir, tracking
// a per-file BASELINE (the hash we last wrote) in a JSON file so we can tell
// "the user edited this" from "this is an old default":
//
//   - absent in dest                          → write it (seed).
//   - unmodified since we wrote it AND the      → write the new version (update),
//     source version changed                       so engine/dev changes propagate.
//   - edited by the user (dest ≠ our baseline) → left alone, marked 'USER'.
//   - pre-existing file with no baseline yet   → adopted: tracked for updates only
//                                                if it already matches the source;
//                                                otherwise assumed user-owned.
//
// A `transform(buf, rel)` hook lets a caller rewrite content before it is
// written AND hashed (so the baseline reflects the written bytes) — used by the
// pod template to swap its placeholder origin for the live one.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const USER = 'USER';   // baseline sentinel: the user owns this file; don't update it.
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// Yield each file under `root` (starting at startRel, '' = whole tree) as a path
// relative to `root`, skipping directories named in skipDirs and files for which
// skipFile(basename) is true.
function* walk(root, startRel, { skipDirs = new Set(), skipFile = () => false } = {}) {
  function* go(rel) {
    const abs = path.join(root, rel);
    let st; try { st = fs.statSync(abs); } catch { return; }
    if (st.isDirectory()) {
      if (rel && skipDirs.has(path.basename(abs))) return;
      for (const name of fs.readdirSync(abs)) yield* go(rel ? path.join(rel, name) : name);
    } else if (!skipFile(path.basename(abs))) {
      yield rel;
    }
  }
  yield* go(startRel || '');
}

function loadBaseline(file) {
  if (!file) return {};
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}
function saveBaseline(file, baseline) {
  if (!file) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(baseline));
  } catch { /* best-effort */ }
}

// Reconcile a single file (srcContent = the bytes we intend to seed) against
// destPath, mutating baseline[key]. Returns 'written' | 'updated' | 'kept' | null.
function reconcileOne(srcContent, destPath, baseline, key) {
  const srcHash = sha256(srcContent);
  if (!fs.existsSync(destPath)) {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, srcContent);
    baseline[key] = srcHash;
    return 'written';
  }
  const destHash = sha256(fs.readFileSync(destPath));
  if (!(key in baseline)) {                                // first sight, no baseline
    baseline[key] = (destHash === srcHash) ? srcHash : USER;
    return null;
  }
  if (baseline[key] !== USER && destHash === baseline[key]) {
    if (srcHash !== destHash) {                             // unmodified → update
      fs.writeFileSync(destPath, srcContent);
      baseline[key] = srcHash;
      return 'updated';
    }
  } else if (destHash !== baseline[key]) {                 // user edited since our write
    baseline[key] = USER;
    return 'kept';
  }
  return null;
}

/**
 * Reconcile srcDir → destDir. Options:
 *   entries     — top-level rels to walk (default: the whole srcDir)
 *   skipDirs    — Set of dir basenames to skip
 *   skipFile    — (basename) => boolean, files to skip
 *   transform   — (buf, rel) => buf, applied before write+hash
 *   destRel     — (rel) => rel, maps a source rel to a destination rel
 *   baselineFile— JSON map path for baseline tracking
 * Returns { written, updated, kept }.
 */
function reconcileTree(srcDir, destDir, opts = {}) {
  const {
    entries, skipDirs, skipFile,
    transform = (b) => b, destRel = (r) => r, baselineFile,
  } = opts;
  const baseline = loadBaseline(baselineFile);
  let written = 0, updated = 0, kept = 0;
  for (const start of (entries || [''])) {
    for (const rel of walk(srcDir, start, { skipDirs, skipFile })) {
      const srcContent = transform(fs.readFileSync(path.join(srcDir, rel)), rel);
      const r = reconcileOne(srcContent, path.join(destDir, destRel(rel)), baseline, rel);
      if (r === 'written') written++;
      else if (r === 'updated') updated++;
      else if (r === 'kept') kept++;
    }
  }
  saveBaseline(baselineFile, baseline);
  return { written, updated, kept };
}

module.exports = { reconcileTree, walk, USER };
