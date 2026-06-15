// Drive PodPro's login inside a dk-style pane (persist:trusted-guest +
// dk's window-open handling) and capture where it breaks: navigations,
// login popups, console, and the login-control DOM. Isolated userData.
//
//   node_modules/.bin/electron claude/smoke-tests/probe-podpro-login.cjs [issuer]
// issuer defaults to the local pod http://localhost:8000 (override to test).

const { app, BaseWindow, WebContentsView } = require('electron');
const path = require('path'); const fs = require('fs'); const os = require('os');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'dk-podpro-')));
app.commandLine.appendSwitch('disable-http-cache');

const ISSUER = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:8000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

function wirePopupHandler(wc, tag) {
  // Mirror main.cjs installOpenHandler: login popup -> real window; else deny.
  wc.setWindowOpenHandler(({ url, frameName, features }) => {
    const isLogin = /login/i.test(frameName || '') || /\bpopup\b/i.test(features || '');
    log(`[${tag}] window.open url=${url} frameName=${frameName} features=${features} -> ${isLogin ? 'ALLOW(popup)' : 'DENY(reader)'}`);
    if (isLogin) return { action: 'allow', overrideBrowserWindowOptions: { width: 480, height: 620, webPreferences: { contextIsolation: true, nodeIntegration: false } } };
    return { action: 'deny' };
  });
}
function wireNav(wc, tag) {
  wc.on('console-message', (_e, lvl, m) => log(`[${tag} console:${lvl}] ${String(m).slice(0, 240)}`));
  wc.on('did-fail-load', (_e, c, d, u, mf) => log(`[${tag} DID-FAIL-LOAD] ${c} ${d} main=${mf} ${u}`));
  wc.on('will-navigate', (_e, u) => log(`[${tag} will-navigate] ${u}`));
  wc.on('will-redirect', (_e, u) => log(`[${tag} will-redirect] ${u}`));
  wc.on('did-navigate', (_e, u) => log(`[${tag} did-navigate] ${u}`));
}

app.on('web-contents-created', (_e, wc) => { wirePopupHandler(wc, 'popup'); wireNav(wc, 'popup'); });

app.whenReady().then(async () => {
  const win = new BaseWindow({ width: 1280, height: 880, show: true, title: 'podpro login probe' });
  const view = new WebContentsView({ webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, partition: 'persist:trusted-guest', backgroundThrottling: false } });
  win.contentView.addChildView(view); view.setBounds({ x: 0, y: 0, width: 1280, height: 880 });
  const wc = view.webContents; wireNav(wc, 'pane');

  await wc.loadURL('https://podpro.dev/login');
  await sleep(6000);

  // Map the login UI on /login.
  const ui = await wc.executeJavaScript(`(() => {
    const txt = (e) => (e.innerText || e.value || e.getAttribute('aria-label') || '').replace(/\\s+/g,' ').trim();
    const clickable = [...document.querySelectorAll('button, a, [role=button]')].map((e,i)=>({i, tag:e.tagName, t:txt(e).slice(0,50), href:e.getAttribute('href')||''})).filter(o=>o.t);
    const inputs = [...document.querySelectorAll('input, select')].map((e,i)=>({i, type:e.type, name:e.name, ph:e.placeholder||'', val:(e.value||'').slice(0,50)}));
    return { url: location.href, clickable: clickable.slice(0,40), inputs };
  })()`);
  log('\n=== /login UI ===');
  log('url:', ui.url);
  log('inputs:', JSON.stringify(ui.inputs));
  log('clickable:', JSON.stringify(ui.clickable));

  // Enter the local pod as issuer and submit (try the text input + a Login/Connect button).
  log(`\n=== entering issuer ${ISSUER} and submitting ===`);
  const acted = await wc.executeJavaScript(`(() => {
    const setVal = (el, v) => { const proto = Object.getPrototypeOf(el); const d = Object.getOwnPropertyDescriptor(proto,'value'); d.set.call(el, v); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); };
    const inp = document.querySelector('input[type=text], input[type=url], input:not([type])');
    if (inp) setVal(inp, ${JSON.stringify(ISSUER)});
    const btn = [...document.querySelectorAll('button, a, [role=button]')].find(b => /log\\s*in|connect|continue|sign\\s*in/i.test((b.innerText||b.value||'')));
    const target = btn ? (btn.innerText||btn.value||'').trim() : null;
    if (btn) btn.click();
    return { filled: !!inp, clicked: target };
  })()`);
  log('action:', JSON.stringify(acted));
  await sleep(9000);   // watch navigations/popups/errors

  const after = await wc.executeJavaScript(`({ url: location.href, title: document.title, text: ((document.body&&document.body.innerText)||'').replace(/\\s+/g,' ').trim().slice(0,300) })`).catch((e) => ({ evalError: e.message }));
  log('\n=== pane state after submit ===');
  log(JSON.stringify(after));
  await sleep(1000);
  app.quit();
}).catch((e) => { console.error(e); app.quit(); });
