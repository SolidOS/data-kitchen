// Drive the running Electron app over CDP (node global WebSocket) to verify the
// settings-expansion changes in the real renderer. Assumes the app is running
// with --remote-debugging-port=9222.
//
//   node claude/smoke-tests/verify-settings.mjs

const DEBUG = 'http://localhost:9222';

async function pageTarget() {
  const list = await (await fetch(`${DEBUG}/json`)).json();
  const p = list.find((t) => t.type === 'page' && t.url.includes('index.html'));
  if (!p) throw new Error('no app page target');
  return p.webSocketDebuggerUrl;
}

function evalInPage(wsUrl, expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const send = (method, params) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
    ws.onerror = (e) => reject(new Error('ws error ' + (e.message || '')));
    ws.onopen = async () => {
      await send('Runtime.enable', {});
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
      ws.close();
      if (r.result && r.result.exceptionDetails) return reject(new Error(JSON.stringify(r.result.exceptionDetails)));
      resolve(r.result?.result?.value);
    };
  });
}

const wsUrl = await pageTarget();

const checks = `(async () => {
  const out = {};
  out.dkConfigDefined  = !!customElements.get('dk-config-settings');
  out.dkIssuersDefined = !!customElements.get('dk-issuers-editor');
  const tabs = document.getElementById('dk-tabs');
  out.activeTab = tabs ? tabs.activeTab : null;
  out.tabPanes = tabs ? [...tabs.querySelectorAll(':scope > .sol-tabs-content > .sol-tabs-pane')].map(p => p.dataset.tabName) : [];
  try { const c = await window.dkElectron.getConfig();
    out.cfgPorts = (c.config['@graph']||[]).filter(n=>n.port!=null).map(n=>n['@id']+'='+n.port);
    out.cfgEffective = c.effective;
  } catch (e) { out.configErr = String(e); }
  return out;
})()`;

const render = `(async () => {
  const div = document.createElement('div'); div.className='dk-settings'; div.id='__verify'; document.body.appendChild(div);
  div.innerHTML = '<dk-config-settings></dk-config-settings>'
    + '<dk-issuers-editor source="./dk-pod/dk/data/data-kitchen-settings.ttl#Settings"></dk-issuers-editor>';
  await new Promise(r => setTimeout(r, 3000));
  const cfg = div.querySelector('dk-config-settings');
  const iss = div.querySelector('dk-issuers-editor');
  const out = {
    configHasElectron: !!cfg && /Electron/.test(cfg.textContent),
    configHasPivot:    !!cfg && /Pivot/.test(cfg.textContent),
    configHasPortField:!!cfg && /Proxy port/.test(cfg.textContent),
    configHasMovePod:  !!cfg && /Move my pod/.test(cfg.textContent),
    issuerRows:        iss ? iss.querySelectorAll('.dk-issuer-row').length : -1,
    issuerFirst:       iss ? (iss.querySelector('.dk-issuer-url')?.textContent || '') : '',
    issuerDefaultBadge:!!iss && /default/.test(iss.textContent),
  };
  div.remove();
  return out;
})()`;

console.log('--- renderer checks ---');
console.log(JSON.stringify(await evalInPage(wsUrl, checks), null, 2));
console.log('--- live component render ---');
console.log(JSON.stringify(await evalInPage(await pageTarget(), render), null, 2));
