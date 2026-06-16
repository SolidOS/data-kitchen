// Live load-test the in-app (ui:Component) catalog entries inside the running
// dk app: confirm each component's custom element is defined (its module loaded
// inside dk) and, where it is mounted as a tab, that a rendered instance exists.
// Components have no external site, so this is report-only — it never changes an
// icon (curated emoji/URL icons are kept as-is).
//
// Bring the app up first (same as verify-unified-shell.mjs):
//   node pivot/run-server.cjs . 3000 &   node proxy/index.cjs &
// then:
//   node claude/smoke-tests/probe-components-load.mjs
// (needs google-chrome; uses playwright-core's chromium launcher.)

import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LIST = JSON.parse(readFileSync(join(root, 'claude/validation/plugin-list.json'), 'utf8'));
const COMPONENTS = LIST.filter((e) => e.kind === 'component' && e.tag);
const TAGS = [...new Set(COMPONENTS.map((e) => e.tag))];

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

await page.goto('http://localhost:3000/index.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.evaluate(async () => { if (window.ComponentInterop?.ready) await window.ComponentInterop.ready; });
await page.waitForTimeout(6000);   // let dk-shell.js import the dk-* components and tabs mount

// Click through every tab so lazy panes call ensureLoaded(), then re-check.
try {
  const tabBtns = await page.$$('#dk-tabs > .sol-tabs-bar button, .sol-tabs-bar button');
  for (const b of tabBtns) { try { await b.click({ timeout: 1500 }); await page.waitForTimeout(400); } catch {} }
} catch {}
await page.waitForTimeout(1500);

// Components that don't eagerly define are loaded on demand when their tab
// opens, via component-interop's importmap (tag -> module). Trigger the same
// path: try ComponentInterop.load(tag), then fall back to importing the mapped
// module URL directly (the exact module dk would import).
const MODULES = {                                   // from dk.manifest.json stages
  'ia-player': '/plugins/ia-player/dist/ia-player.esm.js',
  'omp-images': '/plugins/ia-player/dist/ia-player.esm.js',
};
await page.evaluate(async ({ tags, modules }) => {
  for (const tag of tags) {
    if (customElements.get(tag)) continue;
    try { await window.ComponentInterop?.load?.(tag); } catch (e) {}
    if (customElements.get(tag)) continue;
    if (modules[tag]) { try { await import(modules[tag]); } catch (e) { window.__impErr = (window.__impErr || []).concat(`${tag}: ${e.message}`); } }
  }
  await new Promise((r) => setTimeout(r, 1200));
}, { tags: TAGS, modules: MODULES });

const status = await page.evaluate((tags) => {
  const out = {};
  for (const tag of tags) {
    const defined = !!customElements.get(tag);
    const nodes = [...document.querySelectorAll(tag)];
    let rendered = false;
    for (const n of nodes) {
      const sr = n.shadowRoot;
      if ((sr && sr.innerHTML.trim().length > 30) || n.innerHTML.trim().length > 30) { rendered = true; break; }
    }
    out[tag] = { defined, instances: nodes.length, rendered };
  }
  return out;
}, TAGS);

const results = COMPONENTS.map((e) => {
  const s = status[e.tag] || {};
  return {
    file: e.file, label: e.label, tag: e.tag, icon: e.icon, iconIsUrl: e.iconIsUrl,
    defined: !!s.defined, instances: s.instances || 0, rendered: !!s.rendered,
    loaded: !!s.defined,   // module loaded inside dk == "loads inside dk"
  };
});

writeFileSync(join(root, 'claude/validation/components-probe.json'), JSON.stringify({ results, pageErrors: errors }, null, 2));
for (const r of results) {
  console.log(`[${r.loaded ? (r.rendered ? '✓ rendered' : '✓ defined') : '✗ NOT DEFINED'}] ${r.label}  <${r.tag}>  instances=${r.instances}  icon=${r.icon}`);
}
console.log(`\n[components done] ${results.filter((r) => r.loaded).length}/${results.length} defined; ${results.filter((r) => r.rendered).length} rendered. pageErrors=${errors.length}`);
await browser.close();
