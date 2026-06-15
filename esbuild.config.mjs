import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

// The importmap is no longer hand-maintained here — component-interop injects a
// stage-selected importmap at runtime (see index.html / data-stage), generated
// from sol-components' manifest. So there's nothing to sync before the build.
// dk.bundle.js still externalizes its deps (below); the loader's injected map
// resolves them.

const options = {
  entryPoints: ['src/dk-shell.js'],
  outfile: 'dist/dk.bundle.js',
  format: 'esm',
  bundle: true,
  sourcemap: true,
  target: 'es2022',
  logLevel: 'info',
  external: [
    'rdflib',
    'n3',
    'dompurify',
    'ical.js',
    'marked',
    '@comunica/query-sparql',
    '@inrupt/solid-client-authn-browser',
    'solid-ui',
    'solid-logic',
    'rdf-validate-shacl',
    'sol-components',
    'sol-components/*',
  ],
};

// The ia-player plugin bundle (absorbed from open_media_player; defines
// <ia-player> and <omp-images>). rdflib stays external — component-interop's
// injected importmap maps it to the one shared instance. CSS/HTML are inlined
// as text by bundle-init.js (slated for extraction to sol-include files).
const iaPlayerOptions = {
  entryPoints: ['plugins/ia-player/bundle-entry.js'],
  outfile: 'plugins/ia-player/dist/ia-player.esm.js',
  format: 'esm',
  bundle: true,
  minify: true,
  target: ['es2020'],
  platform: 'browser',
  mainFields: ['module', 'browser', 'main'],
  conditions: ['module', 'import', 'browser', 'default'],
  treeShaking: true,
  legalComments: 'none',
  logLevel: 'info',
  external: ['rdflib'],
  loader: { '.css': 'text', '.html': 'text' },
  define: { __OMP_BUILD__: JSON.stringify(`dk ${new Date().toISOString()}`) },
};

if (watch) {
  const ctx = await esbuild.context(options);
  const iaCtx = await esbuild.context(iaPlayerOptions);
  await ctx.watch();
  await iaCtx.watch();
  console.log('esbuild: watching src/ and plugins/');
} else {
  await esbuild.build(options);
  await esbuild.build(iaPlayerOptions);
}
