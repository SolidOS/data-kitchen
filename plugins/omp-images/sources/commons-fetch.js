/**
 * commons-fetch.js — Wikimedia Commons category → image list, for <sol-gallery>.
 *
 * Each gallery "collection" is a Commons *category* URL (e.g.
 * https://commons.wikimedia.org/wiki/Category:Tarot_1JJ). The Commons
 * MediaWiki API serves CORS-enabled JSON when called with `origin=*`, so —
 * unlike RSS — no proxy is needed. One `generator=categorymembers` +
 * `prop=imageinfo` call returns thumbnail URLs, full-size URLs, and license
 * metadata together; an opaque `continue` token pages the rest.
 *
 * Returns plain data only (strings / numbers) — extmetadata HTML is reduced
 * to text — so callers carry no sanitization burden.
 */

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

/** Collapse an HTML fragment (extmetadata values are HTML) to plain text. */
function toText(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

/**
 * Extract the `Category:Title` page title from a Commons category URL.
 * Accepts the `/wiki/Category:Foo` and `?title=Category:Foo` forms and
 * returns the decoded title with spaces (the API accepts either spaces or
 * underscores). Returns '' when the URL isn't a category.
 */
export function categoryTitleFromUrl(url) {
  if (!url) return '';
  let title = '';
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/wiki\/(.+)$/);
    title = m ? m[1] : (u.searchParams.get('title') || '');
  } catch {
    const m = String(url).match(/Category:[^?#]+/);
    title = m ? m[0] : '';
  }
  try { title = decodeURIComponent(title); } catch { /* leave as-is */ }
  title = title.replace(/_/g, ' ').trim();
  return /^Category:/i.test(title) ? title : '';
}

/**
 * Fetch one page of file members of a Commons category, with thumbnails.
 *
 * @param {string} categoryUrl          a Commons `…/wiki/Category:X` URL
 * @param {object} [opts]
 * @param {number} [opts.thumbWidth=300] thumbnail width in px
 * @param {number} [opts.limit=60]       members per page (API max 500)
 * @param {string} [opts.cont]           continue token from a previous call
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{images:Array<{title,name,thumb,full,width,height,descUrl,artist,license}>, cont:?string}>}
 */
export async function getCategoryImages(categoryUrl, opts = {}) {
  const { thumbWidth = 300, limit = 60, cont, signal } = opts;
  const title = categoryTitleFromUrl(categoryUrl);
  if (!title) throw new Error('Not a Commons category URL');

  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'categorymembers',
    gcmtitle: title,
    gcmtype: 'file',
    gcmlimit: String(limit),
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    iiurlwidth: String(thumbWidth),
    iiextmetadatafilter: 'Artist|LicenseShortName',
  });
  if (cont) params.set('gcmcontinue', cont);

  const resp = await fetch(`${COMMONS_API}?${params}`, { signal });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from Commons`);
  const data = await resp.json();
  if (data.error) throw new Error(data.error.info || 'Commons API error');

  const pages = data.query && data.query.pages ? Object.values(data.query.pages) : [];
  // categorymembers preserves sort order via the `index` the generator adds.
  pages.sort((a, b) => (a.index || 0) - (b.index || 0));

  const images = [];
  for (const p of pages) {
    const ii = p.imageinfo && p.imageinfo[0];
    if (!ii || !ii.thumburl) continue;
    const meta = ii.extmetadata || {};
    images.push({
      title: (p.title || '').replace(/^File:/, ''),
      name: p.title || '',
      thumb: ii.thumburl,
      full: ii.url,
      width: ii.thumbwidth || 0,
      height: ii.thumbheight || 0,
      descUrl: ii.descriptionurl || '',
      artist: toText(meta.Artist && meta.Artist.value),
      license: toText(meta.LicenseShortName && meta.LicenseShortName.value),
    });
  }

  const nextCont = data.continue && data.continue.gcmcontinue
    ? data.continue.gcmcontinue
    : null;
  return { images, cont: nextCont };
}
