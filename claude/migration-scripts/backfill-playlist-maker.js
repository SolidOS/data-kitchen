#!/usr/bin/env node
// One-shot: add  foaf:maker "jeffz"  to every existing playlist file that
// doesn't already have a foaf:maker. Idempotent. Text-level insertion
// (the playlist files have a consistent shape) so the diff stays minimal.
//
//   node backfill-playlist-maker.js            # dry run
//   node backfill-playlist-maker.js --apply

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const APPLY = process.argv.includes('--apply');
const DIR = join(dirname(fileURLToPath(import.meta.url)), 'ia-music-library', 'playlists');
const MAKER = 'jeffz';
const FOAF_PREFIX = '@prefix foaf: <http://xmlns.com/foaf/0.1/>.';

let touched = 0, skipped = 0;
for (const fname of readdirSync(DIR)) {
  const path = join(DIR, fname);
  let ttl = readFileSync(path, 'utf8');

  if (/\bfoaf:maker\b/.test(ttl)) { skipped++; continue; }

  // Ensure the foaf prefix is declared (after the last @prefix line).
  if (!/@prefix\s+foaf:/.test(ttl)) {
    ttl = ttl.replace(/((?:^@prefix[^\n]*\n)+)/m, `$1${FOAF_PREFIX}\n`);
  }

  // Insert  foaf:maker "jeffz";  right after the dcterms:title line.
  const titleRe = /(dcterms:title\s+"(?:[^"\\]|\\.)*"\s*;)/;
  if (!titleRe.test(ttl)) {
    console.warn(`  ! ${fname}: no dcterms:title found — skipped`);
    skipped++;
    continue;
  }
  ttl = ttl.replace(titleRe, `$1\n    foaf:maker "${MAKER}";`);

  console.log(`  ~ ${fname}: + foaf:maker "${MAKER}"`);
  if (APPLY) writeFileSync(path, ttl);
  touched++;
}

console.log(`\n${APPLY ? 'Wrote' : 'Would write'} ${touched} file(s); ${skipped} already had a maker / skipped.`);
if (!APPLY) console.log('Dry run — pass --apply to write.');
