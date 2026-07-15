// Build the STATIC WEB DEMO (read-only, root-hosted — see the variants plan,
// D5): engine files at the site root exactly as the router serves them
// (/node_modules/sol-components, /dist/dk.bundle.js,
// /src/, /assets/, /plugins/*/dist/, plus node_modules/open-media-player the
// omp manifest names), the web-variant seeded content beside them, and
// .nojekyll for GitHub Pages.
//
//   npm run dist:web   →  release/web/  +  release/Solid_Data_Kitchen-<ver>-web.zip
//
// Writes fail quietly on the static host (PUT → 405), which is the demo's
// read-only story; the web variant's menus avoid write-dependent surfaces.

import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = require('../package.json').version;
const out = join(root, 'release', 'web');

// Engine trees, pruned like electron-builder's dist (tests/docs/etc stay home).
const PRUNE = new Set(['node_modules', 'tests', 'tests-disabled', 'coverage',
  'docs', 'examples', 'drafts', 'claude', '.git', '.claude']);
const copyPruned = (fromRel, toRel = fromRel) => {
  const from = join(root, fromRel);
  if (!existsSync(from)) { console.warn(`[web] missing ${fromRel} — skipped`); return; }
  cpSync(from, join(out, toRel), {
    recursive: true, dereference: true,
    filter: (src) => !PRUNE.has(src.split('/').pop()) && !src.endsWith('.map'),
  });
};

// Seeded content FIRST — the assembler cleans the out dir before writing
// (index.html at root, the rest under dk-pod/dk/); engine copies follow.
execFileSync(process.execPath, [
  '--preserve-symlinks', join(root, 'tools', 'assemble-variant.mjs'), 'web', out,
], { stdio: 'inherit' });

copyPruned('node_modules/sol-components');
copyPruned('node_modules/open-media-player/omp.manifest.json');
copyPruned('node_modules/open-media-player/dist');
copyPruned('node_modules/open-media-player/src');
copyPruned('dist/dk.bundle.js');
copyPruned('src');
copyPruned('assets');
for (const p of ['ia-player', 'omp-images']) {
  copyPruned(`plugins/${p}/dist`);
}

writeFileSync(join(out, '.nojekyll'), '');

// Zip it with the release naming convention.
const zip = join(root, 'release', `Solid_Data_Kitchen-${version}-web.zip`);
rmSync(zip, { force: true });
execSync(`cd ${JSON.stringify(out)} && zip -qr ${JSON.stringify(zip)} .`);
console.log(`[web] release/web/ ready; zipped → ${zip}`);
