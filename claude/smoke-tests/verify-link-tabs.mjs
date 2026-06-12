// ui:Link tabs through the whole shell pipeline (2026-06-12 fix: emitTab
// used to DROP link children — a submenu of links emitted empty, exactly
// Jeff's pod's Solid/Dev-Tools tabs). Mirrors that pod state:
//
//   1. tabs.ttl gains a link-only submenu + a mixed component/link submenu
//      OUT-OF-BAND (no regeneration — the html now LAGS, like a pod whose
//      shell was written by the broken generator).
//   2. on reload, the fingerprint rule sees the html is ours → RDF wins →
//      html-first.html regenerates WITH the link anchors (target="_blank",
//      no data-handler), tabs.ttl is NOT clobbered.
//   3. the reloaded live shell harvests those anchors back into submenu
//      tabs with the right child counts (the new link branch in sol-tabs).
//   4. the node generator round-trips: --verify OK against the new file.
//
// The test edits the REAL data/tabs.ttl + html-first.html and restores both
// with git checkout (tree must be clean for those two). Run from dk root
// with the :3000 server up.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium } from '/home/jeff/solid/podz/node_modules/playwright-core/index.mjs';

const fails = [];
const check = (name, ok, detail = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : '')); if (!ok) fails.push(name); };
const restore = () => {
  try { execFileSync('git', ['checkout', '--', 'data/tabs.ttl', 'html-first.html']); } catch {}
};

const dirty = execFileSync('git', ['status', '--porcelain', 'data/tabs.ttl', 'html-first.html'], { encoding: 'utf8' }).trim();
if (dirty) {
  console.error('ABORT: commit data/tabs.ttl and html-first.html first — this test restores them via git checkout:\n' + dirty);
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
  // --- first load on clean state: sets the fingerprint baseline ---
  await page.goto('http://localhost:3000/index.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await settle(5000);
  check('baseline fingerprint recorded on consistent load',
    await page.evaluate(() => !!localStorage.getItem('dk-shell-fingerprint')));

  // --- out-of-band RDF edit: add a link-only submenu and a mixed submenu
  //     (modeled on the pod's :item "Solid" and :panel-dev-tools) ---
  const edited = await page.evaluate(async () => {
    const url = new URL('data/tabs.ttl', document.baseURI).href;
    const ttl = await (await fetch(url, { cache: 'no-store' })).text();
    const out = ttl
      .replace('<#panel-images> <#panel-podz> ) .',
               '<#panel-images> <#panel-podz> <#Linky> <#Mixed> ) .')
      + `
<#Linky> a ui:Menu ; ui:label "🧪 Linky" ;
  ui:parts ( <#L-self> <#L-one> <#L-two> ) .
# the conversion ARTIFACT: a child repeating the submenu's own name (like the
# pod's Dev-Tools-inside-Dev-Tools) — emitted to html for data fidelity but
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
  check('out-of-band tabs.ttl gains the link submenus (html now lags)', edited);

  // --- reload: fingerprint matches the lagging html → RDF wins → regenerate ---
  await page.reload({ waitUntil: 'domcontentloaded' });
  await settle(7000);
  const ttlAfter = readFileSync('data/tabs.ttl', 'utf8');
  const htmlAfter = readFileSync('html-first.html', 'utf8');
  check('tabs.ttl NOT clobbered (link submenus survive the load)', /Linky/.test(ttlAfter) && /L-one/.test(ttlAfter));
  const linky = (htmlAfter.match(/<submenu id="Linky">[\s\S]*?<\/submenu>/) || [''])[0];
  const mixed = (htmlAfter.match(/<submenu id="Mixed">[\s\S]*?<\/submenu>/) || [''])[0];
  check('regenerated html carries all 3 children (artifact kept in DATA)',
    (linky.match(/<a /g) || []).length === 3 && /target="_blank"/.test(linky) && /id="l-self"/.test(linky),
    JSON.stringify(linky.slice(0, 200)));
  check('regenerated html has the mixed submenu: 1 component + 1 link anchor',
    (mixed.match(/<a /g) || []).length === 2 && /data-handler="sol-include"/.test(mixed) && /target="_blank"/.test(mixed),
    JSON.stringify(mixed.slice(0, 200)));

  // --- the reloaded shell harvests them back: link-bearing submenus render
  //     as nested SUB-TABSETS (hybrid rule), ui:Tab links get re-open
  //     anchors, and the all-component stack behavior is untouched ---
  await page.reload({ waitUntil: 'domcontentloaded' });
  await settle(6000);
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

  // --- node generator round-trip is stable over link tabs ---
  let verifyOk = true; let verifyOut = '';
  try { verifyOut = execFileSync('node', ['tools/conversion/generate-html-first.mjs', '--verify'], { encoding: 'utf8' }); }
  catch (e) { verifyOk = false; verifyOut = String(e.stdout || e); }
  check('generate-html-first --verify OK with link tabs', verifyOk, verifyOut.trim());
} finally {
  restore();
  await browser.close();
}
check('repo state restored after the test', !/Linky/.test(readFileSync('data/tabs.ttl', 'utf8')));
console.log(fails.length ? `\n${fails.length} FAILURE(S)` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
