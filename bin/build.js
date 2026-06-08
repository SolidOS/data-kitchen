import * as esbuild from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
const banner = `/*! ia-player v${pkg.version} — omp app code (rdflib + sol-components via component-interop) */`;

// rdflib is EXTERNAL, not bundled. component-interop injects an importmap (from
// the sol-components manifest) mapping bare `rdflib` to the shared rdflib, so
// this bundle and the sol-* components resolve to the SAME rdflib. Coherence
// (one rdflib + one `core/rdf` singleton sol-login._integrateWithRdflib()
// patches) is guaranteed by sol-components itself (core/rdf is a window
// singleton), not by aliasing here. Output is ESM only, imported by
// component-interop via ia-player.manifest.json.
const common = {
  entryPoints: ['./src/bundle-entry.js'],
  bundle: true,
  external: ['rdflib'],
  loader: {
    '.css': 'text',
    '.html': 'text'
  },
  format: 'esm',
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

if (watch) {
  const ctx = await esbuild.context({ ...common, minify: true, sourcemap: true, outfile: './dist/ia-player.esm.js' });
  await ctx.watch();
  console.log('watching for changes…');
} else {
  await esbuild.build({ ...common, minify: true, outfile: './dist/ia-player.esm.js' });
  console.log('built ./dist/ia-player.esm.js');
}
