// Verifies the new sol-settings + keep-alive flow:
// 1. dashboard widgets mount under <#Home>'s keep-alive wrapper
// 2. nav to Settings: Home wrapper is hidden, not removed
// 3. <sol-settings> discovery finds Time/Weather/Calendar/Menu
// 4. expanding a panel lazy-mounts the right editor (sol-form for
//    shape-bearing widgets, sol-tree-edit for sol-menu)
// 5. nav back to Home shows the same (still-mounted) widgets
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-gpu'],
  headless: 'new',
});

const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });

const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => {
  if (m.type() === 'error') errs.push('console.error: ' + m.text());
});

await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 15000 });
await new Promise(r => setTimeout(r, 2500));

// 1: dashboard widgets present + their wrapper carries keep-alive
const homeMount = await page.evaluate(() => {
  const wrap = document.querySelector('#dk-content > [data-menu-item="Home"]');
  return {
    wrapper: !!wrap,
    keepAlive: wrap?.dataset.keepAlive,
    hidden: wrap?.hidden ?? null,
    widgets: ['sol-time','sol-weather','sol-calendar','sol-feed']
      .map(t => ({ tag: t, count: document.querySelectorAll(t).length })),
  };
});
console.log('--- after load ---');
console.log(JSON.stringify(homeMount, null, 2));

// 2: nav to Settings
const navOk = await page.evaluate(() => {
  const buttons = document.querySelector('sol-menu')?.shadowRoot?.querySelectorAll('.sol-menu-nav button') ?? [];
  for (const b of buttons) if (b.textContent.trim() === 'Settings') { b.click(); return true; }
  return false;
});
console.log('nav→Settings:', navOk);
await new Promise(r => setTimeout(r, 2000));

const settingsMount = await page.evaluate(() => {
  const home = document.querySelector('#dk-content > [data-menu-item="Home"]');
  const set  = document.querySelector('#dk-content > [data-menu-item="Settings"]');
  const sol  = document.querySelector('sol-settings');
  const outer = sol?.querySelectorAll('sol-settings > sol-accordion > .sol-accordion-wrapper > details') ?? [];
  return {
    'home wrapper still present': !!home,
    'home wrapper hidden':         home?.hidden,
    'settings wrapper present':    !!set,
    'sol-settings on page':        !!sol,
    'sol-time still in DOM':       document.querySelectorAll('sol-time').length,
    'sol-accordion in sol-settings': !!sol?.querySelector('sol-accordion'),
    'outer panel count':           outer.length,
    'outer panel summaries':       Array.from(outer).map(d => d.querySelector(':scope > summary')?.textContent.trim()),
  };
});
console.log('--- after nav to Settings ---');
console.log(JSON.stringify(settingsMount, null, 2));

// 3: Open each outer panel; verify the right editor mounts.
const panels = await page.evaluate(async () => {
  const sel = 'sol-settings > sol-accordion > .sol-accordion-wrapper > details';
  const detailsList = Array.from(document.querySelectorAll(sel));
  const out = [];
  for (const det of detailsList) {
    const summary = det.querySelector(':scope > summary')?.textContent.trim();
    det.open = true;
    det.dispatchEvent(new Event('toggle'));
    await new Promise(r => setTimeout(r, 600));
    const section = det.querySelector(':scope > .accordion-body > .accordion-content-section');
    const editor = section?.firstElementChild;
    out.push({
      summary,
      editorTag: editor?.localName,
      hasSubject:
        editor?.hasAttribute('subject') ||
        editor?.hasAttribute('root') ||
        editor?.hasAttribute('source'),
      shapeAttr: editor?.getAttribute('shape') ?? null,
      headShape: editor?.getAttribute('head-shape') ?? null,
    });
    det.open = false;
  }
  return out;
});
console.log('--- per-panel editor mount ---');
console.log(JSON.stringify(panels, null, 2));

await page.screenshot({ path: '/home/jeff/data-kitchen/claude/smoke-tests/sol-settings-after.png' });

// 4: nav back to Home — should reveal the keep-alive wrapper untouched.
const navBack = await page.evaluate(() => {
  const buttons = document.querySelector('sol-menu')?.shadowRoot?.querySelectorAll('.sol-menu-nav button') ?? [];
  for (const b of buttons) if (b.textContent.trim() === 'Home') { b.click(); return true; }
  return false;
});
console.log('nav→Home:', navBack);
await new Promise(r => setTimeout(r, 1200));

const homeBack = await page.evaluate(() => {
  const home = document.querySelector('#dk-content > [data-menu-item="Home"]');
  return {
    'home wrapper hidden': home?.hidden,
    'sol-time count':      document.querySelectorAll('sol-time').length,
  };
});
console.log('--- after nav back to Home ---');
console.log(JSON.stringify(homeBack, null, 2));

console.log('--- errors (filtered) ---');
for (const e of errs) {
  if (!/(CORS|net::ERR_|favicon|\.acl|\.meta|\.well-known|open-meteo|w3\.org|calendar\.google)/.test(e)) {
    console.log(e);
  }
}

await browser.close();
