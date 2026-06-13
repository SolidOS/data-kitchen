// cleanup-pod.mjs — list (and optionally prune) stale leftovers in a dk pod
// root. The seeder only ever ADDS/updates files, so renames + the Phase-2 move
// (content → dk-pod/dk/) leave orphans behind. This tool finds them.
//
//   node claude/migration-scripts/cleanup-pod.mjs <podRoot>           # DRY RUN (lists only)
//   node claude/migration-scripts/cleanup-pod.mjs <podRoot> --apply   # actually delete
//
// SAFETY: nothing is deleted without --apply, and the report separates
// "safe" leftovers (a renamed/removed file whose correct version lives
// elsewhere) from "REVIEW" leftovers (the pre-Phase-2 root layout, which may
// hold curated edits that were never migrated to dk-pod/dk/).

import fs from 'node:fs';
import path from 'node:path';

const podRoot = process.argv[2];
const apply = process.argv.includes('--apply');
if (!podRoot) { console.error('usage: cleanup-pod.mjs <podRoot> [--apply]'); process.exit(2); }

const exists = (rel) => fs.existsSync(path.join(podRoot, rel));
const count = (rel) => { try { return fs.statSync(path.join(podRoot, rel)).isDirectory()
  ? fs.readdirSync(path.join(podRoot, rel), { recursive: true }).length : 1; } catch { return 0; } };

// Phase 2 is done iff the personal pod's dk/ content dir exists.
const phase2Done = exists('dk-pod/dk');

// (a) SAFE — renamed/removed files; the correct version lives elsewhere.
const SAFE = [
  ['dk-pod/dk/data/tabs.ttl',       'renamed → data-kitchen-main-menu.ttl'],
  ['dk-pod/dk/data/menu.ttl',       'renamed → data-kitchen-hamburger-menu.ttl'],
  ['dk-pod/dk/data/palette.ttl',    'renamed → plugins-catalog.ttl'],
  ['dk-pod/dk/data/feeds-skos.ttl', 'removed (dead demo)'],
  ['dk-pod/dk/favourites',          'communal wall dropped — favourites are now per-library (<library>/favourites/)'],
  ['dk-pod/dk/pages/manage-plugins.html', 'renamed → choose-plugins.html / all-plugins.html'],
  ['dk-pod/dk/plugins/manage-plugins',    'renamed → choose-plugins / all-plugins'],
];

// (b) REVIEW — the pre-Phase-2 ROOT layout (content now lives under dk-pod/dk/).
// May hold curated edits that were never migrated, so flagged, not auto-safe.
const ROOT_ORPHANS = ['data', 'pages', 'help', 'shapes', 'favourites', 'plugins', 'html-first.html'];

const safeHits = SAFE.filter(([rel]) => exists(rel));
const reviewHits = phase2Done ? ROOT_ORPHANS.filter((rel) => exists(rel)) : [];

console.log(`\nPod root: ${podRoot}   (Phase-2 layout: ${phase2Done ? 'yes' : 'no'})`);
console.log(`Mode: ${apply ? 'APPLY (deleting)' : 'DRY RUN (nothing deleted)'}\n`);

console.log('── (a) SAFE to delete — renamed/removed; correct version exists elsewhere ──');
if (!safeHits.length) console.log('   (none)');
for (const [rel, why] of safeHits) console.log(`   ${rel}   — ${why}`);

console.log('\n── (b) REVIEW FIRST — pre-Phase-2 root orphans (content now at dk-pod/dk/) ──');
console.log('   These MAY contain curated edits never migrated to the new layout.');
if (!reviewHits.length) console.log('   (none)');
for (const rel of reviewHits) console.log(`   ${rel}${fs.statSync(path.join(podRoot, rel)).isDirectory() ? '/' : ''}   (${count(rel)} entr${count(rel) === 1 ? 'y' : 'ies'})`);

if (apply) {
  // Only category (a) is deleted automatically. Category (b) requires --apply-review.
  const alsoReview = process.argv.includes('--apply-review');
  const toDelete = [...safeHits.map(([rel]) => rel), ...(alsoReview ? reviewHits : [])];
  console.log(`\nDeleting ${toDelete.length} item(s)${alsoReview ? ' (incl. review orphans)' : ' (safe only; pass --apply-review to also remove root orphans)'} …`);
  for (const rel of toDelete) { fs.rmSync(path.join(podRoot, rel), { recursive: true, force: true }); console.log(`   removed ${rel}`); }
} else {
  console.log('\n(dry run — re-run with --apply to delete category (a); add --apply-review for (b))');
}
