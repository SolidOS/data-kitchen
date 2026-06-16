// Re-test the Flutter *.solidcommunity.au pods with WebGL forced on (SwiftShader),
// since the headless probe blocklisted WebGL and Flutter/CanvasKit needs it. For
// each, wait longer (Flutter boot) and report whether the app actually rendered:
// body size, presence of a flutter glass-pane / canvas, and visible text.
//
//   xvfb-run node_modules/electron/dist/electron claude/smoke-tests/probe-au-render.cjs

const { app, BaseWindow, WebContentsView } = require('electron');
const path = require('path'); const fs = require('fs'); const os = require('os');
const ROOT = path.join(__dirname, '..', '..');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'dk-au-')));
// Force a working WebGL even under xvfb software rendering.
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
app.commandLine.appendSwitch('use-gl', 'angle');
app.commandLine.appendSwitch('use-angle', 'swiftshader');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

const LIST = JSON.parse(fs.readFileSync(path.join(ROOT, 'claude/validation/plugin-list.json'), 'utf8'));
const AU = LIST.filter((e) => e.kind === 'link' && /solidcommunity\.au/.test(e.href || ''));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe(win, e) {
  const view = new WebContentsView({ webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, partition: 'persist:trusted-guest', backgroundThrottling: false } });
  win.contentView.addChildView(view); view.setBounds({ x: 0, y: 0, width: 1280, height: 860 });
  const wc = view.webContents; let fail = null;
  wc.on('did-fail-load', (_e, c, d, u, m) => { if (m && c !== -3) fail = `${c} ${d}`; });
  wc.on('render-process-gone', (_e, d) => { fail = `gone ${d && d.reason}`; });
  try { await wc.loadURL(e.href); } catch (err) { fail = err.message; }
  await sleep(12000);   // Flutter boot is slow
  let info = {};
  try {
    info = await wc.executeJavaScript(`(() => {
      const glass = document.querySelector('flt-glass-pane, flutter-view, flt-scene-host');
      const canvas = document.querySelectorAll('canvas').length;
      const text = ((document.body && document.body.innerText) || '').replace(/\\s+/g,' ').trim();
      const webgl = (() => { try { const c=document.createElement('canvas'); return !!(c.getContext('webgl2')||c.getContext('webgl')); } catch(e){ return false; } })();
      return { bodyLen: (document.body && document.body.innerHTML.length)||0, hasGlass: !!glass, canvas, webgl, textLen: text.length, text: text.slice(0,80) };
    })()`);
  } catch (err) { info = { evalError: err.message }; }
  win.contentView.removeChildView(view); try { wc.close(); } catch {}
  const rendered = !fail && (info.hasGlass || info.canvas > 0 || info.textLen > 20);
  console.log(`[${rendered ? 'RENDERED' : 'BLANK   '}] ${e.label.padEnd(14)} body=${String(info.bodyLen).padEnd(6)} glass=${info.hasGlass} canvas=${info.canvas} webgl=${info.webgl} text="${info.text || ''}" ${fail ? 'FAIL=' + fail : ''}`);
  return { label: e.label, href: e.href, rendered, ...info, fail };
}

app.whenReady().then(async () => {
  const win = new BaseWindow({ width: 1280, height: 860, show: false });
  const out = [];
  for (const e of AU) out.push(await probe(win, e));
  fs.writeFileSync(path.join(ROOT, 'claude/validation/au-render-probe.json'), JSON.stringify(out, null, 2));
  console.log(`\n[done] ${out.filter((o) => o.rendered).length}/${out.length} *.au pods rendered with WebGL on`);
  app.quit();
}).catch((e) => { console.error(e); app.quit(); });
