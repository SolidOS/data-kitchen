// Tests for nodejs-src/proxy.js — the CORS proxy (/proxy?uri=…) that fetches an
// external resource server-side and returns it with permissive CORS. We point
// it at a local "upstream" http server standing in for the external origin.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const proxy = require(path.join(HERE, '..', '..', 'nodejs-src', 'proxy.js'));

const noop = () => {};
const listening = (server) => new Promise((res) => server.once('listening', res));

let upstream, upstreamPort, proxyServer, proxyPort;

// Request a path off the proxy. `method` defaults to GET.
function req(p, method = 'GET') {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: proxyPort, path: p, method }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    r.on('error', reject);
    r.end();
  });
}

// Build the /proxy URL for an upstream path.
const proxied = (upstreamPath, key = 'uri') =>
  `/proxy?${key}=${encodeURIComponent(`http://127.0.0.1:${upstreamPort}${upstreamPath}`)}`;

before(async () => {
  upstream = http.createServer((r, res) => {
    if (r.url === '/hello') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end('hello world');
    }
    if (r.url === '/json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end('{"ok":true}');
    }
    if (r.url === '/redirect') {
      res.writeHead(302, { location: `http://127.0.0.1:${upstreamPort}/hello` });
      return res.end();
    }
    if (r.url === '/boom') {
      // Hang up mid-flight to force an upstream error.
      return r.socket.destroy();
    }
    res.writeHead(404);
    res.end('nope');
  });
  upstream.listen(0, '127.0.0.1');
  await listening(upstream);
  upstreamPort = upstream.address().port;

  proxyServer = proxy.start(0, noop);
  await listening(proxyServer);
  proxyPort = proxyServer.address().port;
});

after(() => {
  proxyServer?.close();
  upstream?.close();
});

test('fetches an upstream resource and passes through body + content-type', async () => {
  const r = await req(proxied('/hello'));
  assert.equal(r.status, 200);
  assert.equal(r.body, 'hello world');
  assert.equal(r.headers['content-type'], 'text/plain');
});

test('adds permissive CORS headers', async () => {
  const r = await req(proxied('/hello'));
  assert.equal(r.headers['access-control-allow-origin'], '*');
  assert.match(r.headers['access-control-allow-methods'], /GET/);
});

test('preserves a JSON content-type', async () => {
  const r = await req(proxied('/json'));
  assert.equal(r.body, '{"ok":true}');
  assert.equal(r.headers['content-type'], 'application/json');
});

test('accepts the legacy `url` param as well as `uri`', async () => {
  const r = await req(proxied('/hello', 'url'));
  assert.equal(r.status, 200);
  assert.equal(r.body, 'hello world');
});

test('follows redirects', async () => {
  const r = await req(proxied('/redirect'));
  assert.equal(r.status, 200);
  assert.equal(r.body, 'hello world');
});

test('answers a CORS preflight (OPTIONS) with 204', async () => {
  const r = await req('/proxy', 'OPTIONS');
  assert.equal(r.status, 204);
  assert.equal(r.headers['access-control-allow-origin'], '*');
  assert.equal(r.body, '');
});

test('400 when the uri param is missing', async () => {
  const r = await req('/proxy');
  assert.equal(r.status, 400);
  assert.equal(r.headers['access-control-allow-origin'], '*', 'CORS even on error');
});

test('404 for any path other than /proxy', async () => {
  const r = await req('/something-else');
  assert.equal(r.status, 404);
  assert.equal(r.headers['access-control-allow-origin'], '*');
});

test('502 when the upstream fetch fails', async () => {
  const r = await req(proxied('/boom'));
  assert.equal(r.status, 502);
  assert.match(r.body, /proxy fetch failed/);
});

test('502 (not a crash) for a malformed uri', async () => {
  const r = await req('/proxy?uri=not-a-valid-url');
  assert.equal(r.status, 502);
});
