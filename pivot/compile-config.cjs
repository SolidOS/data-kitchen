// Compiles the pivot server's Components.js config to a single JS factory
// (dist/create-app.cjs) so server startup does NO node_modules scanning.
//
// Why: componentsjs' runtime scan walks every ancestor node_modules and
// recurses into every package — including the repo's file:-linked
// sol-components/podz working trees, whose dev dependencies carry a different
// comunica generation than the server's and poison the component registry.
// The componentsjs-compile-config CLI can't be used directly: it doesn't
// expose skipContextValidation/typeChecking, which CSS's own loader sets
// (AppRunner.create), so it chokes on CSS's components.jsonld.
//
// Run via build-compiled-config.sh, which executes this in an isolated copy
// of the pivot tree so the scan can't see the repo. Usage:
//   node compile-config.cjs <mainModulePath> > dist/create-app.cjs

const { ComponentsManager } = require('componentsjs');
const { ConstructionStrategyCommonJsString } = require('componentsjs/lib/construction/strategy/ConstructionStrategyCommonJsString');
const path = require('path');

const APP_IRI = 'urn:solid-server:default:App';

async function main() {
  const mainModulePath = path.resolve(process.argv[2] || process.cwd());
  // Entry config defaults to the desktop one; DK_PIVOT_ENTRY selects a variant
  // (e.g. dk-pivot-mobile.json for the mashlib-databrowser mobile build).
  const entry = process.env.DK_PIVOT_ENTRY || 'dk-pivot.json';
  const configPath = path.join(mainModulePath, '..', 'pivot-config', entry);
  const constructionStrategy = new ConstructionStrategyCommonJsString({ asFunction: true, req: require });
  const manager = await ComponentsManager.build({
    mainModulePath,
    constructionStrategy,
    configLoader: async (registry) => registry.register(configPath),
    skipContextValidation: true,
    typeChecking: false,
  });
  const serializationVariableName = await manager.instantiate(APP_IRI);
  process.stdout.write(`${constructionStrategy.serializeDocument(serializationVariableName)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exit(1);
});
