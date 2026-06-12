// One-shot seeder for data/plugins-catalog.ttl — the curated catalog of plugins
// <sol-plugin-manager> manages. Reads the component lists from
// sol-components' manifest + dk.manifest.json, keeps only the entries that
// make sense as user-placeable plugins (big tab plugins and bar buttons —
// not low-level pieces like sol-include internals), and writes TWO ui:Menu
// lists over one pool of ui:Component parts: #InUse (what the app mounts)
// and #Available (on the shelf). Run once, then CURATE WITH Manage Plugins
// (or by hand); re-running overwrites.
//
//   node tools/seed-plugins-catalog.mjs
//
// Besides the curated PLUGINS table below, the seeder ingests every FLAT
// .ttl file in plugins/ — the single-file manifests of external link apps
// (`<> a ui:Link ; ui:href …`, e.g. the solidproject.org/apps directory).
// Their dct:subject literals become/extend the topic collections.
import { writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rdf } from '../node_modules/sol-components/core/rdf.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const UI_NS = 'http://www.w3.org/ns/ui#';
const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS_NS = 'http://www.w3.org/2000/01/rdf-schema#';
const DCT_NS = 'http://purl.org/dc/terms/';

// Flat single-file manifests in plugins/ — external link apps.
function readLinkApps() {
  const dir = join(root, 'plugins');
  const apps = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.ttl')) continue;
    const path = join(dir, f);
    if (!statSync(path).isFile()) continue;
    const base = 'http://dk.invalid/plugins/' + f;
    const store = rdf.graph();
    try { rdf.parse(readFileSync(path, 'utf8'), store, base, 'text/turtle'); }
    catch (e) { console.warn(`skip ${f}: ${e.message}`); continue; }
    const subj = rdf.sym(base);
    if (!store.statementsMatching(subj, rdf.sym(RDF_NS + 'type'), rdf.sym(UI_NS + 'Link')).length) continue;
    const ui = (l) => { const n = store.any(subj, rdf.sym(UI_NS + l)); return n ? n.value : null; };
    const href = ui('href');
    if (!href) { console.warn(`skip ${f}: no ui:href`); continue; }
    const dct = (l) => { const n = store.any(subj, rdf.sym(DCT_NS + l)); return n ? n.value : ''; };
    apps.push({
      label: ui('label') || f.replace(/\.ttl$/, ''),
      icon: ui('icon') || '',
      href,
      region: (ui('region') || '').split('#').pop(),
      desc: (store.any(subj, rdf.sym(RDFS_NS + 'comment')) || {}).value || '',
      creator: dct('creator'),
      publisher: dct('publisher'),
      cats: store.each(subj, rdf.sym(DCT_NS + 'subject'), null).map((n) => n.value),
    });
  }
  apps.sort((a, b) => a.label.localeCompare(b.label));
  return apps;
}
const APPS = readLinkApps();

// Curated seed. Drawn from the manifests' component lists (sol-components +
// dk) but hand-filtered to plugin-sized pieces; paths point into each
// plugin's self-contained folder. Icons are plain emoji characters (rendered
// by the system emoji font — Noto Emoji on Linux, OFL/Apache licensed; no
// bundled image assets). `list` says which ui:Menu seeds the entry:
// 'use' = #InUse (data/tabs.ttl currently mounts it), 'avail' = #Available.
// `cat` is the plugin's topic category — emitted as a skos:Collection per
// distinct value (skos:prefLabel = the heading the grouped manager shows,
// skos:member = the entries). Each plugin's manifest declares the same
// category as dct:subject, which imports use to file new entries.
// NOTE: a bare <sol-include> is NOT a plugin (it does nothing by itself), so
// there is deliberately no generic "Page (HTML include)" entry — only
// concrete pages like Dev Tools that bring their own source.
const PLUGINS = [
  { label: 'News (three-panel feeds)', cat: 'Information', icon: '📰', tag: 'sol-feed',
    desc: 'Read news feeds in a three-panel reader: sources, headlines, article.',
    params: [['view', 'threePanel'], ['reader', 'inline'],
      ['source', './plugins/news/feeds.ttl#Feeds']] },
  { label: 'Music (Internet Archive)', cat: 'Media', icon: '🎵', tag: 'ia-player',
    desc: 'Browse and play music collections from the Internet Archive.',
    params: [['storage-ns', 'music'], ['defer', ''],
      ['source', './plugins/ia-player/libraries/internet_archive_music/index.ttl']] },
  { label: 'Movies (Internet Archive)', cat: 'Media', icon: '🎬', tag: 'ia-player',
    desc: 'Browse and play films from the Internet Archive.',
    params: [['storage-ns', 'movies'], ['favourites-only', ''], ['defer', ''],
      ['source', './plugins/ia-player/libraries/internet_archive_movies/index.ttl']] },
  { label: 'Images (Wikimedia)', cat: 'Media', icon: '🖼', tag: 'omp-images',
    desc: 'Browse Wikimedia image galleries.',
    params: [['source', './plugins/omp-images/libraries/wikimedia_images/images.ttl#Images']] },
  { label: 'Workspaces (pod browser)', cat: 'Pod Management', icon: '🗂', tag: 'dk-podz',
    desc: 'Browse and manage your Solid pods and workspaces.',
    params: [['source', './plugins/podz/dk-podz.html'], ['defer', '']] },
  { label: 'SolidOS (data browser)', cat: 'Pod Management', creator: 'SolidOS Team', icon: '🐧', tag: 'dk-solidos', list: 'avail',
    desc: 'The SolidOS data browser, embedded.',
    params: [['source', './plugins/solidos/dk-solidos.html'], ['defer', '']] },
  { label: 'Dev Tools (playgrounds)', cat: 'Tech', icon: '🛠', tag: 'sol-include',
    desc: 'JSON-LD, RDF, SHACL and SPARQL playgrounds, plus Solid resources.',
    params: [['source', './plugins/dev-tools/dev-tools.html'], ['trusted', '']] },
  { label: 'Search', cat: 'Information', icon: '🔍', tag: 'sol-search',
    desc: 'Search box for the button bar (pluggable search engines).',
    params: [['source', './plugins/search/search-engines.ttl#SearchEngines']] },
  { label: 'Calendar', cat: 'Information', icon: '📅', tag: 'dk-calendar-popout',
    desc: 'Pop-out month calendar for the button bar.',
    params: [['source', './plugins/calendar/calendar-settings.ttl#All']] },
  { label: 'Sign in', cat: 'Pod Management', icon: '🔑', tag: 'sol-login',
    desc: 'Solid sign-in button (popup flow).',
    params: [['mode', 'popup'], ['popup-callback', 'node_modules/podz/popup-auth-callback.html'],
      ['issuers', 'https://solidcommunity.net,https://solidweb.me,https://solidweb.org,https://login.inrupt.com']] },
  { label: 'Weather', cat: 'Information', icon: '🌤', tag: 'sol-weather', list: 'avail',
    desc: 'Weather widget (location and units in its settings file).',
    params: [['source', './plugins/weather/weather-settings.ttl#Settings']] },
  { label: 'Clock', cat: 'Information', icon: '🕐', tag: 'sol-time', list: 'avail',
    desc: 'Clock widget (timezone in its settings file).',
    params: [['source', './plugins/time/time-settings.ttl#Settings']] },
];

const frag = (label) => label.replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '');

const inList = (which) =>
  PLUGINS.filter((p) => (p.list || 'use') === which).map((p) => `<#${frag(p.label)}>`).join(' ');

const CATS = [...new Set([
  ...PLUGINS.map((p) => p.cat).filter(Boolean),
  ...APPS.flatMap((a) => a.cats),
])];
const catMembers = (cat) => [
  ...PLUGINS.filter((p) => p.cat === cat).map((p) => `<#${frag(p.label)}>`),
  ...APPS.filter((a) => a.cats.includes(cat)).map((a) => `<#${frag(a.label)}>`),
].join(', ');

let ttl = `@prefix ui:     <http://www.w3.org/ns/ui#> .
@prefix rdfs:   <http://www.w3.org/2000/01/rdf-schema#> .
@prefix schema: <http://schema.org/> .
@prefix skos:   <http://www.w3.org/2004/02/skos/core#> .
@prefix dct:    <http://purl.org/dc/terms/> .

# The plugin lists <sol-plugin-manager> manages (Manage Plugins drags entries
# between them; Manage Menus offers #InUse for dragging onto the menu/bar
# managers). Two ui:Menu lists of ui:Component entries over one shared pool,
# seeded by tools/seed-plugins-catalog.mjs and edited by the manager thereafter.
# Each entry's ui:icon is an emoji character (system emoji font — no bundled
# image assets) and its rdfs:comment is the card blurb.

<#InUse> a ui:Menu ; ui:label "Plugins to Use" ;
  rdfs:comment "The plugins this app uses — the palette Manage Menus offers for dragging onto the tab menu and button bar. Edited with Manage Plugins (drag between lists; auto-saves)." ;
  ui:parts ( ${inList('use')} ) .

<#Available> a ui:Menu ; ui:label "Plugins Available" ;
  rdfs:comment "Plugins on the shelf — known to the app but not in use. Drag a manifest URL (or type it) into Manage Plugins to add one; drag a card to Plugins to Use to adopt it." ;
  ui:parts ( ${inList('avail')} ${APPS.map((a) => `<#${frag(a.label)}>`).join(' ')} ) .

# The whole catalog in one list — the ☰ "All Plugins…" page
# (pages/all-plugins.html) browses this.
<#All> a ui:Menu ; ui:label "All Plugins" ;
  rdfs:comment "Every plugin in the catalog, in use or not — what pages/all-plugins.html displays. Seeded; not maintained by Manage Plugins saves." ;
  ui:parts ( ${PLUGINS.map((p) => `<#${frag(p.label)}>`).join(' ')} ${APPS.map((a) => `<#${frag(a.label)}>`).join(' ')} ) .

# Topic categories — skos:Collections over the same pool; the grouped
# plugin manager renders these as headings. A plugin manifest's
# dct:subject names its category; imports file entries here.
${CATS.map((c) => `<#${frag(c)}> a skos:Collection ; skos:prefLabel ${JSON.stringify(c)} ;
  skos:member ${catMembers(c)} .`).join('\n\n')}

`;
// External link apps (from the flat plugins/*.ttl manifests).
for (const a of APPS) {
  ttl += `<#${frag(a.label)}> a ui:Link ; ui:label ${JSON.stringify(a.label)} ;\n`;
  if (a.icon) ttl += `  ui:icon ${JSON.stringify(a.icon)} ;\n`;
  if (a.region) ttl += `  ui:region ui:${a.region} ;\n`;
  if (a.desc) ttl += `  rdfs:comment ${JSON.stringify(a.desc)} ;\n`;
  if (a.creator) ttl += `  dct:creator ${JSON.stringify(a.creator)} ;\n`;
  if (a.publisher) ttl += `  dct:publisher ${JSON.stringify(a.publisher)} ;\n`;
  ttl += `  ui:href <${a.href}> .\n\n`;
}

// Default author for the shipped sol-/dk-/omp-/ia- components; an entry's
// own `creator` (e.g. SolidOS Team) overrides.
const AUTHOR = 'Jeff Zucker';
for (const { label, icon, desc, tag, params, creator } of PLUGINS) {
  ttl += `<#${frag(label)}> a ui:Component ; ui:label ${JSON.stringify(label)} ; ui:name ${JSON.stringify(tag)} ;\n`;
  ttl += `  ui:icon ${JSON.stringify(icon)} ;\n`;
  ttl += `  dct:creator ${JSON.stringify(creator || AUTHOR)} ;\n`;
  ttl += `  rdfs:comment ${JSON.stringify(desc)}`;
  if (params.length) {
    ttl += ' ;\n  ui:attribute\n' + params.map(([k, v]) =>
      `    [ schema:name ${JSON.stringify(k)} ; schema:value ${JSON.stringify(v)} ]`).join(' ,\n');
  }
  ttl += ' .\n\n';
}

writeFileSync(join(root, 'data', 'plugins-catalog.ttl'), ttl);
console.log(`wrote data/plugins-catalog.ttl with ${PLUGINS.length} plugins + ${APPS.length} link apps in ${CATS.length} topics`);
