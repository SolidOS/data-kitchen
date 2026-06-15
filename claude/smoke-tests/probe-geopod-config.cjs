// Isolate why GeoPod renders blank in a dk pane: load it under sandbox on/off
// (trusted-guest partition both times), with FULL console capture, to see whether
// dk's sandbox setting is the cause or the app's own CSP/bootstrap is.
const { app, BaseWindow, WebContentsView } = require('electron');
const path = require('path'); const fs = require('fs'); const os = require('os');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'dk-geo-')));
app.commandLine.appendSwitch('disable-http-cache');
const URL = process.argv.find((a) => a.startsWith('http')) || 'https://geopod.solidcommunity.au';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe(win, sandbox) {
  const view = new WebContentsView({ webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox, partition: 'persist:trusted-guest', backgroundThrottling: false } });
  win.contentView.addChildView(view); view.setBounds({ x: 0, y: 0, width: 1280, height: 860 });
  const wc = view.webContents; const ev = [];
  wc.on('console-message', (_e, lvl, m) => ev.push(`console[${lvl}] ${m}`));
  wc.on('did-fail-load', (_e, c, d, u, mf) => ev.push(`DID-FAIL-LOAD ${c} ${d} main=${mf} ${u}`));
  let threw = null; try { await wc.loadURL(URL); } catch (e) { threw = e.message; }
  await sleep(8000);
  let info = {}; try { info = await wc.executeJavaScript(`({href:location.href,title:document.title,bodyLen:(document.body&&document.body.innerHTML.length)||0,scripts:document.scripts.length,text:((document.body&&document.body.innerText)||'').replace(/\\s+/g,' ').trim().slice(0,120)})`); } catch (e) { info = { evalError: e.message }; }
  console.log(`\n===== sandbox=${sandbox} =====`);
  if (threw) console.log('loadURL threw:', threw);
  console.log('final:', JSON.stringify(info));
  console.log(`console/events (${ev.length}):\n  ${ev.join('\n  ')}`);
  win.contentView.removeChildView(view);
}
app.whenReady().then(async () => {
  const win = new BaseWindow({ width: 1280, height: 860, show: true, title: 'geopod probe' });
  await probe(win, true);
  await probe(win, false);
  app.quit();
}).catch((e) => { console.error(e); app.quit(); });
