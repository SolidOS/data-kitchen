// pod-only-filter: pulled defaults are stripped of owner-personal content —
// catalog entries without a repo manifest (google cards, Home), the Home tab
// in the main menu, off-origin pod locations, and non-neutral theme prefs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripCatalog, stripMainMenu, stripSettings } from '../../tools/pod-only-filter.mjs';

const dir = mkdtempSync(join(tmpdir(), 'pod-only-'));
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));

const CATALOG = `@prefix : <#>.
@prefix ui: <http://www.w3.org/ns/ui#>.
@prefix schema: <http://schema.org/>.
@prefix skos: <http://www.w3.org/2004/02/skos/core#>.
@prefix dct: <http://purl.org/dc/terms/>.
@prefix plug: <../plugins/>.
:Available a schema:ItemList; schema:itemListElement :A-Good, :A-Gmail, :A-Home.
:A-Good a schema:ListItem; schema:item :Good; schema:position 1 .
:A-Gmail a schema:ListItem; schema:item :Gmail; schema:position 2 .
:A-Home a schema:ListItem; schema:item :Home; schema:position 3 .
:Good a ui:Plugin; dct:source plug:good.ttl; ui:label "Good".
:Gmail a ui:Plugin; dct:source plug:gmail.ttl; ui:label "Gmail".
:Home a ui:Plugin; ui:label "Home".
:Comms a skos:Collection; skos:member :Good, :Gmail; skos:prefLabel "Comms".
`;

const MENU = `@prefix : <#>.
@prefix ui: <http://www.w3.org/ns/ui#>.
@prefix schema: <http://schema.org/>.
@prefix data: <data-kitchen-plugins-catalog.ttl#>.
:Home a ui:Component; ui:label "Home".
:Tabs a ui:Menu; schema:itemListElement :Tabs-Pods, :Tabs-Home; ui:label "Menu Tabs".
:Tabs-Pods a schema:ListItem; schema:item :Pods; schema:position 1 .
:Tabs-Home a schema:ListItem; schema:item data:Home; schema:position 2 .
:Pods a ui:Menu; ui:label "Pods".
`;

const SETTINGS = `@prefix : <#>.
@prefix schema: <http://schema.org/>.
@prefix ui: <http://www.w3.org/ns/ui#>.
@prefix dk: <../../>.
@prefix jeff: <https://jeff.example/>.
:loc1 a schema:ListItem; schema:item dk:; schema:name "Own pod"; schema:position 1 .
:loc2 a schema:ListItem; schema:item jeff:; schema:name "jeff.example"; schema:position 2 .
:Locations a schema:ItemList; schema:itemListElement :loc1, :loc2; schema:name "Pod locations".
:Settings ui:colorScheme ui:LightColorScheme; ui:fontSize ui:SmallFont; ui:proxy "http://localhost:8001/proxy?uri=".
`;

test('stripCatalog drops manifest-less and pod-only entries everywhere', async () => {
  const cat = join(dir, 'catalog.ttl');
  const plugins = join(dir, 'plugins');
  mkdirSync(plugins, { recursive: true });
  writeFileSync(join(plugins, 'good.ttl'), '');
  writeFileSync(cat, CATALOG);
  const dropped = await stripCatalog(cat, plugins);
  assert.deepEqual(dropped.sort(), ['Gmail', 'Home']);
  const out = readFileSync(cat, 'utf8');
  assert.match(out, /:Good/);
  assert.doesNotMatch(out, /Gmail|:Home\b|:A-Gmail|:A-Home/);
  // collection membership pruned, list intact
  assert.match(out, /skos:member :Good[;.]/);
  // idempotent
  assert.deepEqual(await stripCatalog(cat, plugins), []);
});

test('stripMainMenu drops the Home component and its catalog-ref wrapper', async () => {
  const menu = join(dir, 'main-menu.ttl');
  writeFileSync(menu, MENU);
  const dropped = await stripMainMenu(menu);
  assert.ok(dropped.includes('Home'));
  const out = readFileSync(menu, 'utf8');
  assert.doesNotMatch(out, /Home/);
  assert.match(out, /:Tabs-Pods/);
  assert.deepEqual(await stripMainMenu(menu), []);
});

test('stripSettings keeps same-origin locations, resets theme to neutral', async () => {
  const settings = join(dir, 'settings.ttl');
  writeFileSync(settings, SETTINGS);
  const dropped = await stripSettings(settings);
  assert.ok(dropped.includes('jeff.example'));
  assert.ok(dropped.some((d) => d.startsWith('colorScheme')));
  assert.ok(dropped.some((d) => d.startsWith('fontSize')));
  const out = readFileSync(settings, 'utf8');
  assert.match(out, /Own pod/);
  assert.doesNotMatch(out, /jeff\.example/);
  assert.match(out, /ui:SystemColorScheme/);
  assert.match(out, /ui:MediumFont/);
  assert.match(out, /ui:proxy/);
  assert.deepEqual(await stripSettings(settings), []);
});
