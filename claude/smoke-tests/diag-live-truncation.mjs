// Drives the LIVE app (localhost:8000, gated) headless, opens the
// "Solid Resources"/"Dev Tools" submenu dropdown, picks its first item, and
// dumps the height chain from .sol-tabs-content down through the mounted pane —
// to find which level stops filling height (the "truncated panel" bug). Also
// reports the dropdown popup's rect/z-index/position (the "dropdown not over
// panel" bug). Run with the global puppeteer:
//   node claude/smoke-tests/diag-live-truncation.mjs
import fs from 'node:fs';
import puppeteer from '/home/jeff/.nvm/versions/node/v24.0.2/lib/node_modules/puppeteer/lib/puppeteer/puppeteer.js';

const TOKEN = fs.readFileSync('/home/jeff/.config/data-kitchen/gate-token', 'utf8').trim();
const URL = `http://localhost:8000/?dk-token=${TOKEN}`;

const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text().slice(0, 160)); });

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 45000 });
await new Promise(r => setTimeout(r, 4500));

const labels = await page.evaluate(() => {
  const bar = document.querySelector('#dk-tabs > .sol-tabs-bar');
  return bar ? Array.from(bar.querySelectorAll('sol-dropdown-button')).map(d => d.getAttribute('label')) : 'NO BAR';
});
console.log('=== dropdowns in bar ===', JSON.stringify(labels));

const result = await page.evaluate(async () => {
  const R = el => el ? (r => ({ w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.top) }))(el.getBoundingClientRect()) : null;
  const C = (el, ps) => el ? ps.reduce((o, p) => (o[p] = getComputedStyle(el)[p], o), {}) : null;
  const tabs = document.querySelector('#dk-tabs');
  const bar = tabs.querySelector(':scope > .sol-tabs-bar');
  const dds = Array.from(bar.querySelectorAll('sol-dropdown-button'));
  const dd = dds.find(d => /resource|dev/i.test(d.getAttribute('label') || ''));
  if (!dd) return { error: 'no resources/dev dropdown', labels: dds.map(d => d.getAttribute('label')) };
  const trig = dd.shadowRoot?.querySelector('.sol-dd-trigger');
  trig?.click();
  await new Promise(r => setTimeout(r, 500));
  const pop = dd.shadowRoot?.querySelector('.sol-dd-popup');
  const popInfo = pop ? { rect: R(pop), css: C(pop, ['position', 'zIndex', 'overflow']) } : 'NO POPUP';
  const items = pop ? Array.from(pop.querySelectorAll('button')) : [];
  const itemTexts = items.map(b => (b.textContent || '').trim().slice(0, 24));
  const picked = itemTexts[0];
  items[0]?.click();
  await new Promise(r => setTimeout(r, 1800));

  // Follow the tallest visible child down from .sol-tabs-content to find where height collapses.
  const content = tabs.querySelector(':scope > .sol-tabs-content');
  function chain(el, depth) {
    if (!el || depth > 7) return [];
    const info = {
      tag: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className ? '.' + (el.className).toString().trim().split(/\s+/).join('.').slice(0, 40) : ''),
      clientH: el.clientHeight, scrollH: el.scrollHeight,
      css: C(el, ['height', 'minHeight', 'flex', 'display', 'overflow', 'position']),
    };
    const kids = Array.from(el.children).filter(k => !k.hasAttribute('hidden') && k.getBoundingClientRect().height > 0);
    const next = kids.sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
    return [info, ...chain(next, depth + 1)];
  }
  return { picked, itemTexts, popInfo, contentClientH: content.clientHeight, chain: chain(content, 0) };
});
console.log('=== RESULT ===');
console.log(JSON.stringify(result, null, 2));
await page.screenshot({ path: 'claude/smoke-tests/live-truncation.png' });
console.log('=== ERRORS ===', errs.slice(0, 15).join('\n') || '(none)');
await browser.close();
