// Manage Plugins verification — the two <sol-plugin-manager> boxes work end
// to end:
//   1. ☰ → Manage Plugins… mounts both boxes (data/plugins-catalog.ttl#InUse /
//      #Available) with their cards and titles from the RDF
//   2. a drag from one box dropped on the other MOVES the entry — one atomic
//      rewrite of BOTH lists (the clobber regression: saving one list must
//      not strip the other), auto-saved through the pivot server
//   3. a manifest URL typed into a box's input row imports the plugin (or
//      reports it's already listed)
// The test edits the REAL data/plugins-catalog.ttl and restores it with git checkout
// afterwards (the file must be clean). Run from dk root with both servers up.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium } from '/home/jeff/solid/podz/node_modules/playwright-core/index.mjs';

const fails = [];
const check = (name, ok, detail = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : '')); if (!ok) fails.push(name); };
const restore = () => {
  try { execFileSync('git', ['checkout', '--', 'data/plugins-catalog.ttl']); } catch {}
};

// GUARD: this test git-restores the file it edits — running it with
// uncommitted palette changes would WIPE them.
const dirty = execFileSync('git', ['status', '--porcelain', 'data/plugins-catalog.ttl'], { encoding: 'utf8' }).trim();
if (dirty) {
  console.error('ABORT: commit data/plugins-catalog.ttl first — this test restores it via git checkout:\n' + dirty);
  process.exit(2);
}

// Turtle helpers that accept BOTH spellings of a fragment subject: the
// hand-written `<#Frag>` and the `:Frag` (@prefix : <#>) the rdflib
// serializer emits after a save. Index-based, not one regex over the block:
// the rdfs:comments contain periods, and saves reorder/reformat everything.
const subjStart = (ttl, frag) => {
  const i = ttl.indexOf(`<#${frag}>`);
  if (i >= 0) return i;
  const m = ttl.match(new RegExp(`^:${frag}\\b`, 'm'));
  return m ? m.index : -1;
};
// The list a menu's ui:parts holds, as fragment names (order preserved).
const partsOf = (ttl, menu) => {
  const i = subjStart(ttl, menu);
  if (i < 0) return null;
  const m = ttl.slice(i).match(/ui:parts\s*\(([^)]*)\)/);
  return m ? [...m[1].matchAll(/(?:<#|:)([\w-]+)/g)].map((x) => x[1]) : null;
};
// A subject's block: from its opener to the next top-level subject.
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

  // --- open Manage Plugins via the ☰ hamburger (menu item → modal) ---
  await page.evaluate(async () => {
    const dd = document.querySelector('sol-dropdown-button.omp-more');
    dd?.shadowRoot?.querySelector('.sol-dd-trigger')?.click();
    await new Promise(r => setTimeout(r, 800));
    [...dd.shadowRoot.querySelectorAll('.sol-dd-popup button, .sol-dd-popup a')]
      .find(b => /manage plugins/i.test(b.textContent))?.click();
    await new Promise(r => setTimeout(r, 5000));
  });

  // --- both boxes mount with cards + RDF-declared titles ---
  const mounted = await page.evaluate(() => {
    const root = document.querySelector('sol-modal')?.shadowRoot || document;
    const boxes = [...root.querySelectorAll('sol-plugin-manager')];
    const by = (frag) => boxes.find((b) => (b.getAttribute('source') || '').endsWith('#' + frag));
    const info = (b) => ({
      title: b?.shadowRoot?.querySelector('.builder-title')?.textContent ?? null,
      cards: b?.shadowRoot?.querySelectorAll('.card:not(.ghost)').length ?? -1,
      urlRow: !!b?.shadowRoot?.querySelector('.url-input'),
    });
    const availBox = by('Available');
    const headings = [...(availBox?.shadowRoot?.querySelectorAll('.topic-tab') || [])].map((h) => h.textContent);
    return { inUse: info(by('InUse')), avail: info(availBox), headings, boxes: boxes.length };
  });
  check('two plugin-manager boxes mount', mounted.boxes === 2, `boxes=${mounted.boxes}`);
  check('Plugins to Use renders its cards + title', mounted.inUse.cards >= 8 && /Plugins to Use/.test(mounted.inUse.title || ''), JSON.stringify(mounted.inUse));
  check('Plugins Available renders its cards + title', mounted.avail.cards >= 1 && /Plugins Available/.test(mounted.avail.title || ''), JSON.stringify(mounted.avail));
  check('boxes carry the manifest-URL input row', mounted.inUse.urlRow && mounted.avail.urlRow);
  check('Available shows skos topic TABS',
    mounted.headings.includes('Information') && mounted.headings.includes('Tech'),
    `tabs=[${mounted.headings}]`);

  // --- move: drop the #InUse Calendar card on the Available box ---
  const moved = await page.evaluate(async () => {
    const root = document.querySelector('sol-modal')?.shadowRoot || document;
    const boxes = [...root.querySelectorAll('sol-plugin-manager')];
    const by = (frag) => boxes.find((b) => (b.getAttribute('source') || '').endsWith('#' + frag));
    const avail = by('Available');
    const docUrl = new URL('data/plugins-catalog.ttl', document.baseURI).href;
    const dt = new DataTransfer();
    dt.setData('application/x-sol-plugin', JSON.stringify({
      label: 'Calendar', tag: 'dk-calendar-popout',
      params: [['source', './plugins/calendar/calendar-settings.ttl#All']],
      subject: `${docUrl}#Calendar`, list: `${docUrl}#InUse`,
    }));
    const target = avail.shadowRoot.querySelector('.builder');
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, composed: true, dataTransfer: dt }));
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 250));
      const s = avail.shadowRoot.querySelector('.builder-status');
      if (/moved|✓/.test(s?.textContent || '')) return { ok: true, msg: s.textContent };
      if (/failed/.test(s?.textContent || '')) return { ok: false, msg: s.textContent };
    }
    return { ok: false, msg: 'timeout waiting for move status' };
  });
  check('drag between boxes saves (PUT via pivot server)', !!moved.ok, moved.msg || '');

  // --- the PUT landed on disk: membership moved, NOTHING clobbered ---
  let ttl = readFileSync('data/plugins-catalog.ttl', 'utf8');
  let inUse = partsOf(ttl, 'InUse');
  let avail = partsOf(ttl, 'Available');
  check('moved entry now in #Available, not #InUse',
    !!avail && avail.includes('Calendar') && !!inUse && !inUse.includes('Calendar'),
    `InUse=${inUse?.length} Available=${avail?.length}`);
  check('both lists survive the rewrite (clobber regression)',
    !!inUse && inUse.length >= 8 && !!avail && avail.length >= 4,
    `InUse=[${inUse}] Available=[${avail}]`);
  check('the moved subject keeps its triples', subjBlock(ttl, 'Calendar').includes('dk-calendar-popout'));

  // --- the sibling box re-rendered (it lost the Calendar card) ---
  const sibling = await page.evaluate(() => {
    const root = document.querySelector('sol-modal')?.shadowRoot || document;
    const boxes = [...root.querySelectorAll('sol-plugin-manager')];
    const by = (frag) => boxes.find((b) => (b.getAttribute('source') || '').endsWith('#' + frag));
    const labels = (b) => [...(b?.shadowRoot?.querySelectorAll('.card .card-label') || [])].map((x) => x.textContent);
    return { inUse: labels(by('InUse')), avail: labels(by('Available')) };
  });
  check('boxes live-update after the move',
    !sibling.inUse.includes('Calendar') && sibling.avail.includes('Calendar'),
    `avail=[${sibling.avail.join(',')}]`);

  // --- import a manifest by URL into Plugins Available ---
  const imported = await page.evaluate(async () => {
    const root = document.querySelector('sol-modal')?.shadowRoot || document;
    const boxes = [...root.querySelectorAll('sol-plugin-manager')];
    const avail = boxes.find((b) => (b.getAttribute('source') || '').endsWith('#Available'));
    const input = avail.shadowRoot.querySelector('.url-input');
    input.value = 'plugins/news/manifest.ttl';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 250));
      const s = avail.shadowRoot.querySelector('.builder-status');
      const t = s?.textContent || '';
      if (/added|already/.test(t)) return { ok: true, msg: t };
      if (/failed/.test(t)) return { ok: false, msg: t };
    }
    return { ok: false, msg: 'timeout waiting for import status' };
  });
  check('manifest URL import lands (added or already listed)', !!imported.ok, imported.msg || '');

  ttl = readFileSync('data/plugins-catalog.ttl', 'utf8');
  inUse = partsOf(ttl, 'InUse');
  avail = partsOf(ttl, 'Available');
  check('lists intact after import', !!inUse && inUse.length >= 8 && !!avail && avail.length >= 5,
    `InUse=${inUse?.length} Available=${avail?.length}`);
  if (/added/.test(imported.msg || '')) {
    const info = subjBlock(ttl, 'Information');
    check('imported entry filed under its manifest category (skos:member)',
      /skos:member|member/.test(info) && /News/.test(info), info.slice(0, 160));
  }
  if (/added/.test(imported.msg || '')) {
    check('imported manifest entry is in #Available on disk',
      avail.some((f) => !['SolidOS-data-browser', 'Weather', 'Clock', 'Calendar'].includes(f)),
      `Available=[${avail}]`);
  }
} finally {
  restore();
  await browser.close();
}
const after = readFileSync('data/plugins-catalog.ttl', 'utf8');
check('repo state restored after the test', partsOf(after, 'InUse')?.includes('Calendar') === true);
console.log(fails.length ? `\n${fails.length} FAILURE(S)` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
