// Unit tests for electron-config/gate.cjs — dk's real security boundary.
// Black-box: drive makeGate() through fake req/res. gate(req,res) returns
// `true` when it handled (blocked/redirected) the response, `false` to pass.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { makeReq, makeRes } from '../helpers/mock-http.mjs';

const require = createRequire(import.meta.url);
const { makeGate, blessNonce, validBless } = require('../../electron-config/gate.cjs');

const TOKEN = 'sekret-123';

test('no token configured → gate is off (everything passes)', () => {
  const gate = makeGate('');
  const res = makeRes();
  assert.equal(gate(makeReq({ url: '/dk-pod/private' }), res), false);
  assert.equal(res.ended, false);
});

test('valid token in x-dk-token header → passes', () => {
  const gate = makeGate(TOKEN);
  const res = makeRes();
  const req = makeReq({ url: '/dk-pod/private', headers: { 'x-dk-token': TOKEN } });
  assert.equal(gate(req, res), false);
  assert.equal(res.ended, false);
});

test('valid token in dk-token cookie → passes', () => {
  const gate = makeGate(TOKEN);
  const res = makeRes();
  const req = makeReq({ url: '/x', headers: { cookie: `other=1; dk-token=${TOKEN}; z=2` } });
  assert.equal(gate(req, res), false);
});

test('missing token → bare 401, no CORS', () => {
  const gate = makeGate(TOKEN);
  const res = makeRes();
  assert.equal(gate(makeReq({ url: '/dk-pod/private' }), res), true);
  assert.equal(res.statusCode, 401);
  assert.equal(res.ended, true);
  assert.equal(res.headers['access-control-allow-origin'], undefined);
});

test('wrong token → 401', () => {
  const gate = makeGate(TOKEN);
  const res = makeRes();
  const req = makeReq({ headers: { 'x-dk-token': 'nope' } });
  assert.equal(gate(req, res), true);
  assert.equal(res.statusCode, 401);
});

test('blessing flow: ?dk-token=<secret> sets a strict cookie and redirects without the param', () => {
  const gate = makeGate(TOKEN);
  const res = makeRes();
  const req = makeReq({ url: `/dk/page?dk-token=${TOKEN}&keep=1` });
  assert.equal(gate(req, res), true);
  assert.equal(res.statusCode, 302);
  const setCookie = res.headers['set-cookie'];
  assert.match(setCookie, new RegExp(`dk-token=${TOKEN}`));
  assert.match(setCookie, /SameSite=Strict/);
  assert.match(setCookie, /HttpOnly/);
  // location keeps other params, drops dk-token
  assert.equal(res.headers['location'], '/dk/page?keep=1');
});

test('bless nonce: ?dk-bless=<nonce> blesses without the durable token in the URL', () => {
  const gate = makeGate(TOKEN);
  const res = makeRes();
  const nonce = blessNonce(TOKEN);
  assert.ok(!nonce.includes(TOKEN), 'the nonce does not contain the durable token');
  const req = makeReq({ url: `/dk/page?dk-bless=${encodeURIComponent(nonce)}&keep=1` });
  assert.equal(gate(req, res), true);
  assert.equal(res.statusCode, 302);
  assert.match(res.headers['set-cookie'], new RegExp(`dk-token=${TOKEN}`));
  assert.equal(res.headers['location'], '/dk/page?keep=1');   // dk-bless stripped
});

test('validBless: round-trips, rejects tamper / expiry / wrong token', () => {
  const now = 1_000_000;
  assert.equal(validBless(TOKEN, blessNonce(TOKEN, now), now), true);
  assert.equal(validBless(TOKEN, blessNonce(TOKEN, now), now + 130_000), false); // expired (>120s)
  assert.equal(validBless(TOKEN, blessNonce('other-token', now), now), false);   // wrong token
  assert.equal(validBless(TOKEN, blessNonce(TOKEN, now) + 'x', now), false);      // tampered mac
  assert.equal(validBless(TOKEN, 'not-a-nonce', now), false);
  assert.equal(validBless(TOKEN, '', now), false);
});

test('allowOrigins: exact origin match passes (proxy use)', () => {
  const gate = makeGate(TOKEN, { allowOrigins: ['http://localhost:3000'] });
  const res = makeRes();
  const req = makeReq({ headers: { origin: 'http://localhost:3000' } });
  assert.equal(gate(req, res), false);
});

test('allowOrigins: referer under an allowed origin passes; unrelated origin is blocked', () => {
  const gate = makeGate(TOKEN, { allowOrigins: ['http://localhost:3000'] });
  assert.equal(
    gate(makeReq({ headers: { referer: 'http://localhost:3000/app/page' } }), makeRes()),
    false,
  );
  const blocked = makeRes();
  assert.equal(gate(makeReq({ headers: { origin: 'http://evil.example' } }), blocked), true);
  assert.equal(blocked.statusCode, 401);
});

test('public endpoints pass un-gated (OIDC + WebID docs)', () => {
  const gate = makeGate(TOKEN);
  for (const url of ['/.well-known/openid-configuration', '/.oidc/jwks', '/dk-pod/profile/card']) {
    assert.equal(gate(makeReq({ url }), makeRes()), false, `${url} should pass`);
  }
});

test('non-GET to a profile/card is still gated', () => {
  const gate = makeGate(TOKEN);
  const res = makeRes();
  assert.equal(gate(makeReq({ method: 'PUT', url: '/dk-pod/profile/card' }), res), true);
  assert.equal(res.statusCode, 401);
});

test('upgradeOk mirrors header/cookie auth for websocket upgrades', () => {
  const gate = makeGate(TOKEN);
  assert.equal(gate.upgradeOk(makeReq({ headers: { 'x-dk-token': TOKEN } })), true);
  assert.equal(gate.upgradeOk(makeReq({ headers: { cookie: `dk-token=${TOKEN}` } })), true);
  assert.equal(gate.upgradeOk(makeReq({})), false);
  assert.equal(makeGate('').upgradeOk(makeReq({})), true); // gate off
});
