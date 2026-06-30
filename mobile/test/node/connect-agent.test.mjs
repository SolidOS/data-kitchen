// Tests for nodejs-src/connect-agent.js — the http/https Agents that route
// node's OUTBOUND traffic through the Dart loopback forward proxy (127.0.0.1:8011)
// while letting loopback/private hosts connect directly.
//
// connect-agent hardcodes the proxy at 127.0.0.1:8011, so we bind a fake CONNECT
// proxy there and a plain "target" http server, then drive requests through the
// exported httpAgent and observe whether each one tunnelled or went direct.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { httpAgent } = require(path.join(HERE, '..', '..', 'nodejs-src', 'connect-agent.js'));

const listening = (server) => new Promise((res) => server.once('listening', res));

let target, targetPort;     // the "external" origin we ultimately reach
let fakeProxy;              // CONNECT proxy on 8011
const connects = [];        // CONNECT host:port lines the proxy received

// A minimal CONNECT proxy: reads the CONNECT line, records it, and either fails
// (host 'fail.test') or tunnels to the real local target server.
function startFakeProxy() {
  const server = net.createServer((client) => {
    let header = '';
    let tunneling = false;
    let upstream = null;
    client.on('data', (chunk) => {
      if (tunneling) { if (upstream) upstream.write(chunk); return; }
      header += chunk.toString('latin1');
      const i = header.indexOf('\r\n\r\n');
      if (i < 0) return;
      const line = header.slice(0, header.indexOf('\r\n'));
      const m = /^CONNECT (\S+) /.exec(line);
      const hostPort = m ? m[1] : '';
      connects.push(hostPort);
      if (hostPort.startsWith('fail.test')) {
        client.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        client.destroy();
        return;
      }
      // Tunnel to the real target (ignore the requested host — it's a stand-in).
      upstream = net.connect(targetPort, '127.0.0.1', () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        tunneling = true;
        const leftover = header.slice(i + 4);
        if (leftover) upstream.write(Buffer.from(leftover, 'latin1'));
        upstream.on('data', (d) => client.write(d));
        upstream.on('close', () => client.destroy());
      });
      upstream.on('error', () => client.destroy());
    });
    client.on('error', () => { if (upstream) upstream.destroy(); });
  });
  server.listen(8011, '127.0.0.1');
  return server;
}

// GET via the connect-agent. Resolves {status, body} or rejects on socket error.
function getVia(host, p = '/') {
  return new Promise((resolve, reject) => {
    const r = http.request({ host, port: targetPort, path: p, agent: httpAgent }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    r.on('error', reject);
    r.end();
  });
}

before(async () => {
  target = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(`target saw host=${req.headers.host} path=${req.url}`);
  });
  target.listen(0, '127.0.0.1');
  await listening(target);
  targetPort = target.address().port;

  fakeProxy = startFakeProxy();
  await listening(fakeProxy);
});

after(() => {
  httpAgent.destroy();          // close kept-alive sockets so the runner exits
  fakeProxy?.close();
  target?.close();
});

test('an external host is tunnelled through the CONNECT proxy', async () => {
  const before = connects.length;
  const r = await getVia('example.test', '/page');
  assert.equal(r.status, 200);
  assert.match(r.body, /path=\/page/);
  assert.equal(connects.length, before + 1, 'one CONNECT reached the proxy');
  assert.match(connects[connects.length - 1], new RegExp(`^example\\.test:${targetPort}$`));
});

test('a loopback host connects directly, bypassing the proxy', async () => {
  const before = connects.length;
  const r = await getVia('127.0.0.1', '/direct');
  assert.equal(r.status, 200);
  assert.match(r.body, /path=\/direct/);
  assert.equal(connects.length, before, 'proxy saw no CONNECT for the loopback host');
});

test('localhost is treated as direct (not tunnelled)', async () => {
  const before = connects.length;
  // 'localhost' resolves to 127.0.0.1 here; isDirect short-circuits it as direct.
  const r = await getVia('localhost', '/lh');
  assert.equal(r.status, 200);
  assert.equal(connects.length, before, 'no CONNECT for localhost');
});

test('a private-range host connects directly', async () => {
  // We can't actually reach 192.168.x in the test, but we can assert the agent
  // classifies it as direct: it must NOT emit a CONNECT to the proxy. The direct
  // socket attempt then fails fast (nothing listening), which is the expected
  // proof it bypassed the tunnel.
  const before = connects.length;
  await assert.rejects(
    () => new Promise((resolve, reject) => {
      const r = http.request(
        { host: '192.168.244.244', port: 9, path: '/', agent: httpAgent, timeout: 1500 },
        (res) => { res.resume(); res.on('end', resolve); });
      r.on('timeout', () => r.destroy(new Error('timeout')));
      r.on('error', reject);
      r.end();
    }),
  );
  assert.equal(connects.length, before, 'private host produced no CONNECT');
});

test('a failed CONNECT surfaces as a request error', async () => {
  await assert.rejects(() => getVia('fail.test', '/x'), /proxy CONNECT failed/);
});
