// Combine the external + component load-test results into one report and, with
// --write, apply the icon decisions to the manifests (repo AND pod copies):
//   - external app loaded + favicon found  -> ui:icon <favicon>   (replaces old)
//   - external loaded, no favicon           -> keep current icon (noted)
//   - external failed to load               -> keep current icon (FAILED)
//   - in-app component                       -> keep curated emoji/URL icon
// Also adds ui:icon to the 9 folder manifest.jsonld files (component emoji).
//
//   node claude/smoke-tests/apply-plugin-icons.mjs            # report only
//   node claude/smoke-tests/apply-plugin-icons.mjs --write    # apply edits

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import os from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const POD = join(os.homedir(), 'solid', 'dk-pod', 'dk');
const WRITE = process.argv.includes('--write');

const list = JSON.parse(readFileSync(join(root, 'claude/validation/plugin-list.json'), 'utf8'));
const ext = JSON.parse(readFileSync(join(root, 'claude/validation/externals-probe.json'), 'utf8'));
const compFile = join(root, 'claude/validation/components-probe.json');
const comp = existsSync(compFile) ? JSON.parse(readFileSync(compFile, 'utf8')).results : [];
const extByFile = new Map(ext.map((e) => [e.file, e]));
const compByFile = new Map(comp.map((c) => [c.file, c]));

// folder plugin -> the .ttl it corresponds to (for stamping manifest.jsonld icon)
const FOLDER_TTL = {
  calendar: 'calendar.ttl', 'ia-player': 'music.ttl', news: 'news.ttl',
  'omp-images': 'images.ttl', podz: 'workspaces.ttl', search: 'search.ttl',
  solidos: 'solidos-browser.ttl', time: 'clock.ttl', weather: 'weather.ttl',
};

const decisions = [];
for (const e of list) {
  const d = { file: e.file, label: e.label, kind: e.kind, oldIcon: e.icon, oldIsUrl: e.iconIsUrl };
  if (e.kind === 'component') {
    const c = compByFile.get(e.file);
    d.loaded = c ? c.loaded : null;
    d.rendered = c ? c.rendered : null;
    d.newIcon = e.icon; d.newIsUrl = e.iconIsUrl;   // components keep their icon
    d.action = 'keep (component)';
  } else {
    const p = extByFile.get(e.file);
    d.loaded = p ? p.loaded : false;
    if (p && p.loaded && p.favicon) {
      d.newIcon = p.favicon; d.newIsUrl = true;
      d.action = (p.favicon === e.icon) ? 'keep (favicon unchanged)' : 'replace -> favicon';
    } else {
      d.newIcon = e.icon; d.newIsUrl = e.iconIsUrl;
      d.action = !d.loaded ? 'keep (FAILED to load)' : 'keep (no favicon found)';
      if (p && p.mainFail) d.note = p.mainFail;
      if (p && p.loadErr) d.note = p.loadErr;
      if (p && p.faviconNote) d.note = p.faviconNote;
    }
  }
  d.changed = d.newIcon !== d.oldIcon || d.newIsUrl !== d.oldIsUrl;
  decisions.push(d);
}

// ---- report ----
const fmt = (icon, isUrl) => (isUrl ? `<${icon}>` : (icon || '∅'));
console.log('\nLABEL'.padEnd(34) + 'KIND'.padEnd(11) + 'LOADED'.padEnd(8) + 'ACTION'.padEnd(26) + 'OLD -> NEW');
console.log('-'.repeat(120));
for (const d of decisions) {
  const loaded = d.loaded === null ? '-' : (d.loaded ? 'yes' : 'NO');
  const arrow = d.changed ? `${fmt(d.oldIcon, d.oldIsUrl)}  ->  ${fmt(d.newIcon, d.newIsUrl)}` : fmt(d.oldIcon, d.oldIsUrl);
  console.log(d.label.slice(0, 33).padEnd(34) + d.kind.padEnd(11) + loaded.padEnd(8) + d.action.padEnd(26) + arrow);
}
const changed = decisions.filter((d) => d.changed);
const failed = decisions.filter((d) => d.kind === 'link' && !d.loaded);
console.log('\n' + '='.repeat(60));
console.log(`${decisions.length} entries | ${changed.length} icon changes | ${failed.length} externals failed to load`);
if (failed.length) console.log('failed:', failed.map((d) => `${d.label} (${d.note || '?'})`).join(', '));

writeFileSync(join(root, 'claude/validation/plugin-icon-report.json'), JSON.stringify(decisions, null, 2));
console.log('wrote claude/validation/plugin-icon-report.json');

if (!WRITE) { console.log('\n(report only — re-run with --write to apply)'); process.exit(0); }

// ---- apply ----
// Replace the ui:icon object on the doc subject. Match emoji literal or <url>.
function setTtlIcon(text, newIcon) {
  const re = /(ui:icon\s+)("(?:[^"\\]|\\.)*"|<[^>]*>)/;
  const repl = `$1<${newIcon}>`;
  if (re.test(text)) return text.replace(re, repl);
  return null;   // no existing ui:icon — leave alone (shouldn't happen here)
}

function editBoth(relPath, transform) {
  const targets = [join(root, relPath), join(POD, relPath)];
  const touched = [];
  for (const p of targets) {
    if (!existsSync(p)) continue;
    const before = readFileSync(p, 'utf8');
    const after = transform(before);
    if (after == null) { console.warn(`  ! no change pattern in ${p}`); continue; }
    if (after !== before) { writeFileSync(p, after); touched.push(p.startsWith(POD) ? 'pod' : 'repo'); }
    else touched.push((p.startsWith(POD) ? 'pod' : 'repo') + '(same)');
  }
  return touched;
}

let nTtl = 0;
for (const d of decisions) {
  if (!d.changed) continue;
  const t = editBoth(`plugins/${d.file}`, (txt) => setTtlIcon(txt, d.newIcon));
  console.log(`ttl ${d.file}: ${d.newIcon}  [${t.join(', ') || 'none'}]`);
  nTtl++;
}

// Stamp ui:icon into the 9 folder manifest.jsonld files (component emoji).
function setJsonldIcon(text, iconVal) {
  const m = JSON.parse(text);
  if (!m['@context']) m['@context'] = {};
  if (typeof m['@context'] === 'object' && !Array.isArray(m['@context']) && !m['@context'].icon) {
    m['@context'].icon = 'ui:icon';
  }
  m.icon = iconVal;
  // Re-serialise preserving 2-space indent + trailing newline.
  return JSON.stringify(m, null, 2) + '\n';
}

let nManifest = 0;
for (const [folder, ttl] of Object.entries(FOLDER_TTL)) {
  const dec = decisions.find((d) => d.file === ttl);
  const iconVal = dec ? dec.newIcon : null;
  if (!iconVal) { console.warn(`  ! no icon for folder ${folder} (ttl ${ttl})`); continue; }
  const t = editBoth(`plugins/${folder}/manifest.jsonld`, (txt) => setJsonldIcon(txt, iconVal));
  console.log(`manifest ${folder}: icon "${iconVal}"  [${t.join(', ') || 'none'}]`);
  nManifest++;
}

console.log(`\napplied: ${nTtl} ttl icon edits, ${nManifest} manifest.jsonld icons (repo + pod where present)`);
