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

// Test 1: bare load — verify chrome wired up
await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 15000 });
await new Promise(r => setTimeout(r, 2000));

const a = await page.evaluate(() => {
  const acc = document.querySelector('dk-account');
  const sq  = document.querySelector('dk-settings-quick');
  return {
    'dk-account upgraded': acc && acc.constructor.name === 'DkAccount',
    'dk-account has sol-login': !!acc?.querySelector('sol-login'),
    'dk-account.auth ok': !!acc?.auth,
    'dk-settings-quick upgraded': sq && sq.constructor.name === 'DkSettingsQuick',
    'theme buttons': sq?.querySelectorAll('button[data-theme]').length,
    'font buttons':  sq?.querySelectorAll('button[data-font]').length,
    'initial theme attr': document.documentElement.dataset.theme,
    'initial font-size': getComputedStyle(document.documentElement).getPropertyValue('--font-size'),
    'dkFetch type': typeof window.dkFetch,
    'dkActiveAuthTag': window.dkActiveAuthTag,
  };
});
console.log('--- after bare load ---');
for (const [k,v] of Object.entries(a)) console.log(k, '=', JSON.stringify(v));

// Test 2: click dark theme button
await page.evaluate(() => {
  document.querySelector('dk-settings-quick button[data-theme="dark"]').click();
});
await new Promise(r => setTimeout(r, 300));

// Test 3: click large font button
await page.evaluate(() => {
  document.querySelector('dk-settings-quick button[data-font="large"]').click();
});
await new Promise(r => setTimeout(r, 300));

const b = await page.evaluate(() => ({
  'theme attr after dark click': document.documentElement.dataset.theme,
  'theme source':                 document.documentElement.dataset.themeSource,
  'font-size after large click':  document.documentElement.style.getPropertyValue('--font-size'),
  'stored prefs': localStorage.getItem('dk-prefs'),
  'dark btn active': document.querySelector('dk-settings-quick button[data-theme="dark"]').classList.contains('active'),
  'large btn active': document.querySelector('dk-settings-quick button[data-font="large"]').classList.contains('active'),
}));
console.log('--- after toggles ---');
for (const [k,v] of Object.entries(b)) console.log(k, '=', JSON.stringify(v));

// Test 4: load with #auth=test
await page.goto('http://localhost:8081/#auth=podz-left', { waitUntil: 'domcontentloaded', timeout: 15000 });
await new Promise(r => setTimeout(r, 1000));
const c = await page.evaluate(() => ({
  'dkActiveAuthTag after #auth=podz-left': window.dkActiveAuthTag,
}));
console.log('--- after hash nav ---');
for (const [k,v] of Object.entries(c)) console.log(k, '=', JSON.stringify(v));

// Test 5: change hash dynamically
await page.evaluate(() => { location.hash = '#auth=other'; });
await new Promise(r => setTimeout(r, 300));
const d = await page.evaluate(() => ({
  'dkActiveAuthTag after hashchange': window.dkActiveAuthTag,
}));
console.log('--- after hashchange ---');
for (const [k,v] of Object.entries(d)) console.log(k, '=', JSON.stringify(v));

// Screenshot dark + large
await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 15000 });
await new Promise(r => setTimeout(r, 2000));
await page.screenshot({ path: '/home/jeff/data-kitchen/claude/smoke-tests/phase2-dark-large.png' });

console.log('--- errors (excluding expected CORS) ---');
for (const e of errs) {
  if (!/(CORS|net::ERR_|favicon|\.acl|\.meta|\.well-known|open-meteo|w3\.org|calendar\.google)/.test(e)) console.log(e);
}

await browser.close();
