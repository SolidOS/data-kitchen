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

// The ia-player plugin bundle (<ia-player> + <omp-images>) is no longer built
// here — it ships prebuilt in the open-media-player package (sibling working
// tree in dev via the node_modules symlink; `npm run build` THERE after
// editing its src/).

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('esbuild: watching src/');
} else {
  await esbuild.build(options);
}
