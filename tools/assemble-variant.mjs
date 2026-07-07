// Materialize a release variant's SEEDED CONTENT TREE — the exact layout
// electron-config/seed.cjs produces (index.html at the served root, every
// other definition entry under dk-pod/dk/) — with a variant overlay applied:
//
//   variants/<name>/<base-relative-path>   replaces the base file
//   variants/<name>/EXCLUDE                base-relative paths to omit
//                                          (one per line, # comments)
//
// The variant catalog is REGENERATED from the assembled plugins/*.ttl (via
// tools/seed-plugins-catalog.mjs), never hand-overlaid — the catalog↔manifest
// contract holds per variant.
//
//   node tools/assemble-variant.mjs <base|web|mobile> <outDir>
//
// `resolveVariantFiles(variant)` is exported pure (no writes) for tests.

import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// The seeding rules ARE seed.cjs's — one source of truth for what ships.
const { SEED_ENTRIES } = require('../electron-config/seed.cjs');

const SKIP_DIR_NAMES = new Set(['dist', 'node_modules']);
const ROOT_FILES = new Set(['index.html']);
const destRel = (rel) => (ROOT_FILES.has(rel) ? rel : join('dk-pod', 'dk', rel));

// Every base-relative file a seed entry contributes (dirs walked, skips applied).
function baseFiles() {
  const out = [];
  const walk = (rel) => {
    const abs = join(root, rel);
    if (!existsSync(abs)) return;
    const st = statSync(abs);
    if (st.isFile()) { out.push(rel); return; }
    if (st.isDirectory()) {
      for (const e of readdirSync(abs).sort()) {
        if (SKIP_DIR_NAMES.has(e)) continue;
        walk(join(rel, e));
      }
    }
  };
  for (const entry of SEED_ENTRIES) walk(entry);
  return out;
}

function readExcludes(variant) {
  const f = join(root, 'variants', variant, 'EXCLUDE');
  if (!existsSync(f)) return new Set();
  return new Set(readFileSync(f, 'utf8').split('\n')
    .map((l) => l.replace(/#.*$/, '').trim()).filter(Boolean));
}

function overlayFiles(variant) {
  const dir = join(root, 'variants', variant);
  const out = new Map();   // baseRel → abs
  if (!existsSync(dir)) return out;
  const walk = (abs) => {
    for (const e of readdirSync(abs).sort()) {
      if (e === 'EXCLUDE') continue;
      const p = join(abs, e);
      if (statSync(p).isDirectory()) walk(p);
      else out.set(relative(dir, p), p);
    }
  };
  walk(dir);
  return out;
}

// Media-plugin CONTENT the electron/mobile pods get from seedMediaPlugins at
// boot (omp package → plugins/{ia-player,omp-images}/…). A static tree has no
// boot-time seeder, so the assembler bakes the same mapping in. Mirrors
// seed.cjs's MEDIA_ENTRIES/mediaDestRel; manifest.jsonld gets the same
// path transform (applied at copy time — see MEDIA_MANIFEST_RE in main).
const OMP = join(root, 'node_modules', 'open-media-player');
function mediaDestRel(rel) {
  const p = rel.split(sep).join('/');
  let out;
  if (p.startsWith('src/ia-player/')) out = 'plugins/ia-player/' + p.slice('src/ia-player/'.length);
  else if (p.startsWith('src/omp-images/')) out = 'plugins/omp-images/' + p.slice('src/omp-images/'.length);
  else if (p.startsWith('libraries/wikimedia_images/')) out = 'plugins/omp-images/' + p;
  else if (p.startsWith('libraries/')) out = 'plugins/ia-player/' + p;
  else if (p.startsWith('shapes/')) {
    const base = p.slice('shapes/'.length);
    out = (base.startsWith('image') ? 'plugins/omp-images/' : 'plugins/ia-player/') + base;
  } else out = p;
  return join('dk-pod', 'dk', out);
}
function mediaFiles() {
  const out = new Map();   // destRel → srcAbs
  if (!existsSync(OMP)) return out;
  const walk = (rel) => {
    const abs = join(OMP, rel);
    if (!existsSync(abs)) return;
    const st = statSync(abs);
    if (st.isFile()) { out.set(mediaDestRel(rel), abs); return; }
    for (const e of readdirSync(abs).sort()) {
      if (SKIP_DIR_NAMES.has(e)) continue;
      walk(join(rel, e));
    }
  };
  for (const entry of ['src/ia-player', 'src/omp-images', 'shapes', 'libraries']) walk(entry);
  return out;
}

export const MEDIA_MANIFEST_RE = /plugins[/\\](ia-player|omp-images)[/\\]manifest\.jsonld$/;

/** Pure resolution: Map<destRel, srcAbs> for the assembled variant tree. */
export function resolveVariantFiles(variant = 'base') {
  const excludes = readExcludes(variant);
  const overlay = variant === 'base' ? new Map() : overlayFiles(variant);
  const excluded = (rel) => {
    for (const ex of excludes) {
      if (rel === ex || rel.startsWith(ex + sep)) return true;
    }
    return false;
  };
  const files = new Map();
  for (const rel of baseFiles()) {
    if (excluded(rel)) continue;
    files.set(destRel(rel), overlay.get(rel) || join(root, rel));
  }
  // Media-plugin content (see above) — base files/overlays win on collision.
  for (const [dest, abs] of mediaFiles()) {
    if (!files.has(dest)) files.set(dest, abs);
  }
  // Overlay-only files (a variant may ADD a file the base lacks).
  for (const [rel, abs] of overlay) {
    if (!excluded(rel)) files.set(destRel(rel), abs);
  }
  return files;
}

function main() {
  const [variant, outDir] = process.argv.slice(2);
  if (!variant || !outDir) {
    console.error('usage: node tools/assemble-variant.mjs <base|web|mobile> <outDir>');
    process.exit(1);
  }
  if (variant !== 'base' && !existsSync(join(root, 'variants', variant))) {
    console.error(`no variants/${variant}/ overlay dir`);
    process.exit(1);
  }
  rmSync(outDir, { recursive: true, force: true });
  const files = resolveVariantFiles(variant);
  for (const [dest, src] of files) {
    const to = join(outDir, dest);
    mkdirSync(dirname(to), { recursive: true });
    if (MEDIA_MANIFEST_RE.test(dest)) {
      // Same path transform seed.cjs applies: package-layout refs → pod layout.
      const body = readFileSync(src, 'utf8')
        .replaceAll('../../libraries/', './libraries/')
        .replaceAll('../../shapes/', './');
      writeFileSync(to, body);
    } else {
      cpSync(src, to);
    }
  }
  // Regenerate the catalog from the ASSEMBLED manifests (post-overlay/exclude).
  execFileSync(process.execPath, [
    '--preserve-symlinks', join(root, 'tools', 'seed-plugins-catalog.mjs'),
    '--plugins-dir', join(outDir, 'dk-pod', 'dk', 'plugins'),
    '--out', join(outDir, 'dk-pod', 'dk', 'ui-data', 'data-kitchen-plugins-catalog.ttl'),
  ], { stdio: 'inherit' });
  console.log(`[assemble] ${variant}: ${files.size} files → ${outDir}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
