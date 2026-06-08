// Headless smoke test for the solid-ui-skos add-on (real solid-ui in real
// Chrome). Serves the sol-components tree statically, loads the
// add-on's test/smoke/page.html, and drives the flat / mint paths.
// Persistence is stubbed to in-memory in the page (no network writes).
//
//   node claude/smoke-tests/e2e-skos.mjs
//
// Resolves puppeteer-core from this app's node_modules; serves swc.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const SWC = '/home/jeff/solid/sol-components';
const CHROME = '/usr/bin/google-chrome';
const PAGE = '/packages/solid-ui-skos/test/smoke/page.html';
const SMOKE = SWC + '/packages/solid-ui-skos/test/smoke';

// (Re)build the browser bundle (real solid-ui + rdflib + solid-logic + add-on).
console.log('building bundle…');
execFileSync(SWC + '/node_modules/esbuild/bin/esbuild',
  ['entry.js', '--bundle', '--format=iife', '--platform=browser', '--outfile=bundle.js', '--log-level=error'],
  { cwd: SMOKE, stdio: 'inherit' });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.ttl': 'text/turtle', '.css': 'text/css', '.map': 'application/json' };

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const file = path.normalize(path.join(SWC, urlPath));
  if (!file.startsWith(SWC)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found: ' + urlPath); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});

const results = [];
const check = (name, cond, detail) => { results.push({ name, ok: !!cond, detail }); console.log(`${cond ? '✓' : '✗'} ${name}${detail ? '  — ' + JSON.stringify(detail) : ''}`); };
const real = arr => (arr || []).filter(t => !['—', 'undefined', ''].includes(t));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const port = await new Promise(r => server.listen(0, () => r(server.address().port)));
const base = `http://localhost:${port}`;
let browser;
try {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('console', m => { const t = m.text(); if (!/Download the React|Lit is in dev/.test(t)) console.log('  [page]', t); });
  page.on('pageerror', e => console.log('  [pageerror]', e.message));

  await page.goto(base + PAGE, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('window.__ready === true', { timeout: 20000 });

  const env = await page.evaluate(() => ({ diag: window.__diag, setupError: window.__setupError, hasSkos: !!window.__skos }));
  console.log('  UI surface:', JSON.stringify(env.diag));
  if (env.setupError) console.log('  setup error:', env.setupError);
  check('add-on installed on window.UI', env.diag && env.diag.installed && env.diag.hasFieldFn, env.diag);
  if (!env.hasSkos) throw new Error('page setup failed (no window.__skos) — see UI surface / setup error above');

  // ── flat ──
  const flat = await page.evaluate(() => window.__skos.flat());
  check('flat scheme → all 6 concepts (transitive)', real(flat.options).length === 6 && real(flat.options).includes('Marble'), { n: real(flat.options).length, options: real(flat.options).sort() });
  const picked = await page.evaluate(() => window.__skos.flatPick('Life'));
  check('flat pick "Life" writes dcat:theme #Life', picked.picked && eqArr(picked.value, ['#Life']), picked);

  // ── mint ──
  const started = await page.evaluate(() => window.__skos.mintStart('Comics'));
  check('mint: "+ New…" opened a prompt input', started.triggered === true, started);
  if (started.triggered) {
    const mint = await page.evaluate(() => window.__skos.mintResult('Comics'));
    check('mint: new skos:Concept created + typed', mint.created && mint.typed, mint);
    check('mint: placed in scheme (inScheme + topConceptOf, top-only field)', mint.inScheme && mint.topConcept, mint);
    check('mint: new concept set as the field value', mint.isValue, mint);
  }
} catch (e) {
  console.log('FATAL', e.stack || e.message);
} finally {
  if (browser) await browser.close();
  server.close();
}

const passed = results.filter(r => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length && results.length > 0 ? 0 : 1);

// helpers injected into evaluate-land are separate; these are node-side
function eqArr(a, b) { return eq(a, b); }
