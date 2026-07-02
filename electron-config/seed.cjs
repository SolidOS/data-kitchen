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

const fs = require('node:fs');
const path = require('node:path');
const { reconcileTree } = require('./seed-core.cjs');

// Definition entries (relative to the engine dir) making up the editable surface.
const SEED_ENTRIES = [
  'index.html', 'dk.manifest.json', 'dokieli.manifest.json',
  'ui-data', 'pages', 'help', 'shapes', 'plugins',
];
// NB: 'favourites' is intentionally NOT seeded — favourites are per-library
// (each library's own <library>/favourites/, see omp-favourites-store.js) and
// are user-generated, so dk ships none.

// Within a seeded dir, never copy these subdirs — engine (plugins/<name>/dist),
// served from the executable, or never web content (node_modules).
const SKIP_DIR_NAMES = new Set(['dist', 'node_modules']);

// Map an engine-relative path to its destination in the pod. Only index.html
// stays at the served root (the home page); everything else dk uses — including
// the loader descriptor dk.manifest.json — is tucked under dk-pod/dk/.
// (dk.manifest.json's internal paths were made absolute/manifest-relative so it
// resolves correctly from /dk-pod/dk/; index.html's data-manifest points there.)
const ROOT_FILES = new Set(['index.html']);
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

// ── media plugins (from the open-media-player package) ──────────────────
//
// The ia-player / omp-images plugin content no longer lives in this repo — it
// ships in the open-media-player npm package (sibling working tree in dev via
// the node_modules symlink). Seed it into the SAME pod destinations as before
// (dk-pod/dk/plugins/{ia-player,omp-images}/…), so plugin TTLs, the catalog,
// menus, and favourites keep their URLs unchanged.
//
// The package lays files out differently (libraries/ and shapes/ at its root,
// sources under src/<plugin>/), so destRel maps package paths onto the pod
// plugin layout, and the two folder manifest.jsonld files get their relative
// refs mapped back from package layout to pod layout.
//
// Library trees are seeded whole-or-not-at-all: a pod library we did not
// write (no baseline for its index.ttl but the tree exists) is user-owned —
// possibly still on the older extensionless releases/playlists naming — and
// mixing package-style files into it could tear it, so it is skipped
// entirely.

const MEDIA_ENTRIES = ['src/ia-player', 'src/omp-images', 'shapes'];

function mediaDestRel(rel) {
  const p = rel.split(path.sep).join('/');
  let out;
  if (p.startsWith('src/ia-player/')) out = 'plugins/ia-player/' + p.slice('src/ia-player/'.length);
  else if (p.startsWith('src/omp-images/')) out = 'plugins/omp-images/' + p.slice('src/omp-images/'.length);
  else if (p.startsWith('libraries/wikimedia_images/')) out = 'plugins/omp-images/' + p;
  else if (p.startsWith('libraries/')) out = 'plugins/ia-player/' + p;
  else if (p.startsWith('shapes/')) {
    const base = p.slice('shapes/'.length);
    out = (base.startsWith('image') ? 'plugins/omp-images/' : 'plugins/ia-player/') + base;
  } else out = p;
  return path.join('dk-pod', 'dk', out);
}

// Map the package-layout relative refs in a folder manifest.jsonld back to the
// pod plugin layout it is being seeded into.
function mediaTransform(buf, rel) {
  const p = rel.split(path.sep).join('/');
  if (!p.endsWith('/manifest.jsonld')) return buf;
  return Buffer.from(String(buf)
    .replaceAll('../../libraries/', './libraries/')
    .replaceAll('../../shapes/', './'));
}

function seedMediaPlugins(packageDir, podRoot, baselineFile) {
  let baseline = {};
  try { baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8')); } catch { /* first run */ }
  const entries = [...MEDIA_ENTRIES];
  const libsDir = path.join(packageDir, 'libraries');
  for (const lib of fs.existsSync(libsDir) ? fs.readdirSync(libsDir) : []) {
    const seededBefore = Object.keys(baseline).some((k) => k.startsWith(`libraries/${lib}/`));
    const destDir = path.dirname(path.join(podRoot, mediaDestRel(path.join('libraries', lib, 'x'))));
    if (!seededBefore && fs.existsSync(destDir)) continue;   // pre-existing user tree
    entries.push(`libraries/${lib}`);
  }
  return reconcileTree(packageDir, podRoot, {
    entries,
    skipDirs: SKIP_DIR_NAMES,
    destRel: mediaDestRel,
    transform: mediaTransform,
    baselineFile,
  });
}

module.exports = { seedDefinition, seedMediaPlugins, SEED_ENTRIES };
