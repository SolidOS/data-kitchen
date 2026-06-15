// Probe how external "tab" apps load inside a dk-style pane: a real
// WebContentsView on the persist:trusted-guest partition (same webPreferences as
// external-views.cjs _build), capturing console messages, did-fail-load, and the
// final rendered DOM. Uses an isolated userData dir so it never locks the running
// app's partition store.
//
//   node_modules/.bin/electron claude/smoke-tests/probe-external-panes.cjs [url ...]
// (needs a display; on a headless box use xvfb-run)

const { app, BaseWindow, WebContentsView } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'dk-probe-')));
app.commandLine.appendSwitch('disable-http-cache');

const URLS = process.argv.slice(2).filter((a) => a.startsWith('http'));
const TARGETS = URLS.length ? URLS : [
  'https://geopod.solidcommunity.au',
  'https://chat.solidproject.org/',
  'https://podpro.dev/',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe(win, url) {
  const view = new WebContentsView({
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, partition: 'persist:trusted-guest', backgroundThrottling: false },
  });
  win.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 1280, height: 860 });
  const wc = view.webContents;
  const events = [];
  wc.on('console-message', (_e, level, message) => events.push(`console[${level}] ${message}`.slice(0, 200)));
  wc.on('did-fail-load', (_e, code, desc, u, mainFrame) => events.push(`DID-FAIL-LOAD ${code} ${desc} main=${mainFrame} ${u}`));
  wc.on('render-process-gone', (_e, d) => events.push(`RENDER-GONE ${JSON.stringify(d)}`));

  let threw = null;
  try { await wc.loadURL(url); } catch (e) { threw = e.message; }
  await sleep(7000);   // let the SPA boot

  let info = {};
  try {
    info = await wc.executeJavaScript(`({
      href: location.href, title: document.title, readyState: document.readyState,
      bodyLen: (document.body && document.body.innerHTML.length) || 0,
      text: ((document.body && document.body.innerText) || '').replace(/\\s+/g,' ').trim().slice(0,160)
    })`);
  } catch (e) { info = { evalError: e.message }; }

  console.log(`\n========== ${url} ==========`);
  if (threw) console.log(`loadURL threw: ${threw}`);
  console.log(`final: ${JSON.stringify(info)}`);
  console.log(`events (${events.length}):${events.length ? '\n  ' + events.join('\n  ') : ' none'}`);
  win.contentView.removeChildView(view);
}

app.whenReady().then(async () => {
  const win = new BaseWindow({ width: 1280, height: 860, show: true, title: 'dk pane probe' });
  for (const u of TARGETS) await probe(win, u);
  console.log('\n[probe done]');
  app.quit();
}).catch((e) => { console.error(e); app.quit(); });
