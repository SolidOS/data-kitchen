// Minimal CDP driver: eval an async expression in the running dk page and print
// the JSON result. Usage:
//   node claude/smoke-tests/cdp-eval.mjs '<async-js-expression>'
// Reads the page target from http://localhost:9222. Node 22+ (global WebSocket).

const PORT = process.env.CDP_PORT || 9222;
const expr = process.argv[2];
if (!expr) { console.error('need an expression'); process.exit(1); }

const targets = await (await fetch(`http://localhost:${PORT}/json`)).json();
const page = targets.find((t) => t.type === 'page' && /index\.html/.test(t.url)) || targets.find((t) => t.type === 'page');
if (!page) { console.error('no page target'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };

await new Promise((r) => { ws.onopen = r; });
await send('Runtime.enable', {});
const r = await send('Runtime.evaluate', {
  expression: `(async () => { ${expr} })()`,
  awaitPromise: true, returnByValue: true, allowUnsafeEvalBlocklist: false,
});
if (r.result?.exceptionDetails || r.exceptionDetails) console.log('EXCEPTION:', JSON.stringify(r.result?.exceptionDetails || r.exceptionDetails));
console.log(JSON.stringify(r.result?.result?.value ?? r.result?.result ?? r, null, 1));
ws.close();
