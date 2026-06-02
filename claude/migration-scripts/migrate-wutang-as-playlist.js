// One-off: rebuild "Wu-Tang Clan" as a normal converted-artist playlist
// so it's identical in shape to every other converted artist (J_Dilla
// is the exact analog: converted, hidden, Hip_Hop, localData "true").
//
// A previous session dropped & re-inserted Wu-Tang in the OLD snapshot
// shape (24 releases foaf:maker the agent; no playlist; no
// omp:sourcePlaylist), so it falls into getLocalArtistAlbums' legacy
// foaf:maker branch and isCuratedArtist can't classify it without
// release files (the lazy-load "Raw until opened" edge). This makes it
// pointer-only like the others: a hidden playlist of its releases'
// tracks + the agent's omp:sourcePlaylist link + the playlists.ttl
// spine edge. Purely ADDITIVE to release data (no release file touched).
//
//   node migrate-wutang-as-playlist.js [libDir]           # dry run
//   node migrate-wutang-as-playlist.js --apply [libDir]   # write
//
// --apply backs up agents.ttl + playlists.ttl first and writes the new
// playlists/Wu_Tang_Clan$.ttl. Idempotent: aborts if already linked.

import { readFileSync, writeFileSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import rdflib from 'rdflib';

const { graph, parse, sym, literal, Namespace } = rdflib;
const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const libDir = resolve(__dirname,
  args.find(a => !a.startsWith('--')) || 'libraries/internet_archive_music');

const ROOT = 'http://localhost:3000/s/test/ia/libraries/internet_archive_music/';
const FOAF = Namespace('http://xmlns.com/foaf/0.1/');
const MO   = Namespace('http://purl.org/ontology/mo/');
const ARTIST_NAME = 'Wu-Tang Clan';
const SLUG = 'Wu_Tang_Clan';
const PL_PATH = `playlists/${SLUG}$.ttl`;
const PL_URL  = ROOT + 'playlists/' + SLUG;

// ---- load agents + every release file ------------------------------
const store = graph();
const pd = (rel, iri) => {
  const p = join(libDir, rel);
  if (existsSync(p)) try { parse(readFileSync(p, 'utf8'), store, iri, 'text/turtle'); }
                     catch (e) { console.warn('parse skip', rel, e.message); }
};
pd('agents.ttl', ROOT + 'agents.ttl');
for (const f of readdirSync(join(libDir, 'releases')).filter(f => f.endsWith('.ttl')))
  pd('releases/' + f, ROOT + 'releases/' + f.replace(/\$?\.ttl$/, ''));

const agentNode = store.statementsMatching(null, FOAF('name'), literal(ARTIST_NAME))
  .map(s => s.subject).find(Boolean);
if (!agentNode) { console.error(`! agent "${ARTIST_NAME}" not found`); process.exit(1); }

const agentsTtl = readFileSync(join(libDir, 'agents.ttl'), 'utf8');
if (agentsTtl.includes('/playlists/' + SLUG) || existsSync(join(libDir, PL_PATH))) {
  console.log('already linked (sourcePlaylist or playlist file present) — nothing to do.');
  process.exit(0);
}

// releases it makes → their tracks, deterministic order ---------------
const slugOf = u => u.split('/releases/')[1]?.split('#')[0];
const fragNum = u => parseInt((u.split('#')[1] || '').replace(/\D/g, ''), 10) || 0;
const releases = [...new Set(store.match(null, FOAF('maker'), agentNode)
  .map(s => s.subject.value))].sort((a, b) => slugOf(a).localeCompare(slugOf(b)));
const tracks = [];
for (const r of releases)
  for (const s of store.match(sym(r), MO('track'), null)
        .sort((x, y) => fragNum(x.object.value) - fragNum(y.object.value)))
    tracks.push(s.object.value);

if (!tracks.length) { console.error('! no tracks found for', ARTIST_NAME); process.exit(1); }

// ---- build the playlist file (mirror J_Dilla exactly) --------------
const W = String(tracks.length).length < 2 ? 2 : String(tracks.length).length;
const eid = i => '#e' + String(i + 1).padStart(W, '0');
const entryList = tracks.map((_, i) => `<${eid(i)}>`).join(', ');
const blocks = tracks.map((t, i) => {
  const slug = slugOf(t), frag = t.split('#')[1];
  return `<${eid(i)}>\n    omp:position ${i + 1} ;\n    omp:track <../releases/${slug}#${frag}> .`;
}).join('\n\n');
const playlistTtl =
`@prefix dct: <http://purl.org/dc/terms/> .
@prefix as: <https://www.w3.org/ns/activitystreams#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix omp: <http://open-media-player.org/ns#> .

<>
    a as:OrderedCollection, dcat:Dataset ;
    dct:title ${JSON.stringify(ARTIST_NAME)} ;
    dct:isPartOf <../playlists.ttl#it> ;
    foaf:maker "jeffz" ;
    omp:hidePlaylist "true" ;
    omp:entry ${entryList} .

${blocks}
`;

// ---- agents.ttl: append sourcePlaylist to the Wu-Tang block --------
const localLine = `    <http://open-media-player.org/ns#localData> "true".`;
const agentLine = `<${agentNode.value}> a mo:MusicArtist;`;
if (!agentsTtl.includes(agentLine) || !agentsTtl.includes(localLine)) {
  console.error('! Wu-Tang agent block not in the expected verbatim shape — aborting (no guess).');
  process.exit(1);
}
const newAgentBlockTail =
`    <http://open-media-player.org/ns#localData> "true";
    <http://open-media-player.org/ns#sourcePlaylist> <${PL_URL}>.`;
const agentsOut = agentsTtl.replace(localLine, newAgentBlockTail);
if (agentsOut === agentsTtl || agentsOut.split(newAgentBlockTail).length !== 2) {
  console.error('! agents.ttl patch not applied uniquely — aborting.'); process.exit(1);
}

// ---- playlists.ttl: add the spine dcat:dataset edge ----------------
const plsPath = join(libDir, 'playlists.ttl');
const plsTtl = readFileSync(plsPath, 'utf8');
const m = plsTtl.match(/dcat:dataset\s+([\s\S]*?)\s*\.\s*$/m)
       || plsTtl.match(/dcat:dataset\s+([\s\S]*?)\s*\./);
if (!m) { console.error('! could not find dcat:dataset list in playlists.ttl'); process.exit(1); }
const items = m[1].split(',').map(s => s.trim()).filter(Boolean);
const want = `<./playlists/${SLUG}>`;
const merged = [...new Set([...items, want])]
  .sort((a, b) => a.localeCompare(b));
const rebuilt = 'dcat:dataset ' + merged.join(',\n                 ') + ' .';
const plsOut = plsTtl.replace(m[0], rebuilt);

// ---- report --------------------------------------------------------
console.log(`library      : ${libDir}`);
console.log(`agent        : ${agentNode.value}  ("${ARTIST_NAME}")`);
console.log(`releases     : ${releases.length}`);
console.log(`tracks       : ${tracks.length}  → ${PL_PATH} (hidden, pointer-only)`);
console.log(`agents.ttl   : + omp:sourcePlaylist → ${PL_URL}`);
console.log(`playlists.ttl: + dcat:dataset ${want} (spine, alphabetical)`);
console.log(`sample       : ${tracks.slice(0, 3).map(t => t.replace(ROOT, '')).join('  ')}`);

if (!apply) { console.log('\n(dry run) — pass --apply to write the 3 changes + backups'); process.exit(0); }

const ts = new Date().toISOString().replace(/[:.]/g, '-');
copyFileSync(join(libDir, 'agents.ttl'), join(libDir, `agents.ttl.pre-wutang-${ts}`));
copyFileSync(plsPath, join(libDir, `playlists.ttl.pre-wutang-${ts}`));
writeFileSync(join(libDir, PL_PATH), playlistTtl);
writeFileSync(join(libDir, 'agents.ttl'), agentsOut);
writeFileSync(plsPath, plsOut);
console.log(`\napplied. backups: agents.ttl.pre-wutang-${ts}, playlists.ttl.pre-wutang-${ts}`);
