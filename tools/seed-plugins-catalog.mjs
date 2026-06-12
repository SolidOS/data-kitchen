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
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Curated seed. Drawn from the manifests' component lists (sol-components +
// dk) but hand-filtered to plugin-sized pieces; paths point into each
// plugin's self-contained folder. Icons are plain emoji characters (rendered
// by the system emoji font — Noto Emoji on Linux, OFL/Apache licensed; no
// bundled image assets). `list` says which ui:Menu seeds the entry:
// 'use' = #InUse (data/tabs.ttl currently mounts it), 'avail' = #Available.
// NOTE: a bare <sol-include> is NOT a plugin (it does nothing by itself), so
// there is deliberately no generic "Page (HTML include)" entry — only
// concrete pages like Dev Tools that bring their own source.
const PLUGINS = [
  { label: 'News (three-panel feeds)', icon: '📰', tag: 'sol-feed',
    desc: 'Read news feeds in a three-panel reader: sources, headlines, article.',
    params: [['view', 'threePanel'], ['reader', 'inline'],
      ['source', './plugins/news/feeds.ttl#Feeds']] },
  { label: 'Music (Internet Archive)', icon: '🎵', tag: 'ia-player',
    desc: 'Browse and play music collections from the Internet Archive.',
    params: [['storage-ns', 'music'], ['defer', ''],
      ['source', './plugins/ia-player/libraries/internet_archive_music/index.ttl']] },
  { label: 'Movies (Internet Archive)', icon: '🎬', tag: 'ia-player',
    desc: 'Browse and play films from the Internet Archive.',
    params: [['storage-ns', 'movies'], ['favourites-only', ''], ['defer', ''],
      ['source', './plugins/ia-player/libraries/internet_archive_movies/index.ttl']] },
  { label: 'Images (Wikimedia)', icon: '🖼', tag: 'omp-images',
    desc: 'Browse Wikimedia image galleries.',
    params: [['source', './plugins/omp-images/libraries/wikimedia_images/images.ttl#Images']] },
  { label: 'Workspaces (pod browser)', icon: '🗂', tag: 'dk-podz',
    desc: 'Browse and manage your Solid pods and workspaces.',
    params: [['source', './plugins/podz/dk-podz.html'], ['defer', '']] },
  { label: 'SolidOS (data browser)', icon: '🐧', tag: 'dk-solidos', list: 'avail',
    desc: 'The SolidOS data browser, embedded.',
    params: [['source', './plugins/solidos/dk-solidos.html'], ['defer', '']] },
  { label: 'Dev Tools (playgrounds)', icon: '🛠', tag: 'sol-include',
    desc: 'JSON-LD, RDF, SHACL and SPARQL playgrounds, plus Solid resources.',
    params: [['source', './plugins/dev-tools/dev-tools.html'], ['trusted', '']] },
  { label: 'Search', icon: '🔍', tag: 'sol-search',
    desc: 'Search box for the button bar (pluggable search engines).',
    params: [['source', './plugins/search/search-engines.ttl#SearchEngines']] },
  { label: 'Calendar', icon: '📅', tag: 'dk-calendar-popout',
    desc: 'Pop-out month calendar for the button bar.',
    params: [['source', './plugins/calendar/calendar-settings.ttl#All']] },
  { label: 'Sign in', icon: '🔑', tag: 'sol-login',
    desc: 'Solid sign-in button (popup flow).',
    params: [['mode', 'popup'], ['popup-callback', 'node_modules/podz/popup-auth-callback.html'],
      ['issuers', 'https://solidcommunity.net,https://solidweb.me,https://solidweb.org,https://login.inrupt.com']] },
  { label: 'Weather', icon: '🌤', tag: 'sol-weather', list: 'avail',
    desc: 'Weather widget (location and units in its settings file).',
    params: [['source', './plugins/weather/weather-settings.ttl#Settings']] },
  { label: 'Clock', icon: '🕐', tag: 'sol-time', list: 'avail',
    desc: 'Clock widget (timezone in its settings file).',
    params: [['source', './plugins/time/time-settings.ttl#Settings']] },
  { label: 'Theme toggle', icon: '🌗', tag: 'sol-button', list: 'avail',
    desc: 'Button that switches between light and dark themes.',
    params: [['data-handler', 'toggleTheme'], ['title', 'Toggle light / dark']] },
  { label: 'Text size', icon: '🔤', tag: 'sol-button', list: 'avail',
    desc: 'Button that cycles the app text size.',
    params: [['data-handler', 'cycleFontSize'], ['title', 'Text size']] },
];

const frag = (label) => label.replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '');

const inList = (which) =>
  PLUGINS.filter((p) => (p.list || 'use') === which).map((p) => `<#${frag(p.label)}>`).join(' ');

let ttl = `@prefix ui:     <http://www.w3.org/ns/ui#> .
@prefix rdfs:   <http://www.w3.org/2000/01/rdf-schema#> .
@prefix schema: <http://schema.org/> .

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
  ui:parts ( ${inList('avail')} ) .

`;
for (const { label, icon, desc, tag, params } of PLUGINS) {
  ttl += `<#${frag(label)}> a ui:Component ; ui:label ${JSON.stringify(label)} ; ui:name ${JSON.stringify(tag)} ;\n`;
  ttl += `  ui:icon ${JSON.stringify(icon)} ;\n`;
  ttl += `  rdfs:comment ${JSON.stringify(desc)}`;
  if (params.length) {
    ttl += ' ;\n  ui:attribute\n' + params.map(([k, v]) =>
      `    [ schema:name ${JSON.stringify(k)} ; schema:value ${JSON.stringify(v)} ]`).join(' ,\n');
  }
  ttl += ' .\n\n';
}

writeFileSync(join(root, 'data', 'plugins-catalog.ttl'), ttl);
console.log(`wrote data/plugins-catalog.ttl with ${PLUGINS.length} plugins`);
