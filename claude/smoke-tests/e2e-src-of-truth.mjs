/**
 * e2e-src-of-truth.mjs — verify the vanilla index.html + <sol-default
 * src-of-truth> switch: omp-shell reads the attribute (html | rdf, default
 * html) and points the #omp-body <sol-include> at html-first.html or
 * rdf-first.html, which then mount <sol-tabs> into the light DOM.
 *
 * Self-contained: spins up a static server on the project root. A `?rdf`
 * query makes the server rewrite src-of-truth="html" → "rdf" so both modes
 * are exercised from the one shell. News feeds won't render (no proxy) — we
 * only assert the tab STRUCTURE, so proxy/network errors are tolerated.
 *
 * Run from project root: node claude/smoke-tests/e2e-src-of-truth.mjs
 */
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

let fails = 0;
const errors = [];
const check = (ok, msg) => { if (!ok) { fails++; console.log(`✗ ${msg}`); } else console.log(`✓ ${msg}`); };

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.ttl': 'text/turtle',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    let p = decodeURIComponent(u.pathname);
    if (p === '/' || p === '') p = '/index.html';
    const file = normalize(resolve(ROOT, '.' + p));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    let body = await readFile(file);
    if (p === '/index.html' && u.searchParams.has('rdf')) {
      body = Buffer.from(body.toString('utf8').replace('src-of-truth="html"', 'src-of-truth="rdf"'));
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;
const BASE = `http://localhost:${PORT}`;

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

async function inspect(query) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 820 });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/index.html' + query, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    () => document.querySelectorAll('#omp-tabs > .sol-tabs-bar > button').length === 5,
    { timeout: 20000 });
  const out = await page.evaluate(() => {
    const inc = document.getElementById('omp-body');
    const tabs = document.getElementById('omp-tabs');
    const content = document.querySelector('#omp-tabs > .sol-tabs-content');
    return {
      bodySource: inc?.getAttribute('source') || null,
      tabsInLightDom: !!tabs && tabs.getRootNode() === document,
      siContentDisplay: inc?.querySelector('.si-content')
        ? getComputedStyle(inc.querySelector('.si-content')).display : null,
      tabsLaidOut: (tabs?.offsetHeight || 0) > 0,
      hasFromRdf: tabs?.hasAttribute('from-rdf') || false,
      hasDeclarativeChrome: !!tabs?.querySelector(':scope > .sol-tabs-bar') &&
        !!document.querySelector('#omp-tabs') && !!tabs?.querySelector('sol-login, .omp-help-launch'),
      panelNews: !!document.getElementById('panel-news'),
      ids: [...document.querySelectorAll('#omp-tabs > .sol-tabs-bar > button')].map(b => b.dataset.tabId),
    };
  });
  await page.close();
  return out;
}

try {
  // ---- default (html-first) ----
  const html = await inspect('');
  check(/html-first\.html$/.test(html.bodySource || ''), `default → #omp-body source = ${html.bodySource}`);
  check(html.tabsInLightDom, 'tabs mounted in light DOM (getElementById works)');
  check(html.siContentDisplay === 'contents', `.si-content display:contents (layout-transparent) = ${html.siContentDisplay}`);
  check(html.tabsLaidOut, 'sol-tabs is laid out (flex child has height)');
  check(JSON.stringify(html.ids) === JSON.stringify(['News', 'Music', 'Images', 'Movies']),
    `tab order = ${html.ids.join(' · ')}`);
  check(html.panelNews, 'panel-news present');
  check(!html.hasFromRdf, 'html mode: <sol-tabs> has NO from-rdf (inline declarative)');

  // ---- rdf-first ----
  const rdf = await inspect('?rdf');
  check(/rdf-first\.html$/.test(rdf.bodySource || ''), `?rdf → #omp-body source = ${rdf.bodySource}`);
  check(rdf.hasFromRdf, 'rdf mode: <sol-tabs> has from-rdf (loaded from tabs.ttl)');
  check(rdf.tabsLaidOut, 'rdf mode: sol-tabs is laid out');
  check(JSON.stringify(rdf.ids) === JSON.stringify(['News', 'Music', 'Images', 'Movies']),
    `rdf mode tab order = ${rdf.ids.join(' · ')}`);
  check(rdf.panelNews, 'rdf mode: panel-news present');
} finally {
  await browser.close();
  server.close();
}

const realErrors = errors.filter(e => !/favicon|proxy|3002|Failed to fetch|NetworkError|net::ERR/i.test(e));
if (realErrors.length) { console.log(`\npage errors (${realErrors.length}):`); realErrors.forEach(e => console.log('  ! ' + e)); }
console.log(`\n${fails ? '✗ ' + fails + ' check(s) failed' : '✓ all checks passed'}  (${realErrors.length} non-network errors)`);
process.exit(fails || realErrors.length ? 1 : 0);
