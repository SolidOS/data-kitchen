// Tests for nodejs-src/untar.cjs — the dependency-free gunzip+tar extractor
// that expands the bundled node_modules / engine / pod-seed tarballs on-device.
//
// We build real archives with GNU `tar` so the fixtures exercise the exact
// on-the-wire format the extractor sees in production (ustar + GNU longlink +
// gzip), then assert the extracted tree matches.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { extractTarGz } = require(path.join(HERE, '..', '..', 'nodejs-src', 'untar.cjs'));

// Make a throwaway working dir; clean it up after the test.
function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function rm(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// Build a source tree, tar it (gzip unless raw=true), return the archive path.
// `srcName` is the top dir name inside the archive (e.g. node_modules-like).
function makeArchive(buildTree, { raw = false } = {}) {
  const work = tmp('untar-src-');
  buildTree(work);
  const archive = path.join(tmp('untar-arc-'), raw ? 'a.tar' : 'a.tar.gz');
  const flags = raw ? ['cf'] : ['czf'];
  // -C so paths in the archive are relative to the work dir.
  execFileSync('tar', [...flags, archive, '-C', work, '.']);
  rm(work);
  return archive;
}

test('extracts regular files and reports the file count', () => {
  const dest = tmp('untar-dest-');
  const arc = makeArchive((root) => {
    fs.writeFileSync(path.join(root, 'a.txt'), 'alpha');
    fs.mkdirSync(path.join(root, 'sub'));
    fs.writeFileSync(path.join(root, 'sub', 'b.txt'), 'bravo');
  });

  const n = extractTarGz(arc, dest);

  assert.equal(n, 2, 'two regular files extracted');
  assert.equal(fs.readFileSync(path.join(dest, 'a.txt'), 'utf8'), 'alpha');
  assert.equal(fs.readFileSync(path.join(dest, 'sub', 'b.txt'), 'utf8'), 'bravo');
  rm(dest);
  rm(path.dirname(arc));
});

test('creates directory entries even when empty', () => {
  const dest = tmp('untar-dest-');
  const arc = makeArchive((root) => {
    fs.mkdirSync(path.join(root, 'emptydir'));
    fs.writeFileSync(path.join(root, 'keep.txt'), 'x');
  });

  extractTarGz(arc, dest);

  assert.ok(fs.statSync(path.join(dest, 'emptydir')).isDirectory(),
    'empty directory recreated');
  rm(dest);
  rm(path.dirname(arc));
});

test('preserves binary content byte-for-byte', () => {
  const dest = tmp('untar-dest-');
  const bytes = Buffer.from([0, 1, 2, 255, 254, 0, 128, 64]);
  const arc = makeArchive((root) => {
    fs.writeFileSync(path.join(root, 'bin.dat'), bytes);
  });

  extractTarGz(arc, dest);

  assert.deepEqual(fs.readFileSync(path.join(dest, 'bin.dat')), bytes);
  rm(dest);
  rm(path.dirname(arc));
});

test('handles GNU long names (basename > 100 chars)', () => {
  const dest = tmp('untar-dest-');
  // A single component longer than the 100-char ustar name field forces GNU
  // tar to emit an "L"/@LongLink entry — the branch untar.cjs handles.
  const longName = 'z'.repeat(150) + '.txt';
  const arc = makeArchive((root) => {
    fs.writeFileSync(path.join(root, longName), 'long');
  });

  const n = extractTarGz(arc, dest);

  assert.equal(n, 1);
  assert.equal(fs.readFileSync(path.join(dest, longName), 'utf8'), 'long');
  rm(dest);
  rm(path.dirname(arc));
});

test('handles deeply nested paths (ustar name/prefix split)', () => {
  const dest = tmp('untar-dest-');
  // A path > 100 chars total but splittable on a slash uses the ustar prefix
  // field rather than a longlink — exercises the prefix+name join.
  const deep = path.join('a'.repeat(80), 'b'.repeat(80), 'c.txt');
  const arc = makeArchive((root) => {
    fs.mkdirSync(path.dirname(path.join(root, deep)), { recursive: true });
    fs.writeFileSync(path.join(root, deep), 'deep');
  });

  extractTarGz(arc, dest);

  assert.equal(fs.readFileSync(path.join(dest, deep), 'utf8'), 'deep');
  rm(dest);
  rm(path.dirname(arc));
});

test('auto-detects a raw (non-gzipped) tar', () => {
  // The Android asset pipeline can decompress a .gz asset, so the file on disk
  // may be a raw tar; untar.cjs sniffs the gzip magic and handles both.
  const dest = tmp('untar-dest-');
  const arc = makeArchive((root) => {
    fs.writeFileSync(path.join(root, 'plain.txt'), 'no gzip');
  }, { raw: true });

  // Sanity: the fixture really is not gzipped.
  const head = fs.readFileSync(arc).subarray(0, 2);
  assert.ok(!(head[0] === 0x1f && head[1] === 0x8b), 'fixture is a raw tar');

  const n = extractTarGz(arc, dest);
  assert.equal(n, 1);
  assert.equal(fs.readFileSync(path.join(dest, 'plain.txt'), 'utf8'), 'no gzip');
  rm(dest);
  rm(path.dirname(arc));
});

test('skips symlinks (type that the pure-JS npm tree never contains)', () => {
  const dest = tmp('untar-dest-');
  const arc = makeArchive((root) => {
    fs.writeFileSync(path.join(root, 'real.txt'), 'real');
    fs.symlinkSync('real.txt', path.join(root, 'link.txt'));
  });

  const n = extractTarGz(arc, dest);

  assert.equal(n, 1, 'only the regular file is counted');
  assert.ok(fs.existsSync(path.join(dest, 'real.txt')));
  assert.ok(!fs.existsSync(path.join(dest, 'link.txt')), 'symlink not created');
  rm(dest);
  rm(path.dirname(arc));
});

test('stops cleanly at the end-of-archive zero blocks', () => {
  // An empty archive (just terminator blocks) must extract zero files without
  // throwing — proves the zero-block stop condition.
  const dest = tmp('untar-dest-');
  const arc = makeArchive(() => { /* empty tree */ });

  const n = extractTarGz(arc, dest);
  assert.equal(n, 0);
  rm(dest);
  rm(path.dirname(arc));
});
