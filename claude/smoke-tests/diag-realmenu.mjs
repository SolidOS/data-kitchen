// Loads the REAL menu (snapshot) and reports, for each submenu dropdown in the
// tab bar: how many items parsed, their names, and how many buttons actually
// render in the popup — to find why Media is empty / Pods shows only one.
import puppeteer from '/home/jeff/.nvm/versions/node/v24.0.2/lib/node_modules/puppeteer/lib/puppeteer/puppeteer.js';

const URL = 'http://localhost:8081/claude/smoke-tests/real-menu-repro.html';
const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 800 });
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
await new Promise(r => setTimeout(r, 3500));

const report = await page.evaluate(async () => {
  const out = [];
  const tabs = document.querySelector('#dk-tabs');
  const bar = tabs?.querySelector(':scope > .sol-tabs-bar');
  const dds = bar ? Array.from(bar.querySelectorAll('sol-dropdown-button')) : [];
  for (const dd of dds) {
    const trig = dd.shadowRoot?.querySelector('.sol-dd-trigger');
    trig?.click();
    await new Promise(r => setTimeout(r, 300));
    const pop = dd.shadowRoot?.querySelector('.sol-dd-popup');
    const btns = pop ? Array.from(pop.querySelectorAll(':scope > button, :scope > .sol-menu-group')) : [];
    out.push({
      label: dd.getAttribute('label'),
      source: dd.getAttribute('source'),
      parsedItems: (dd._items || []).map(i => ({ name: i.name, hasRender: !!i.render, cmd: i.command, kids: i.children?.length })),
      popupChildCount: pop ? pop.children.length : null,
      popupButtons: btns.map(b => ({ tag: b.tagName.toLowerCase(), text: (b.textContent || '').trim().slice(0, 30) })),
      popupHTML: pop ? pop.innerHTML.slice(0, 240) : null,
    });
    trig?.click(); // close
    await new Promise(r => setTimeout(r, 100));
  }
  return out;
});
console.log(JSON.stringify(report, null, 2));
console.log('=== ERRORS/WARNINGS ===');
console.log(errs.length ? errs.slice(0, 25).join('\n') : '(none)');
await browser.close();
