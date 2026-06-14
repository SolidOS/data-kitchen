// Drives the LIVE app, opens ☰ → Settings, and measures the settings page width
// chain (#dk-menu-pane → .dk-settings → sol-form → its fields) against the
// available width — to find why the settings panel is "too narrow".
import fs from 'node:fs';
import puppeteer from '/home/jeff/.nvm/versions/node/v24.0.2/lib/node_modules/puppeteer/lib/puppeteer/puppeteer.js';

const TOKEN = fs.readFileSync('/home/jeff/.config/data-kitchen/gate-token', 'utf8').trim();
const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
await page.goto(`http://localhost:8000/?dk-token=${TOKEN}`, { waitUntil: 'networkidle2', timeout: 45000 });
await new Promise(r => setTimeout(r, 4500));

const out = await page.evaluate(async () => {
  const R = el => el ? (r => ({ w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left) }))(el.getBoundingClientRect()) : null;
  const C = (el, ps) => el ? ps.reduce((o, p) => (o[p] = getComputedStyle(el)[p], o), {}) : null;
  // open ☰ and click Settings
  const bar = document.querySelector('#dk-tabs > .sol-tabs-bar');
  const more = Array.from(bar.querySelectorAll('sol-dropdown-button')).find(d => /☰|menu/i.test(d.getAttribute('label') || d.className || ''));
  const trig = more?.shadowRoot?.querySelector('.sol-dd-trigger'); trig?.click();
  await new Promise(r => setTimeout(r, 400));
  const items = Array.from(more?.shadowRoot?.querySelectorAll('.sol-dd-popup button') || []);
  const settingsBtn = items.find(b => /customize|setting/i.test(b.textContent || ''));
  settingsBtn?.click();
  await new Promise(r => setTimeout(r, 1500));
  // The Customize page has sub-tabs; click "Customize Preferences" to reach the
  // settings form (.dk-settings).
  const prefTab = Array.from(document.querySelectorAll('button, [role=tab], a')).find(e => /customize preferences/i.test(e.textContent || ''));
  prefTab?.click();
  await new Promise(r => setTimeout(r, 1200));

  const pane = document.querySelector('.dk-menu-pane');
  const settings = document.querySelector('.dk-settings');
  const form = settings?.querySelector('sol-form');
  // a representative input/select inside the form (may be in shadow)
  const field = form && (form.querySelector('input,select') || form.shadowRoot?.querySelector('input,select'));
  return {
    settingsItemFound: !!settingsBtn,
    viewport: window.innerWidth,
    menuPane: { rect: R(pane), css: C(pane, ['width', 'maxWidth', 'padding', 'overflow', 'display']) },
    dkSettings: { rect: R(settings), css: C(settings, ['width', 'maxWidth', 'margin', 'padding', 'display']) },
    form: { rect: R(form), css: C(form, ['width', 'maxWidth', 'display']) },
    field: { rect: R(field), css: C(field, ['width', 'maxWidth']) },
  };
});
console.log(JSON.stringify(out, null, 2));
await page.screenshot({ path: 'claude/smoke-tests/live-settings-width.png' });
await browser.close();
