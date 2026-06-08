// Verify dk-calendar-popout's pre-fetch behaviour:
//   1. ICS fetches kick off at page load even though the popout is closed.
//   2. The "Loading…" status text is not visible until the user opens it.
//   3. After opening, sol-calendar is already populated (no Loading text).

import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-gpu'],
  headless: 'new',
});

const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
const errs = [];
const calRequests = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
page.on('request', r => {
  const u = r.url();
  if (/\/calendar\/|\/ics|\.ics|w3\.org\/groups\/.+\/calendar\/export|calendar\.google/.test(u)) {
    calRequests.push({ method: r.method(), url: u.slice(0, 120) });
  }
});

await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 15000 });

// Snapshot at 600ms — popout still closed. ICS fetches should already
// be in flight. Status div should be invisible (no visible "Loading…").
await new Promise(r => setTimeout(r, 600));
const earlySnap = await page.evaluate(() => {
  const popout = document.querySelector('dk-calendar-popout');
  const panel = popout?.querySelector('.dk-popout-panel');
  const cal = panel?.querySelector('sol-calendar');
  const status = cal?.shadowRoot?.querySelector('.sol-calendar-status');
  // Effective visibility: an element inside a hidden parent has
  // offsetParent === null even if its own computed display is block.
  const statusVisible = status ? (status.offsetParent !== null && !!status.textContent.trim()) : false;
  return {
    panelHidden: !!panel?.hidden,
    calMounted: !!cal,
    calConnectedCallback: cal?.isConnected,
    statusText: status?.textContent.trim() || '',
    statusVisible,
  };
});
console.log('-- (1) 600 ms after load (popout still closed) --');
console.log(JSON.stringify(earlySnap, null, 2));
console.log('-- calendar requests so far --');
console.log(JSON.stringify(calRequests, null, 2));

// Wait for ICS fetches to settle; then open the popout.
await new Promise(r => setTimeout(r, 4500));
await page.evaluate(() => document.querySelector('dk-calendar-popout .dk-popout-trigger')?.click());
await new Promise(r => setTimeout(r, 600));

const afterOpen = await page.evaluate(() => {
  const cal = document.querySelector('dk-calendar-popout sol-calendar');
  const status = cal?.shadowRoot?.querySelector('.sol-calendar-status');
  const eventEls = cal?.shadowRoot?.querySelectorAll('.sol-calendar [data-event], .sol-calendar .agenda-item, .sol-calendar li, .sol-calendar .event');
  return {
    panelHidden: !!document.querySelector('dk-calendar-popout .dk-popout-panel')?.hidden,
    statusText: status?.textContent.trim() || '',
    statusVisible: status ? (status.offsetParent !== null && !!status.textContent.trim()) : false,
    rootHtmlLen: cal?.shadowRoot?.querySelector('.sol-calendar')?.innerHTML?.length ?? 0,
  };
});
console.log('-- (2) after opening popout --');
console.log(JSON.stringify(afterOpen, null, 2));

await page.screenshot({ path: '/home/jeff/data-kitchen/claude/smoke-tests/calendar-prefetch.png' });

console.log('-- total calendar requests --', calRequests.length);

console.log('-- errors (filtered) --');
for (const e of errs) {
  if (!/(CORS|net::ERR_|favicon|\.acl|\.meta|\.well-known|open-meteo|w3\.org|calendar\.google|api\.weather|fcc\.gov)/.test(e)) console.log(e);
}

await browser.close();
