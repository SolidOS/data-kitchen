// Minimal read-only static server for headless e2e runs when the user's :3000
// pod server isn't up. Serves ONLY this omp directory (process.cwd()) mounted at
// /solid/open_media_player/ — the path the e2e fixtures hardcode. No writes.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';

const ROOT = process.cwd();
const PREFIX = '/solid/open_media_player';
const PORT = 3000;
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.ttl': 'text/turtle',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.startsWith(PREFIX)) path = path.slice(PREFIX.length) || '/';
    let fsPath = normalize(join(ROOT, path));
    if (!fsPath.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
    let s = await stat(fsPath).catch(() => null);
    if (s?.isDirectory()) { fsPath = join(fsPath, 'index.html'); s = await stat(fsPath).catch(() => null); }
    if (!s) { res.writeHead(404).end('not found'); return; }
    const body = await readFile(fsPath);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(fsPath)] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(body);
  } catch (e) { res.writeHead(500).end(String(e)); }
}).listen(PORT, () => console.log(`static omp server on http://localhost:${PORT}${PREFIX}/`));
