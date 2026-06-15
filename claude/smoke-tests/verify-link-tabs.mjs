// ui:Link tabs through the whole rdf-first shell pipeline (2026-06-12 fix:
// emitTab used to DROP link children — a submenu of links emitted empty,
// exactly Jeff's pod's Solid/Dev-Tools tabs). Mirrors that pod state:
//
//   1. tabs.ttl gains a link-only submenu + a mixed component/link submenu
//      OUT-OF-BAND. Under rdf-first that edit simply IS the new shell —
//      nothing regenerates or clobbers it.
//   2. the reloaded live shell renders them straight from the RDF: a
//      link-bearing submenu becomes a nested SUB-TABSET (hybrid rule),
//      ui:Tab links embed their site in the pane, the strip stays visible.
//   3. the rdf2html snapshot emits the link anchors correctly (no
//      data-handler, target="_blank"; the self-named conversion artifact is
//      kept for data fidelity) and --verify is stable over link tabs.
//
// The test edits the REAL ui-data/data-kitchen-main-menu.ttl and restores it with git checkout
// (the file must be clean). Run from dk root with the :3000 server up.
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { chromium } from '/home/jeff/solid/podz/node_modules/playwright-core/index.mjs';

const fails = [];
const check = (name, ok, detail = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : '')); if (!ok) fails.push(name); };
const restore = () => {
  try { execFileSync('git', ['checkout', '--', 'ui-data/data-kitchen-main-menu.ttl']); } catch {}
  try { rmSync('tools/conversion/shell.html', { force: true }); } catch {}   // scratch snapshot of the test state
};

const dirty = execFileSync('git', ['status', '--porcelain', 'ui-data/data-kitchen-main-menu.ttl'], { encoding: 'utf8' }).trim();
if (dirty) {
  console.error('ABORT: commit ui-data/data-kitchen-main-menu.ttl first — this test restores it via git checkout:\n' + dirty);
  process.exit(2);
}

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });

const settle = async (ms) => {
  await page.evaluate(async () => { if (window.ComponentInterop?.ready) await window.ComponentInterop.ready; });
  await page.waitForTimeout(ms);
};

try {
  await page.goto('http://localhost:3000/index.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await settle(5000);

  // --- out-of-band RDF edit: add a link-only submenu and a mixed submenu
  //     (modeled on the pod's :item "Solid" and :panel-dev-tools) ---
  const edited = await page.evaluate(async () => {
    const url = new URL('ui-data/data-kitchen-main-menu.ttl', document.baseURI).href;
    const ttl = await (await fetch(url, { cache: 'no-store' })).text();
    // tabs.ttl ships in the managers' serialization (prefixed `:name`, the
    // #Tabs parts list ends `:item :panel-dev-tools ).`). Splice the two test
    // submenus onto the end of that list.
    const out = ttl
      .replace(':item :panel-dev-tools ).',
               ':item :panel-dev-tools <#Linky> <#Mixed> ).')
      + `
<#Linky> a ui:Menu ; ui:label "🧪 Linky" ;
  ui:parts ( <#L-self> <#L-one> <#L-two> ) .
# the conversion ARTIFACT: a child repeating the submenu's own name (like the
# pod's Dev-Tools-inside-Dev-Tools) — kept in the data for fidelity but
# NEVER rendered as a sub-tab (a menu item that calls a submenu is not also
# an item on that submenu)
<#L-self> a ui:Component ; ui:label "🧪 Linky" ; ui:name "sol-include" ;
  ui:attribute
    [ schema:name "id" ;      schema:value "l-self" ] ,
    [ schema:name "source" ;  schema:value "./pages/settings.html" ] ,
    [ schema:name "trusted" ; schema:value "" ] .
<#L-one> a ui:Link ; ui:href "https://example.org/one" ; ui:icon "🧩" ;
  ui:label "Link One" ; ui:region ui:Tab .
<#L-two> a ui:Link ; ui:href "https://example.org/two" ;
  ui:label "Link Two" ; ui:region ui:Tab .
<#Mixed> a ui:Menu ; ui:label "🧪 Mixed" ;
  ui:parts ( <#M-inc> <#M-link> ) .
<#M-inc> a ui:Component ; ui:label "Mixed Inc" ; ui:name "sol-include" ;
  ui:attribute
    [ schema:name "id" ;      schema:value "m-inc" ] ,
    [ schema:name "source" ;  schema:value "./pages/settings.html" ] ,
    [ schema:name "trusted" ; schema:value "" ] .
<#M-link> a ui:Link ; ui:href "https://example.org/m" ;
  ui:label "Mixed Link" ; ui:region ui:Tab .
`;
    const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'text/turtle' }, body: out });
    return res.ok && out !== ttl;
  });
  check('out-of-band tabs.ttl gains the link submenus', edited);

  // --- reload: the shell renders the link submenus straight from the RDF ---
  await page.reload({ waitUntil: 'domcontentloaded' });
  await settle(7000);
  const ttlAfter = readFileSync('ui-data/data-kitchen-main-menu.ttl', 'utf8');
  check('tabs.ttl NOT clobbered (link submenus survive the load)', /Linky/.test(ttlAfter) && /L-one/.test(ttlAfter));

  const live = await page.evaluate(async () => {
    const mainBtn = (re) => [...document.querySelectorAll('#dk-tabs > .sol-tabs-bar button')]
      .find(b => re.test(b.textContent));
    const panes = [...document.querySelectorAll('#dk-tabs > .sol-tabs-content > .sol-tabs-pane')];
    const subOf = (re) => panes.find(x => re.test(x.dataset.tabName || ''))?.querySelector('sol-tabs[variant="sub"]');
    const info = (sub) => sub ? {
      subTabs: [...sub.querySelectorAll(':scope > .sol-tabs-bar button')].map(b => b.textContent.trim()),
      barVisible: sub.querySelector(':scope > .sol-tabs-bar').getBoundingClientRect().height > 0,
      iframes: [...sub.querySelectorAll('iframe')].map(f => f.getAttribute('src')),
    } : null;

    // select the Linky MAIN tab, then click its second sub-tab — the strip
    // must stay visible (the regression: pane content covered it)
    mainBtn(/Linky/)?.click();
    await new Promise(r => setTimeout(r, 600));
    const linkySub = subOf(/Linky/);
    [...(linkySub?.querySelectorAll(':scope > .sol-tabs-bar button') || [])]
      .find(b => /Link Two/.test(b.textContent))?.click();
    await new Promise(r => setTimeout(r, 600));
    const linky = info(linkySub);

    mainBtn(/Mixed/)?.click();
    await new Promise(r => setTimeout(r, 600));
    const mixedSub = subOf(/Mixed/);
    [...(mixedSub?.querySelectorAll(':scope > .sol-tabs-bar button') || [])]
      .find(b => /Mixed Link/.test(b.textContent))?.click();
    await new Promise(r => setTimeout(r, 600));
    return { linky, mixed: info(mixedSub) };
  });
  check('link submenu renders as a nested sub-tabset with both links',
    live.linky?.subTabs?.length === 2 && live.linky.subTabs.join('|') === 'Link One|Link Two',
    JSON.stringify(live.linky?.subTabs));
  check('clicked link embeds in the pane; the sub-tab strip stays visible',
    live.linky?.iframes?.some(s => /example\.org\/two/.test(s || '')) && live.linky.barVisible,
    JSON.stringify(live.linky));
  check('mixed submenu: picking its link sub-tab embeds the site, strip still visible',
    live.mixed?.subTabs?.length === 2 && live.mixed.iframes.some(s => /example\.org\/m/.test(s || ''))
    && live.mixed.barVisible,
    JSON.stringify(live.mixed));
  await page.screenshot({ path: 'claude/smoke-tests/link-submenu-subtabs.png' });

  // --- the rdf2html snapshot emits link tabs correctly and is stable ---
  let genOk = true; let genOut = '';
  try { genOut = execFileSync('node', ['tools/conversion/rdf2html.mjs'], { encoding: 'utf8' }); }
  catch (e) { genOk = false; genOut = String(e.stdout || e); }
  check('rdf2html emits the snapshot with link tabs', genOk, genOut.trim());
  const snap = readFileSync('tools/conversion/shell.html', 'utf8');
  const linkySnap = (snap.match(/<submenu id="Linky">[\s\S]*?<\/submenu>/) || [''])[0];
  const mixedSnap = (snap.match(/<submenu id="Mixed">[\s\S]*?<\/submenu>/) || [''])[0];
  check('snapshot carries all 3 children (artifact kept in DATA)',
    (linkySnap.match(/<a /g) || []).length === 3 && /target="_blank"/.test(linkySnap) && /id="l-self"/.test(linkySnap),
    JSON.stringify(linkySnap.slice(0, 200)));
  check('snapshot has the mixed submenu: 1 component + 1 link anchor',
    (mixedSnap.match(/<a /g) || []).length === 2 && /data-handler="sol-include"/.test(mixedSnap) && /target="_blank"/.test(mixedSnap),
    JSON.stringify(mixedSnap.slice(0, 200)));
  let verifyOk = true; let verifyOut = '';
  try { verifyOut = execFileSync('node', ['tools/conversion/rdf2html.mjs', '--verify'], { encoding: 'utf8' }); }
  catch (e) { verifyOk = false; verifyOut = String(e.stdout || e); }
  check('rdf2html --verify OK with link tabs', verifyOk, verifyOut.trim());
} finally {
  restore();
  await browser.close();
}
check('repo state restored after the test', !/Linky/.test(readFileSync('ui-data/data-kitchen-main-menu.ttl', 'utf8')));
console.log(fails.length ? `\n${fails.length} FAILURE(S)` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
