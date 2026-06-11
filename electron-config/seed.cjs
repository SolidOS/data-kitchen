// First-launch seeding of the editable app DEFINITION into the user's pod root.
//
// dk ships a pristine copy of the app definition inside the executable (the
// engine dir). When the pod root is a different, writable location, the definition
// must exist there so the user can redesign it and so the pivot CSS can serve it.
// This copies the definition entries into the pod root, file-by-file, ONLY where
// the target is absent — so user edits are never overwritten and a newer
// executable can fill in files added since (an "update" re-seed). When the pod
// root and engine dir coincide (dev default), it is a no-op.
//
// NOT seeded: the engine (node_modules, dist, src, assets, plugins/*/dist) — the
// router serves those read-only from the executable — and shell/build/meta dirs
// (electron-config, pivot, proxy, router, bin, build, tools, claude, …), which are
// never web-served.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Definition entries (relative to the engine dir) making up the editable surface.
// QUESTION (deferred): pages/help/shapes and most of plugins/ are shipped content
// the user *could* edit — seeded here for safety so nothing 404s. If some should
// stay read-only engine instead, move them out of SEED_ENTRIES and add their path
// prefix to the router's engine list. See claude/plans for the open item.
const SEED_ENTRIES = [
  'index.html', 'html-first.html', 'dk.manifest.json',
  'data', 'favourites', 'pages', 'help', 'shapes', 'plugins',
];

// Within a seeded dir, never copy these subdirs — they are engine, served from
// the executable (e.g. plugins/<name>/dist), or never web content (node_modules).
const SKIP_DIR_NAMES = new Set(['dist', 'node_modules']);

function copyIfAbsent(src, dest) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    if (SKIP_DIR_NAMES.has(path.basename(src))) return 0;
    fs.mkdirSync(dest, { recursive: true });
    let n = 0;
    for (const name of fs.readdirSync(src)) {
      n += copyIfAbsent(path.join(src, name), path.join(dest, name));
    }
    return n;
  }
  if (fs.existsSync(dest)) return 0;            // never overwrite user edits
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return 1;
}

// Seed the definition from engineDir into podRoot. No-op when they coincide
// (dev) or for files that already exist. Returns the count of files written.
function seedDefinition(engineDir, podRoot) {
  if (path.resolve(engineDir) === path.resolve(podRoot)) return 0;
  let written = 0;
  for (const entry of SEED_ENTRIES) {
    const src = path.join(engineDir, entry);
    if (fs.existsSync(src)) written += copyIfAbsent(src, path.join(podRoot, entry));
  }
  return written;
}

module.exports = { seedDefinition, SEED_ENTRIES };
