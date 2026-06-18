// dk single-origin routing front server.
//
// dk is a self-hosting, user-redesignable app: the editable app DEFINITION (the
// HTML shells, RDF config, favourites, content) lives in the user's writable pod
// root, while the read-only ENGINE (component libraries, vendor bundles, compiled
// plugin dist, dk's own bundle) ships inside the executable. The definition files
// reference the engine by plain relative paths (e.g. node_modules/…, dist/…), so
// both must appear under ONE origin for those paths to resolve.
//
// This server is that single origin (default :8000). It routes per request:
//   - engine path prefixes  -> served statically from the executable dir (read-only)
//   - everything else        -> reverse-proxied to the pivot CSS (the pod root),
//                               which listens on an internal loopback port
// CSS keeps Solid semantics (LDP/PATCH/POST) on the pod; the engine is plain files.
//
// Loopback-bound and gated (see ../electron-config/gate.cjs) like the other dk
// servers. Standalone (no DK_GATE_TOKEN) it runs open, for dev.

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { makeGate } = require('../electron-config/gate.cjs');

const publicPort = Number(process.env.DK_PUBLIC_PORT) || 8000;
const cssPort = Number(process.env.DK_CSS_INTERNAL_PORT) || 8010;
const engineDir = path.resolve(process.env.DK_ENGINE_DIR || path.join(__dirname, '..'));

// Path prefixes whose files are ENGINE (shipped, read-only) — served from the
// executable dir, never the pod. Everything else is pod data via CSS.
const ENGINE_PREFIXES = ['/node_modules/', '/dist/', '/src/', '/assets/'];
// Plugin dist is engine; the rest of a plugin (config/assets) is pod-editable.
const ENGINE_PLUGIN = /^\/plugins\/[^/]+\/dist\//;

function isEnginePath(p) {
  return ENGINE_PREFIXES.some((pre) => p.startsWith(pre)) || ENGINE_PLUGIN.test(p);
}

const gate = makeGate(process.env.DK_GATE_TOKEN, {
  allowOrigins: [`http://localhost:${publicPort}`, `http://127.0.0.1:${publicPort}`],
});

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.cjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.map': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.wasm': 'application/wasm', '.ttl': 'text/turtle', '.txt': 'text/plain',
};

function serveEngine(req, res, pathname) {
  // Resolve under engineDir and refuse anything that escapes it (traversal).
  const rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  const full = path.resolve(engineDir, rel);
  if (full !== engineDir && !full.startsWith(engineDir + path.sep)) {
    res.writeHead(403); return res.end('forbidden');
  }
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
    // Dev/app server: never let the renderer serve a stale engine asset. The
    // editable surface (incl. the symlinked sol-components sources) must reflect
    // the file on disk on every load, so a restart picks up source edits.
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
  if (gate(req, res)) return;
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if ((req.method === 'GET' || req.method === 'HEAD') && isEnginePath(pathname)) {
    return serveEngine(req, res, pathname);
  }
  proxyToCss(req, res);
});

// CSS uses websockets for change notifications; forward upgrades to the pod.
server.on('upgrade', (req, socket, head) => {
  if (!gate.upgradeOk(req)) return socket.destroy();
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

server.listen(publicPort, '127.0.0.1', () =>
  console.log(`router listening on http://localhost:${publicPort}/ — engine from ${engineDir}, pod via :${cssPort}`));
