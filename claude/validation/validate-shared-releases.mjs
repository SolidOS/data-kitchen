// READ-ONLY post-migration validation.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import rdflib from 'rdflib';
const { graph, parse, Namespace } = rdflib;
const libDir = 'libraries/internet_archive_music';
const RDF=Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#');
const RDFS=Namespace('http://www.w3.org/2000/01/rdf-schema#');
const DCT=Namespace('http://purl.org/dc/terms/');
const DCAT=Namespace('http://www.w3.org/ns/dcat#');
const MO=Namespace('http://purl.org/ontology/mo/');

let fail = 0;
const bad = (m) => { console.log('  FAIL: ' + m); fail++; };

// 1. all release files parse; collect defined Track IRIs + lp per file
const defined = new Set();
const fileByLp = new Map();
let relFiles = 0, relParseErr = 0;
for (const f of readdirSync(join(libDir,'releases'))) {
  if (!f.endsWith('.ttl')) continue;
  relFiles++;
  const url = 'http://localhost:3000/s/test/ia/libraries/internet_archive_music/releases/'+f.replace(/\$?\.ttl$/,'');
  const g = graph();
  try { parse(readFileSync(join(libDir,'releases',f),'utf8'),g,url,'text/turtle'); }
  catch(e){ relParseErr++; bad(`release parse ${f}: ${e.message}`); continue; }
  for (const t of g.match(null,RDF('type'),MO('Track'))) defined.add(t.subject.value);
  const rel = g.match(null,RDF('type'),MO('Release'))[0]?.subject;
  const lp = rel && g.any(rel,DCAT('landingPage'))?.value;
  if (lp){ if(!fileByLp.has(lp)) fileByLp.set(lp,[]); fileByLp.get(lp).push(f); }
}

// 2. every playlist: pointer-only + hasPart resolves
let pls=0, ptrOnly=0, totHasPart=0, dangle=0;
const sharedSeen={};
for (const f of readdirSync(join(libDir,'playlists'))) {
  if (!f.endsWith('.ttl')) continue;
  pls++;
  const url='http://localhost:3000/s/test/ia/libraries/internet_archive_music/playlists/'+f.replace(/\$?\.ttl$/,'');
  const g=graph();
  try { parse(readFileSync(join(libDir,'playlists',f),'utf8'),g,url,'text/turtle'); }
  catch(e){ bad(`playlist parse ${f}: ${e.message}`); continue; }
  const hasTrk=g.match(null,RDF('type'),MO('Track')).length;
  const hasRel=g.match(null,RDF('type'),MO('Release')).length;
  if (hasTrk===0 && hasRel===0) ptrOnly++;
  else bad(`${f} still has ${hasTrk} Track / ${hasRel} Release blocks (not pointer-only)`);
  const pl=g.match(null,RDF('type'),MO('Playlist'))[0]?.subject;
  if(!pl){ bad(`${f} no mo:Playlist`); continue; }
  const parts=g.match(pl,DCT('hasPart'),null).map(s=>s.object.value);
  totHasPart+=parts.length;
  if(parts.length===0) bad(`${f} empty hasPart`);
  for(const p of parts){ if(!defined.has(p)){ dangle++; if(dangle<=5) bad(`${f} dangling hasPart ${p}`);} }
}

// 3. releases.ttl index covers every release file's landingPage
const idx=graph();
parse(readFileSync(join(libDir,'releases.ttl'),'utf8'),idx,'urn:i','text/turtle');
const idxSee=new Set(idx.match(null,RDFS('seeAlso'),null).map(s=>s.object.value));
const idxLp=idx.match(null,DCAT('landingPage'),null).length;

// 4. duplicate landingPage across release files (should be 0 — dedup)
let dupLp=0;
for(const [lp,fs] of fileByLp) if(fs.length>1){ dupLp++; bad(`landingPage in ${fs.length} files: ${lp} [${fs.join(', ')}]`);}

console.log(`release files            : ${relFiles}  (parse errors ${relParseErr})`);
console.log(`  defined Track IRIs     : ${defined.size}`);
console.log(`  distinct landingPages  : ${fileByLp.size}  (duplicate-lp files: ${dupLp})`);
console.log(`releases.ttl seeAlso     : ${idxSee.size}   landingPage triples: ${idxLp}`);
console.log(`playlists                : ${pls}  (pointer-only ${ptrOnly})`);
console.log(`total hasPart pointers   : ${totHasPart}  (dangling ${dangle})`);
console.log(fail===0 ? '\nALL VALID ✓' : `\n${fail} FAILURE(S) ✗`);
process.exit(fail?1:0);
