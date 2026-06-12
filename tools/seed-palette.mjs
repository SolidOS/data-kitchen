// One-shot seeder for data/palette.ttl — the curated catalog of plugins
// <sol-plugin-manager> manages. Reads the component lists from
// sol-components' manifest + dk.manifest.json, keeps only the entries that
// make sense as user-placeable plugins (big tab plugins and bar buttons —
// not low-level pieces like sol-include internals), and writes TWO ui:Menu
// lists over one pool of ui:Component parts: #InUse (what the app mounts)
// and #Available (on the shelf). Run once, then CURATE WITH Manage Plugins
// (or by hand); re-running overwrites.
//
//   node tools/seed-palette.mjs
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Curated seed: label, tag, default attributes, list ('use' = #InUse,
// 'avail' = #Available — i.e. whether data/tabs.ttl currently mounts it).
// Drawn from the manifests' component lists (sol-components + dk) but
// hand-filtered to plugin-sized pieces; paths point into each plugin's
// self-contained folder.
const PLUGINS = [
  ['News (three-panel feeds)', 'sol-feed', [
    ['view', 'threePanel'], ['reader', 'inline'],
    ['source', './plugins/news/feeds.ttl#Feeds']]],
  ['Music (Internet Archive)', 'ia-player', [
    ['storage-ns', 'music'], ['defer', ''],
    ['source', './plugins/ia-player/libraries/internet_archive_music/index.ttl']]],
  ['Movies (Internet Archive)', 'ia-player', [
    ['storage-ns', 'movies'], ['favourites-only', ''], ['defer', ''],
    ['source', './plugins/ia-player/libraries/internet_archive_movies/index.ttl']]],
  ['Images (Wikimedia)', 'omp-images', [
    ['source', './plugins/omp-images/libraries/wikimedia_images/images.ttl#Images']]],
  ['Workspaces (pod browser)', 'dk-podz', [
    ['source', './plugins/podz/dk-podz.html'], ['defer', '']]],
  ['SolidOS (data browser)', 'dk-solidos', [
    ['source', './plugins/solidos/dk-solidos.html'], ['defer', '']], 'avail'],
  ['Home (dashboard)', 'sol-include', [
    ['source', './plugins/home/home.html'], ['trusted', '']], 'avail'],
  ['Dev Tools (playgrounds)', 'sol-include', [
    ['source', './plugins/dev-tools/dev-tools.html'], ['trusted', '']]],
  ['Page (HTML include)', 'sol-include', [
    ['source', ''], ['trusted', '']], 'avail'],
  ['Search', 'sol-search', [
    ['source', './plugins/search/search-engines.ttl#SearchEngines']]],
  ['Calendar', 'dk-calendar-popout', [
    ['source', './plugins/calendar/calendar-settings.ttl#All']]],
  ['Sign in', 'sol-login', [
    ['mode', 'popup'], ['popup-callback', 'node_modules/podz/popup-auth-callback.html'],
    ['issuers', 'https://solidcommunity.net,https://solidweb.me,https://solidweb.org,https://login.inrupt.com']]],
  ['Theme toggle', 'sol-button', [['data-handler', 'toggleTheme'], ['title', 'Toggle light / dark']], 'avail'],
  ['Text size', 'sol-button', [['data-handler', 'cycleFontSize'], ['title', 'Text size']], 'avail'],
];

const frag = (label) => label.replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '');

const inList = (which) =>
  PLUGINS.filter((p) => (p[3] || 'use') === which).map(([l]) => `<#${frag(l)}>`).join(' ');

let ttl = `@prefix ui:     <http://www.w3.org/ns/ui#> .
@prefix rdfs:   <http://www.w3.org/2000/01/rdf-schema#> .
@prefix schema: <http://schema.org/> .

# The plugin lists <sol-plugin-manager> manages (Manage Plugins drags entries
# between them; Manage Menus offers #InUse for dragging onto the menu/bar
# managers). Two ui:Menu lists of ui:Component entries over one shared pool,
# seeded by tools/seed-palette.mjs and edited by the manager thereafter.

<#InUse> a ui:Menu ; ui:label "Plugins to Use" ;
  rdfs:comment "The plugins this app uses — the palette Manage Menus offers for dragging onto the tab menu and button bar. Edited with Manage Plugins (drag between lists; auto-saves)." ;
  ui:parts ( ${inList('use')} ) .

<#Available> a ui:Menu ; ui:label "Plugins Available" ;
  rdfs:comment "Plugins on the shelf — known to the app but not in use. Drag a manifest URL (or type it) into Manage Plugins to add one; drag a card to Plugins to Use to adopt it." ;
  ui:parts ( ${inList('avail')} ) .

`;
for (const [label, tag, params] of PLUGINS) {
  ttl += `<#${frag(label)}> a ui:Component ; ui:label ${JSON.stringify(label)} ; ui:name ${JSON.stringify(tag)}`;
  if (params.length) {
    ttl += ' ;\n  ui:attribute\n' + params.map(([k, v]) =>
      `    [ schema:name ${JSON.stringify(k)} ; schema:value ${JSON.stringify(v)} ]`).join(' ,\n');
  }
  ttl += ' .\n\n';
}

writeFileSync(join(root, 'data', 'palette.ttl'), ttl);
console.log(`wrote data/palette.ttl with ${PLUGINS.length} plugins`);
