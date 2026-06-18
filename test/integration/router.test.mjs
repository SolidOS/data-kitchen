// Integration test for router/index.cjs — the single-origin front server. Boots
// the real router (gated) on an ephemeral port and drives it over HTTP. Engine
// paths are served from disk; the gate decides pass/401/redirect. (Pod paths
// would be reverse-proxied to CSS, which isn't running here, so we only assert
// they get PAST the gate, not their eventual status.)

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { freePort, startServer, waitForServer, stopServer } from '../helpers/spawn-server.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOKEN = 'router-test-token';
let proc, base, cssPort;

before(async () => {
  const port = await freePort();
  cssPort = await freePort();                 // nothing listens here → proxy attempts 502
  base = `http://127.0.0.1:${port}`;
  proc = startServer(join(root, 'router/index.cjs'), {
    DK_PUBLIC_PORT: String(port),
    DK_CSS_INTERNAL_PORT: String(cssPort),
    DK_GATE_TOKEN: TOKEN,
    DK_ENGINE_DIR: root,
  });
  await waitForServer(`${base}/src/dk-shell.js`, { headers: { 'x-dk-token': TOKEN } });
});

after(() => stopServer(proc));

test('serves an engine file when the token is present', async () => {
  const r = await fetch(`${base}/src/dk-shell.js`, { headers: { 'x-dk-token': TOKEN } });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') || '', /javascript/);
  assert.equal(r.headers.get('cache-control'), 'no-store');   // never a stale engine asset
});

test('blocks an engine file without the token (bare 401)', async () => {
  const r = await fetch(`${base}/src/dk-shell.js`);
  assert.equal(r.status, 401);
  assert.equal(r.headers.get('access-control-allow-origin'), null);
});

test('the blessing query redirects and sets a strict cookie', async () => {
  const r = await fetch(`${base}/src/dk-shell.js?dk-token=${TOKEN}`, { redirect: 'manual' });
  assert.equal(r.status, 302);
  assert.match(r.headers.get('set-cookie') || '', /dk-token=.*SameSite=Strict/);
  assert.equal(r.headers.get('location'), '/src/dk-shell.js');   // param stripped
});

test('404 for an engine path that does not exist (still gated-through)', async () => {
  const r = await fetch(`${base}/src/does-not-exist.js`, { headers: { 'x-dk-token': TOKEN } });
  assert.equal(r.status, 404);
});

test('a public WebID endpoint passes the gate un-authenticated', async () => {
  // No token: the gate lets /profile/card GETs through; with no CSS backend the
  // router then 502s. Either way it is NOT the gate's 401 — that is the point.
  const r = await fetch(`${base}/dk-pod/profile/card`);
  assert.notEqual(r.status, 401, 'public WebID doc must not be gated');
});
