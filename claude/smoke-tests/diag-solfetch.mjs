// Verify the solFetch + sol-auth-needed contract:
//   * No <sol-login>: solFetch returns the 401 as-is (no hang).
//   * With <sol-login>: a 401 dispatches sol-auth-needed and waits.
//   * A listener resolving true triggers a retry.
//   * The "Preferences" label override (label="Preferences" on
//     <sol-default>) is picked up by sol-settings as a sanity check
//     since we're already poking at that page.
//
// We don't run an actual OIDC popup — we mock fetch to count 401s
// followed by 200s, and let a test listener resolve(true).

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
await new Promise(r => setTimeout(r, 1500));

// (A) "Preferences" label check on the settings page.
await page.evaluate(() => {
  for (const sb of document.querySelectorAll('sol-button')) {
    if (sb.getAttribute('name') === 'Settings') { sb.shadowRoot?.querySelector('button')?.click(); break; }
  }
});
await new Promise(r => setTimeout(r, 1800));
const summaries = await page.evaluate(() =>
  [...document.querySelectorAll('.dk-settings sol-accordion details > summary')].map(s => s.textContent.trim()));
console.log('-- (A) accordion summaries --');
console.log(JSON.stringify(summaries));
console.log('Preferences present:', summaries.includes('Preferences'));

// (B) solFetch behaviour. Stub fetch to: 401 first, 200 after.
// Use the AuthManager.shared if present so the path is realistic.
const noLoginScenario = await page.evaluate(async () => {
  // First test: NO sol-login on the page. Temporarily detach the one
  // we'll need for case C — but dk doesn't currently mount one in the
  // chrome at all, so this case is the natural starting point.
  const hadSolLogin = !!document.querySelector('sol-login');
  let originalLogin = null;
  if (hadSolLogin) {
    originalLogin = document.querySelector('sol-login');
    originalLogin.remove();
  }

  // Mock fetch to always return 401.
  const realFetch = window.fetch;
  window.fetch = () => Promise.resolve(new Response('nope', { status: 401 }));

  // Import solFetch via the importmap.
  const { solFetch } = await import('sol-components/core/auth-fetch.js');
  const start = performance.now();
  const r = await solFetch('http://localhost:3000/example.ttl');
  const elapsed = performance.now() - start;

  window.fetch = realFetch;
  if (originalLogin) document.body.appendChild(originalLogin);

  return { status: r.status, elapsedMs: Math.round(elapsed) };
});
console.log('-- (B) no <sol-login>: solFetch returns 401 immediately --');
console.log(JSON.stringify(noLoginScenario, null, 2));

// (C) WITH sol-login on the page: a test listener resolves(true), and
// the retry returns 200.
const withLoginScenario = await page.evaluate(async () => {
  // Inject a sol-login element so hasLoginListener() returns true.
  // We don't need it to actually log in — a test listener for
  // sol-auth-needed pre-empts the real one and resolves(true).
  if (!document.querySelector('sol-login')) {
    const el = document.createElement('sol-login');
    el.style.display = 'none';
    document.body.appendChild(el);
  }

  // Fetch counter — 401 first call, 200 thereafter.
  const realFetch = window.fetch;
  let n = 0;
  window.fetch = () => {
    n += 1;
    return Promise.resolve(new Response(n === 1 ? 'unauth' : 'ok', { status: n === 1 ? 401 : 200 }));
  };

  // Pre-empt the real listener so we don't open a popup. Capture phase
  // + stopImmediatePropagation, then resolve(true) ourselves.
  const captured = [];
  const handler = (e) => {
    captured.push({ url: e.detail.url, status: e.detail.response.status });
    e.detail.resolve(true);
    e.stopImmediatePropagation();
  };
  document.addEventListener('sol-auth-needed', handler, { capture: true });

  const { solFetch } = await import('sol-components/core/auth-fetch.js');
  const start = performance.now();
  const r = await solFetch('http://localhost:3000/example.ttl');
  const elapsed = performance.now() - start;

  document.removeEventListener('sol-auth-needed', handler, { capture: true });
  window.fetch = realFetch;
  return { status: r.status, elapsedMs: Math.round(elapsed), fetchCalls: n, eventsCaptured: captured };
});
console.log('-- (C) with <sol-login> + listener: retry returns 200 --');
console.log(JSON.stringify(withLoginScenario, null, 2));

console.log('-- errors (filtered) --');
for (const e of errs) {
  if (!/(CORS|net::ERR_|favicon|\.acl|\.meta|\.well-known|open-meteo|w3\.org|calendar\.google|api\.weather|fcc\.gov)/.test(e)) console.log(e);
}

await browser.close();
