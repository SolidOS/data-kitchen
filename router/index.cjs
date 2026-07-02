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
const path = require('node:path');
const crypto = require('node:crypto');
const { makeGate } = require('../electron-config/gate.cjs');
// Engine/pod routing primitives shared with the mobile router (server-core.cjs).
const { isEnginePath, serveEngine, proxyToCss, forwardUpgrade } = require('../server-core.cjs');

const publicPort = Number(process.env.DK_PUBLIC_PORT) || 8000;
const cssPort = Number(process.env.DK_CSS_INTERNAL_PORT) || 8010;
const engineDir = path.resolve(process.env.DK_ENGINE_DIR || path.join(__dirname, '..'));

const gate = makeGate(process.env.DK_GATE_TOKEN, {
  allowOrigins: [`http://localhost:${publicPort}`, `http://127.0.0.1:${publicPort}`],
});

// ─── Content-Security-Policy for the APP SHELL only (/ and /index.html) ─────────
// NOT applied to iframe sub-documents (the SolidOS/mashlib host, the reader
// chrome), which run their own looser policies. The shell's own <script>s carry a
// fresh per-response NONCE (stamped in below), and component-interop propagates
// that nonce to the importmap it injects — so every legit script runs, while any
// <script> written into a pod doc (the `sol-include … trusted` injection) has no
// nonce and is BLOCKED. That is the whole point: it backstops pod-HTML injection.
// Allowances: script-src https://esm.sh (sol-pod-ops dynamic-imports marked@9);
// style-src 'unsafe-inline' (web components inject styles); img/connect/frame open
// enough for live favicons, feed images, the CORS proxy + CSS websocket on sibling
// ports, and external API reads. Add 'wasm-unsafe-eval' to script-src only if a
// dependency proves to need it.
function shellCsp(nonce) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://esm.sh`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https: http:",
    "font-src 'self' data:",
    "connect-src 'self' https: http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*",
    "frame-src 'self' https: http:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ');
}

function isAppShell(pathname) {
  return pathname === '/' || pathname === '/index.html';
}

// Serve the app shell: buffer the pod's index.html, stamp a fresh per-response
// nonce onto every <script> tag, and return it with a matching nonce-based CSP.
// (accept-encoding is dropped upstream so the body is plaintext to rewrite.)
function serveShell(req, res) {
  const nonce = crypto.randomBytes(16).toString('base64');
  const headers = { ...req.headers };
  delete headers['accept-encoding'];
  const up = http.request(
    { host: '127.0.0.1', port: cssPort, method: req.method, path: req.url, headers },
    (r) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => {
        let body = Buffer.concat(chunks);
        const outHeaders = { ...r.headers };
        delete outHeaders['content-encoding'];
        if (/text\/html/i.test(String(outHeaders['content-type'] || ''))) {
          const html = body.toString('utf8').replace(/<script(?=[\s>])/gi, `<script nonce="${nonce}"`);
          body = Buffer.from(html, 'utf8');
          outHeaders['content-security-policy'] = shellCsp(nonce);
        }
        outHeaders['content-length'] = Buffer.byteLength(body);
        res.writeHead(r.statusCode, outHeaders);
        if (req.method === 'HEAD') return res.end();
        res.end(body);
      });
    },
  );
  up.on('error', (e) => { res.writeHead(502); res.end(`pod server unreachable: ${e.message}`); });
  req.pipe(up);
}

const server = http.createServer((req, res) => {
  if (gate(req, res)) return;
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if ((req.method === 'GET' || req.method === 'HEAD') && isEnginePath(pathname)) {
    return serveEngine(req, res, pathname, engineDir);
  }
  // The app shell (pod-served) gets a per-response nonce + nonce-based CSP.
  if ((req.method === 'GET' || req.method === 'HEAD') && isAppShell(pathname)) {
    return serveShell(req, res);
  }
  proxyToCss(req, res, cssPort);
});

// CSS uses websockets for change notifications; forward upgrades to the pod
// (gated first — an un-blessed upgrade is dropped).
server.on('upgrade', (req, socket, head) => {
  if (!gate.upgradeOk(req)) return socket.destroy();
  forwardUpgrade(req, socket, head, cssPort);
});

server.listen(publicPort, '127.0.0.1', () =>
  console.log(`router listening on http://localhost:${publicPort}/ — engine from ${engineDir}, pod via :${cssPort}`));
