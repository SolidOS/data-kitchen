// Verify the "switch issuer" UX inside <sol-login>'s auth-needed flow:
//   * When sol-auth-needed fires, sol-login goes [active], the dropdown
//     opens, and a .switch-hint appears naming the default issuer.
//   * The full issuer list is rendered as clickable buttons.
//   * Cancelling (sol-popup-blocked) tears everything down cleanly.

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
await new Promise(r => setTimeout(r, 1800));

// Headless can't open a real popup, but the chrome <sol-login> goes
// through _handleAuthNeeded → setAttribute(active) →
// _showSwitchHint/_toggleDropdown → login(default) → window.open
// returns null → sol-popup-blocked. We snapshot mid-flow before the
// popup-blocked event fires (i.e. before login() throws).
const state = await page.evaluate(async () => {
  const login = document.querySelector('sol-login');
  if (!login) return { error: 'no sol-login' };

  // Trigger _handleAuthNeeded by dispatching sol-auth-needed.
  document.dispatchEvent(new CustomEvent('sol-auth-needed', {
    detail: { url: 'http://localhost:3000/x.ttl', response: { status: 401 }, resolve: () => {}, reject: () => {} },
  }));

  // Snapshot during the rAF window before sol-popup-blocked fires.
  // The requestAnimationFrame + popup window.open are synchronous-ish;
  // give two animation frames.
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  const root = login.shadowRoot;
  const dropdown = root?.querySelector('.dropdown');
  const hint = root?.querySelector('.switch-hint');
  const issuerBtns = [...(root?.querySelectorAll('.issuer-item') ?? [])].map(b => b.textContent);

  const snap = {
    'host visible':  getComputedStyle(login).display !== 'none',
    'host has active': login.hasAttribute('active'),
    'dropdown open':   !!dropdown?.classList.contains('open'),
    'hint text':       hint?.textContent || null,
    'issuer buttons':  issuerBtns,
  };

  // Now force a cleanup by firing sol-popup-blocked (popup blocked in
  // headless; this is the real cleanup path).
  login.dispatchEvent(new CustomEvent('sol-popup-blocked', { bubbles: true, composed: true, detail: { side: 'default' } }));
  await new Promise(r => setTimeout(r, 100));

  snap.afterCleanup = {
    'host has active': login.hasAttribute('active'),
    'dropdown open':   !!dropdown?.classList.contains('open'),
    'hint present':    !!root?.querySelector('.switch-hint'),
  };
  return snap;
});

console.log('-- switch-issuer flow --');
console.log(JSON.stringify(state, null, 2));

await page.screenshot({ path: '/home/jeff/data-kitchen/claude/smoke-tests/switch-issuer.png' });

console.log('-- errors (filtered) --');
for (const e of errs) {
  if (!/(CORS|net::ERR_|favicon|\.acl|\.meta|\.well-known|open-meteo|w3\.org|calendar\.google|api\.weather|fcc\.gov)/.test(e)) console.log(e);
}

await browser.close();
