// Unit tests for electron-config/shell-caller.cjs — the backstop on the
// remembered-IdP fetch bridge. Only dk's own shell document may use it; the
// target of the fetch is deliberately unrestricted (a Solid session is good
// at every pod that grants the signed-in WebID access).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isShellCaller, isShellUrl } = require('../../electron-config/shell-caller.cjs');

const APP = 'http://localhost:8000';

// A frame object shaped like Electron's WebFrameMain, and an event whose
// senderFrame is the main frame unless told otherwise.
const frame = (url) => ({ url });
const event = (f, mainFrame = f) => ({ senderFrame: f, sender: { mainFrame } });

test('the shell root and index.html are the shell', () => {
  assert.equal(isShellUrl(`${APP}/`, APP), true);
  assert.equal(isShellUrl(`${APP}/index.html`, APP), true);
});

test('a pod document at the app origin is not the shell', () => {
  assert.equal(isShellUrl(`${APP}/dk-pod/notes/evil.html`, APP), false);
  assert.equal(isShellUrl(`${APP}/pages/customize.html`, APP), false);
});

test('another origin is never the shell', () => {
  assert.equal(isShellUrl('https://evil.example/index.html', APP), false);
  assert.equal(isShellUrl('http://localhost:8001/index.html', APP), false);
});

test('a query or hash on the shell URL still reads as the shell', () => {
  assert.equal(isShellUrl(`${APP}/?dk-bless=abc`, APP), true);
  assert.equal(isShellUrl(`${APP}/index.html#tab`, APP), true);
});

test('unparseable or missing urls are refused', () => {
  assert.equal(isShellUrl('', APP), false);
  assert.equal(isShellUrl(undefined, APP), false);
  assert.equal(isShellUrl('not a url', APP), false);
});

test('a call from the shell main frame passes', () => {
  const f = frame(`${APP}/index.html`);
  assert.equal(isShellCaller(event(f), APP), true);
});

test('a sub-frame is refused even when it sits at a shell URL', () => {
  const main = frame(`${APP}/index.html`);
  const sub = frame(`${APP}/index.html`);
  assert.equal(isShellCaller(event(sub, main), APP), false);
});

test('a pod page that replaced the shell is refused', () => {
  const f = frame(`${APP}/dk-pod/evil.html`);
  assert.equal(isShellCaller(event(f), APP), false);
});

test('an event with no sender frame is refused', () => {
  assert.equal(isShellCaller({ sender: {} }, APP), false);
  assert.equal(isShellCaller(undefined, APP), false);
});
