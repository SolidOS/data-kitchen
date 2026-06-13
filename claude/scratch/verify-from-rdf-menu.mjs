// One-off: verify <sol-menu from-rdf="data/data-kitchen-hamburger-menu.ttl#MainMenu"> still renders its
// items after swc's from-rdf became an opt-in add-on. Serves data-kitchen read-
// only and checks the rendered menu buttons in the shadow DOM. No writes.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { createRequire } from 'node:module';
// puppeteer-core lives in the omp project's node_modules, not data-kitchen's.
const require = createRequire('/home/jeff/Dropbox/Web/solid/open_media_player/');
const puppeteer = require('puppeteer-core');

const ROOT = '/home/jeff/data-kitchen';
const PORT = 8099;
const TYPES = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.ttl':'text/turtle','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.map':'application/json' };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let fsPath = normalize(join(ROOT, p));
    if (!fsPath.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    let s = await stat(fsPath).catch(() => null);
    if (s?.isDirectory()) { fsPath = join(fsPath, 'index.html'); s = await stat(fsPath).catch(() => null); }
    if (!s) { res.writeHead(404).end('nf'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[extname(fsPath)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
    res.end(await readFile(fsPath));
  } catch (e) { res.writeHead(500).end(String(e)); }
});
await new Promise(r => server.listen(PORT, r));
console.log(`serving ${ROOT} on :${PORT}`);

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const warns = [];
page.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') warns.push(m.text()); });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });

let labels = [];
try {
  await page.waitForFunction(() => {
    const m = document.querySelector('sol-menu');
    const btns = m?.shadowRoot?.querySelectorAll('.sol-menu-nav button');
    return btns && btns.length > 0;
  }, { timeout: 15000 });
  labels = await page.evaluate(() => Array.from(document.querySelector('sol-menu').shadowRoot.querySelectorAll('.sol-menu-nav button')).map(b => (b.textContent || '').trim()).filter(Boolean));
} catch (e) {
  labels = ['<timeout: menu did not render>'];
}
const hasLoader = await page.evaluate(() => {
  const C = customElements.get('sol-menu');
  return !!(C && C.fromRdfLoader);
});

console.log('sol-menu.fromRdfLoader installed:', hasLoader);
console.log('rendered menu buttons:', JSON.stringify(labels));
const menuWarns = warns.filter(w => /menu-from-rdf|from-rdf|sol-menu/.test(w));
console.log('relevant console warns:', menuWarns.length ? JSON.stringify(menuWarns) : '(none)');

await browser.close();
server.close();
process.exit(labels[0]?.startsWith('<timeout') ? 1 : 0);
