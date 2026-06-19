// Main-process music scanner for the "import a folder of my audio" feature.
// ESM (music-metadata is ESM-only) — main.cjs loads it via dynamic import().
//
// Split of concerns: this module ONLY reads the filesystem and parses tags. It
// returns plain metadata objects; the renderer (plugins/ia-player/import-id3.js)
// groups them into releases and authors the library RDF. The originals are
// never copied or modified — mo:item will point file:// at them in place.
//
// Two entry points:
//   scanFolder(root, { onProgress }) → { root, count, tracks: [TrackMeta] }
//   readCover(absPath)               → { format, base64 } | null
// Cover art is NOT included in the bulk scan (it would balloon the IPC payload
// across thousands of tracks); the renderer pulls one cover per release on
// demand via readCover(), using a track whose `hasPicture` is true.

import { promises as fs } from 'node:fs';
import path from 'node:path';

// The audio extensions the importer recognises (lower-case, with dot). Matches
// the formats the dkfile: streamer + <video> element can play back.
const AUDIO_EXTS = new Set(['.mp3', '.m4a', '.aac', '.flac', '.ogg', '.oga', '.opus', '.wav']);

// music-metadata is ESM and somewhat heavy; load it once, lazily.
let _mm = null;
async function mm() { return (_mm ||= await import('music-metadata')); }

// Depth-first walk collecting every audio file under `root`. Unreadable
// directories are skipped (best-effort), the result sorted for stable order.
export async function walkAudioFiles(root) {
  const out = [];
  async function walk(dir) {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && AUDIO_EXTS.has(path.extname(e.name).toLowerCase())) out.push(full);
    }
  }
  await walk(root);
  out.sort();
  return out;
}

// Parse one file's tags into a flat TrackMeta. `hasPicture` flags embedded art
// without shipping the bytes (read later via readCover). On a parse failure the
// track is still returned, carrying `error` so the renderer can report/skip it.
async function readTrackMeta(absPath) {
  try {
    const { parseFile } = await mm();
    // Don't skipCovers: we need to KNOW if art exists (hasPicture) — but we drop
    // the bytes here and ship them only on demand via readCover(), to keep the
    // scan's IPC payload small across a large library.
    const md = await parseFile(absPath, { duration: true });
    const c = md.common || {};
    const f = md.format || {};
    return {
      absPath,
      title:       c.title || null,
      artist:      c.artist || (c.artists && c.artists[0]) || null,
      albumArtist: c.albumartist || null,
      album:       c.album || null,
      trackNo:     c.track && c.track.no != null ? c.track.no : null,
      discNo:      c.disk && c.disk.no != null ? c.disk.no : null,
      genre:       c.genre && c.genre.length ? c.genre[0] : null,
      year:        c.year != null ? c.year : null,
      durationSec: f.duration != null ? Math.round(f.duration) : null,
      hasPicture:  !!(c.picture && c.picture.length),
    };
  } catch (e) {
    return { absPath, error: e.message || String(e) };
  }
}

// Walk `root` and parse every audio file. `onProgress({ done, total, absPath })`
// fires after each file so the caller can drive a progress UI.
export async function scanFolder(root, { onProgress } = {}) {
  const files = await walkAudioFiles(root);
  const tracks = [];
  let done = 0;
  for (const absPath of files) {
    tracks.push(await readTrackMeta(absPath));
    done++;
    if (onProgress) { try { onProgress({ done, total: files.length, absPath }); } catch { /* progress is best-effort */ } }
  }
  return { root, count: files.length, tracks };
}

// The first embedded picture of one file, as { format, base64 }, or null. Used
// by the renderer to write one cover image per release (foaf:depiction).
export async function readCover(absPath) {
  try {
    const { parseFile } = await mm();
    const md = await parseFile(absPath, { duration: false, skipCovers: false });
    const pics = md.common && md.common.picture;
    if (!pics || !pics.length || !pics[0].data) return null;
    const p = pics[0];
    const buf = Buffer.isBuffer(p.data) ? p.data : Buffer.from(p.data);
    return { format: p.format || 'image/jpeg', base64: buf.toString('base64') };
  } catch {
    return null;
  }
}
