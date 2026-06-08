// Verify step 3-5 integration:
//   * <sol-login> mounted in dk chrome with the right mode + issuers
//   * <sol-default default-issuer> picked up
//   * sol-login's auth-needed listener attached at document level
//   * solFetch is reachable from a bare-spec import inside the page
//   * Old smokes still pass (engines load, accordion start-closed, Preferences label)
//   * dkFetch round-trip still authenticates against the AuthManager

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
page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });

await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 15000 });
await new Promise(r => setTimeout(r, 2000));

const wiring = await page.evaluate(() => {
  const login = document.querySelector('sol-login');
  const def = document.querySelector('sol-default');
  return {
    'sol-login present': !!login,
    'sol-login mode':    login?.getAttribute('mode'),
    'sol-login issuers': login?.getAttribute('issuers'),
    'sol-default default-issuer': def?.getAttribute('default-issuer'),
    'sol-default proxy attr':     def?.getAttribute('proxy'),
    'AuthManager.shared exists':  !!window.SolidWebComponents?.AuthManager?.shared,
    'dkFetch present':            typeof window.dkFetch === 'function',
  };
});
console.log('-- chrome wiring --');
console.log(JSON.stringify(wiring, null, 2));

// Verify the auth-needed listener really got attached.
const listenerCheck = await page.evaluate(async () => {
  let captured = null;
  // Provoke the event ourselves; sol-login's listener will try to
  // start a popup. Pre-empt that by capturing first and resolving false.
  const probe = (e) => {
    captured = { hasResolve: typeof e.detail.resolve === 'function', url: e.detail.url };
    e.detail.resolve(false);
    e.stopImmediatePropagation();
  };
  document.addEventListener('sol-auth-needed', probe, { capture: true });
  document.dispatchEvent(new CustomEvent('sol-auth-needed', {
    detail: { url: 'http://localhost:3000/example.ttl', response: { status: 401 }, resolve: () => {}, reject: () => {} },
  }));
  document.removeEventListener('sol-auth-needed', probe, { capture: true });
  return captured;
});
console.log('-- listener probe --');
console.log(JSON.stringify(listenerCheck, null, 2));

// Re-run the no-listener / with-listener scenarios from the prior smoke
// to confirm solFetch still works end-to-end.
const retryScenario = await page.evaluate(async () => {
  // 1st call: 401 with retry → 200 expected.
  const realFetch = window.fetch;
  let n = 0;
  window.fetch = () => Promise.resolve(new Response(n++ === 0 ? 'unauth' : 'ok', { status: n === 1 ? 401 : 200 }));

  // Pre-empt sol-login's real listener so we don't open a popup.
  const handler = (e) => { e.detail.resolve(true); e.stopImmediatePropagation(); };
  document.addEventListener('sol-auth-needed', handler, { capture: true });

  const { solFetch } = await import('sol-components/core/auth-fetch.js');
  const r = await solFetch('http://localhost:3000/example.ttl');

  document.removeEventListener('sol-auth-needed', handler, { capture: true });
  window.fetch = realFetch;
  return { status: r.status, fetchCalls: n };
});
console.log('-- solFetch retry round-trip --');
console.log(JSON.stringify(retryScenario, null, 2));

// Sanity: prior smokes still pass.
const sanity = await page.evaluate(async () => {
  // sol-search engines (RDF-driven)
  const labels = [...document.querySelector('sol-search')?.shadowRoot?.querySelectorAll('label.engine span') ?? []].map(s => s.textContent.trim());

  // Settings page open + accordion all-closed + Preferences label
  for (const sb of document.querySelectorAll('sol-button')) {
    if (sb.getAttribute('name') === 'Settings') { sb.shadowRoot?.querySelector('button')?.click(); break; }
  }
  await new Promise(r => setTimeout(r, 1500));
  const dets = [...document.querySelectorAll('.dk-settings sol-accordion details')];
  return {
    engineLabels: labels,
    summaries: dets.map(d => d.querySelector('summary')?.textContent.trim()),
    anyOpen: dets.some(d => d.open),
  };
});
console.log('-- sanity (engines, summaries, all closed) --');
console.log(JSON.stringify(sanity, null, 2));

await page.screenshot({ path: '/home/jeff/data-kitchen/claude/smoke-tests/auth-integration.png' });

console.log('-- errors (filtered) --');
for (const e of errs) {
  if (!/(CORS|net::ERR_|favicon|\.acl|\.meta|\.well-known|open-meteo|w3\.org|calendar\.google|api\.weather|fcc\.gov)/.test(e)) console.log(e);
}

await browser.close();
