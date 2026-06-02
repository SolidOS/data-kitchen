/**
 * check-ia-rights.mjs — validate the IA adapter now surfaces rights, against
 * the LIVE archive.org API. Run from project root:
 *   node claude/validation/check-ia-rights.mjs
 */
import { getAlbums, getTracks, buildArchiveQuery }
  from '../../../solid-web-components/sources/internet-archive.js';

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails++; };

// Live Music Archive (etree): fan recordings that carry CC licenseurl / rights.
const albums = await getAlbums(buildArchiveQuery('https://archive.org/details/etree'),
  null, { mediaType: 'audio' });
console.log(`fetched ${albums.length} albums`);
check(albums.length > 0, 'getAlbums returned results');

const withRights = albums.filter(a => a._rights);
check(withRights.length > 0, `albums carry _rights (${withRights.length}/${albums.length})`);
check(albums.every(a => '_detailUrl' in a), 'every album has _detailUrl');
const labels = [...new Set(withRights.map(a => a._rights.label))].slice(0, 8);
console.log('  sample album rights labels:', JSON.stringify(labels));

// getTracks on the first album that actually has playable tracks.
let probed = 0, trackRights = null, detail = null, trackCount = 0;
for (const a of albums.slice(0, 6)) {
  const id = decodeURIComponent(a.url.split('/details/')[1]);
  const tracks = await getTracks(id, null, { mediaType: 'audio' });
  probed++;
  if (tracks.length) {
    trackCount = tracks.length;
    trackRights = tracks[0]._rights;
    detail = tracks[0]._detailUrl;
    console.log(`  ${id}: ${tracks.length} tracks; first _rights=`, JSON.stringify(trackRights), 'detail=', detail);
    break;
  }
}
check(trackCount > 0, `getTracks returned tracks (after ${probed} probe(s))`);
check(detail && detail.includes('/details/'), 'tracks carry _detailUrl');
check(trackRights === null || (trackRights && typeof trackRights.label === 'string'),
  'track _rights is null or a {label,...} snapshot');

console.log(fails ? `\n${fails} failure(s)` : '\nIA rights adapter validated.');
process.exit(fails ? 1 : 0);
