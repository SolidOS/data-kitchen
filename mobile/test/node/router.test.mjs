// Tests for nodejs-src/router.js — the single-origin front (:8000) that serves
// the read-only dk engine from disk and reverse-proxies everything else to CSS
// (the pod). We stand up a fake CSS upstream + a temp engine dir on ephemeral
// ports, then drive the router over real HTTP.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const router = require(path.join(HERE, '..', '..', 'nodejs-src', 'router.js'));

const noop = () => {};
const listening = (server) => new Promise((res) => server.once('listening', res));

let engineDir;
let css;          // fake pod/CSS upstream
let cssPort;
let routerServer;
let port;         // router public port

// Fetch a path off the router; returns {status, headers, body}.
function get(p, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: p, method },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

before(async () => {
  engineDir = fs.mkdtempSync(path.join(os.tmpdir(), 'router-engine-'));
  fs.mkdirSync(path.join(engineDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(engineDir, 'plugins', 'foo', 'dist'), { recursive: true });
  fs.writeFileSync(path.join(engineDir, 'src', 'app.js'), 'console.log(1)');
  fs.writeFileSync(path.join(engineDir, 'src', 'style.css'), 'body{}');
  fs.writeFileSync(path.join(engineDir, 'plugins', 'foo', 'dist', 'p.js'), 'plugin');
  // A secret OUTSIDE the engine dir, to prove the traversal guard.
  fs.writeFileSync(path.join(engineDir, '..', 'router-secret.txt'), 'TOPSECRET');

  // Fake CSS: echoes the method + path so we can confirm pass-through.
  css = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain', 'x-from': 'css' });
    res.end(`css:${req.method}:${req.url}`);
  });
  css.listen(0, '127.0.0.1');
  await listening(css);
  cssPort = css.address().port;

  routerServer = router.start(0, cssPort, engineDir, noop);
  await listening(routerServer);
  port = routerServer.address().port;
});

after(() => {
  routerServer?.close();
  css?.close();
  fs.rmSync(engineDir, { recursive: true, force: true });
  fs.rmSync(path.join(engineDir, '..', 'router-secret.txt'), { force: true });
});

test('serves an engine file from disk with the right MIME', async () => {
  const r = await get('/src/app.js');
  assert.equal(r.status, 200);
  assert.equal(r.body, 'console.log(1)');
  assert.equal(r.headers['content-type'], 'text/javascript');
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.notEqual(r.headers['x-from'], 'css', 'served locally, not proxied');
});

test('maps .css to text/css', async () => {
  const r = await get('/src/style.css');
  assert.equal(r.status, 200);
  assert.equal(r.headers['content-type'], 'text/css');
});

test('serves plugin dist paths (regex engine prefix)', async () => {
  const r = await get('/plugins/foo/dist/p.js');
  assert.equal(r.status, 200);
  assert.equal(r.body, 'plugin');
});

test('HEAD on an engine file returns headers but no body', async () => {
  const r = await get('/src/app.js', 'HEAD');
  assert.equal(r.status, 200);
  assert.equal(r.body, '');
  assert.equal(r.headers['content-type'], 'text/javascript');
});

test('404 for a missing engine file', async () => {
  const r = await get('/src/nope.js');
  assert.equal(r.status, 404);
});

test('blocks path traversal out of the engine dir with 403', async () => {
  // Encoded slashes (%2f) keep the dot-segments inside one path segment, so URL
  // pathname normalization can't collapse them. The prefix still matches as an
  // engine path; serveEngine's decodeURIComponent then expands the `..`, which
  // resolves outside engineDir and trips the guard → 403.
  const r = await get('/src/..%2f..%2frouter-secret.txt');
  assert.equal(r.status, 403);
  assert.ok(!r.body.includes('TOPSECRET'), 'secret never served');
});

test('reverse-proxies non-engine paths to CSS', async () => {
  const r = await get('/profile/card');
  assert.equal(r.status, 200);
  assert.equal(r.headers['x-from'], 'css', 'came from the pod upstream');
  assert.equal(r.body, 'css:GET:/profile/card');
});

test('proxies the pod root (/) to CSS, not the engine', async () => {
  const r = await get('/');
  assert.equal(r.headers['x-from'], 'css');
  assert.equal(r.body, 'css:GET:/');
});

test('POST (a non-GET method) is proxied even on an engine-looking path', async () => {
  // Only GET/HEAD are served from the engine; other methods go to the pod.
  const r = await get('/src/app.js', 'POST');
  assert.equal(r.headers['x-from'], 'css');
  assert.equal(r.body, 'css:POST:/src/app.js');
});

test('returns 502 when the pod upstream is unreachable', async () => {
  // Point a fresh router at a dead CSS port.
  const dead = router.start(0, 1, engineDir, noop); // port 1: refused
  await listening(dead);
  const deadPort = dead.address().port;
  const r = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: deadPort, path: '/card' },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
      });
    req.on('error', reject);
    req.end();
  });
  dead.close();
  assert.equal(r.status, 502);
  assert.match(r.body, /unreachable/);
});
