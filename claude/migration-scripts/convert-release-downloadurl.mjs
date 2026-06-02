#!/usr/bin/env node
// Phase B of the vocab migration — rename each mo:Track's audio-file
// link in the release files from dcat:downloadUrl to mo:item (Music
// Ontology: a manifestation → the item holding its full content). See
// claude/plans/vocab-migration-plan.md.
//
//   node claude/migration-scripts/convert-release-downloadurl.mjs [--apply]
//
// Pure predicate rename: `dcat:downloadUrl` → `mo:item`. Release files
// keep the dcat: prefix (dcat:Dataset / dcat:landingPage) and already
// declare mo:. Dry-run by default; --apply backs up to claude/backups/.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const apply = process.argv.includes('--apply');
const RELDIR = 'libraries/internet_archive_music/releases';
const tstamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = join('claude', 'backups', `convert-release-downloadurl-${tstamp}`);

const files = existsSync(RELDIR)
  ? readdirSync(RELDIR).filter(n =>
      n.endsWith('.ttl') && !n.startsWith('#') && !n.endsWith('~') && !n.includes('.pre-'))
  : [];

let changed = 0, total = 0;
for (const name of files) {
  const file = join(RELDIR, name);
  const before = readFileSync(file, 'utf8');
  const n = (before.match(/dcat:downloadUrl/g) || []).length;
  if (!n) continue;
  changed++;
  total += n;
  console.log(`${apply ? 'convert ' : 'would   '} ${name}  (${n} tracks)`);
  if (apply) {
    const bk = join(backupDir, name);
    mkdirSync(dirname(bk), { recursive: true });
    copyFileSync(file, bk);
    writeFileSync(file, before.split('dcat:downloadUrl').join('mo:item'));
  }
}

console.log(`\n${changed} release files ${apply ? 'converted' : 'to convert'}, ${total} dcat:downloadUrl → mo:item.`);
if (apply) console.log(`backups: ${backupDir}`);
else console.log('dry-run — re-run with --apply to write.');
