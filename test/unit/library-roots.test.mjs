// Unit test for the dkfile: allow-list (electron-config/library-roots.cjs). Uses a
// real temp tree so realpathSync resolves and the prefix / persistence logic is
// exercised for real.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { LibraryRoots, pathUnderRoot } = require('../../electron-config/library-roots.cjs');

let tmp, music, songs, extra, outside;
before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dkfile-roots-'));
  music = path.join(tmp, 'music');
  extra = path.join(tmp, 'music-extra');            // shares the "music" prefix but is NOT under it
  outside = path.join(tmp, 'private');
  fs.mkdirSync(music); fs.mkdirSync(extra); fs.mkdirSync(outside);
  songs = path.join(music, 'song.mp3');
  fs.writeFileSync(songs, 'x');
  fs.writeFileSync(path.join(extra, 'x.mp3'), 'x');
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'x');
});
after(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} });

test('pathUnderRoot: a file inside the root is allowed; the root itself is allowed', () => {
  assert.equal(pathUnderRoot(songs, music), true);
  assert.equal(pathUnderRoot(music, music), true);
});

test('pathUnderRoot: files outside, and a prefix-sharing sibling, are refused', () => {
  assert.equal(pathUnderRoot(path.join(outside, 'secret.txt'), music), false);
  assert.equal(pathUnderRoot(path.join(extra, 'x.mp3'), music), false);   // /music-extra ⊄ /music
  assert.equal(pathUnderRoot('', music), false);
  assert.equal(pathUnderRoot(songs, ''), false);
});

test('LibraryRoots.isAllowed reflects the added roots', () => {
  const lr = new LibraryRoots(null);          // no persistence
  assert.equal(lr.isAllowed(songs), false);   // nothing added yet
  lr.add(music);
  assert.equal(lr.isAllowed(songs), true);
  assert.equal(lr.isAllowed(path.join(outside, 'secret.txt')), false);
});

test('roots persist to userData and reload in a fresh instance', () => {
  const ud = path.join(tmp, 'userdata');
  fs.mkdirSync(ud);
  const a = new LibraryRoots(ud);
  a.add(music);
  a.add(music);                                // idempotent
  assert.deepEqual(a.roots, [path.resolve(music)]);

  const b = new LibraryRoots(ud);              // fresh process would see the persisted list
  assert.equal(b.isAllowed(songs), true);
  assert.equal(b.isAllowed(path.join(outside, 'secret.txt')), false);
});
