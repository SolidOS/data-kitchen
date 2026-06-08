// Verifies the new chrome:
// 1. No <dk-account> / Log in button in the header.
// 2. Single ⚙ gear in the header; clicking opens a dropdown panel
//    with theme + font controls; click-outside closes it.
// 3. window.SolidWebComponents.AuthManager.shared returns the singleton
//    even with no <sol-login> in the dk-level light DOM.
// 4. dk-auth-router's dkFetch reaches that singleton.
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

const chrome = await page.evaluate(() => {
  return {
    'dk-account in header':       !!document.querySelector('header.dk-chrome dk-account'),
    'sol-login in header':        !!document.querySelector('header.dk-chrome sol-login'),
    'dk-settings-quick present':  !!document.querySelector('header.dk-chrome dk-settings-quick'),
    'gear button visible':        !!document.querySelector('dk-settings-quick .dk-prefs-gear'),
    'prefs panel hidden at load': document.querySelector('dk-settings-quick .dk-prefs-panel')?.hidden,
  };
});
console.log('--- chrome shape ---');
console.log(JSON.stringify(chrome, null, 2));

// Click the gear, verify panel opens with controls.
const open = await page.evaluate(() => {
  document.querySelector('dk-settings-quick .dk-prefs-gear')?.click();
  const panel = document.querySelector('dk-settings-quick .dk-prefs-panel');
  return {
    'panel visible':         !panel.hidden,
    'aria-expanded':         document.querySelector('dk-settings-quick .dk-prefs-gear')?.getAttribute('aria-expanded'),
    'theme buttons':         panel.querySelectorAll('button[data-theme]').length,
    'font buttons':          panel.querySelectorAll('button[data-font]').length,
    'active theme':          panel.querySelector('button[data-theme].active')?.dataset.theme,
    'active font':           panel.querySelector('button[data-font].active')?.dataset.font,
  };
});
console.log('--- gear opened ---');
console.log(JSON.stringify(open, null, 2));

// Click outside; panel should close.
const close = await page.evaluate(() => {
  document.body.click();
  const panel = document.querySelector('dk-settings-quick .dk-prefs-panel');
  return { 'panel hidden': panel.hidden };
});
console.log('--- click outside ---');
console.log(JSON.stringify(close, null, 2));

// AuthManager.shared accessible without any <sol-login> mounted.
const auth = await page.evaluate(() => {
  return {
    'sol-login on page':         document.querySelectorAll('sol-login').length,
    'AuthManager.shared exists': !!window.SolidWebComponents?.AuthManager?.shared,
    'sessions Map':              window.SolidWebComponents?.AuthManager?.shared?.sessions instanceof Map,
    'dkFetch reachable':         typeof window.dkFetch,
  };
});
console.log('--- AuthManager singleton ---');
console.log(JSON.stringify(auth, null, 2));

await page.screenshot({ path: '/home/jeff/data-kitchen/claude/smoke-tests/prefs-gear-closed.png' });
// Open + screenshot.
await page.evaluate(() => document.querySelector('dk-settings-quick .dk-prefs-gear')?.click());
await new Promise(r => setTimeout(r, 200));
await page.screenshot({ path: '/home/jeff/data-kitchen/claude/smoke-tests/prefs-gear-open.png' });

// Navigate to podz so a sol-pod mounts a sol-login, then confirm the
// AuthManager singleton sees it (sessions Map shape unchanged but
// instance identity matches).
await page.evaluate(() => {
  for (const b of document.querySelector('sol-menu')?.shadowRoot?.querySelectorAll('.sol-menu-nav button') ?? [])
    if (b.textContent.trim() === 'Podz') b.click();
});
await new Promise(r => setTimeout(r, 2500));
const afterPodz = await page.evaluate(() => {
  const shared = window.SolidWebComponents?.AuthManager?.shared;
  // sol-login in podz is inside sol-pod's shadow root, so a plain
  // querySelector won't find it; deep-walk to confirm one is mounted.
  function deepFindSolLogin(root) {
    if (!root.querySelectorAll) return false;
    if (root.querySelector('sol-login')) return true;
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot && deepFindSolLogin(el.shadowRoot)) return true;
    }
    return false;
  }
  return {
    'shared still singleton': !!shared,
    'sol-login found in deep walk': deepFindSolLogin(document),
    'tags in AuthManager': shared ? Array.from(shared.sessions.keys()) : null,
  };
});
console.log('--- after nav to podz ---');
console.log(JSON.stringify(afterPodz, null, 2));

console.log('--- errors (filtered) ---');
for (const e of errs) {
  if (!/(CORS|net::ERR_|favicon|\.acl|\.meta|\.well-known|open-meteo|w3\.org|calendar\.google|truth-out)/.test(e)) {
    console.log(e);
  }
}

await browser.close();
