// Read-only static server for the WEB DEMO build (npm run serve:web, :8082).
// Exists because `python -m http.server` (and npm run serve's bare server)
// don't map .ttl → text/turtle or .jsonld → application/ld+json, so the shell
// can't be verified against them. GET/HEAD only — anything else 405s, which
// is exactly the story a static host tells.

import { createServer } from 'node:http';
import { statSync, createReadStream, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { MIME } = require('../server-core.cjs');

const root = resolve(process.argv[2]
  || join(dirname(fileURLToPath(import.meta.url)), '..', 'release', 'web'));
const PORT = Number(process.env.PORT || 8082);

createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end('read-only demo');
  }
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, ''); }
  catch { res.writeHead(400); return res.end(); }
  let full = resolve(root, rel || 'index.html');
  if (full !== root && !full.startsWith(root + sep)) { res.writeHead(403); return res.end(); }
  try { if (statSync(full).isDirectory()) full = join(full, 'index.html'); } catch { /* fallthrough */ }
  if (!existsSync(full)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': MIME[extname(full)] || 'application/octet-stream' });
  if (req.method === 'HEAD') return res.end();
  createReadStream(full).pipe(res);
}).listen(PORT, () => console.log(`[serve:web] read-only demo on http://localhost:${PORT}/ from ${root}`));
