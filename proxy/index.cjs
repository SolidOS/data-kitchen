// CORS proxy for the Electron home build. Fetches an external resource
// server-side and returns it with permissive CORS, so the app can read
// cross-origin content the browser would otherwise block.
//
// Dependency-free: Node's built-in http server + the global fetch (Node 18+),
// no express/cors — so it runs with a plain `node index.js`, no install.
// Started/stopped with the app (see ../electron-config/servers.cjs).

const http = require('node:http');
const { makeGate } = require('../electron-config/gate.cjs');
// SSRF guard shared with the mobile proxy (server-core.cjs). The gate limits WHO
// may call the proxy; this limits WHAT it may fetch (no loopback/private/metadata,
// http(s) only), re-checked at every redirect hop. Opt-in DK_PROXY_ALLOW_HOSTS
// bypasses the block for a named internal host.
const { assertProxyTarget, makeAllowHosts } = require('../server-core.cjs');
const ALLOW_HOSTS = makeAllowHosts(process.env.DK_PROXY_ALLOW_HOSTS);

// A remote host must not be able to hold a socket open or hand back an
// unbounded body: this proxy buffers what it fetches.
const TIMEOUT_MS = 30_000;
const MAX_BYTES = 25 * 1024 * 1024;

// Read a response body, giving up past the cap rather than buffering whatever
// arrives.
async function readCapped(response, max = MAX_BYTES) {
  if (!response.body) return Buffer.alloc(0);
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) {
    const e = new Error('response too large');
    e.tooLarge = true;
    throw e;
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > max) {
      const e = new Error('response too large');
      e.tooLarge = true;
      throw e;
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// fetch() that follows redirects manually so every hop is re-validated.
async function fetchGuarded(uri, max = 5) {
  let url = uri;
  for (let hop = 0; hop <= max; hop++) {
    assertProxyTarget(url, ALLOW_HOSTS);
    const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
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
    const buf = await readCapped(response);
    res.writeHead(response.status || 200, {
      ...CORS,
      ...(type ? { 'content-type': type } : {}),
      // The body is what the app asked for; it must never become a live
      // document on this origin. Cookies are not port-scoped, so a page
      // rendered here would sit alongside the app's own localhost cookies.
      'x-content-type-options': 'nosniff',
      ...(/^text\/html\b|^application\/xhtml\+xml\b/i.test(type)
        ? { 'content-security-policy': 'sandbox', 'content-disposition': 'attachment' }
        : {}),
    });
    return res.end(buf);
  } catch (error) {
    console.log(error);
    const status = error && error.blocked ? 403 : (error && error.tooLarge ? 502 : 500);
    res.writeHead(status, { ...CORS, 'content-type': 'text/plain; charset=utf-8' });
    // The detail is in the log; the caller gets the shape of the failure only.
    res.end(status === 403 ? 'blocked' : (status === 502 ? 'upstream response rejected' : 'proxy error'));
  }
});

// Loopback only — the proxy is for this machine's app, never the LAN.
server.listen(port, '127.0.0.1', () => console.log(`Proxy listening on port ${port}`));
