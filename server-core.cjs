'use strict';

// Shared server primitives for dk's single-origin front (router) and CORS proxy.
// Used by BOTH the desktop CJS servers (router/index.cjs, proxy/index.cjs) and the
// in-process mobile variants (mobile/nodejs-src/{router,proxy}.js). The mobile
// bundle is assembled flat, so mobile/nodejs-src/server-core.cjs is a symlink back
// to this file and mobile requires it as './server-core.cjs' (prepare-node-project.sh
// copies the real file into the bundle). One copy = no drift (they had drifted on
// the MIME map). Pure — only node:http / node:fs / node:path — so it runs unchanged
// on nodejs-mobile (whose undici fetch is non-functional).

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// ── engine vs pod routing ─────────────────────────────────────────────────────
// Path prefixes whose files are ENGINE (shipped, read-only) — served from the
// executable dir, never the pod. Everything else is pod data via CSS.
const ENGINE_PREFIXES = ['/node_modules/', '/dist/', '/src/', '/assets/'];
// Plugin dist is engine; the rest of a plugin (config/assets) is pod-editable.
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

// Serve an ENGINE file from engineDir, refusing any path that escapes it
// (traversal). no-store so a reload always reflects the file on disk.
function serveEngine(req, res, pathname, engineDir) {
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

// Reverse-proxy a request to the pivot CSS on loopback:cssPort (the pod root).
function proxyToCss(req, res, cssPort) {
  const up = http.request(
    { host: '127.0.0.1', port: cssPort, method: req.method, path: req.url, headers: req.headers },
    (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); },
  );
  up.on('error', (e) => { res.writeHead(502); res.end(`pod server unreachable: ${e.message}`); });
  req.pipe(up);
}

// Forward a websocket upgrade to CSS (pod change notifications).
function forwardUpgrade(req, socket, head, cssPort) {
  const up = http.request({ host: '127.0.0.1', port: cssPort, method: req.method, path: req.url, headers: req.headers });
  up.on('upgrade', (r, upSocket, upHead) => {
    socket.write(`HTTP/1.1 101 ${r.statusMessage}\r\n`
      + Object.entries(r.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n');
    if (upHead && upHead.length) upSocket.unshift(upHead);
    upSocket.pipe(socket).pipe(upSocket);
  });
  up.on('error', () => socket.destroy());
  up.end();
}

// ── CORS proxy SSRF guard ─────────────────────────────────────────────────────
// The gate limits WHO may call the proxy; this limits WHAT it may fetch. A pod doc
// or feed the app reads is attacker-influenceable, so the proxy must not become a
// confused deputy against loopback / private / cloud-metadata addresses. Checked at
// every redirect hop. Residual: a hostname that DNS-resolves to a private IP
// (rebinding) is not caught here.
function isBlockedHost(host) {
  const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h || h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '::1' || h === '::' || h === '0.0.0.0') return true;
  if (h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true; // v6 link-local / ULA
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true;            // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16/12
    if (a === 192 && b === 168) return true;            // 192.168/16
    if (a === 100 && b >= 64 && b <= 127) return true;  // CGNAT 100.64/10
  }
  return false;
}

// Opt-in escape hatch: a Set of hostnames (from DK_PROXY_ALLOW_HOSTS) that bypass
// isBlockedHost, for a deployment that legitimately proxies a known internal host.
function makeAllowHosts(envVal) {
  return new Set(String(envVal || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

// Validate a proxy target; throws an Error with `.blocked = true` if refused.
function assertProxyTarget(uri, allowHosts) {
  let u;
  try { u = new URL(uri); } catch { const e = new Error('invalid url'); e.blocked = true; throw e; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') { const e = new Error('scheme not allowed'); e.blocked = true; throw e; }
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!(allowHosts && allowHosts.has(host)) && isBlockedHost(u.hostname)) { const e = new Error('host not allowed'); e.blocked = true; throw e; }
  return u;
}

module.exports = {
  ENGINE_PREFIXES, ENGINE_PLUGIN, isEnginePath, MIME,
  serveEngine, proxyToCss, forwardUpgrade,
  isBlockedHost, makeAllowHosts, assertProxyTarget,
};
