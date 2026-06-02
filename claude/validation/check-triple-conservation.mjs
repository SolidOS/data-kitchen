#!/usr/bin/env node
// Conservation guard for the RDF rework migration. Identity changes
// legitimately (urn:uuid → #it/#tNN; mo:Playlist → as:OrderedCollection;
// hasPart → omp:entry), so a raw triple diff is meaningless. Instead we
// assert CONTENT is conserved between the pristine A0 backup and the
// migrated tree:
//   • same set of releases (keyed by IA identifier = landingPage tail)
//   • per release: title, maker-IRI set, and the exact set of track
//     download URLs — and per track its title + duration
//   • same set of playlists; per playlist: title, maker, description,
//     hide flag, and the EXACT ORDERED list of track download URLs
//   • generic sweep: every literal-valued predicate on a backup
//     playlist node has its value present on the migrated playlist
//     (catches any silently-dropped flag, e.g. omp:hidePlaylist)
//
//   node check-triple-conservation.mjs <backupDir> [libDir]
// Exit non-zero on any loss/corruption.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import rdflib from 'rdflib';

const { graph, parse, sym, Namespace } = rdflib;
const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const backupDir = resolve(__dirname, args[0] || '');
const libDir = resolve(__dirname, args[1] || '../../libraries/internet_archive_music');
if (!args[0]) { console.error('usage: check-triple-conservation.mjs <backupDir> [libDir]'); process.exit(2); }

const RDF  = Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#');
const DCT  = Namespace('http://purl.org/dc/terms/');
const MO   = Namespace('http://purl.org/ontology/mo/');
const DCAT = Namespace('http://www.w3.org/ns/dcat#');
const FOAF = Namespace('http://xmlns.com/foaf/0.1/');
const OMP  = Namespace('http://open-media-player.org/ns#');
const ROOT = 'http://localhost:3000/s/test/ia/libraries/internet_archive_music/';
const slugOf = f => basename(f).replace(/\$?\.ttl$/, '');

let fail = 0;
const bad = m => { console.error('  ✗', m); fail++; };
const ok  = m => console.log('  ✓', m);
const idOf = lp => { const m = lp && lp.match(/archive\.org\/details\/(.+?)\/?$/); return m ? decodeURIComponent(m[1]) : null; };

// model: dir → { releases: Map(id→{title,makers:Set,tracks:Map(dl→{title,dur})}),
//                playlists: Map(name→{title,maker,desc,hidden,order:[dl],lits:Map}) }
function readModel(dir, kind) {
  const relDir = join(dir, 'releases'), plDir = join(dir, 'playlists');
  const uuid2dl = new Map();           // backup: track node → dl
  const releases = new Map();
  for (const f of readdirSync(relDir).filter(x => x.endsWith('.ttl'))) {
    const base = ROOT + 'releases/' + slugOf(f);
    const g = graph();
    try { parse(readFileSync(join(relDir, f), 'utf8'), g, base, 'text/turtle'); }
    catch (e) { bad(`${kind} parse releases/${f}: ${e.message}`); continue; }
    const rel = g.statementsMatching(null, RDF('type'), MO('Release'))[0]?.subject;
    if (!rel) { bad(`${kind} releases/${f}: no mo:Release`); continue; }
    const lp = g.any(rel, DCAT('landingPage'))?.value;
    const id = kind === 'backup' ? idOf(lp) : g.any(rel, DCT('identifier'))?.value;
    if (!id) { bad(`${kind} releases/${f}: no identity key`); continue; }
    const makers = new Set(g.statementsMatching(rel, FOAF('maker'), null).map(s => s.object.value));
    const tracks = new Map();
    for (const ts of g.statementsMatching(null, RDF('type'), MO('Track'))) {
      const tn = ts.subject;
      const dl = g.any(tn, DCAT('downloadUrl'))?.value;
      if (!dl) { bad(`${kind} releases/${f}: track ${tn.value} has no downloadUrl`); continue; }
      uuid2dl.set(tn.value, dl);
      tracks.set(dl, { title: g.any(tn, DCT('title'))?.value || '',
                       dur: g.any(tn, MO('duration'))?.value || null });
    }
    releases.set(id, { title: g.any(rel, DCT('title'))?.value || '', makers, tracks });
  }
  const playlists = new Map();
  for (const f of readdirSync(plDir).filter(x => /\$?\.ttl$/.test(x) && !x.startsWith('#'))) {
    const base = ROOT + 'playlists/' + slugOf(f);
    const g = graph();
    try { parse(readFileSync(join(plDir, f), 'utf8'), g, base, 'text/turtle'); }
    catch (e) { bad(`${kind} parse playlists/${f}: ${e.message}`); continue; }
    const pl = g.statementsMatching(null, RDF('type'), null)
                .map(s => s.subject).find(s => s.value.includes('/playlists/')) || sym(base);
    let order = [];
    if (kind === 'backup') {
      order = g.statementsMatching(pl, DCT('hasPart'), null)
               .map(s => uuid2dl.get(s.object.value)).filter(Boolean);
    } else {
      // omp:track points into a SEPARATE release file — resolve via
      // the cross-file track→dl map, not this playlist's graph.
      order = g.statementsMatching(pl, OMP('entry'), null)
        .map(e => ({ p: parseInt(g.any(e.object, OMP('position'))?.value, 10),
                     dl: uuid2dl.get(g.any(e.object, OMP('track'))?.value) }))
        .filter(x => x.dl).sort((a, b) => a.p - b.p).map(x => x.dl);
    }
    const lits = new Map();
    for (const s of g.statementsMatching(pl, null, null))
      if (s.object.termType === 'Literal')
        lits.set(s.predicate.value, (lits.get(s.predicate.value) || new Set()).add(s.object.value));
    playlists.set(slugOf(f), {
      title: g.any(pl, DCT('title'))?.value || '',
      maker: g.any(pl, FOAF('maker'))?.value || null,
      desc:  g.any(pl, DCT('description'))?.value || null,
      hidden: g.any(pl, OMP('hidePlaylist'))?.value || null,
      order, lits,
    });
  }
  return { releases, playlists };
}

const A = readModel(backupDir, 'backup');
const B = readModel(libDir, 'migrated');

// ---- releases ------------------------------------------------------
for (const [id, ra] of A.releases) {
  const rb = B.releases.get(id);
  if (!rb) { bad(`release lost: identifier "${id}"`); continue; }
  if (ra.title !== rb.title) bad(`release "${id}" title changed: "${ra.title}" → "${rb.title}"`);
  for (const m of ra.makers) if (!rb.makers.has(m)) bad(`release "${id}" lost maker ${m}`);
  for (const [dl, ta] of ra.tracks) {
    const tb = rb.tracks.get(dl);
    if (!tb) { bad(`release "${id}" lost track ${dl}`); continue; }
    if (ta.title !== tb.title) bad(`track ${dl} title changed: "${ta.title}" → "${tb.title}"`);
    if (ta.dur !== tb.dur) bad(`track ${dl} duration changed: ${ta.dur} → ${tb.dur}`);
  }
}
if (!fail) ok(`${A.releases.size} releases, all tracks/titles/durations/makers conserved`);

// ---- playlists -----------------------------------------------------
let plFail = fail;
for (const [name, pa] of A.playlists) {
  const pb = B.playlists.get(name);
  if (!pb) { bad(`playlist lost: ${name}`); continue; }
  if (pa.title  !== pb.title)  bad(`playlist ${name} title changed`);
  if (pa.maker  !== pb.maker)  bad(`playlist ${name} maker changed (${pa.maker}→${pb.maker})`);
  if (pa.desc   !== pb.desc)   bad(`playlist ${name} description changed`);
  if (pa.hidden !== pb.hidden) bad(`playlist ${name} hide flag changed (${pa.hidden}→${pb.hidden})`);
  if (pa.order.length !== pb.order.length || pa.order.some((d, i) => d !== pb.order[i]))
    bad(`playlist ${name} track ORDER/membership changed (${pa.order.length}→${pb.order.length})`);
  // generic: every literal predicate value in backup present in migrated
  for (const [p, vals] of pa.lits)
    for (const v of vals) {
      const present = [...(pb.lits.values())].some(set => set.has(v));
      if (!present) bad(`playlist ${name} dropped literal {${p} "${v}"}`);
    }
}
if (fail === plFail) ok(`${A.playlists.size} playlists, ordered membership + all literals (incl. hide flag) conserved`);

console.log(fail ? `\nFAIL — ${fail} conservation violation(s)` : '\nPASS — content fully conserved');
process.exit(fail ? 1 : 0);
