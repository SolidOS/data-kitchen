// The music importer's tag reader against a real tagged file: every field of a
// TrackMeta must survive the music-metadata library's own naming of tags.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanFolder, readCover } from '../../electron-config/import-music.mjs';

// A 1x1 PNG, for the embedded cover.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

// One ID3v2.3 frame: id, big-endian size, two flag bytes, body.
function frame(id, body) {
  const head = Buffer.alloc(10);
  head.write(id, 0, 'latin1');
  head.writeUInt32BE(body.length, 4);
  return Buffer.concat([head, body]);
}
const text = (id, value) => frame(id, Buffer.concat([Buffer.from([0]), Buffer.from(value, 'latin1')]));

// A small MP3: an ID3v2.3 tag, then four silent MPEG-1 Layer III frames.
function taggedMp3() {
  const frames = Buffer.concat([
    text('TIT2', 'First Light'),
    text('TPE1', 'The Test Ensemble'),
    text('TPE2', 'Various Artists'),
    text('TALB', 'Fixture Album'),
    text('TRCK', '3/12'),
    text('TPOS', '1/2'),
    text('TCON', 'Jazz'),
    text('TYER', '1999'),
    frame('APIC', Buffer.concat([
      Buffer.from([0]), Buffer.from('image/png\0', 'latin1'), Buffer.from([3, 0]), PNG,
    ])),
  ]);
  const head = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0]);
  const n = frames.length;                       // synchsafe: 7 bits per byte
  head[6] = (n >> 21) & 0x7f; head[7] = (n >> 14) & 0x7f; head[8] = (n >> 7) & 0x7f; head[9] = n & 0x7f;
  const mpeg = Buffer.alloc(417);                // 128 kbps, 44.1 kHz
  mpeg.set([0xff, 0xfb, 0x90, 0x00]);
  return Buffer.concat([head, frames, mpeg, mpeg, mpeg, mpeg]);
}

test('scanFolder reads every TrackMeta field from a tagged file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dk-import-'));
  try {
    writeFileSync(join(dir, 'first-light.mp3'), taggedMp3());
    const { count, tracks } = await scanFolder(dir);
    assert.equal(count, 1);
    const t = tracks[0];
    assert.equal(t.error, undefined, t.error);
    assert.equal(t.title, 'First Light');
    assert.equal(t.artist, 'The Test Ensemble');
    assert.equal(t.albumArtist, 'Various Artists');
    assert.equal(t.album, 'Fixture Album');
    assert.equal(t.trackNo, 3);
    assert.equal(t.discNo, 1);
    assert.equal(t.genre, 'Jazz');
    assert.equal(t.year, 1999);
    assert.equal(t.hasPicture, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readCover returns the embedded picture', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dk-import-'));
  try {
    const file = join(dir, 'first-light.mp3');
    writeFileSync(file, taggedMp3());
    const cover = await readCover(file);
    assert.ok(cover, 'a cover is returned');
    assert.equal(cover.format, 'image/png');
    assert.equal(Buffer.from(cover.base64, 'base64').equals(PNG), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
