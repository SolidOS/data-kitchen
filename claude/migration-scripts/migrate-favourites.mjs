// migrate-favourites.mjs — move old top-level (communal) favourites into the
// per-library favourites/ folders, by bucket. Favourites became per-library
// (see omp-favourites-store.js), so the legacy `<pod>/favourites/` stars need
// sorting into each library's own `<library>/favourites/`.
//
//   node migrate-favourites.mjs <sourceFavDir> <dkPluginsDir> [--apply]
//   e.g. node … ~/solid/dk-pod/favourites ~/solid/dk-pod/dk/plugins
//
// Dry-run by default (prints the plan); --apply copies the files (source left
// intact — delete it yourself once you've confirmed in the app).

import fs from 'node:fs';
import path from 'node:path';

const [srcDir, pluginsDir] = process.argv.slice(2);
const apply = process.argv.includes('--apply');
if (!srcDir || !pluginsDir) {
  console.error('usage: migrate-favourites.mjs <sourceFavDir> <dkPluginsDir> [--apply]');
  process.exit(2);
}

// bucket (dctype local name) → the library whose favourites/ it belongs in.
const BUCKET_TO_LIB = {
  Sound:       'ia-player/libraries/internet_archive_music',
  MovingImage: 'ia-player/libraries/internet_archive_movies',
  Collection:  'omp-images/libraries/wikimedia_images',   // image galleries
};

const bucketOf = (ttl) => (ttl.match(/dctype:(StillImage|MovingImage|Sound|Text|Collection)/) || [])[1] || null;

const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.ttl'));
const plan = { };   // lib → [file]
const unmapped = [];

for (const f of files) {
  const ttl = fs.readFileSync(path.join(srcDir, f), 'utf8');
  const lib = BUCKET_TO_LIB[bucketOf(ttl)];
  if (!lib) { unmapped.push(`${f} (bucket=${bucketOf(ttl)})`); continue; }
  (plan[lib] ||= []).push(f);
}

console.log(`\nSource: ${srcDir}  (${files.length} stars)`);
console.log(`Mode: ${apply ? 'APPLY (copying)' : 'DRY RUN'}\n`);
for (const [lib, fs_] of Object.entries(plan)) {
  console.log(`  → ${lib}/favourites/   (${fs_.length})`);
}
if (unmapped.length) console.log(`  ⚠ unmapped (left in source): ${unmapped.join(', ')}`);

if (apply) {
  for (const [lib, fs_] of Object.entries(plan)) {
    const dest = path.join(pluginsDir, lib, 'favourites');
    fs.mkdirSync(dest, { recursive: true });
    for (const f of fs_) fs.copyFileSync(path.join(srcDir, f), path.join(dest, f));
    console.log(`copied ${fs_.length} → ${dest}`);
  }
  console.log('\nDone. Source left intact — remove it once confirmed in the app.');
} else {
  console.log('\n(dry run — re-run with --apply to copy)');
}
