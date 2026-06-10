// One-shot seeder for data/palette.ttl — the curated catalog of plugins the
// <sol-plugins-available> palette offers. Reads the component lists from
// sol-components' manifest + dk.manifest.json, keeps only the entries that
// make sense as user-placeable plugins (big tab plugins and bar buttons —
// not low-level pieces like sol-include internals), and writes a ui:Menu of
// ui:Component parts. Run once, then CURATE THE FILE BY HAND (or with the
// menu builder itself); re-running overwrites.
//
//   node tools/seed-palette.mjs
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Curated seed: label, tag, default attributes. Drawn from the manifests'
// component lists (sol-components + dk) but hand-filtered to plugin-sized
// pieces; paths point into each plugin's self-contained folder.
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
    ['source', './plugins/solidos/dk-solidos.html'], ['defer', '']]],
  ['Home (dashboard)', 'sol-include', [
    ['source', './plugins/home/home.html'], ['trusted', '']]],
  ['Solid Resources (links)', 'sol-include', [
    ['source', './plugins/solid-resources/resources.html'], ['trusted', '']]],
  ['Dev Tools (playgrounds)', 'sol-include', [
    ['source', './plugins/dev-tools/dev-tools.html'], ['trusted', '']]],
  ['Page (HTML include)', 'sol-include', [
    ['source', ''], ['trusted', '']]],
  ['Search', 'sol-search', [
    ['source', './plugins/search/search-engines.ttl#SearchEngines']]],
  ['Calendar', 'dk-calendar-popout', [
    ['source', './plugins/calendar/calendar-settings.ttl#All']]],
  ['Sign in', 'sol-login', [
    ['mode', 'popup'], ['popup-callback', 'node_modules/podz/popup-auth-callback.html'],
    ['issuers', 'https://solidcommunity.net,https://solidweb.me,https://solidweb.org,https://login.inrupt.com']]],
  ['Theme toggle', 'sol-button', [['data-handler', 'toggleTheme'], ['title', 'Toggle light / dark']]],
  ['Text size', 'sol-button', [['data-handler', 'cycleFontSize'], ['title', 'Text size']]],
];

const frag = (label) => label.replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '');

let ttl = `@prefix ui:     <http://www.w3.org/ns/ui#> .
@prefix schema: <http://schema.org/> .

# The plugins palette — what <sol-plugins-available> offers for dragging into
# the menu/bar builders. A plain ui:Menu of ui:Component entries (the same
# shape every menu uses), seeded by tools/seed-palette.mjs and curated by
# hand thereafter.

<#Palette> a ui:Menu ; ui:label "Available plugins" ;
  ui:parts ( ${PLUGINS.map(([l]) => `<#${frag(l)}>`).join(' ')} ) .

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
