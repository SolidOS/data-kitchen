// The save → live-shell pipeline, end to end — the three 2026-06-12 fixes:
//
//   1. applyTabs change detection: editing an EXISTING tab's definition
//      through the Customize form (here: a second plugin dropped on it,
//      changing it into / growing its submenu) re-renders that tab's pane
//      in the RUNNING shell at once, while an UNCHANGED tab keeps its
//      keep-alive pane (same DOM node), and a rename keeps the pane too.
//   2. both-writes status: the builder's status reports the shell write —
//      "saved ✓ (menu + shell)" — not just the RDF PUT.
//   3. fingerprint rule (dk-tabs-sync): on load, an html-first.html that
//      merely LAGS tabs.ttl (it matches our last known-synced write) is
//      regenerated FROM the RDF — the form edits are NOT reverted; an html
//      that truly differs from our last write is a hand edit and imports
//      into the RDF as before (HTML wins).
//
// The test edits the REAL data/tabs.ttl + html-first.html and restores both
// with git checkout afterwards (tree must be clean for those two files).
// Run from dk root with the :3000 server up. One browser for the whole run —
// the fingerprint lives in localStorage, which an ephemeral profile only
// keeps within a single launch.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium } from '/home/jeff/solid/podz/node_modules/playwright-core/index.mjs';

const fails = [];
const check = (name, ok, detail = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : '')); if (!ok) fails.push(name); };
const restore = () => {
  try { execFileSync('git', ['checkout', '--', 'data/tabs.ttl', 'html-first.html']); } catch {}
};

// GUARD: this test git-restores the two files it edits — running it with
// uncommitted changes to them would WIPE those changes.
const dirty = execFileSync('git', ['status', '--porcelain', 'data/tabs.ttl', 'html-first.html'], { encoding: 'utf8' }).trim();
if (dirty) {
  console.error('ABORT: commit data/tabs.ttl and html-first.html first — this test restores them via git checkout:\n' + dirty);
  process.exit(2);
}

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
// ONE browser profile for the whole run (the fingerprint lives in its
// localStorage) — so the HTTP cache must be disabled instead of using fresh
// browsers per reload: plain Chrome otherwise serves the PRE-regeneration
// tabs.ttl / html-first.html after reload and the sync sees stale state.
const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });

const settle = async (ms = 5000) => {
  await page.evaluate(async () => { if (window.ComponentInterop?.ready) await window.ComponentInterop.ready; });
  await page.waitForTimeout(ms);
};
const openCustomize = () => page.evaluate(async () => {
  const dd = document.querySelector('sol-dropdown-button.omp-more');
  dd?.shadowRoot?.querySelector('.sol-dd-trigger')?.click();
  await new Promise(r => setTimeout(r, 800));
  [...dd.shadowRoot.querySelectorAll('.sol-dd-popup button, .sol-dd-popup a')]
    .find(b => /^customize$/i.test(b.textContent.trim()))?.click();
  await new Promise(r => setTimeout(r, 5000));
});
// Drop a palette payload on the menu builder row whose label matches, then
// wait for the save round-trip AND the shell-sync status; returns the final
// builder status text.
const dropOnRow = (rowRe, payload) => page.evaluate(async ({ rowRe, payload }) => {
  const builder = document.querySelector('#dk-menu-pane .dk-choose-targets sol-menu-manager');
  const sh = builder.shadowRoot;
  const row = [...sh.querySelectorAll('.row')].find(r => new RegExp(rowRe).test(r.querySelector('.label')?.value || ''));
  if (!row) return { ok: false, status: `no row matching ${rowRe}` };
  const dt = new DataTransfer();
  dt.setData('application/x-sol-plugin', JSON.stringify(payload));
  const rect = row.getBoundingClientRect();
  const mid = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, bubbles: true, cancelable: true, composed: true };
  row.dispatchEvent(new DragEvent('dragover', { ...mid, dataTransfer: dt }));
  row.dispatchEvent(new DragEvent('drop', { ...mid, dataTransfer: dt }));
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 250));
    const s = sh.querySelector('.builder-status')?.textContent || '';
    if (/menu \+ shell|failed/i.test(s)) return { ok: /saved/.test(s) && !/failed/i.test(s), status: s };
  }
  return { ok: false, status: 'timeout: ' + (sh.querySelector('.builder-status')?.textContent || '') };
}, { rowRe, payload });
const paneInfo = (nameRe) => page.evaluate((nameRe) => {
  const re = new RegExp(nameRe);
  const pane = [...document.querySelectorAll('#dk-tabs > .sol-tabs-content > .sol-tabs-pane')]
    .find(p => re.test(p.dataset.tabName || ''));
  return pane ? {
    tabName: pane.dataset.tabName,
    stackItems: pane.querySelectorAll('.sol-tabs-stack-item').length,
    tags: [...pane.querySelectorAll('.sol-tabs-stack-item > *, :scope > *:not(.sol-tabs-stack)')].map(e => e.tagName.toLowerCase()),
  } : null;
}, nameRe);

try {
  await page.goto('http://localhost:3000/index.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await settle();
  await openCustomize();

  // Mark an untouched tab's pane so we can verify it survives by IDENTITY.
  await page.evaluate(() => {
    const pane = [...document.querySelectorAll('#dk-tabs > .sol-tabs-content > .sol-tabs-pane')]
      .find(p => /News/.test(p.dataset.tabName || ''));
    if (pane) pane.__dkProbe = true;
  });

  // --- build a new tab with ONE plugin (this part worked before) ---
  await page.evaluate(async () => {
    const sh = document.querySelector('#dk-menu-pane .dk-choose-targets sol-menu-manager').shadowRoot;
    const add = sh.querySelector('.add-input');
    add.value = '🚬 Live Sync Tab';
    add.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
  });
  const first = await dropOnRow('Live Sync Tab', {
    label: 'Smoke Music', tag: 'ia-player',
    params: [['storage-ns', 'smoke'], ['source', './plugins/ia-player/libraries/internet_archive_music/index.ttl']],
  });
  check('first save lands and status covers BOTH writes', first.ok && /menu \+ shell/.test(first.status), first.status);
  let pane = await paneInfo('Live Sync Tab');
  check('new tab pane appears live', !!pane, JSON.stringify(pane));

  // --- THE regression: a SECOND plugin on the SAME tab (definition change
  //     on an existing tab) must re-render its live pane as the submenu ---
  const second = await dropOnRow('Live Sync Tab', {
    label: 'Smoke Weather', tag: 'sol-weather',
    params: [['source', './plugins/weather/weather-settings.ttl#Settings']],
  });
  check('second save lands with both-writes status', second.ok && /menu \+ shell/.test(second.status), second.status);
  await page.waitForTimeout(1000);
  pane = await paneInfo('Live Sync Tab');
  check('LIVE pane now shows the 2-plugin submenu (no reload)',
    !!pane && pane.stackItems === 2, JSON.stringify(pane));
  const probe = await page.evaluate(() => {
    const pane = [...document.querySelectorAll('#dk-tabs > .sol-tabs-content > .sol-tabs-pane')]
      .find(p => /News/.test(p.dataset.tabName || ''));
    return !!(pane && pane.__dkProbe);
  });
  check('untouched tab kept its keep-alive pane (same DOM node)', probe);

  // --- rename only → pane survives by identity ---
  await page.evaluate(() => {
    const pane = [...document.querySelectorAll('#dk-tabs > .sol-tabs-content > .sol-tabs-pane')]
      .find(p => /Live Sync Tab/.test(p.dataset.tabName || ''));
    if (pane) pane.__dkProbe2 = true;
  });
  const renamed = await page.evaluate(async () => {
    const sh = document.querySelector('#dk-menu-pane .dk-choose-targets sol-menu-manager').shadowRoot;
    const label = [...sh.querySelectorAll('.row .label')].find(l => /Live Sync Tab/.test(l.value));
    label.value = '🚬 Live Sync Renamed';
    label.dispatchEvent(new Event('input', { bubbles: true }));
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 250));
      const s = sh.querySelector('.builder-status')?.textContent || '';
      if (/menu \+ shell|failed/i.test(s)) return s;
    }
    return 'timeout';
  });
  await page.waitForTimeout(800);
  const renameKept = await page.evaluate(() => {
    const pane = [...document.querySelectorAll('#dk-tabs > .sol-tabs-content > .sol-tabs-pane')]
      .find(p => /Live Sync/.test(p.dataset.tabName || ''));
    const btn = [...document.querySelectorAll('#dk-tabs > .sol-tabs-bar button')]
      .find(b => /Live Sync Renamed/.test(b.textContent));
    return { paneKept: !!(pane && pane.__dkProbe2), btnRenamed: !!btn };
  });
  check('rename keeps the pane (same node) and relabels the button',
    /menu \+ shell/.test(renamed) && renameKept.paneKept && renameKept.btnRenamed,
    `${renamed} ${JSON.stringify(renameKept)}`);

  // --- fingerprint rule, case 1: tabs.ttl moved on, html merely LAGS (we
  //     simulate a failed regeneration) → on reload the RDF must WIN.
  //     NOTE the edit must be key-visible to the reverse sync: its tab key
  //     is id|tag|params of TOP-LEVEL tabs — label-only changes and
  //     submenu-children changes are invisible to it (pre-existing
  //     limitations, unrelated to the fingerprint rule). So we edit the
  //     News tab's view param. ---
  const lagged = await page.evaluate(async () => {
    const url = new URL('data/tabs.ttl', document.baseURI).href;
    const ttl = await (await fetch(url)).text();
    const out = ttl.replace('schema:value "threePanel"', 'schema:value "threePanel-lag"');
    const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'text/turtle' }, body: out });
    return res.ok && out !== ttl;
  });
  check('out-of-band tabs.ttl edit applied (simulated failed regen)', lagged);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await settle(6000);   // importHandEdits fires 1.5s after load, then regenerates
  const afterLag = { ttl: readFileSync('data/tabs.ttl', 'utf8'), html: readFileSync('html-first.html', 'utf8') };
  check('RDF wins: tabs.ttl NOT reverted (form-save protection)', /threePanel-lag/.test(afterLag.ttl));
  check('RDF wins: html-first.html regenerated from the RDF', /data-view="threePanel-lag"/.test(afterLag.html));

  // --- fingerprint rule, case 2: a real HAND EDIT to html-first.html still
  //     wins and imports into the RDF on reload ---
  const handEdited = await page.evaluate(async () => {
    const url = new URL('html-first.html', document.baseURI).href;
    const html = await (await fetch(url)).text();
    const out = html.replace('data-view="threePanel-lag"', 'data-view="threePanel-hand"');
    const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'text/html' }, body: out });
    return res.ok && out !== html;
  });
  check('hand edit applied to html-first.html', handEdited);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await settle(6000);
  check('hand edit wins: imported into tabs.ttl', /threePanel-hand/.test(readFileSync('data/tabs.ttl', 'utf8')));
} finally {
  restore();
  await browser.close();
}
check('repo state restored after the test',
  !/Live Sync|threePanel-(lag|hand)/.test(readFileSync('data/tabs.ttl', 'utf8')));
console.log(fails.length ? `\n${fails.length} FAILURE(S)` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
