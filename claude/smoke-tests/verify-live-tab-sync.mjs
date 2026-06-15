// The save → live-shell pipeline, end to end, under RDF-FIRST (2026-06-12):
// ui-data/data-kitchen-main-menu.ttl is the ONLY live artifact — no html-first.html, no fingerprint,
// no dual writes (src/dk-tabs-rdf.js replaced dk-tabs-sync.js).
//
//   1. applyTabs change detection: editing an EXISTING tab's definition
//      through the Customize form (here: a second plugin dropped on it,
//      changing it into / growing its submenu) re-renders that tab's pane
//      in the RUNNING shell at once, while an UNCHANGED tab keeps its
//      keep-alive pane (same DOM node), and a rename keeps the pane too.
//   2. single write: a Customize save PUTs tabs.ttl and NOTHING else — the
//      whole run must see zero PUTs of any .html resource.
//   3. persistence: after a reload the shell re-renders the saved state
//      straight from the RDF (from-rdf + dk-tabs-rdf), and an out-of-band
//      tabs.ttl edit simply IS the new truth — nothing reverts or rewrites it.
//   4. chrome self-heal: dropping a mandatory item from #Chrome's parts is
//      repaired on load (RDF-only heal) and the button reappears in the DOM.
//
// The test edits the REAL ui-data/data-kitchen-main-menu.ttl and restores it with git checkout
// afterwards (the file must be clean). Run from dk root with the :3000
// server up.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const fails = [];
const check = (name, ok, detail = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : '')); if (!ok) fails.push(name); };
const restore = () => {
  try { execFileSync('git', ['checkout', '--', 'ui-data/data-kitchen-main-menu.ttl']); } catch {}
};

// GUARD: this test git-restores the file it edits — running it with
// uncommitted changes to it would WIPE those changes.
const dirty = execFileSync('git', ['status', '--porcelain', 'ui-data/data-kitchen-main-menu.ttl'], { encoding: 'utf8' }).trim();
if (dirty) {
  console.error('ABORT: commit ui-data/data-kitchen-main-menu.ttl first — this test restores it via git checkout:\n' + dirty);
  process.exit(2);
}

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
// Disable the HTTP cache so a reload re-fetches the just-PUT tabs.ttl.
const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });

// rdf-first means NO shell file write, ever: collect every .html PUT.
const htmlPuts = [];
page.on('request', (req) => {
  if (req.method() === 'PUT' && /\.html(\?|$)/.test(req.url())) htmlPuts.push(req.url());
});

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
// wait for the save round-trip; returns the final builder status text.
// (Single write now — the plain "saved ✓" IS the complete save.)
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
    if (/saved ✓|failed/i.test(s)) return { ok: /saved ✓/.test(s) && !/failed/i.test(s), status: s };
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

  // --- build a new tab with ONE plugin ---
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
  check('first save lands (plain saved ✓ — single write)', first.ok, first.status);
  // saved ✓ covers the RDF PUT only; the live refresh runs ~150ms later
  // (dk-tabs-rdf debounce + fetch/parse) — give it a beat.
  await page.waitForTimeout(1500);
  let pane = await paneInfo('Live Sync Tab');
  check('new tab pane appears live', !!pane, JSON.stringify(pane));

  // --- a SECOND plugin on the SAME tab (definition change on an existing
  //     tab) must re-render its live pane as the submenu ---
  const second = await dropOnRow('Live Sync Tab', {
    label: 'Smoke Weather', tag: 'sol-weather',
    params: [['source', './plugins/weather/weather-settings.ttl#Settings']],
  });
  check('second save lands', second.ok, second.status);
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
      if (/saved ✓|failed/i.test(s)) return s;
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
    /saved ✓/.test(renamed) && renameKept.paneKept && renameKept.btnRenamed,
    `${renamed} ${JSON.stringify(renameKept)}`);

  // --- persistence: a reload re-renders the saved state from the RDF ---
  await page.reload({ waitUntil: 'domcontentloaded' });
  await settle(6000);
  const reloaded = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('#dk-tabs > .sol-tabs-bar button')]
      .find(b => /Live Sync Renamed/.test(b.textContent));
    return { btn: !!btn, help: !!document.querySelector('.omp-help-launch'), more: !!document.querySelector('.omp-more') };
  });
  check('reload renders the saved tab from tabs.ttl', reloaded.btn, JSON.stringify(reloaded));
  check('chrome launchers built from #Chrome on load', reloaded.help && reloaded.more, JSON.stringify(reloaded));

  // --- out-of-band tabs.ttl edit: the RDF IS the truth; on reload nothing
  //     reverts or rewrites it (the old fingerprint/import machinery is gone) ---
  const edited = await page.evaluate(async () => {
    const url = new URL('ui-data/data-kitchen-main-menu.ttl', document.baseURI).href;
    const ttl = await (await fetch(url)).text();
    const out = ttl.replace('schema:value "threePanel"', 'schema:value "threePanel-edit"');
    const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'text/turtle' }, body: out });
    return res.ok && out !== ttl;
  });
  check('out-of-band tabs.ttl edit applied', edited);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await settle(6000);
  check('RDF edit untouched after reload (no machinery rewrites it)',
    /threePanel-edit/.test(readFileSync('ui-data/data-kitchen-main-menu.ttl', 'utf8')));

  // --- chrome self-heal: drop a mandatory item from #Chrome's parts ---
  // (after a manager save the doc is in canonical rdflib form, so the item
  // may be spelled :chrome-help OR <#chrome-help> — handle both)
  const dropped = await page.evaluate(async () => {
    const url = new URL('ui-data/data-kitchen-main-menu.ttl', document.baseURI).href;
    const ttl = await (await fetch(url)).text();
    const out = ttl.replace(/(ui:parts \(\s*)(?:<#chrome-help>|:chrome-help)\s*/, '$1');
    const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'text/turtle' }, body: out });
    return res.ok && out !== ttl;
  });
  check('chrome-help dropped from #Chrome parts', dropped);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await settle(6000);
  const healed = await page.evaluate(() => !!document.querySelector('.omp-help-launch'));
  check('healChrome reinserted the help button (RDF-only heal)', healed);
  check('healed tabs.ttl lists chrome-help in #Chrome parts again',
    /(?:<#|:)Chrome>?[\s\S]{0,200}?ui:parts \([^)]*chrome-help/.test(readFileSync('ui-data/data-kitchen-main-menu.ttl', 'utf8')));

  // --- the rdf-first invariant: the whole run wrote NO .html anywhere ---
  check('zero .html PUTs across the entire run', htmlPuts.length === 0, htmlPuts.join(' '));
} finally {
  restore();
  await browser.close();
}
check('repo state restored after the test',
  !/Live Sync|threePanel-edit/.test(readFileSync('ui-data/data-kitchen-main-menu.ttl', 'utf8')));
console.log(fails.length ? `\n${fails.length} FAILURE(S)` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
