'use strict';

// CORS proxy (in-process variant of the desktop proxy/index.cjs). Fetches an
// external resource server-side and returns it with permissive CORS so the app
// can read cross-origin content the WebView would otherwise block.
//
// Uses Node's core http/https (NOT global fetch): nodejs-mobile's undici fetch
// is non-functional in this build ("TypeError: fetch failed" even for
// localhost), whereas the core modules work. No gate token on mobile: the
// servers are loopback-bound inside the app sandbox. Binds 127.0.0.1 via
// main.js's listen() shim (call listen(port) with no host).

const http = require('node:http');
const https = require('node:https');

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,OPTIONS',
  'access-control-allow-headers': '*',
};

// GET a URL, following up to `max` redirects. Calls cb(err, {status, type, buf}).
function fetchUpstream(uri, cb, max = 5) {
  let target;
  try { target = new URL(uri); } catch (e) { return cb(e); }
  const mod = target.protocol === 'https:' ? https : http;
  const req = mod.get(target, (res) => {
    const { statusCode = 0, headers } = res;
    if (statusCode >= 300 && statusCode < 400 && headers.location && max > 0) {
      res.resume();
      return fetchUpstream(new URL(headers.location, target).href, cb, max - 1);
    }
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => cb(null, { status: statusCode || 200, type: headers['content-type'] || '', buf: Buffer.concat(chunks) }));
  });
  req.on('error', cb);
  req.setTimeout(15000, () => req.destroy(new Error('upstream timeout')));
}

function start(port, log) {
  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname !== '/proxy') { res.writeHead(404, CORS); return res.end('not found'); }
    const uri = url.searchParams.get('uri') || url.searchParams.get('url');
    if (!uri) { res.writeHead(400, CORS); return res.end('missing uri'); }
    fetchUpstream(uri, (err, result) => {
      if (err) { res.writeHead(502, CORS); return res.end('proxy fetch failed: ' + err.message); }
      res.writeHead(result.status, { ...CORS, ...(result.type ? { 'content-type': result.type } : {}) });
      res.end(result.buf);
    });
  });
  server.listen(port, () => log('CORS proxy on http://127.0.0.1:' + port + '/proxy'));
  return server;
}

module.exports = { start };
