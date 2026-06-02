#!/usr/bin/env node
// Rewrite a library's absolute in-library IRIs to file-relative form,
// making the library portable — it resolves wherever it is mounted.
// Run this on a library copy you are about to move / re-mount: every
// PATCH edit re-serialises docs with absolute IRIs pinned to the
// current URL, which break on a move (see the omp-library memory).
// Uses the SAME relativiser as the "Install on my Pod" action.
//
//   node claude/migration-scripts/relativize-library-iris.mjs [libDir] [--apply] [--seg=NAME]
//
// libDir defaults to libraries/internet_archive_music (resolved from
// the project root this is run from). The in-library marker segment
// defaults to libDir's basename; pass --seg=NAME if the folder was
// renamed away from the name baked into its IRIs. Dry-run unless
// --apply; --apply backs up every changed file under claude/backups/.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { relativizeLibraryIris } from '../../src/ia-rdf.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const libDir = (args.find(a => !a.startsWith('--')) || 'libraries/internet_archive_music')
  .replace(/\/+$/, '');
// The library-container segment that marks an IRI as in-library.
// Defaults to the directory's own name (correct unless the folder was
// renamed away from the name baked into its IRIs); --seg=NAME overrides.
const segArg = args.find(a => a.startsWith('--seg='));
const containerSeg = segArg ? segArg.slice(6) : basename(libDir);

if (!existsSync(libDir)) {
  console.error(`library directory not found: ${libDir}`);
  process.exit(1);
}

// .ttl files in the library root + its playlists/ and releases/ subdirs.
// Skip emacs autosave (#…#), tilde backups and *.pre-* snapshots.
const skip = (n) => n.startsWith('#') || n.endsWith('~') || n.includes('.pre-');
const collect = (sub) => {
  const dir = sub ? join(libDir, sub) : libDir;
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(n => n.endsWith('.ttl') && !skip(n))
    .map(n => (sub ? `${sub}/${n}` : n));
};
const relPaths = [...collect(''), ...collect('playlists'), ...collect('releases')];

const ts = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = join('claude', 'backups', `relativize-${ts}`);
let scanned = 0, changed = 0;

for (const rel of relPaths) {
  scanned++;
  const file = join(libDir, rel);
  const before = readFileSync(file, 'utf8');
  const after = relativizeLibraryIris(before, containerSeg, rel);
  if (after === before) continue;
  changed++;
  const n = (before.match(/<https?:\/\//g) || []).length
          - (after.match(/<https?:\/\//g) || []).length;
  console.log(`${apply ? 'rewrote' : 'would rewrite'}  ${rel}  (${n} IRIs → relative)`);
  if (apply) {
    const bk = join(backupDir, rel);
    mkdirSync(dirname(bk), { recursive: true });
    copyFileSync(file, bk);
    writeFileSync(file, after);
  }
}

console.log(`\n${scanned} files scanned, ${changed} ${apply ? 'rewritten' : 'with stale absolute in-library IRIs'}.`);
if (changed && apply)  console.log(`backups: ${backupDir}`);
if (changed && !apply) console.log('dry-run — re-run with --apply to write the changes.');
