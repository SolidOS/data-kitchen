// Integration test for the app-shell CSP + per-response nonce in router/index.cjs.
// Boots the real router in front of a FAKE CSS upstream that returns an HTML shell,
// and asserts the shell is served with a nonce-based CSP whose nonce matches the
// nonce stamped onto every <script>, freshly minted per response — so the app's own
// scripts (and component-interop's nonce-propagated importmap) run while a <script>
// injected into a pod doc, having no nonce, is blocked.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { freePort, startServer, waitForServer, stopServer } from '../helpers/spawn-server.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOKEN = 'router-csp-token';
const SHELL = '<!doctype html><html><head>'
  + '<script src="a.js"></script>'
  + '<script type="module" src="b.js"></script>'
  + '</head><body>hi</body></html>';
let proc, css, base;

before(async () => {
  // Fake CSS: serve the shell HTML for any path.
  css = http.createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end(SHELL); });
  const cssPort = await freePort();
  await new Promise((r) => css.listen(cssPort, '127.0.0.1', r));

  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  proc = startServer(join(root, 'router/index.cjs'), {
    DK_PUBLIC_PORT: String(port),
    DK_CSS_INTERNAL_PORT: String(cssPort),
    DK_GATE_TOKEN: TOKEN,
    DK_ENGINE_DIR: root,
  });
  await waitForServer(`${base}/src/dk-shell.js`, { headers: { 'x-dk-token': TOKEN } });
});

after(async () => { await stopServer(proc); await new Promise((r) => css.close(r)); });

const getShell = () => fetch(`${base}/index.html`, { headers: { 'x-dk-token': TOKEN } });
const nonceOf = (r) => (r.headers.get('content-security-policy') || '').match(/'nonce-([^']+)'/)?.[1];

test('the shell carries a nonce-based CSP and every <script> is stamped with that nonce', async () => {
  const r = await getShell();
  assert.equal(r.status, 200);
  const csp = r.headers.get('content-security-policy') || '';
  assert.match(csp, /script-src[^;]*'nonce-[^']+'/, 'script-src carries a nonce');
  assert.match(csp, /object-src 'none'/);
  const nonce = nonceOf(r);
  const html = await r.text();
  const scriptNonces = [...html.matchAll(/<script nonce="([^"]+)"/g)].map((x) => x[1]);
  assert.equal(scriptNonces.length, 2, 'both scripts stamped');
  assert.ok(scriptNonces.every((n) => n === nonce), 'script nonces match the header nonce');
});

test('the nonce is fresh per response', async () => {
  const a = nonceOf(await getShell());
  const b = nonceOf(await getShell());
  assert.ok(a && b && a !== b, 'a new nonce each response');
});

test('a non-shell pod path is proxied verbatim with no shell CSP', async () => {
  const r = await fetch(`${base}/dk-pod/dk/pages/settings.html`, { headers: { 'x-dk-token': TOKEN } });
  assert.equal(r.headers.get('content-security-policy'), null, 'CSP is only on the shell');
  const html = await r.text();
  assert.ok(!/<script nonce=/.test(html), 'no nonce stamping off the shell');
});
