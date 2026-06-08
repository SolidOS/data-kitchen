// Verifies Stream B: setting editor-self on a sol-* component renders
// a gear button, and clicking it opens the editor modal.

import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-gpu'],
  headless: 'new',
});

const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });

await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 15000 });
await new Promise(r => setTimeout(r, 2500));

// We're on Home now. Find sol-time and add editor-self, then
// re-mount it (sol-time only checks the attribute in
// connectedCallback). Easiest re-mount: remove and re-append.
const beforeAttach = await page.evaluate(() => {
  const t = document.querySelector('sol-time');
  if (!t) return { 'no sol-time': true };
  return {
    'before: hasAttr editor-self': t.hasAttribute('editor-self'),
    'before: gear in shadow': !!t.shadowRoot?.querySelector('.sol-editor-self-gear'),
  };
});
console.log('--- before editor-self attach ---');
for (const [k,v] of Object.entries(beforeAttach)) console.log(k, '=', JSON.stringify(v));

// Set the attribute and force re-connect by detach+attach
await page.evaluate(() => {
  const t = document.querySelector('sol-time');
  t.setAttribute('editor-self', '');
  // Re-trigger connectedCallback: detach + reattach
  const parent = t.parentNode;
  const next = t.nextSibling;
  parent.removeChild(t);
  parent.insertBefore(t, next);
});
await new Promise(r => setTimeout(r, 800));

const afterAttach = await page.evaluate(() => {
  const t = document.querySelector('sol-time');
  const gear = t.shadowRoot?.querySelector('.sol-editor-self-gear');
  return {
    'after: hasAttr editor-self': t.hasAttribute('editor-self'),
    'after: gear in shadow': !!gear,
    'gear text': gear?.textContent,
    'gear aria-label': gear?.getAttribute('aria-label'),
    'host position': t.style.position,
  };
});
console.log('--- after editor-self + re-mount ---');
for (const [k,v] of Object.entries(afterAttach)) console.log(k, '=', JSON.stringify(v));

// Click the gear
const clicked = await page.evaluate(() => {
  const gear = document.querySelector('sol-time')?.shadowRoot?.querySelector('.sol-editor-self-gear');
  if (!gear) return { ok: false };
  gear.click();
  return { ok: true };
});
console.log('clicked gear:', clicked);
await new Promise(r => setTimeout(r, 800));

const modal = await page.evaluate(() => {
  const modals = document.querySelectorAll('sol-modal');
  if (!modals.length) return { 'no modal': true };
  const last = modals[modals.length - 1];
  return {
    title: last.getAttribute('title'),
    open:  last.hasAttribute('open'),
    'has sol-form': !!last.querySelector('sol-form'),
    'form source': last.querySelector('sol-form')?.getAttribute('source'),
    'form subject': last.querySelector('sol-form')?.getAttribute('subject'),
  };
});
console.log('--- modal after gear click ---');
console.log(JSON.stringify(modal, null, 2));

await page.screenshot({ path: '/home/jeff/data-kitchen/claude/smoke-tests/phase3-editor-self.png' });

await browser.close();
