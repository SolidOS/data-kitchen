// Verify the sol-plugin-manager re-list fix: a stale, mislabeled pantry node
// (href dokie.li, label "Apps") should get RELABELED to the dropped plugin's
// name + icon when re-added — not keep "Apps". Drives the running app via CDP on
// a SCRATCH menu (doesn't touch the user's real menu).
//
//   node claude/smoke-tests/repro-menu-builder.mjs   (app must run with --remote-debugging-port=9222)

const DEBUG = 'http://localhost:9222';
const LT = String.fromCharCode(60), GT = String.fromCharCode(62);

async function pageWs() {
  const list = await (await fetch(`${DEBUG}/json`)).json();
  const p = list.find((t) => t.type === 'page' && t.url.includes('index.html'));
  if (!p) throw new Error('no app page');
  return p.webSocketDebuggerUrl;
}

function evalInPage(wsUrl, expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0; const pending = new Map();
    const send = (method, params) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
    ws.onerror = () => reject(new Error('ws error'));
    ws.onopen = async () => {
      await send('Runtime.enable', {});
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      ws.close();
      if (r.result?.exceptionDetails) return reject(new Error(JSON.stringify(r.result.exceptionDetails)));
      resolve(r.result?.result?.value);
    };
  });
}

// 1) reload so the patched sol-plugin-manager.js loads
await evalInPage(await pageWs(), `(()=>{location.reload();return 1})()`);
await new Promise((r) => setTimeout(r, 9000));

// 2) seed a menu with an EMPTY :Apps + a stale pantry node :Apps-2 (mislabeled
//    "Apps"), then re-add dokieli and read the result.
const PRE = '@prefix : ' + LT + '#' + GT + '.\\n'
  + '@prefix ui: ' + LT + 'http://www.w3.org/ns/ui#' + GT + '.\\n'
  + ':Apps a ui:Menu; ui:label "Apps"; ui:parts ().\\n'
  + ':Apps-2 a ui:Link; ui:href "https://dokie.li/"; ui:icon "memo"; ui:label "Apps"; ui:region ui:Tab.';

const expr = `(async () => {
  const { solFetch } = await import('sol-components/core/auth-fetch.js');
  const url = new URL('./dk-pod/dk/scratch/test-apps-' + Date.now() + '.ttl', document.baseURI).href;
  await solFetch(url, { method: 'PUT', headers: { 'content-type': 'text/turtle' }, body: ${JSON.stringify(PRE)} });
  const mgr = document.createElement('sol-plugin-manager');
  mgr.setAttribute('source', url + '#Apps');
  document.body.appendChild(mgr);
  await new Promise((r) => setTimeout(r, 3500));
  await mgr._addEntry({ type: 'link', id: null, name: 'dokieli',
    href: 'https://dokie.li/', icon: 'https://dokie.li/media/images/logo.png', region: 'tab' });
  await new Promise((r) => setTimeout(r, 2000));
  const out = await (await solFetch(url, { headers: { accept: 'text/turtle' } })).text();
  mgr.remove();
  return out;
})()`;

console.log(await evalInPage(await pageWs(), expr));
