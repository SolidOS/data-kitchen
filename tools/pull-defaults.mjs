// Pod → repo snapshot of the SAVEABLE DEFAULTS, so electron releases track the
// curated pod (this is also the pod→repo reconciliation the two-copies rule
// defers). The pod stays the source of truth; this copies its current content
// into the repo's seed set.
//
//   npm run pull-defaults            (DK_POD=<dir> overrides ~/solid/dk-pod/dk)
//   npm run pull-defaults -- --dry-run
//
// COPIES:  ui-data/data-kitchen-{main-menu,hamburger-menu,settings,
//          plugins-catalog}.ttl (the catalog IS owner config now),
//          every FLAT plugins/*.ttl manifest, plugins/news/feeds.ttl
//          (SANITIZED: an absolute @prefix : <http://localhost:8000/…#> is
//          rewritten to the document-relative <#> so no machine port ships).
// EXCLUDES (deliberate):
//          ui-data/data-kitchen-startup.ttl        machine ports — never ships
//          plugin DIR contents except news/feeds.ttl — repo owns code, the pod
//            copies of podz/solidos/ia-player code may be stale
//          favourites/, libraries/*/, scratch/     user data, never defaults
// REPORTS (doesn't touch): pod↔repo diffs in plugin CODE files, for hand
//          reconciliation.
//
// Idempotent. Ends by RECONCILING the catalog (seed-plugins-catalog's
// non-destructive default: add-new + drift report) and printing git status.

import { copyFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { homedir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pod = process.env.DK_POD || join(homedir(), 'solid', 'dk-pod', 'dk');
const dry = process.argv.includes('--dry-run');

if (!existsSync(pod)) { console.error(`pod not found: ${pod}`); process.exit(1); }

const changed = [];
const pull = (rel, transform) => {
  const from = join(pod, rel);
  if (!existsSync(from)) { console.log(`  (pod has no ${rel} — skipped)`); return; }
  const to = join(root, rel);
  let body = readFileSync(from, 'utf8');
  if (transform) body = transform(body);
  const same = existsSync(to) && readFileSync(to, 'utf8') === body;
  if (same) return;
  changed.push(rel);
  if (!dry) writeFileSync(to, body);
};

// The document-relative form of feeds.ttl's base prefix — the pod copy is
// absolute (the app saved it with its own origin baked in).
const sanitizeFeeds = (s) =>
  s.replace(/@prefix : <http:\/\/[^/>]+\/dk-pod\/dk\/plugins\/news\/feeds\.ttl#>\./, '@prefix : <#>.');

console.log(`[pull-defaults] pod: ${pod}${dry ? ' (dry-run)' : ''}`);
pull('ui-data/data-kitchen-main-menu.ttl');
pull('ui-data/data-kitchen-hamburger-menu.ttl');
pull('ui-data/data-kitchen-settings.ttl');
// The catalog is the OWNER'S WORKING COPY of the unified ui:Plugin entries
// (plugin-manifest-unification, 2026-07-18) — it is PULLED like the menus,
// never regenerated (regeneration would discard owner edits).
pull('ui-data/data-kitchen-plugins-catalog.ttl');
pull('plugins/news/feeds.ttl', sanitizeFeeds);
for (const f of readdirSync(join(pod, 'plugins')).sort()) {
  if (!f.endsWith('.ttl')) continue;
  if (!statSync(join(pod, 'plugins', f)).isFile()) continue;
  pull(join('plugins', f));
}

console.log(changed.length
  ? `  pulled ${changed.length} file(s):\n    ${changed.join('\n    ')}`
  : '  repo already matches the pod');

// Report (never copy) code drift the releases would otherwise mask.
const CODE_REPORT = ['plugins/podz', 'plugins/solidos', 'plugins/home'];
for (const rel of CODE_REPORT) {
  const a = join(root, rel), b = join(pod, rel);
  if (!existsSync(a) || !existsSync(b)) continue;
  try {
    execSync(`diff -rq ${JSON.stringify(a)} ${JSON.stringify(b)} > /dev/null 2>&1`);
  } catch {
    console.log(`  NOTE: ${rel} differs pod↔repo (code/content — reconcile by hand)`);
  }
}

if (!dry && changed.length) {
  // RECONCILE (not regenerate): seed-plugins-catalog's default mode adds
  // entries for any new seeds and reports seed↔entry drift; owner entries
  // are never touched.
  execFileSync(process.execPath, ['--preserve-symlinks', join(root, 'tools', 'seed-plugins-catalog.mjs')], { stdio: 'inherit' });
}
if (!dry) execSync('git status --short', { cwd: root, stdio: 'inherit' });
