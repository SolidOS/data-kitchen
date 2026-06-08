// omp-favourites-store.js — the communal favourites wall's data layer.
//
// A shared, append-only `favourites/` folder, ONE file per star
// (schema:BookmarkAction). Anyone can add (public Append); only the owner can
// remove (moderation). The wall renders from these snapshots alone — it never
// loads a source library. Records use only standard vocab:
//
//   <>  a schema:BookmarkAction ; dct:creator "<name>" ; dct:title "<custom>" ;
//       dct:created "…"^^xsd:dateTime ; dct:references <ITEM> .
//   <ITEM> a dctype:<bucket>, schema:<fine> ; schema:name "<canonical>" ;
//          schema:thumbnailUrl <…> ; dcat:downloadURL|landingPage <…> .
//
// `dct:references` (the item IRI) is the grouping key; the `dctype:` bucket
// (StillImage|MovingImage|Sound|Text|Collection) picks the wall's renderer.

import { rdf } from 'sol-components/core/rdf.js';

const NS = {
  rdf:    'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  schema: 'http://schema.org/',
  dct:    'http://purl.org/dc/terms/',
  dcat:   'http://www.w3.org/ns/dcat#',
  dctype: 'http://purl.org/dc/dcmitype/',
  ldp:    'http://www.w3.org/ns/ldp#',
  xsd:    'http://www.w3.org/2001/XMLSchema#',
};

/** The communal favourites folder (top-level, so it's permissioned on its own). */
export const favouritesUrl = () => new URL('favourites/', document.baseURI).href;

const lit = (s) => JSON.stringify(String(s));

/**
 * Build the Turtle for one favourite file.
 * @param {object} f
 * @param {string} f.item        the item's stable IRI (grouping key + identity)
 * @param {string} f.bucket      DCMI type local name: StillImage|MovingImage|Sound|Text|Collection
 * @param {string} f.schemaType  schema.org local name: ImageObject|ImageGallery|AudioObject|VideoObject|Article|…
 * @param {string} f.name        canonical item title (card heading)
 * @param {string} f.contributor who starred it (anonymous name)
 * @param {string} f.title       the custom favourite name (defaults to f.name)
 * @param {string} [f.thumbnail]
 * @param {string} [f.link]      play/open URL
 * @param {boolean}[f.download]  true → dcat:downloadURL (a file); else dcat:landingPage (a page)
 * @param {string} [f.created]   ISO timestamp (defaults to now)
 */
export function favouriteTurtle(f) {
  const created = f.created || new Date().toISOString();
  let item = `<${f.item}> a dctype:${f.bucket}, schema:${f.schemaType} ;\n   schema:name ${lit(f.name)}`;
  if (f.thumbnail) item += ` ;\n   schema:thumbnailUrl <${f.thumbnail}>`;
  if (f.link)      item += ` ;\n   ${f.download ? 'dcat:downloadURL' : 'dcat:landingPage'} <${f.link}>`;
  item += ' .';
  return `@prefix schema: <${NS.schema}> .
@prefix dct: <${NS.dct}> .
@prefix dcat: <${NS.dcat}> .
@prefix dctype: <${NS.dctype}> .
@prefix xsd: <${NS.xsd}> .

<> a schema:BookmarkAction ;
   dct:creator ${lit(f.contributor)} ;
   dct:title ${lit(f.title || f.name)} ;
   dct:created "${created}"^^xsd:dateTime ;
   dct:references <${f.item}> .

${item}
`;
}

/** POST a new favourite file to the folder (append). Returns its URL or null. */
export async function addFavourite(f) {
  const resp = await fetch(favouritesUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/turtle' },
    body: favouriteTurtle(f),
  });
  if (!resp.ok) throw new Error(`Couldn't save favourite (HTTP ${resp.status}).`);
  const loc = resp.headers.get('Location');
  return loc ? new URL(loc, favouritesUrl()).href : null;
}

/** Permanently remove one favourite file (owner moderation). */
export async function removeFavouriteFile(fileUrl) {
  const resp = await fetch(fileUrl, { method: 'DELETE' });
  if (!resp.ok) throw new Error(`Couldn't remove favourite (HTTP ${resp.status}).`);
}

/** Parse one favourite file into a flat record (or null). */
function parseFavourite(url, ttl) {
  const s = rdf.graph();
  try { rdf.parse(ttl, s, url, 'text/turtle'); } catch { return null; }
  const action = s.each(undefined, rdf.sym(NS.rdf + 'type'), rdf.sym(NS.schema + 'BookmarkAction'))[0];
  if (!action) return null;
  const item = s.any(action, rdf.sym(NS.dct + 'references'))?.value;
  if (!item) return null;
  const n = rdf.sym(item);
  const types = s.each(n, rdf.sym(NS.rdf + 'type')).map(t => t.value);
  const dctypeUri = types.find(v => v.startsWith(NS.dctype)) || '';
  const schemaUri = types.find(v => v.startsWith(NS.schema)) || '';
  return {
    file: url,
    item,
    contributor:    s.any(action, rdf.sym(NS.dct + 'creator'))?.value || 'anonymous',
    customTitle:    s.any(action, rdf.sym(NS.dct + 'title'))?.value || '',
    created:        s.any(action, rdf.sym(NS.dct + 'created'))?.value || '',
    canonicalTitle: s.any(n, rdf.sym(NS.schema + 'name'))?.value || item,
    thumbnail:      s.any(n, rdf.sym(NS.schema + 'thumbnailUrl'))?.value || '',
    link:           s.any(n, rdf.sym(NS.dcat + 'downloadURL'))?.value
                 || s.any(n, rdf.sym(NS.dcat + 'landingPage'))?.value || item,
    bucket:         dctypeUri.replace(NS.dctype, '') || 'Collection',
    schemaType:     schemaUri.replace(NS.schema, ''),
  };
}

/**
 * List every favourite, GROUPED by item (the communal wall).
 * @returns {Promise<Array<{item,canonicalTitle,thumbnail,link,bucket,created,
 *          count,contributors:Array<{name,customTitle,file}>}>>}
 */
export async function listFavourites() {
  const folder = favouritesUrl();
  let containerTtl;
  try {
    // no-store: after a delete, a cached listing would still name the removed
    // file and we'd 404 fetching it.
    const r = await fetch(folder, { headers: { Accept: 'text/turtle' }, cache: 'no-store' });
    if (!r.ok) return [];                 // no folder yet → nothing favourited
    containerTtl = await r.text();
  } catch { return []; }

  const cstore = rdf.graph();
  try { rdf.parse(containerTtl, cstore, folder, 'text/turtle'); } catch { return []; }
  // Every contained resource that isn't a sub-container. (CSS POST mints
  // names WITHOUT a .ttl extension, so don't filter on one; parseFavourite
  // just returns null for anything that isn't a favourite record.)
  const files = cstore.each(rdf.sym(folder), rdf.sym(NS.ldp + 'contains'))
    .map(t => t.value).filter(u => !u.endsWith('/'));

  const records = [];
  await Promise.all(files.map(async (u) => {
    try {
      const r = await fetch(u, { cache: 'no-store' });
      if (!r.ok) return;
      const rec = parseFavourite(u, await r.text());
      if (rec) records.push(rec);
    } catch { /* skip a bad file */ }
  }));

  // Group by item; dedupe contributors by name (same person starring twice).
  const groups = new Map();
  for (const rec of records) {
    if (!groups.has(rec.item)) {
      groups.set(rec.item, {
        item: rec.item, canonicalTitle: rec.canonicalTitle, thumbnail: rec.thumbnail,
        link: rec.link, bucket: rec.bucket, schemaType: rec.schemaType,
        created: rec.created, contributors: [],
      });
    }
    const g = groups.get(rec.item);
    if (!g.contributors.some(c => c.name === rec.contributor)) {
      g.contributors.push({ name: rec.contributor, customTitle: rec.customTitle, file: rec.file });
    }
    if (rec.created > g.created) g.created = rec.created;     // newest star wins for sort
    if (!g.thumbnail && rec.thumbnail) g.thumbnail = rec.thumbnail;
  }
  return [...groups.values()].map(g => ({ ...g, count: g.contributors.length }));
}
