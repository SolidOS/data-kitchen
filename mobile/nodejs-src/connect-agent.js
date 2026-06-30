'use strict';

// Route node's OUTBOUND http/https through the Dart loopback forward proxy
// (forward_proxy.dart on 127.0.0.1:8011). nodejs-mobile's own sockets don't
// route to the internet on this device, but Dart's do — so we open a CONNECT
// tunnel to the Dart proxy (loopback, which works) and let Dart reach the target.
//
// Loopback / private hosts bypass the proxy and connect directly, so in-process
// server-to-server traffic (CSS:8010 <-> router:8000 <-> proxy:8001) is untouched.
//
// Installed as http.globalAgent / https.globalAgent in main.js, so CSS's
// node-fetch/http AND the CORS proxy both route through it with no other changes.

const net = require('node:net');
const tls = require('node:tls');
const http = require('node:http');
const https = require('node:https');

const PROXY_HOST = '127.0.0.1';
const PROXY_PORT = 8011;

// Hosts that must NOT go through the proxy (the app's own loopback servers and
// any private-range address). Everything else is "external" → tunnelled.
function isDirect(host) {
  if (!host) return true;
  const h = String(host).toLowerCase();
  if (h === 'localhost' || h === '::1' || h === '0.0.0.0') return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h) || /^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

// Open a CONNECT tunnel to host:port through the Dart proxy. cb(err, socket).
function openTunnel(host, port, cb) {
  const sock = net.connect(PROXY_PORT, PROXY_HOST);
  let buf = '';
  let done = false;
  const finish = (err, result) => { if (done) return; done = true; cb(err, result); };
  sock.once('error', (e) => finish(e));
  sock.on('connect', () => {
    sock.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n\r\n`);
  });
  const onData = (chunk) => {
    buf += chunk.toString('latin1');
    const i = buf.indexOf('\r\n\r\n');
    if (i < 0) { if (buf.length > 16384) { sock.destroy(); finish(new Error('proxy header too large')); } return; }
    sock.removeListener('data', onData);
    const statusLine = buf.slice(0, buf.indexOf('\r\n'));
    if (!/ 200 /.test(statusLine)) { sock.destroy(); return finish(new Error('proxy CONNECT failed: ' + statusLine)); }
    const leftover = Buffer.from(buf.slice(i + 4), 'latin1');
    if (leftover.length) sock.unshift(leftover);
    finish(null, sock);
  };
  sock.on('data', onData);
}

class HttpConnectAgent extends http.Agent {
  createConnection(options, callback) {
    const host = options.host;
    if (isDirect(host)) return net.createConnection(options); // direct (sync)
    openTunnel(host, options.port || 80, (err, socket) => {
      if (err) return callback(err);
      callback(null, socket); // plain HTTP flows through the tunnel
    });
  }
}

class HttpsConnectAgent extends https.Agent {
  createConnection(options, callback) {
    const host = options.host;
    if (isDirect(host)) {
      // Direct TLS (loopback CSS doesn't use https, but be correct anyway).
      return tls.connect(options);
    }
    openTunnel(host, options.port || 443, (err, raw) => {
      if (err) return callback(err);
      const secure = tls.connect({
        socket: raw,
        servername: options.servername || (net.isIP(host) ? undefined : host),
        rejectUnauthorized: options.rejectUnauthorized,
        ALPNProtocols: options.ALPNProtocols,
      });
      secure.once('error', (e) => callback(e));
      callback(null, secure);
    });
  }
}

module.exports = {
  httpAgent: new HttpConnectAgent({ keepAlive: true }),
  httpsAgent: new HttpsConnectAgent({ keepAlive: true }),
};
