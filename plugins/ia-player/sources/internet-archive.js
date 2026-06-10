/**
 * sources/internet-archive.js — archive.org fetcher (audio + video).
 *
 * Relocated from open_media_player's src/ia-utils.js — a headless IA client
 * with no app dependencies. Query/identifier in, normalized media out; all
 * archive.org knowledge (advancedsearch + metadata APIs, derivative grouping,
 * HTML5-playable format detection, the 3-layer quality filter) lives here.
 *
 * Sibling of commons.js: getAlbums ≈ a source search (advancedsearch.php),
 * getTracks ≈ loadItem (metadata API). Output is plain objects — the player's
 * established internal contract (ia-rdf.js shapes local data to match it). An
 * RDF (schema:AudioObject/VideoObject) layer is added only when a pure
 * audio/video display consumes it, not before.
 *
 *   [{name, url}...] = await getAlbums(query, filter, {mediaType});  // e.g. 'collection:BernieWorrell'
 *   [{url, name, time, artist}...] = await getTracks(albumId, filter, {mediaType});
 */

// Translate an artist's landing-page URL into an archive.org advancedsearch
// query. Supports two URL shapes:
//   • https://archive.org/details/<collection>            -> collection:<id>
//   • https://archive.org/search?query=…&and[]=…&and[]=…  -> query AND clauses
// Returns null when the URL doesn't match either form.
export function buildArchiveQuery(artistUrl) {
    if (!artistUrl) return null;
    let u;
    try { u = new URL(artistUrl); } catch { return null; }

    const detailsMatch = u.pathname.match(/\/details\/([^/?]+)/);
    if (detailsMatch) return `collection:${detailsMatch[1]}`;

    if (u.pathname === '/search' || u.pathname === '/search.php') {
        const parts = [];
        const q = (u.searchParams.get('query') || '').trim();
        if (q) parts.push(q);
        for (const clause of u.searchParams.getAll('and[]')) {
            const c = clause.trim();
            if (c) parts.push(c);
        }
        return parts.length ? parts.join(' AND ') : null;
    }
    return null;
}

// Parse "MM:SS" or "HH:MM:SS" (IA's runtime convention) to seconds.
// Returns NaN on a bad string so callers can treat "unknown" as "don't filter".
function parseRuntimeStr(s) {
    if (s == null) return NaN;
    if (typeof s === 'number') return s;
    const str = String(s).trim();
    if (!str) return NaN;
    if (/^[0-9.]+$/.test(str)) return parseFloat(str);
    const parts = str.split(':').map(Number);
    if (parts.some(n => !Number.isFinite(n))) return NaN;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0];
}

// True when the query targets a specific IA collection (catalog artist).
// Layer-1 / Layer-2 filtering only applies to free-form search queries
// unless the caller explicitly opts in via filter.applyToCatalogArtists.
function isCatalogQuery(q) { return /^collection:/.test(q); }

// IA `mediatype` value for our media kind: audio recordings vs the
// "movies" mediatype that covers films / video.
function iaMediatype(mediaType) { return mediaType === 'video' ? 'movies' : 'audio'; }

export async function getAlbums(query, filter = null, opts = {}) {
    if (!query) return [];
    const mt = iaMediatype(opts.mediaType);

    // Layer 1: append search-query clauses so noise is rejected by IA
    // before it ever reaches the client.
    let finalQuery = query;
    const filterApplies = filter && (!isCatalogQuery(query) || filter.applyToCatalogArtists);
    if (filterApplies) {
        const extras = [];
        // Belt-and-braces on mediatype: buildArchiveQuery may already include
        // it for /search? URLs, but collection-derived queries don't.
        if (!query.includes('mediatype:')) extras.push(`mediatype:"${mt}"`);
        if (filter.minDownloads > 0) {
            extras.push(`downloads:[${filter.minDownloads} TO *]`);
        }
        for (const c of (filter.blockedCollections || [])) {
            const t = String(c).trim();
            if (t) extras.push(`-collection:"${t}"`);
        }
        if (extras.length) finalQuery = `(${query}) AND ${extras.join(' AND ')}`;
    }

    // Request the fields needed for Layer-2 client-side filtering.
    // Without an `fl[]` whitelist IA returns the full doc, which can be
    // megabytes for popular queries.
    const params = new URLSearchParams({
        q: finalQuery,
        output: 'json',
        rows: 10000,
    });
    for (const f of ['identifier', 'title', 'downloads', 'runtime', 'collection', 'creator', 'format',
                     'licenseurl', 'rights', 'possible-copyright-status']) {
        params.append('fl[]', f);
    }
    const url = `https://archive.org/advancedsearch.php?${params}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const jsonData = await response.json();
    let albums = [];
    if (jsonData.response && jsonData.response.docs) {
        for (const doc of jsonData.response.docs) {
            if (!doc.identifier) continue;
            albums.push({
                name: doc.title || doc.identifier,
                url: `https://archive.org/details/${doc.identifier}`,
                _downloads: doc.downloads,
                _runtime: doc.runtime,
                _collection: doc.collection,
                _creator: doc.creator,
                _format: doc.format,
                _rights: rightsFrom(doc),
                _detailUrl: `https://archive.org/details/${doc.identifier}`,
            });
        }
    }

    // Layer 2: client-side filtering over fields IA returned.
    if (filterApplies) {
        const blocked = (filter.blockedCollections || []).map(s => String(s).trim()).filter(Boolean);
        albums = albums.filter(a => {
            if (filter.minItemRuntimeSec > 0 && a._runtime != null) {
                const secs = parseRuntimeStr(a._runtime);
                if (Number.isFinite(secs) && secs < filter.minItemRuntimeSec) return false;
            }
            if (blocked.length && a._collection) {
                const cols = Array.isArray(a._collection) ? a._collection : [a._collection];
                if (cols.some(c => blocked.includes(c))) return false;
            }
            return true;
        });
    }

    // Video: cull items with no HTML5-playable video derivative (audio-only,
    // image, text, or restricted/older-codec items that sneak into movie
    // collections — those are the "No playable video" dead ends). The
    // search-result `format` array lists every file format in the item, so
    // we can filter WITHOUT a per-item metadata fetch. Items with no
    // `format` field are kept (uncertain → let the click resolve it).
    if (opts.mediaType === 'video') {
        albums = albums.filter(a => {
            const fmts = Array.isArray(a._format) ? a._format : (a._format ? [a._format] : []);
            return !fmts.length || fmts.some(f => VIDEO_PLAYABLE_FORMAT_RE.test(f));
        });
        // The same film is often uploaded as several IA items — collapse by
        // normalized title, keeping the most-downloaded ("most watched")
        // copy, then order most-watched first.
        albums = dedupeByTitle(albums);
    }

    return albums;
}

// Group rows by a normalized title and keep the single highest-`downloads`
// item per title. Untitled/identifier-only rows are left untouched (an
// empty key would wrongly merge unrelated items).
function dedupeByTitle(albums) {
    const dl = (a) => { const n = parseInt(a._downloads, 10); return Number.isFinite(n) ? n : 0; };
    const best = new Map();
    const passthrough = [];
    for (const a of albums) {
        const key = String(a.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
        if (!key) { passthrough.push(a); continue; }
        const cur = best.get(key);
        if (!cur || dl(a) > dl(cur)) best.set(key, a);
    }
    return [...best.values(), ...passthrough].sort((a, b) => dl(b) - dl(a));
}
const ARCHIVE_API = 'https://archive.org/metadata/';

// Extensions the HTML5 <audio> element can decode in all modern browsers
// (mp3 / m4a / aac / ogg / opus / wav) plus flac (Firefox / Chrome / recent
// Safari). Ordered by how likely they are to play and how compact the file
// is — earlier entries win when an IA item ships multiple derivatives of
// the same recording.
const AUDIO_EXTS = ['.mp3', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.webm', '.weba', '.flac', '.wav'];
// Video derivatives the HTML5 <video> element decodes broadly. IA almost
// always ships an h.264 .mp4 derivative for video items; .ogv/.webm are
// the open fallbacks, .m4v/.mov occasional. Ordered by likelihood.
const VIDEO_EXTS = ['.mp4', '.m4v', '.ogv', '.webm', '.mov'];
// archive.org `format` strings that mean an HTML5-playable video derivative
// exists (h.264 mp4, MPEG4 variants like "512Kb MPEG4", Ogg Video, WebM,
// QuickTime, Matroska). Used to cull no-video items from movie searches.
// Deliberately does NOT match "MPEG2"/"DivX"/"Cinepack" (not <video>-able).
const VIDEO_PLAYABLE_FORMAT_RE = /(h\.?264|mpeg-?4|ogg\s*video|web ?m|quicktime|matroska)/i;
const extsFor = (mediaType) => (mediaType === 'video' ? VIDEO_EXTS : AUDIO_EXTS);
const extRe = (exts) => new RegExp('(' + exts.map(e => '\\' + e).join('|') + ')$', 'i');

function originalKey(file) {
    // IA marks derivatives with source:"derivative" and original:"name.flac".
    // Group on the original so all formats of one logical track collapse.
    return (file.source === 'derivative' && file.original) ? file.original : file.name;
}

function pickPreferred(files, exts) {
    for (const ext of exts) {
        const m = files.find(f => f.name && f.name.toLowerCase().endsWith(ext));
        if (m) return m;
    }
    return null;
}

// ── rights / licensing ───────────────────────────────────────────────────
// archive.org carries item-level rights as `licenseurl` (often Creative
// Commons), free-text `rights`, and `possible-copyright-status`. It's
// uploader-entered and frequently UNKNOWN — surfaced for context, NOT a
// clearance. Same field names on a metadata doc and an advancedsearch doc.
const COPYRIGHT_LABELS = {
    NOT_IN_COPYRIGHT: 'Public domain',
    PUBLIC_DOMAIN: 'Public domain',
    IN_COPYRIGHT: 'In copyright',
    UNKNOWN: 'Rights unknown',
};
function ccLabel(url) {
    const m = /creativecommons\.org\/(licenses|publicdomain)\/([a-z0-9-]+)(?:\/([0-9.]+))?/i.exec(url || '');
    if (!m) return '';
    const code = m[2].toLowerCase();
    if (m[1].toLowerCase() === 'publicdomain' || code === 'zero' || code === 'mark') return 'Public domain (CC)';
    return `CC ${code.toUpperCase()}${m[3] ? ' ' + m[3] : ''}`;
}
function rightsLabel(licenseUrl, rights, status) {
    const cc = ccLabel(licenseUrl);
    if (cc) return cc;
    if (status && COPYRIGHT_LABELS[status]) return COPYRIGHT_LABELS[status];
    if (rights) return rights.length > 70 ? rights.slice(0, 67) + '…' : rights;
    if (status) return status.replace(/_/g, ' ').toLowerCase();
    if (licenseUrl) return 'Licensed (see IA)';
    return '';
}
// Build a rights snapshot { label, licenseUrl, rights, status } from an IA
// metadata or advancedsearch doc, or null when IA tells us nothing.
function rightsFrom(src) {
    if (!src) return null;
    const one = (v) => Array.isArray(v) ? v[0] : v;
    const licenseUrl = one(src.licenseurl) || '';
    const rights = (one(src.rights) || '').toString().trim();
    const status = one(src['possible-copyright-status']) || '';
    const label = rightsLabel(licenseUrl, rights, status);
    if (!label) return null;
    return { label, licenseUrl, rights, status };
}

export async function getTracks(albumId, filter = null, opts = {}) {
    if (!albumId) return [];
    const exts = extsFor(opts.mediaType);
    const playableRe = extRe(exts);
    const response = await fetch(`${ARCHIVE_API}${albumId}`);
    if (!response.ok) throw new Error(`IA metadata ${response.status} for ${albumId}`);
    const data = await response.json();
    if (!data.metadata) throw new Error(`Empty metadata for ${albumId}`);

    // Some items expose metadata but block downloads; skip them up front
    // so the album shows zero tracks instead of a list that 401s on play.
    const md = data.metadata || {};
    const isRestricted = md['access-restricted-item'] === 'true'
        || md['access-restricted'] === 'true'
        || md.is_dark === 'true';
    if (isRestricted) return [];

    const rights = rightsFrom(md);
    const detailUrl = `https://archive.org/details/${albumId}`;

    const files = data.files || [];
    // Group files by their underlying recording so we don't list each track
    // twice (once for the FLAC original and once for the MP3 derivative).
    // Skip files individually marked private (downloads will 401).
    const groups = new Map();
    for (const f of files) {
        if (!f.name || !playableRe.test(f.name)) continue;
        if (f.private === 'true') continue;
        const key = originalKey(f);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(f);
    }

    // Item-level creator, used as the per-track fallback when the file's
    // own artist field is missing. "Various Artists" (and common variants)
    // are intentionally treated as "no creator" so a mixtape doesn't
    // mis-attribute every track to "Various".
    const itemCreatorRaw = Array.isArray(md.creator) ? md.creator[0] : md.creator;
    const itemCreator = itemCreatorRaw ? String(itemCreatorRaw).trim() : '';
    const isVarious = /^(various(\s+artists?)?|v\.?a\.?)$/i.test(itemCreator);
    const itemArtistFallback = isVarious ? '' : itemCreator;

    const links = [];
    for (const group of groups.values()) {
        const f = pickPreferred(group, exts);
        if (!f) continue;
        // length / title / bitrate are usually filled on the derivative MP3
        // even when we picked a different format; fall back across the group.
        const length  = f.length  || group.find(g => g.length)?.length;
        const title   = f.title   || group.find(g => g.title)?.title;
        const bitrate = f.bitrate || group.find(g => g.bitrate)?.bitrate;
        // Per-file artist (most accurate, especially for compilations).
        // IA uses `artist` for music files and `creator` more generally.
        const fileArtist =
            f.artist || f.creator
            || group.find(g => g.artist)?.artist
            || group.find(g => g.creator)?.creator
            || '';
        const artist = String(fileArtist).trim() || itemArtistFallback;
        links.push({
            url: `https://archive.org/download/${albumId}/${encodeURIComponent(f.name)}`,
            name: title || f.name.replace(/\.[^.]+$/, ''),
            time: formatLength(length),
            artist,
            _rights: rights,
            _detailUrl: detailUrl,
            _lengthSec: parseRuntimeStr(length),
            _bitrate: bitrate != null ? parseFloat(bitrate) : NaN,
        });
    }

    // Layer 3: filter by per-track duration / bitrate. Files with missing
    // metadata (NaN) are kept — better to risk one short track than to
    // hide a whole album because IA didn't bother to fill `length`.
    if (filter) {
        return links.filter(t => {
            if (filter.minTrackDurationSec > 0 && Number.isFinite(t._lengthSec)) {
                if (t._lengthSec < filter.minTrackDurationSec) return false;
            }
            if (filter.minTrackBitrateKbps > 0 && Number.isFinite(t._bitrate)) {
                if (t._bitrate < filter.minTrackBitrateKbps) return false;
            }
            return true;
        });
    }
    return links;
}

function formatLength(len) {
  if (!len) return '';
  // IA reports "mm:ss" or a numeric seconds string.
  if (/^\d+:\d+/.test(len)) return len.split(':').slice(-2).join(':');
  const secs = parseFloat(len);
  if (!isFinite(secs)) return '';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
