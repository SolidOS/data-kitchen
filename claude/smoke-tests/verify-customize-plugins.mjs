// Customize subtab 1 (Customize Plugins, Menus, & buttons) end to end:
//   1. ☰ → Customize (subtab 1 auto-selected) mounts the catalog box (topic
//      tabs) and the menu/bar managers as drop targets showing current contents
//   2. a manifest URL typed into the box imports the plugin (or reports
//      it's already listed) — and a fresh import is filed under its
//      manifest category (skos:member), with the topic collections intact
// The test edits the REAL data/plugins-catalog.ttl and restores it with git
// checkout afterwards (the file must be clean). Run from dk root with both
// servers up.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium } from '/home/jeff/solid/podz/node_modules/playwright-core/index.mjs';

const fails = [];
const check = (name, ok, detail = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : '')); if (!ok) fails.push(name); };
const restore = () => {
  try { execFileSync('git', ['checkout', '--', 'data/plugins-catalog.ttl']); } catch {}
};

// GUARD: this test git-restores the file it edits — running it with
// uncommitted catalog changes would WIPE them.
const dirty = execFileSync('git', ['status', '--porcelain', 'data/plugins-catalog.ttl'], { encoding: 'utf8' }).trim();
if (dirty) {
  console.error('ABORT: commit data/plugins-catalog.ttl first — this test restores it via git checkout:\n' + dirty);
  process.exit(2);
}

// Turtle helpers tolerant of both subject spellings (`<#Frag>` hand-written,
// `:Frag` after an rdflib save).
const subjStart = (ttl, frag) => {
  const i = ttl.indexOf(`<#${frag}>`);
  if (i >= 0) return i;
  const m = ttl.match(new RegExp(`^:${frag}\\b`, 'm'));
  return m ? m.index : -1;
};
const partsOf = (ttl, menu) => {
  const i = subjStart(ttl, menu);
  if (i < 0) return null;
  const m = ttl.slice(i).match(/ui:parts\s*\(([^)]*)\)/);
  return m ? [...m[1].matchAll(/(?:<#|:)([\w-]+)/g)].map((x) => x[1]) : null;
};
const subjBlock = (ttl, frag) => {
  const i = subjStart(ttl, frag);
  if (i < 0) return '';
  const at = ttl.slice(i + 1).search(/\n[<:]/);
  return at < 0 ? ttl.slice(i) : ttl.slice(i, i + 1 + at);
};

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
try {
  await page.goto('http://localhost:3000/index.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.evaluate(async () => { if (window.ComponentInterop?.ready) await window.ComponentInterop.ready; });
  await page.waitForTimeout(5000);

  // --- open ☰ Customize; subtab 1 (choose plugins) is auto-selected ---
  await page.evaluate(async () => {
    const dd = document.querySelector('sol-dropdown-button.omp-more');
    dd?.shadowRoot?.querySelector('.sol-dd-trigger')?.click();
    await new Promise(r => setTimeout(r, 800));
    [...dd.shadowRoot.querySelectorAll('.sol-dd-popup button, .sol-dd-popup a')]
      .find(b => /^customize$/i.test(b.textContent.trim()))?.click();
    await new Promise(r => setTimeout(r, 5000));
  });

  // --- the panel mounts: catalog box + menu/bar drop targets ---
  const mounted = await page.evaluate(() => {
    const root = document.querySelector('#dk-menu-pane .dk-choose-plugins');
    const box = root?.querySelector('sol-plugin-manager');
    const menuB = root?.querySelector('sol-menu-manager');
    const barB = root?.querySelector('sol-button-bar-manager');
    return {
      title: box?.shadowRoot?.querySelector('.builder-title')?.textContent ?? null,
      topicTabs: [...(box?.shadowRoot?.querySelectorAll('.topic-tab') || [])].map((t) => t.textContent),
      cards: box?.shadowRoot?.querySelectorAll('.card:not(.ghost)').length ?? -1,
      urlRow: !!box?.shadowRoot?.querySelector('.url-input'),
      menuRows: menuB?.shadowRoot?.querySelectorAll('.row').length ?? -1,
      barRows: barB?.shadowRoot?.querySelectorAll('.row').length ?? -1,
    };
  });
  check('catalog box mounts with topic tabs', /Plugins Available/.test(mounted.title || '')
    && mounted.topicTabs.includes('Information') && mounted.topicTabs.includes('Tech'),
    `tabs=[${mounted.topicTabs}]`);
  check('active topic shows cards + URL row', mounted.cards >= 1 && mounted.urlRow, `cards=${mounted.cards}`);
  check('menu drop target shows current tabs', mounted.menuRows >= 5, `rows=${mounted.menuRows}`);
  check('bar drop target shows current buttons', mounted.barRows >= 2, `rows=${mounted.barRows}`);

  // --- import by manifest URL (News is already in the catalog by tag but
  //     with different defaults, so this lands as a fresh entry and must be
  //     filed under its manifest category) ---
  const imported = await page.evaluate(async () => {
    const box = document.querySelector('#dk-menu-pane .dk-choose-plugins sol-plugin-manager');
    const input = box.shadowRoot.querySelector('.url-input');
    input.value = 'plugins/news/manifest.ttl';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 250));
      const t = box.shadowRoot.querySelector('.builder-status')?.textContent || '';
      if (/added|already/.test(t)) return { ok: true, msg: t };
      if (/failed/.test(t)) return { ok: false, msg: t };
    }
    return { ok: false, msg: 'timeout waiting for import status' };
  });
  check('manifest URL import lands (added or already listed)', !!imported.ok, imported.msg || '');

  const ttl = readFileSync('data/plugins-catalog.ttl', 'utf8');
  const avail = partsOf(ttl, 'Available');
  check('catalog list survives the import', !!avail && avail.length >= 53, `Available=${avail?.length}`);
  if (/added/.test(imported.msg || '')) {
    const info = subjBlock(ttl, 'Information');
    check('imported entry filed under its manifest category (skos:member)',
      /member/.test(info) && /News/.test(info), info.slice(0, 160));
  }
} finally {
  restore();
  await browser.close();
}
const after = readFileSync('data/plugins-catalog.ttl', 'utf8');
check('repo state restored after the test', (partsOf(after, 'Available') || []).length >= 53);
console.log(fails.length ? `\n${fails.length} FAILURE(S)` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
