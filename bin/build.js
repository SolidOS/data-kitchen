import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
const banner = `/*! ia-player v${pkg.version} — bundled web component (includes rdflib) */`;

// Solid-login shares the web-components `core/rdf.js` singleton, which
// does its own `import 'rdflib'` resolved relative to the out-of-tree
// web-components repo — a *different* rdflib copy than the player's.
// Two rdflib instances would break the single-singleton / term
// `instanceof` requirement. Alias every `rdflib` specifier to the
// player's one copy so the bundle has exactly one rdflib + one `rdf`.
// Alias to the package DIRECTORY (not require.resolve's CJS lib/index.js)
// so esbuild still applies mainFields/conditions and picks rdflib's ESM
// entry (esm/index.js) — just pinned to the player's single copy.
const require = createRequire(import.meta.url);
const rdflibDir = dirname(require.resolve('rdflib/package.json'));

const common = {
  entryPoints: ['./src/bundle-entry.js'],
  bundle: true,
  alias: {
    rdflib: rdflibDir,
  },
  loader: {
    '.css': 'text',
    '.html': 'text'
  },
  target: ['es2020'],
  platform: 'browser',
  mainFields: ['module', 'browser', 'main'],
  conditions: ['module', 'import', 'browser', 'default'],
  treeShaking: true,
  legalComments: 'none',
  // Build stamp logged at startup so a STALE cached bundle on the pod
  // (or dev) is instantly identifiable in the console.
  define: { __OMP_BUILD__: JSON.stringify(`${pkg.version} ${new Date().toISOString()}`) },
  banner: { js: banner }
};

const watch = process.argv.includes('--watch');

async function buildOne(opts, outfile) {
  const result = await esbuild.build({ ...common, ...opts, outfile });
  console.log(`built ${outfile}`);
  return result;
}

if (watch) {
  const ctx = await esbuild.context({
    ...common,
    format: 'iife',
    minify: true,
    sourcemap: true,
    outfile: './dist/ia-player.js'
  });
  await ctx.watch();
  console.log('watching for changes…');
} else {
  // IIFE — drop in via a plain <script src="ia-player.js"> tag.
  await buildOne({ format: 'iife', minify: true }, './dist/ia-player.js');
  // ESM — import via <script type="module" src="ia-player.esm.js">.
  await buildOne({ format: 'esm', minify: true }, './dist/ia-player.esm.js');

  // Tiny convenience HTML showing single-file usage.
  writeFileSync('./dist/example.html', `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Open Media Player</title>
</head>
<body>
  <ia-player src="../libraries/internet_archive_music/index.ttl"></ia-player>
  <script src="./ia-player.js"></script>
</body>
</html>
`);
  console.log('built dist/example.html');
}
