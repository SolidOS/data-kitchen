// Sync the inline <script type="importmap"> in index.html from the
// canonical importmaps/local.json so the two never drift. Runs
// standalone (`node tools/sync-importmap.mjs`) and is also invoked
// automatically by esbuild.config.mjs before each build.
//
// Path rewrite: local.json lives in importmaps/ so its paths use
// "../node_modules/…"; index.html sits at project root so they need
// "./node_modules/…".

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

const SRC   = resolve(PROJECT_ROOT, 'importmaps/local.json');
const HTML  = resolve(PROJECT_ROOT, 'index.html');
const START = '<!-- IMPORTMAP:start -->';
const END   = '<!-- IMPORTMAP:end -->';

function rewriteForRoot(map) {
  const out = { imports: {} };
  for (const [spec, target] of Object.entries(map.imports || {})) {
    out.imports[spec] = target.startsWith('../') ? './' + target.slice(3) : target;
  }
  return out;
}

function renderAligned(map, prefix = '  ') {
  const entries = Object.entries(map.imports);
  const maxKey  = Math.max(...entries.map(([k]) => k.length));
  const lines = entries.map(([k, v]) => {
    const pad = ' '.repeat(maxKey - k.length);
    return `${prefix}    "${k}":${pad} "${v}"`;
  });
  return [
    `${prefix}{`,
    `${prefix}  "imports": {`,
    lines.join(',\n'),
    `${prefix}  }`,
    `${prefix}}`,
  ].join('\n');
}

export function syncImportmap({ quiet = false } = {}) {
  const src = JSON.parse(readFileSync(SRC, 'utf8'));
  const adjusted = rewriteForRoot(src);
  const block = [
    START,
    '  <script type="importmap">',
    renderAligned(adjusted, '  '),
    '  </script>',
    `  ${END}`,
  ].join('\n');

  const html = readFileSync(HTML, 'utf8');
  const startIdx = html.indexOf(START);
  const endIdx   = html.indexOf(END);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(
      `[sync-importmap] markers ${START} / ${END} not found in ${HTML}. ` +
      `Wrap the inline <script type="importmap"> with them so this sync can find it.`
    );
  }
  const before = html.slice(0, startIdx);
  const after  = html.slice(endIdx + END.length);
  const next   = before + block + after;

  if (next === html) {
    if (!quiet) console.log(`[sync-importmap] ${HTML} already in sync`);
    return { changed: false };
  }
  writeFileSync(HTML, next);
  if (!quiet) console.log(`[sync-importmap] updated ${HTML} from ${SRC}`);
  return { changed: true };
}

// Run as CLI when invoked directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    syncImportmap();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
