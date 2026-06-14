// Drives the dropdown repro (dropdown-repro.html) and dumps the rendered bar
// DOM + computed styles, then clicks the "Media" submenu dropdown and reports
// what appears (the "2 panels / disconnected / faint" symptoms). Uses the
// global puppeteer (bundled Chromium): run with
//   NODE_PATH=$(npm root -g) node claude/smoke-tests/diag-dropdown.mjs
import puppeteer from '/home/jeff/.nvm/versions/node/v24.0.2/lib/node_modules/puppeteer/lib/puppeteer/puppeteer.js';

const URL = 'http://localhost:8081/claude/smoke-tests/dropdown-repro.html';
const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 800 });
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
await new Promise(r => setTimeout(r, 3000));
// Theme override for measuring (default light in the html). Pass dark to repro
// the faint/missing-entry symptom: THEME=dark node ...
if (process.env.THEME) await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), process.env.THEME);
// CLOBBER=1 simulates a host app (like dk) remapping --surface/--text onto its
// own theme tokens that DON'T resolve here — collapsing them to one tone. A
// menu that themed off --surface/--text would go invisible; one that themes off
// --menu-* must stay legible.
if (process.env.CLOBBER) await page.evaluate(() => {
  document.body.style.setProperty('--surface', '#222');
  document.body.style.setProperty('--text', '#222');
});
await new Promise(r => setTimeout(r, 200));

const bar = await page.evaluate(() => {
  const tabs = document.querySelector('#dk-tabs');
  const bar = tabs?.querySelector(':scope > .sol-tabs-bar');
  const kids = bar ? Array.from(bar.children).map(c => ({
    tag: c.tagName.toLowerCase(),
    cls: c.className,
    text: (c.textContent || '').trim().slice(0, 30),
    label: c.getAttribute && c.getAttribute('label'),
    source: c.getAttribute && c.getAttribute('source'),
    region: c.getAttribute && c.getAttribute('region'),
  })) : null;
  // computed style of a dropdown trigger (shadow part)
  const dd = bar?.querySelector('sol-dropdown-button');
  let trig = null;
  if (dd && dd.shadowRoot) {
    const t = dd.shadowRoot.querySelector('.sol-dd-trigger');
    if (t) {
      const cs = getComputedStyle(t);
      trig = { color: cs.color, padding: cs.padding, fontSize: cs.fontSize, fontWeight: cs.fontWeight, borderBottom: cs.borderBottomWidth + ' ' + cs.borderBottomColor };
    }
  }
  // panes in the content area
  const content = tabs?.querySelector(':scope > .sol-tabs-content');
  const panes = content ? Array.from(content.children).map(p => ({
    id: p.id, cls: p.className, hidden: p.hidden, tabName: p.dataset?.tabName,
    childCount: p.children.length, html: p.innerHTML.slice(0, 60),
  })) : null;
  return { barChildCount: kids?.length, kids, trig, panes };
});
console.log('=== BAR ===');
console.log(JSON.stringify(bar, null, 2));

// Click the Media dropdown trigger, then inspect popup + panes
const after = await page.evaluate(async () => {
  const tabs = document.querySelector('#dk-tabs');
  const bar = tabs.querySelector(':scope > .sol-tabs-bar');
  const dds = Array.from(bar.querySelectorAll('sol-dropdown-button'));
  const media = dds.find(d => (d.getAttribute('label') || '').includes('Media'));
  const trig = media?.shadowRoot?.querySelector('.sol-dd-trigger');
  trig?.click();
  await new Promise(r => setTimeout(r, 600));
  // popup state
  const pop = media?.shadowRoot?.querySelector('.sol-dd-popup');
  const popInfo = pop ? {
    hidden: pop.hidden,
    rect: (() => { const r = pop.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })(),
    popupBg: getComputedStyle(pop).backgroundColor,
    items: Array.from(pop.querySelectorAll('button')).map(b => { const cs = getComputedStyle(b); return { text: (b.textContent || '').trim(), color: cs.color, bg: cs.backgroundColor }; }),
    itemCount: pop.querySelectorAll('button').length,
    html: pop.innerHTML.slice(0, 200),
  } : null;
  const trigRect = (() => { const r = trig.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) }; })();
  // any visible panes now?
  const content = tabs.querySelector(':scope > .sol-tabs-content');
  const panes = Array.from(content.children).map(p => ({ id: p.id, hidden: p.hidden, tabName: p.dataset?.tabName, kids: p.children.length }));
  return { trigRect, popInfo, panes };
});
console.log('=== AFTER CLICK Media ===');
console.log(JSON.stringify(after, null, 2));

await page.screenshot({ path: 'claude/smoke-tests/dropdown-repro-open.png' });

// Pick "Clock A" and verify it mounts into the Media pane and that pane shows.
const picked = await page.evaluate(async () => {
  const tabs = document.querySelector('#dk-tabs');
  const bar = tabs.querySelector(':scope > .sol-tabs-bar');
  const media = Array.from(bar.querySelectorAll('sol-dropdown-button')).find(d => (d.getAttribute('label') || '').includes('Media'));
  const item = Array.from(media.shadowRoot.querySelectorAll('.sol-dd-popup button')).find(b => b.textContent.trim() === 'Clock A');
  item?.click();
  await new Promise(r => setTimeout(r, 500));
  const content = tabs.querySelector(':scope > .sol-tabs-content');
  const panes = Array.from(content.children).map(p => ({ id: p.id, hidden: p.hidden, tabName: p.dataset?.tabName, kids: p.children.length, html: p.innerHTML.slice(0, 70) }));
  const ddActive = media.classList.contains('active');
  return { ddActive, panes };
});
console.log('=== AFTER PICK Clock A ===');
console.log(JSON.stringify(picked, null, 2));

console.log('=== ERRORS ===');
console.log(errs.length ? errs.join('\n') : '(none)');
await browser.close();
