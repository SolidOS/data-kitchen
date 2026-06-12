// Customize subtab 1 (define the main menu tabs) end to end:
//   1. the menu + bar managers mount and render their rows
//   2. an edit made through the UI (add item, assign the ia-player plugin
//      via the drag payload, rename) SAVES — the PUT lands in data/tabs.ttl
//      on disk through the pivot server
//   3. tools/conversion/generate-html-first.mjs regenerates html-first.html
//      with the new tab, and --verify round-trips
// The test edits the REAL data/tabs.ttl + html-first.html and restores both
// with git checkout afterwards (tree must be clean for those two files).
// Run from dk root with both servers up.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium } from '/home/jeff/solid/podz/node_modules/playwright-core/index.mjs';

const fails = [];
const check = (name, ok, detail = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : '')); if (!ok) fails.push(name); };
const restore = () => {
  try { execFileSync('git', ['checkout', '--', 'data/tabs.ttl', 'html-first.html']); } catch {}
};

// GUARD: this test git-restores the two files it edits — running it with
// uncommitted changes to them would WIPE those changes (it has, twice).
const dirty = execFileSync('git', ['status', '--porcelain', 'data/tabs.ttl', 'html-first.html'], { encoding: 'utf8' }).trim();
if (dirty) {
  console.error('ABORT: commit data/tabs.ttl and html-first.html first — this test restores them via git checkout:\n' + dirty);
  process.exit(2);
}

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
try {
  await page.goto('http://localhost:3000/index.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.evaluate(async () => { if (window.ComponentInterop?.ready) await window.ComponentInterop.ready; });
  await page.waitForTimeout(5000);

  // --- open ☰ Customize; subtab 1 (define menus) is auto-selected ---
  await page.evaluate(async () => {
    const dd = document.querySelector('sol-dropdown-button.omp-more');
    dd?.shadowRoot?.querySelector('.sol-dd-trigger')?.click();
    await new Promise(r => setTimeout(r, 800));
    [...dd.shadowRoot.querySelectorAll('.sol-dd-popup button, .sol-dd-popup a')]
      .find(b => /^customize$/i.test(b.textContent.trim()))?.click();
    await new Promise(r => setTimeout(r, 5000));
  });

  // The managers live in the menu pane, inside the define-menus include.
  const mounted = await page.evaluate(() => {
    const root = document.querySelector('#dk-menu-pane .dk-define-menus') || document;
    const menuB = root.querySelector('sol-menu-manager');
    const barB = root.querySelector('sol-button-bar-manager');
    return {
      menuRows: menuB?.shadowRoot?.querySelectorAll('.row').length ?? -1,
      barRows: barB?.shadowRoot?.querySelectorAll('.row').length ?? -1,
    };
  });
  check('menu builder renders the tab rows', mounted.menuRows >= 5, `rows=${mounted.menuRows}`);
  // the bar is down to search + calendar (fontsize/theme moved to the ☰ menu)
  check('bar builder renders the bar rows', mounted.barRows >= 2, `rows=${mounted.barRows}`);

  // --- edit: add an item, assign it the Music plugin via the drag payload,
  //     rename it, save ---
  const saved = await page.evaluate(async () => {
    const root = document.querySelector('#dk-menu-pane .dk-define-menus') || document;
    const builder = root.querySelector('sol-menu-manager');
    const sh = builder.shadowRoot;
    sh.querySelector('.add-btn').click();                       // ＋ item
    await new Promise(r => setTimeout(r, 300));
    const rows = sh.querySelectorAll('.row');
    const newRow = rows[rows.length - 1];
    // a real DataTransfer carrying the palette payload, dropped ON the row
    const dt = new DataTransfer();
    dt.setData('application/x-sol-plugin', JSON.stringify({
      label: 'Smoke Music', tag: 'ia-player',
      params: [['storage-ns', 'smoke'], ['source', './plugins/ia-player/libraries/internet_archive_music/index.ttl']],
    }));
    const rect = newRow.getBoundingClientRect();
    const mid = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, bubbles: true, cancelable: true, composed: true };
    newRow.dispatchEvent(Object.assign(new DragEvent('dragover', { ...mid, dataTransfer: dt })));
    newRow.dispatchEvent(Object.assign(new DragEvent('drop', { ...mid, dataTransfer: dt })));
    await new Promise(r => setTimeout(r, 300));
    // rename via the (re-rendered) last row's input
    const rows2 = builder.shadowRoot.querySelectorAll('.row');
    const input = rows2[rows2.length - 1].querySelector('.label');
    input.value = '🚬 Smoke Test Tab';
    input.dispatchEvent(new Event('input'));
    // no Save button — the managers auto-save ~0.8s after the last edit
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 250));
      const s = builder.shadowRoot.querySelector('.builder-status');
      if (/saved/.test(s?.textContent || '')) return { ok: true };
      if (/failed/.test(s?.textContent || '')) return { ok: false, msg: s.textContent };
    }
    return { ok: false, msg: 'timeout waiting for save status' };
  });
  check('auto-save round-trips (PUT via pivot server)', !!saved.ok, saved.msg || '');

  // --- a SECOND plugin dropped on the same row turns it into a submenu ---
  const submenu = await page.evaluate(async () => {
    const root = document.querySelector('#dk-menu-pane .dk-define-menus') || document;
    const builder = root.querySelector('sol-menu-manager');
    const sh = builder.shadowRoot;
    const row = [...sh.querySelectorAll('.row')].find(r => /Smoke Test Tab/.test(r.querySelector('.label')?.value || ''));
    const dt = new DataTransfer();
    dt.setData('application/x-sol-plugin', JSON.stringify({
      label: 'Smoke Weather', tag: 'sol-weather',
      params: [['source', './plugins/weather/weather-settings.ttl#Settings']],
    }));
    const rect = row.getBoundingClientRect();
    const mid = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, bubbles: true, cancelable: true, composed: true };
    row.dispatchEvent(new DragEvent('dragover', { ...mid, dataTransfer: dt }));
    row.dispatchEvent(new DragEvent('drop', { ...mid, dataTransfer: dt }));
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 250));
      if (/saved/.test(sh.querySelector('.builder-status')?.textContent || '')) break;
    }
    await new Promise(r => setTimeout(r, 800));   // let the post-save re-render settle
    const row2 = [...sh.querySelectorAll('.row')].find(r => /Smoke Test Tab/.test(r.querySelector('.label')?.value || ''));
    return {
      chips: row2 ? [...row2.querySelectorAll('.chip')].map((c) => c.textContent) : [],
      // getElementsByTagName counts true descendants only (querySelectorAll
      // 'ul .row' would match the row via the tree's OWN ul outside the li)
      nestedRows: row2 ? row2.closest('li').getElementsByTagName('ul').length : -1,
    };
  });
  check('second drop lists BOTH plugins as chips ON the row (no nested rows)',
    submenu.chips.length === 2 && submenu.nestedRows === 0
    && submenu.chips.some((c) => /Internet Archive/.test(c)) && submenu.chips.some((c) => /Smoke Weather/.test(c)),
    JSON.stringify(submenu));

  // --- the PUT landed on disk; the generator picks it up ---
  const ttl = readFileSync('data/tabs.ttl', 'utf8');
  check('saved RDF contains the new item', /Smoke Test Tab/.test(ttl) && /smoke/.test(ttl));
  check('pantry comment-free doc still has all panels', /panel-solidos/.test(ttl) && /panel-customize/.test(ttl));

  let genOut = '';
  try { genOut = execFileSync('node', ['tools/conversion/generate-html-first.mjs'], { encoding: 'utf8' }); }
  catch (e) { genOut = String(e); }
  const html = readFileSync('html-first.html', 'utf8');
  check('generator emits the new tab into html-first.html', /Smoke Test Tab/.test(html), genOut.trim());
  check('generator emits the submenu block with both plugins',
    /<submenu[\s\S]*?Smoke Test Tab[\s\S]*?<\/submenu>/.test(html)
    && ((html.match(/<submenu[\s\S]*?<\/submenu>/) || [''])[0].match(/<a /g) || []).length === 2);
  check('chrome block survives regeneration', /chrome:begin/.test(html) && /omp-help-launch/.test(html) && /omp-more/.test(html));
  let verifyOk = true;
  try { execFileSync('node', ['tools/conversion/generate-html-first.mjs', '--verify']); }
  catch { verifyOk = false; }
  check('generator --verify round-trip is stable', verifyOk);

  // --- the regenerated shell actually shows the new tab ---
  // (a FRESH browser, so the old instance's HTTP cache can't serve the
  // pre-regeneration html-first.html — electron disables its cache, plain
  // Chrome here doesn't, and that made this check flaky)
  const browser2 = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  const page2 = await browser2.newPage();
  await page2.goto('http://localhost:3000/index.html', { waitUntil: 'domcontentloaded' });
  await page2.evaluate(async () => { if (window.ComponentInterop?.ready) await window.ComponentInterop.ready; });
  await page2.waitForTimeout(4000);
  const tabsNow = await page2.evaluate(() =>
    [...document.querySelector('sol-tabs')?.querySelectorAll('a, [role="tab"]') || []].map(e => e.textContent.trim()));
  await browser2.close();
  check('reloaded shell shows the built tab', tabsNow.some(t => /Smoke Test Tab/.test(t)), tabsNow.join(' | ').slice(0, 140));
} finally {
  restore();
  await browser.close();
}
const ttlAfter = readFileSync('data/tabs.ttl', 'utf8');
check('repo state restored after the test', !/Smoke Test Tab/.test(ttlAfter));
console.log(fails.length ? `\n${fails.length} FAILURE(S)` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
