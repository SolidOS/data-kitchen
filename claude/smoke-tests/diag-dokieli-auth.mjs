// diag-dokieli-auth.mjs — verify the Phase-1 auth-fetch wiring for dokieli.
//
// Confirms that turning on `auth:sol-components` (index.html data-objects) plus
// dokieli.manifest.json's new `auth → adoptDokieliFetch` consume actually wires
// up: the broker registered both dokieli consumers, the `auth` host-service is
// live, and (optionally) the dokieli editor doc-frame's window.fetch was replaced
// by dk's authed fetch.
//
// Connects to the RUNNING dk Electron app over CDP (start it with
//   --remote-debugging-port=9222   — same as cdp-eval.mjs).
// Usage:  node claude/smoke-tests/diag-dokieli-auth.mjs
//
// This checks the *wiring* only. The decisive end-to-end test is interactive:
//   1. Log dk into a REMOTE pod (sol-pod's sign-in, real OIDC).
//   2. Open the dokieli tab, open/create a doc that lives on that remote pod.
//   3. Edit + save; confirm the write persists to the remote pod (Network tab
//      shows the request carrying the session's Authorization header), with no
//      dokieli login prompt. Then repeat against the LOCAL pod (regression).

const PORT = process.env.CDP_PORT || 9222;

let targets;
try {
  targets = await (await fetch(`http://localhost:${PORT}/json`)).json();
} catch {
  console.error(`No CDP on :${PORT}. Start dk with --remote-debugging-port=${PORT}.`);
  process.exit(1);
}
const page = targets.find((t) => t.type === 'page' && /index\.html/.test(t.url))
          || targets.find((t) => t.type === 'page');
if (!page) { console.error('no page target'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
await new Promise((r) => { ws.onopen = r; });
await send('Runtime.enable', {});

const expr = `(async () => {
  const ci = window.ComponentInterop;
  const consumers = ci && ci.consumers ? Object.keys(ci.consumers) : [];
  let services = [];
  try { services = ci && ci.services && ci.services.names ? ci.services.names() : []; } catch (_) {}
  const swc = window.SolidWebComponents;
  const authServicePresent = services.includes('auth') || !!(swc && swc.auth);
  // dokieli editor doc-frames (have window.DO): is fetch overridden away from native?
  const dokieliFrames = [];
  (function scan(win) {
    try { if (win.DO && win.DO.C && win.DO.C.User) {
      const native = /\\[native code\\]/.test(String(win.fetch));
      dokieliFrames.push({ webId: win.DO.C.User.IRI || null, fetchIsNative: native });
    } } catch (_) {}
    let f; try { f = win.frames; } catch (_) { return; }
    for (let i = 0; i < (f ? f.length : 0); i++) { try { scan(f[i]); } catch (_) {} }
  })(window);
  return JSON.stringify({
    consumersRegistered: consumers,
    hasAdoptDokieliUser: consumers.includes('adoptDokieliUser'),
    hasAdoptDokieliFetch: consumers.includes('adoptDokieliFetch'),
    services,
    authServicePresent,
    dokieliFramesFound: dokieliFrames.length,
    dokieliFrames,
  }, null, 1);
})()`;

const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
if (r.result?.exceptionDetails) console.log('EXCEPTION:', JSON.stringify(r.result.exceptionDetails));
console.log(r.result?.result?.value ?? JSON.stringify(r, null, 1));
console.log('\nExpect: hasAdoptDokieliFetch=true, authServicePresent=true.');
console.log('After opening a dokieli doc: a dokieliFrame with fetchIsNative=false (dk fetch installed).');
ws.close();
