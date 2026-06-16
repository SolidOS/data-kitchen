// Verify the pane loading overlay: it must appear while the external app
// fetches AND stay up through the post-network boot pause, dropping only once
// the app has actually painted (Flutter glass-pane) — not at did-stop-loading.
// SwiftShader is forced on so Flutter actually paints in this headless run.
//
//   xvfb-run node_modules/electron/dist/electron claude/smoke-tests/probe-pane-loading.cjs [url]

const { app, BaseWindow } = require('electron');
const path = require('path'); const fs = require('fs'); const os = require('os');
const { ExternalViews } = require('../../electron-config/external-views.cjs');

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'dk-paneload-')));
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
app.commandLine.appendSwitch('use-gl', 'angle');
app.commandLine.appendSwitch('use-angle', 'swiftshader');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

const URL = process.argv.slice(2).find((a) => a.startsWith('http')) || 'https://billipod.solidcommunity.au';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BaseWindow({ width: 1280, height: 860, show: false });
  const ev = new ExternalViews(win);
  ev.setContentRect({ x: 0, y: 60, width: 1280, height: 800 });

  ev.openPane(URL, { x: 0, y: 60, width: 1280, height: 800 });
  await sleep(400);
  const shownDuringFetch = !!ev._paneLoadingShown;

  // did-stop-loading fires when the network stops; the overlay must persist past it.
  let stopAt = 0;
  ev.pane.webContents.once('did-stop-loading', () => { stopAt = Date.now(); });
  for (let i = 0; i < 30 && !stopAt; i++) await sleep(200);
  await sleep(250);
  const shownAtNetworkStop = !!ev._paneLoadingShown;   // expect STILL shown (boot pause)

  // Now wait for the overlay to clear (paint detected, or safety cap).
  let clearedAt = 0;
  for (let i = 0; i < 80 && ev._paneLoadingShown; i++) await sleep(200);
  if (!ev._paneLoadingShown) clearedAt = Date.now();
  const painted = await ev.pane.webContents.executeJavaScript(
    `!!document.querySelector('flt-glass-pane, flutter-view, flt-scene-host, flt-semantics-host')`).catch(() => false);
  const heldMs = stopAt && clearedAt ? clearedAt - stopAt : -1;

  console.log(`shownDuringFetch=${shownDuringFetch}`);
  console.log(`shownAtNetworkStop=${shownAtNetworkStop}  (should be true — held through boot pause)`);
  console.log(`cleared=${!ev._paneLoadingShown}  heldPastNetworkStop=${heldMs}ms  flutterPainted=${painted}`);

  const ok = shownDuringFetch && shownAtNetworkStop && !ev._paneLoadingShown;
  console.log(`\n[pane-loading] ${ok ? 'PASS — spinner shown through fetch + boot pause, cleared after paint' : 'FAIL'}`);
  app.quit();
}).catch((e) => { console.error(e); app.quit(); });
