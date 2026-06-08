// Verify sol-form-help.html's demo renders solid-ui fields, not the
// "solid-ui is not loaded" error.

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

const url = 'http://localhost:8081/node_modules/sol-components/help/sol-form-help.html';
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
await new Promise(r => setTimeout(r, 3000));

const state = await page.evaluate(() => {
  const formHost = document.getElementById('form-host');
  return {
    'window.UI present':     typeof window.UI === 'object',
    'fieldFunction':         typeof window.UI?.widgets?.fieldFunction,
    'form-host children':    formHost ? formHost.children.length : -1,
    'still loading class':   !!formHost?.classList.contains('loading'),
    'has solid-ui error':    /solid-ui is not loaded/.test(formHost?.innerHTML || ''),
    'has error element':     !!formHost?.querySelector('.error'),
    'error text':            formHost?.querySelector('.error')?.textContent || null,
    // First ~200 chars of rendered form HTML, for sanity.
    'host preview':          formHost?.innerHTML?.slice(0, 200),
  };
});

console.log(JSON.stringify(state, null, 2));

await page.screenshot({ path: '/home/jeff/data-kitchen/claude/smoke-tests/sol-form-help.png' });

console.log('-- errors (filtered) --');
for (const e of errs) {
  if (!/(CORS|net::ERR_|favicon|\.acl|\.meta|\.well-known|open-meteo|w3\.org|calendar\.google|api\.weather|fcc\.gov)/.test(e)) console.log(e);
}

await browser.close();
