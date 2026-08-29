// Contract tests for the Netlify /proxy Function (netlify/functions/proxy.mjs)
// — the same-origin caller gate, the shared SSRF guard, and the response
// shape. The handler is invoked directly with Request objects; upstream
// fetches are stubbed, and the SSRF cases assert no upstream fetch happens.

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../netlify/functions/proxy.mjs';

const SELF = 'https://dk.example';
const proxyReq = (target, { method = 'GET', headers = {} } = {}) =>
  new Request(`${SELF}/proxy${target === undefined ? '' : `?uri=${encodeURIComponent(target)}`}`,
    { method, headers });
const sameOrigin = { 'sec-fetch-site': 'same-origin' };

const realFetch = globalThis.fetch;
let fetchCalls;
beforeEach(() => {
  fetchCalls = [];
  globalThis.fetch = async () => { throw new Error('unexpected upstream fetch'); };
});
afterEach(() => { globalThis.fetch = realFetch; });

const stubUpstream = (body, { status = 200, headers = {} } = {}) => {
  globalThis.fetch = async (url) => {
    fetchCalls.push(String(url));
    return new Response(body, { status, headers });
  };
};

test('OPTIONS answers 204', async () => {
  const res = await handler(proxyReq('https://feeds.example/rss', { method: 'OPTIONS' }));
  assert.equal(res.status, 204);
});

test('non-GET is refused 405', async () => {
  const res = await handler(proxyReq('https://feeds.example/rss', { method: 'POST', headers: sameOrigin }));
  assert.equal(res.status, 405);
});

test('caller gate: no Origin/Referer/Sec-Fetch-Site → 403, no upstream fetch', async () => {
  const res = await handler(proxyReq('https://feeds.example/rss'));
  assert.equal(res.status, 403);
});

test('caller gate: cross-origin Origin → 403', async () => {
  const res = await handler(proxyReq('https://feeds.example/rss',
    { headers: { origin: 'https://evil.example' } }));
  assert.equal(res.status, 403);
});

test('caller gate: sec-fetch-site cross-site wins over a matching Origin', async () => {
  const res = await handler(proxyReq('https://feeds.example/rss',
    { headers: { 'sec-fetch-site': 'cross-site', origin: SELF } }));
  assert.equal(res.status, 403);
});

test('caller gate: matching Origin admits', async () => {
  stubUpstream('<rss/>', { headers: { 'content-type': 'application/rss+xml' } });
  const res = await handler(proxyReq('https://feeds.example/rss', { headers: { origin: SELF } }));
  assert.equal(res.status, 200);
});

test('caller gate: same-origin Referer admits when Origin is absent', async () => {
  stubUpstream('<rss/>', { headers: { 'content-type': 'application/rss+xml' } });
  const res = await handler(proxyReq('https://feeds.example/rss',
    { headers: { referer: `${SELF}/index.html` } }));
  assert.equal(res.status, 200);
});

test('missing uri → 400', async () => {
  const res = await handler(proxyReq(undefined, { headers: sameOrigin }));
  assert.equal(res.status, 400);
});

for (const target of [
  'http://169.254.169.254/latest/meta-data/',
  'http://localhost:8000/dk-pod/',
  'http://10.0.0.7/internal',
  'file:///etc/passwd',
]) {
  test(`SSRF guard: ${target} → 403 blocked, no upstream fetch`, async () => {
    const res = await handler(proxyReq(target, { headers: sameOrigin }));
    assert.equal(res.status, 403);
    assert.equal(await res.text(), 'blocked');
  });
}

test('redirect hops are re-validated: bounce to a private host → 403', async () => {
  globalThis.fetch = async (url) => {
    fetchCalls.push(String(url));
    return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/secret' } });
  };
  const res = await handler(proxyReq('https://feeds.example/rss', { headers: sameOrigin }));
  assert.equal(res.status, 403);
  assert.equal(await res.text(), 'blocked');
  assert.equal(fetchCalls.length, 1);
});

test('happy path: body, upstream content-type, nosniff, and NO CORS header', async () => {
  stubUpstream('<rss>hi</rss>', { headers: { 'content-type': 'application/rss+xml' } });
  const res = await handler(proxyReq('https://feeds.example/rss', { headers: sameOrigin }));
  assert.equal(res.status, 200);
  assert.equal(await res.text(), '<rss>hi</rss>');
  assert.equal(res.headers.get('content-type'), 'application/rss+xml');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  assert.deepEqual(fetchCalls, ['https://feeds.example/rss']);
});

test('proxied HTML is defused: sandbox CSP + attachment', async () => {
  stubUpstream('<html></html>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
  const res = await handler(proxyReq('https://pages.example/a', { headers: sameOrigin }));
  assert.equal(res.headers.get('content-security-policy'), 'sandbox');
  assert.equal(res.headers.get('content-disposition'), 'attachment');
});

test('oversize declared content-length → 502 without buffering', async () => {
  stubUpstream('x', { headers: { 'content-length': String(50 * 1024 * 1024) } });
  const res = await handler(proxyReq('https://feeds.example/big', { headers: sameOrigin }));
  assert.equal(res.status, 502);
  assert.equal(await res.text(), 'upstream response rejected');
});
