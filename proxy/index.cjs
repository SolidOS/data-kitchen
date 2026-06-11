// CORS proxy for the Electron home build. Fetches an external resource
// server-side and returns it with permissive CORS, so the app can read
// cross-origin content the browser would otherwise block.
//
// Dependency-free: Node's built-in http server + the global fetch (Node 18+),
// no express/cors — so it runs with a plain `node index.js`, no install.
// Started/stopped with the app (see ../electron-config/servers.cjs).

const http = require('node:http');
const { makeGate } = require('../electron-config/gate.cjs');

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
    const response = await fetch(uri);
    const type = response.headers.get('content-type') || '';

    if (type.includes('text/html')) {
      // A site that refuses framing (X-Frame-Options, or a restrictive CSP
      // frame-ancestors) re-routes its client app on this proxy URL and
      // renders its own 404 inside the in-pane reader iframe. For those we
      // strip the page's scripts so the server-rendered article survives;
      // framing-friendly pages keep their JS intact.
      const xfo = (response.headers.get('x-frame-options') || '').toLowerCase();
      const csp = (response.headers.get('content-security-policy') || '').toLowerCase();
      const fa = (csp.match(/frame-ancestors([^;]*)/) || [, ''])[1];
      const refusesFraming =
        xfo.includes('deny') || xfo.includes('sameorigin') || (fa && !fa.includes('*'));

      // Inject <base> so the article's relative assets (css/img) resolve
      // against its real origin when shown in the in-pane reader iframe.
      let html = await response.text();
      const base = `<base href="${uri}">`;
      html = /<head[^>]*>/i.test(html) ? html.replace(/<head([^>]*)>/i, `<head$1>${base}`) : base + html;

      if (refusesFraming) {
        html = html
          .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')   // inline + external
          .replace(/<script\b[^>]*\/>/gi, '');                  // self-closing
        console.log('  refuses framing → stripped scripts');
      }
      res.writeHead(200, { ...CORS, 'content-type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    const buf = Buffer.from(await response.arrayBuffer());
    res.writeHead(response.status || 200, { ...CORS, ...(type ? { 'content-type': type } : {}) });
    return res.end(buf);
  } catch (error) {
    console.log(error);
    res.writeHead(500, CORS);
    res.end(String(error));
  }
});

// Loopback only — the proxy is for this machine's app, never the LAN.
server.listen(port, '127.0.0.1', () => console.log(`Proxy listening on port ${port}`));
