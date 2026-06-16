// Live load-test every external (ui:Link) catalog app the real dk way — a
// WebContentsView on the persist:trusted-guest partition (same webPreferences as
// electron-config/external-views.cjs) — and, for each that loads, scrape its
// real favicon and verify the URL returns 200. Reads the work list from
// claude/validation/plugin-list.json; writes claude/validation/externals-probe.json.
//
//   xvfb-run node_modules/electron/dist/electron claude/smoke-tests/probe-all-externals.cjs
// (needs a display; on a headless box use xvfb-run)

const { app, BaseWindow, WebContentsView, net } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..', '..');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'dk-iconprobe-')));
app.commandLine.appendSwitch('disable-http-cache');

const LIST = JSON.parse(fs.readFileSync(path.join(ROOT, 'claude/validation/plugin-list.json'), 'utf8'));
const EXTERNALS = LIST.filter((e) => e.kind === 'link' && e.href);

const LOAD_TIMEOUT = 14000;   // give SPAs time to boot
const SETTLE = 2500;          // after did-finish-load, let late <link> tags appear
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// HEAD/GET a URL via Electron net (no CORS); resolve {ok, status, type}.
function check(url) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    let req;
    try { req = net.request({ method: 'GET', url }); }
    catch (e) { return finish({ ok: false, status: 0, type: '', err: e.message }); }
    const to = setTimeout(() => { try { req.abort(); } catch {} finish({ ok: false, status: 0, type: '', err: 'timeout' }); }, 8000);
    req.on('response', (res) => {
      clearTimeout(to);
      const type = (res.headers['content-type'] || '').toString();
      res.on('data', () => {});
      res.on('end', () => {});
      finish({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, type });
      try { req.abort(); } catch {}
    });
    req.on('error', (e) => { clearTimeout(to); finish({ ok: false, status: 0, type: '', err: e.message }); });
    req.end();
  });
}

// Rank favicon candidates: apple-touch-icon first, then biggest declared size,
// then any rel~=icon, then the /favicon.ico fallback.
function rank(cands) {
  const sizeOf = (s) => { const m = /(\d+)x(\d+)/.exec(s || ''); return m ? parseInt(m[1], 10) : 0; };
  const score = (c) => {
    const rel = (c.rel || '').toLowerCase();
    let s = sizeOf(c.sizes);
    if (rel.includes('apple-touch-icon')) s += 1000;
    else if (rel.includes('icon')) s += 100;
    if (rel.includes('mask-icon')) s -= 50;            // monochrome svg, last resort
    if ((c.href || '').endsWith('.svg')) s += 10;       // crisp
    if (c.fallback) s -= 500;                           // /favicon.ico guess
    return s;
  };
  return [...cands].sort((a, b) => score(b) - score(a));
}

async function probe(win, entry) {
  const out = { file: entry.file, label: entry.label, href: entry.href, oldIcon: entry.icon, loaded: false };
  const view = new WebContentsView({
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, partition: 'persist:trusted-guest', backgroundThrottling: false },
  });
  win.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 1280, height: 860 });
  const wc = view.webContents;
  let mainFail = null;
  wc.on('did-fail-load', (_e, code, desc, u, isMain) => { if (isMain && code !== -3) mainFail = `${code} ${desc}`; });
  wc.on('render-process-gone', (_e, d) => { mainFail = `render-gone ${d && d.reason}`; });

  const loaded = await Promise.race([
    wc.loadURL(entry.href).then(() => true).catch((e) => { out.loadErr = e.message; return false; }),
    sleep(LOAD_TIMEOUT).then(() => 'timeout'),
  ]);
  await sleep(SETTLE);

  let info = {};
  try {
    info = await wc.executeJavaScript(`(() => {
      const cands = [...document.querySelectorAll('link[rel~="icon"i], link[rel="apple-touch-icon"i], link[rel="apple-touch-icon-precomposed"i], link[rel="shortcut icon"i], link[rel="mask-icon"i]')]
        .map(l => ({ rel: l.getAttribute('rel'), href: l.href, sizes: l.getAttribute('sizes') }));
      return { href: location.href, origin: location.origin, title: document.title,
               bodyLen: (document.body && document.body.innerHTML.length) || 0, cands };
    })()`);
  } catch (e) { info = { evalError: e.message }; }

  out.finalUrl = info.href || entry.href;
  out.title = info.title || '';
  out.bodyLen = info.bodyLen || 0;
  out.loaded = (loaded === true || (info.bodyLen || 0) > 200) && !mainFail;
  if (mainFail) out.mainFail = mainFail;
  if (loaded === 'timeout') out.timedOut = true;

  // Build candidate list (+ /favicon.ico fallback) and verify in ranked order.
  const cands = (info.cands || []).filter((c) => c.href && /^https?:/.test(c.href));
  if (info.origin) cands.push({ rel: 'icon', href: info.origin.replace(/\/$/, '') + '/favicon.ico', sizes: '', fallback: true });
  out.candidates = cands;
  if (out.loaded) {
    for (const c of rank(cands)) {
      const v = await check(c.href);
      if (v.ok) { out.favicon = c.href; out.faviconRel = c.rel; out.faviconCheck = v; break; }
      c.check = v;
    }
    if (!out.favicon) out.faviconNote = 'no candidate returned 200';
  }

  win.contentView.removeChildView(view);
  try { wc.close(); } catch {}
  const tag = out.loaded ? (out.favicon ? '✓ favicon' : '✓ no-icon') : '✗ FAILED';
  console.log(`[${tag}] ${entry.label}  ${entry.href}  ${out.favicon ? '→ ' + out.favicon : (out.mainFail || out.loadErr || '')}`);
  return out;
}

app.whenReady().then(async () => {
  const win = new BaseWindow({ width: 1280, height: 860, show: false, title: 'dk icon probe' });
  const results = [];
  for (const e of EXTERNALS) results.push(await probe(win, e));
  fs.writeFileSync(path.join(ROOT, 'claude/validation/externals-probe.json'), JSON.stringify(results, null, 2));
  const loaded = results.filter((r) => r.loaded).length;
  const withIcon = results.filter((r) => r.favicon).length;
  console.log(`\n[probe done] ${results.length} externals: ${loaded} loaded, ${withIcon} favicons captured, ${results.length - loaded} failed`);
  app.quit();
}).catch((e) => { console.error(e); app.quit(); });
