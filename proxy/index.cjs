// CORS proxy for the Electron home build. Fetches an external resource
// server-side and returns it with permissive CORS, so the app can read
// cross-origin content the browser would otherwise block.
//
// Dependency-free: Node's built-in http server + the global fetch (Node 18+),
// no express/cors — so it runs with a plain `node index.js`, no install.
// Started/stopped with the app (see ../electron-config/servers.cjs).

const http = require('node:http');
const { makeGate } = require('../electron-config/gate.cjs');

// ─── SSRF guard ───────────────────────────────────────────────────────────────
// The gate limits WHO may call the proxy; this limits WHAT it may fetch. A pod
// doc or feed the app reads is attacker-influenceable, so the proxy must not be
// turned into a confused deputy against loopback / private / cloud-metadata
// addresses. Only http/https to a non-private host is allowed. NOTE: this checks
// the literal host at each redirect hop; a hostname that DNS-resolves to a
// private IP (rebinding) is a known residual, to be closed when this moves into
// the shared router/proxy core (plan item C1).
function isBlockedHost(host) {
  const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h || h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '::1' || h === '::' || h === '0.0.0.0') return true;
  if (h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true; // v6 link-local / ULA
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true;            // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16/12
    if (a === 192 && b === 168) return true;            // 192.168/16
    if (a === 100 && b >= 64 && b <= 127) return true;  // CGNAT 100.64/10
  }
  return false;
}

// Opt-in escape hatch: hostnames listed in DK_PROXY_ALLOW_HOSTS (comma-separated)
// bypass isBlockedHost, for a deployment that legitimately proxies a known
// internal service. Empty by default, so loopback/private stay blocked.
const ALLOW_HOSTS = new Set(
  (process.env.DK_PROXY_ALLOW_HOSTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
);

function assertProxyTarget(uri) {
  let u;
  try { u = new URL(uri); } catch { throw new Error('invalid url'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('scheme not allowed');
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!ALLOW_HOSTS.has(host) && isBlockedHost(u.hostname)) throw new Error('host not allowed');
  return u;
}

// fetch() that follows redirects manually so every hop is re-validated.
async function fetchGuarded(uri, max = 5) {
  let url = uri;
  for (let hop = 0; hop <= max; hop++) {
    assertProxyTarget(url);
    const r = await fetch(url, { redirect: 'manual' });
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get('location');
      if (loc) { url = new URL(loc, url).href; continue; }
    }
    return r;
  }
  throw new Error('too many redirects');
}

const port = Number(process.env.DK_PROXY_PORT) || 8001;
const appPort = Number(process.env.DK_PUBLIC_PORT) || 8000;

// Token gate (see gate.cjs); no-op when DK_GATE_TOKEN is absent (standalone dev).
// The app's own origin is allowed by Origin/Referer too: app pages in a blessed
// browser call the proxy with plain fetch(), which doesn't attach cookies
// cross-port — and a hostile page can't forge its Origin.
const gate = makeGate(process.env.DK_GATE_TOKEN, {
  allowOrigins: [`http://localhost:${appPort}`, `http://127.0.0.1:${appPort}`],
});

// Permissive CORS on every response (replaces the express `cors()` middleware).
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,OPTIONS',
  'access-control-allow-headers': '*',
};

const server = http.createServer(async (req, res) => {
  if (gate(req, res)) return;
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }

  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname !== '/proxy') { res.writeHead(404, CORS); return res.end('not found'); }

  const uri = url.searchParams.get('uri') || url.searchParams.get('url');
  if (!uri) { res.writeHead(400, CORS); return res.end('missing uri'); }
  console.log('fetching ', uri);

  try {
    const response = await fetchGuarded(uri);
    const type = response.headers.get('content-type') || '';

    // Everything (HTML included) is returned verbatim with permissive CORS.
    // The proxy no longer rewrites HTML: feed articles are shown in a native
    // view that loads the live page directly, so there is no in-iframe framing
    // problem to work around. The proxy's remaining job is letting the app READ
    // cross-origin feed XML / RDF / images the browser would otherwise block.
    const buf = Buffer.from(await response.arrayBuffer());
    res.writeHead(response.status || 200, { ...CORS, ...(type ? { 'content-type': type } : {}) });
    return res.end(buf);
  } catch (error) {
    console.log(error);
    const blocked = /not allowed|invalid url/.test(error && error.message);
    res.writeHead(blocked ? 403 : 500, CORS);
    res.end(String(error));
  }
});

// Loopback only — the proxy is for this machine's app, never the LAN.
server.listen(port, '127.0.0.1', () => console.log(`Proxy listening on port ${port}`));
