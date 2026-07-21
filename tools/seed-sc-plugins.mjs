#!/usr/bin/env node
/**
 * seed-sc-plugins.mjs — reconcile dk's DEPLOYMENT plugin ttls with
 * sol-components' canonical per-component plugin ttls (sc plugins/*.ttl).
 *
 * sc's ttl is the library's self-description (settings shape, default data,
 * help). dk's plugins/<x>.ttl is the deployment layer: same component, plus
 * dk-specific facts (schema:keywords category, schema:additionalProperty source → the pod's
 * settings doc). This seeder copies the SETTINGS POINTERS across so
 * dk-plugin-settings can drive a form from the deployment doc alone:
 *
 *   dct:conformsTo      → rewritten to /node_modules/sol-components/…
 *   dct:references      → rewritten likewise (the library DEFAULT data doc;
 *                         the deployment's live doc stays in schema:additionalProperty)
 *   schema:softwareHelp → rewritten likewise
 *
 * Idempotent: pointers are replaced, never duplicated. Matching is by
 * module tag. Run after updating sol-components. Like seed-plugins-catalog,
 * this edits the REPO copies; sync the pod copy per the two-copies rule
 * (--pod also updates ~/solid/dk-pod/dk/plugins and dk-pod/dk/plugins).
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const SC = resolve(root, 'node_modules/sol-components');
const WEB_PREFIX = '/node_modules/sol-components/';

// ── read sc's canonical plugin docs (regex on the simple, generated ttls) ──
// keyed by element TAG, derived from the schema:url module filename (the
// single payload predicate — ui:name is retired everywhere, 2026-07-19)
const canonical = new Map();   // tag -> {conformsTo, references[], help}
for (const f of readdirSync(join(SC, 'plugins')).filter((x) => x.endsWith('.ttl'))) {
  const ttl = readFileSync(join(SC, 'plugins', f), 'utf8');
  const name = /schema:url\s+<[^>]*?([a-z][a-z0-9]*(?:-[a-z0-9]+)+)(?:\.esm|\.min)?\.js>/.exec(ttl)?.[1];
  if (!name) continue;
  const rel = (m) => (m ? WEB_PREFIX + m[1].replace(/^\.\.\//, '') : null);
  canonical.set(name, {
    conformsTo: rel(/dct:conformsTo\s+<([^>]+)>/.exec(ttl)),
    references: [...ttl.matchAll(/dct:references\s+<([^>]+)>/g)]
      .map((m) => WEB_PREFIX + m[1].replace(/^\.\.\//, '')),
    help: rel(/schema:softwareHelp\s+<([^>]+)>/.exec(ttl)),
  });
}

function enrich(dir) {
  let touched = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.ttl'))) {
    const path = join(dir, f);
    let ttl = readFileSync(path, 'utf8');
    // A Component's tag derives from its schema:url module filename (the
    // single payload). A launcher entry (calendar's <sol-button
    // data-handler="sol-calendar">) matches by its data-handler — the same
    // key dk-plugin-settings uses for the settings component.
    const modTag = /schema:url\s+<[^>]*?([\w-]+?)(?:\.esm|\.min)?\.js>/.exec(ttl)?.[1];
    const handler = /schema:name\s+"data-handler"\s*;\s*schema:value\s+"([^"]+)"/.exec(ttl)?.[1];
    const key = canonical.has(modTag) ? modTag : handler;
    const meta = key && canonical.get(key);
    if (!meta || (!meta.conformsTo && !meta.references.length && !meta.help)) continue;

    // drop any prior pointer lines (idempotence), then append fresh ones
    ttl = ttl.replace(/^\s*(dct:conformsTo|dct:references|schema:softwareHelp)\s+<[^>]+>\s*;\s*\n/gm, '');
    if (!/@prefix schema:/.test(ttl) && (meta.help)) {
      ttl = ttl.replace(/(@prefix ui:[^\n]+\n)/, '$1@prefix schema: <http://schema.org/> .\n');
    }
    const lines = [];
    if (meta.conformsTo) lines.push(`  dct:conformsTo <${meta.conformsTo}> ;`);
    for (const r of meta.references) lines.push(`  dct:references <${r}> ;`);
    if (meta.help) lines.push(`  schema:softwareHelp <${meta.help}> ;`);
    // insert after the schema:url payload line
    ttl = ttl.replace(/^(\s*schema:url\s+<[^>]+>\s*;\s*)$/m, `$1\n${lines.join('\n')}`);
    writeFileSync(path, ttl);
    touched++;
    console.log(`[seed-sc-plugins] ${path.replace(root + '/', '')} ← ${key} pointers`);
  }
  return touched;
}

const dirs = [join(root, 'plugins')];
if (process.argv.includes('--pod')) {
  const podDirs = [
    join(root, 'dk-pod/dk/plugins'),
    join(process.env.HOME, 'solid/dk-pod/dk/plugins'),
  ];
  for (const d of podDirs) if (existsSync(d)) dirs.push(d);
}
let total = 0;
for (const d of dirs) total += enrich(d);
console.log(`[seed-sc-plugins] enriched ${total} plugin doc(s) across ${dirs.length} dir(s)`);
