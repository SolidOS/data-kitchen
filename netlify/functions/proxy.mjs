// CORS proxy for the Netlify build — the same GET /proxy?uri=<target>
// contract as the desktop proxy (proxy/index.cjs), served as a Netlify
// Function at /proxy (the `config.path` below).
//
// SAME-ORIGIN CALLERS ONLY: the gate admits requests the deployed app's own
// pages make — judged by Sec-Fetch-Site, then Origin, then Referer, against
// the request's own origin — and turns everything else away with a 403. This
// is not an open proxy. Same-origin responses need no CORS headers, so none
// are sent; even a request that slipped the gate cross-origin would be
// unreadable to its page.
//
// The SSRF guard is shared verbatim with the desktop and mobile proxies
// (server-core.cjs): http(s) only, no loopback/private/metadata targets,
// re-checked at every redirect hop.
//
// Caps sit inside Netlify's synchronous-Function budget (~6MB response,
// 10s): real payloads through this proxy are feed XML and calendar ICS.

import { assertProxyTarget, makeAllowHosts } from '../../server-core.cjs';

const ALLOW_HOSTS = makeAllowHosts(process.env.DK_PROXY_ALLOW_HOSTS);
const TIMEOUT_MS = 8_000;
const MAX_BYTES = 5 * 1024 * 1024;

// Only the deployed app's own pages may call. Sec-Fetch-Site is the browser's
// own verdict and is checked first; Origin / Referer cover browsers that omit
// it. A request carrying none of the three is refused.
export function sameOriginCaller(req) {
  const self = new URL(req.url).origin;
  const sfs = req.headers.get('sec-fetch-site');
  if (sfs) return sfs === 'same-origin';
  const origin = req.headers.get('origin');
  if (origin) return origin === self;
  const referer = req.headers.get('referer');
  if (referer) {
    try { return new URL(referer).origin === self; } catch { return false; }
  }
  return false;
}

// Read an upstream body, giving up past the cap rather than buffering
// whatever arrives.
async function readCapped(response, max = MAX_BYTES) {
  if (!response.body) return new Uint8Array(0);
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
    chunks.push(chunk);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
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

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (req.method !== 'GET') return new Response('method not allowed', { status: 405 });
  if (!sameOriginCaller(req)) return new Response('forbidden', { status: 403 });

  const params = new URL(req.url).searchParams;
  const uri = params.get('uri') || params.get('url');
  if (!uri) return new Response('missing uri', { status: 400 });

  try {
    const upstream = await fetchGuarded(uri);
    const type = upstream.headers.get('content-type') || '';
    const buf = await readCapped(upstream);
    const status = upstream.status || 200;
    return new Response([204, 304].includes(status) ? null : buf, {
      status,
      headers: {
        ...(type ? { 'content-type': type } : {}),
        // The body is what the app asked for; it must never become a live
        // document on this origin.
        'x-content-type-options': 'nosniff',
        ...(/^text\/html\b|^application\/xhtml\+xml\b/i.test(type)
          ? { 'content-security-policy': 'sandbox', 'content-disposition': 'attachment' }
          : {}),
      },
    });
  } catch (error) {
    console.log('[proxy]', error?.message || error);
    const status = error?.blocked ? 403 : (error?.tooLarge ? 502 : 500);
    // The detail is in the log; the caller gets the shape of the failure only.
    const body = status === 403 ? 'blocked'
      : (status === 502 ? 'upstream response rejected' : 'proxy error');
    return new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
};

export const config = { path: '/proxy' };
