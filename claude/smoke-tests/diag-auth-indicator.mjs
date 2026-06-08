// Verify auth-indicator state machine:
//   (1) sol-login is hidden in the chrome by default (no visible chip).
//   (2) Settings gear is the indicator: no special class when logged out.
//   (3) Faking a sol-login event paints the gear green + sets WebID title.
//   (4) Faking sol-logout reverts.
//   (5) Faking sol-auth-needed flips :host([active]) so sol-login surfaces.

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

function isVisible(handle) {
  return page.evaluate(el => {
    if (!el) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetParent !== null;
  }, handle);
}

// (1) sol-login hidden by default
const initial = await page.evaluate(() => {
  const login = document.querySelector('sol-login');
  const settings = [...document.querySelectorAll('sol-button')].find(b => b.getAttribute('name') === 'Settings');
  return {
    'sol-login display':       login && getComputedStyle(login).display,
    'sol-login visible':       login ? login.offsetParent !== null : false,
    'sol-login active attr':   login?.hasAttribute('active'),
    'settings has authed cls': !!settings?.classList.contains('dk-chrome-authed'),
    'settings title':          settings?.getAttribute('title'),
  };
});
console.log('-- (1) initial state --');
console.log(JSON.stringify(initial, null, 2));

// (3) Fire a fake sol-login event with a WebID
await page.evaluate(() => {
  document.dispatchEvent(new CustomEvent('sol-login', {
    bubbles: true, composed: true,
    detail: { webId: 'https://jeff.solidcommunity.net/profile/card#me', issuer: 'https://solidcommunity.net' },
  }));
});
const afterLogin = await page.evaluate(() => {
  const settings = [...document.querySelectorAll('sol-button')].find(b => b.getAttribute('name') === 'Settings');
  return {
    'settings has authed cls': !!settings?.classList.contains('dk-chrome-authed'),
    'settings title':          settings?.getAttribute('title'),
    'gear computed color':     settings ? getComputedStyle(settings.shadowRoot?.querySelector('button') || settings).color : null,
  };
});
console.log('-- (3) after sol-login --');
console.log(JSON.stringify(afterLogin, null, 2));

// (4) Fire sol-logout
await page.evaluate(() => {
  document.dispatchEvent(new CustomEvent('sol-logout', { bubbles: true, composed: true, detail: {} }));
});
const afterLogout = await page.evaluate(() => {
  const settings = [...document.querySelectorAll('sol-button')].find(b => b.getAttribute('name') === 'Settings');
  return {
    'settings has authed cls': !!settings?.classList.contains('dk-chrome-authed'),
    'settings title':          settings?.getAttribute('title'),
  };
});
console.log('-- (4) after sol-logout --');
console.log(JSON.stringify(afterLogout, null, 2));

// (5) Fire sol-auth-needed; sol-login's internal handler sets `active`
// during the prompt (in this headless env the popup obviously won't
// open, so we just verify the attribute toggles synchronously).
const authNeededState = await page.evaluate(async () => {
  const login = document.querySelector('sol-login');
  if (!login) return { error: 'no sol-login' };

  // Trigger the handler directly with a noop resolver so it gets to
  // the setAttribute('active', '') line + login() attempt. The popup
  // window.open will return null in headless → sol-popup-blocked
  // fires → cleanup removes 'active'. So we snapshot right after the
  // dispatch microtask.
  document.dispatchEvent(new CustomEvent('sol-auth-needed', {
    detail: {
      url: 'http://localhost:3000/example.ttl',
      response: { status: 401 },
      resolve: () => {}, reject: () => {},
    },
  }));
  await new Promise(r => setTimeout(r, 50));
  const display = getComputedStyle(login).display;
  const hasActive = login.hasAttribute('active');
  // Cleanup: force the popup-blocked path.
  login.dispatchEvent(new CustomEvent('sol-popup-blocked', { bubbles: true, composed: true, detail: { side: 'default' } }));
  await new Promise(r => setTimeout(r, 50));
  return {
    'mid-flow display':       display,
    'mid-flow has active':    hasActive,
    'after-cleanup active':   login.hasAttribute('active'),
    'after-cleanup display':  getComputedStyle(login).display,
  };
});
console.log('-- (5) sol-auth-needed flow --');
console.log(JSON.stringify(authNeededState, null, 2));

await page.screenshot({ path: '/home/jeff/data-kitchen/claude/smoke-tests/auth-indicator.png' });

console.log('-- errors (filtered) --');
for (const e of errs) {
  if (!/(CORS|net::ERR_|favicon|\.acl|\.meta|\.well-known|open-meteo|w3\.org|calendar\.google|api\.weather|fcc\.gov)/.test(e)) console.log(e);
}

await browser.close();
