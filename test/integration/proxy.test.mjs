// Integration test for proxy/index.cjs — the CORS reader proxy. Boots the real
// proxy (gated) plus a tiny in-test origin server, and asserts that the proxy
// passes content through VERBATIM with permissive CORS (it no longer rewrites
// HTML — feed articles load live in a native view, not an in-iframe proxy view).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { freePort, startServer, waitForServer, stopServer } from '../helpers/spawn-server.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOKEN = 'proxy-test-token';
let proc, origin, proxyBase, originBase;

const PAGE = '<html><head><title>t</title></head><body>hi<script>alert(1)</script></body></html>';

before(async () => {
  // Upstream origin: /frameok serves freely; /frameno refuses framing.
  origin = http.createServer((req, res) => {
    if (req.url === '/frameno') res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('content-type', 'text/html');
    res.end(PAGE);
  });
  const originPort = await freePort();
  await new Promise((r) => origin.listen(originPort, '127.0.0.1', r));
  originBase = `http://127.0.0.1:${originPort}`;

  const proxyPort = await freePort();
  proxyBase = `http://127.0.0.1:${proxyPort}`;
  proc = startServer(join(root, 'proxy/index.cjs'), {
    DK_PROXY_PORT: String(proxyPort),
    DK_GATE_TOKEN: TOKEN,
  });
  await waitForServer(`${proxyBase}/`, { headers: { 'x-dk-token': TOKEN } });
});

after(async () => {
  await stopServer(proc);
  await new Promise((r) => origin.close(r));
});

const get = (path) => fetch(`${proxyBase}${path}`, { headers: { 'x-dk-token': TOKEN } });

test('HTML is passed through verbatim with permissive CORS (no rewriting)', async () => {
  const r = await get(`/proxy?uri=${encodeURIComponent(originBase + '/frameok')}`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  const html = await r.text();
  assert.equal(html, PAGE, 'returned unchanged — scripts kept, no <base> injected');
});

test('OPTIONS preflight is answered with CORS once past the gate', async () => {
  const r = await fetch(`${proxyBase}/proxy`, { method: 'OPTIONS', headers: { 'x-dk-token': TOKEN } });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-methods'), 'GET,OPTIONS');
});

test('missing uri parameter is a 400', async () => {
  const r = await get('/proxy');
  assert.equal(r.status, 400);
});

test('the proxy is gated: no token → 401', async () => {
  const r = await fetch(`${proxyBase}/proxy?uri=${encodeURIComponent(originBase + '/frameok')}`);
  assert.equal(r.status, 401);
});
