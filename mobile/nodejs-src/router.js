'use strict';

// dk single-origin routing front (in-process variant of router/index.cjs).
//
// dk's renderer loads the editable app DEFINITION (index.html + dk-pod/dk/…)
// from the writable pod (CSS) and the read-only ENGINE (sol-components,
// component-interop, dk's bundle, plugin dist, assets) from a shipped dir, and
// references the engine by plain relative paths — so both must appear under ONE
// origin. This server is that origin (:8000): engine path prefixes are served
// from engineDir; everything else is reverse-proxied to CSS (the pod).
//
// No gate on mobile (loopback, in-app sandbox). Binds 127.0.0.1 via main.js's
// listen() shim (call listen(port) with no host).

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ENGINE_PREFIXES = ['/node_modules/', '/dist/', '/src/', '/assets/'];
const ENGINE_PLUGIN = /^\/plugins\/[^/]+\/dist\//;

function isEnginePath(p) {
  return ENGINE_PREFIXES.some((pre) => p.startsWith(pre)) || ENGINE_PLUGIN.test(p);
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.cjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.map': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.wasm': 'application/wasm', '.ttl': 'text/turtle', '.txt': 'text/plain',
  '.shacl': 'text/turtle', '.jsonld': 'application/ld+json',
};

function start(publicPort, cssPort, engineDir, log) {
  function serveEngine(req, res, pathname) {
    const rel = decodeURIComponent(pathname).replace(/^\/+/, '');
    const full = path.resolve(engineDir, rel);
    if (full !== engineDir && !full.startsWith(engineDir + path.sep)) {
      res.writeHead(403); return res.end('forbidden');
    }
    fs.stat(full, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, {
        'content-type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(full).pipe(res);
    });
  }

  function proxyToCss(req, res) {
    const up = http.request(
      { host: '127.0.0.1', port: cssPort, method: req.method, path: req.url, headers: req.headers },
      (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); },
    );
    up.on('error', (e) => { res.writeHead(502); res.end(`pod server unreachable: ${e.message}`); });
    req.pipe(up);
  }

  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if ((req.method === 'GET' || req.method === 'HEAD') && isEnginePath(pathname)) {
      return serveEngine(req, res, pathname);
    }
    proxyToCss(req, res);
  });

  // CSS uses websockets for change notifications; forward upgrades to the pod.
  server.on('upgrade', (req, socket, head) => {
    const up = http.request({ host: '127.0.0.1', port: cssPort, method: req.method, path: req.url, headers: req.headers });
    up.on('upgrade', (r, upSocket, upHead) => {
      socket.write(`HTTP/1.1 101 ${r.statusMessage}\r\n` +
        Object.entries(r.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n');
      if (upHead && upHead.length) upSocket.unshift(upHead);
      upSocket.pipe(socket).pipe(upSocket);
    });
    up.on('error', () => socket.destroy());
    up.end();
  });

  server.listen(publicPort, () =>
    log('router on http://127.0.0.1:' + publicPort + '/ — engine ' + engineDir + ', pod via :' + cssPort));
  return server;
}

module.exports = { start };
