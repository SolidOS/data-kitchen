// Shared rdflib helpers for the data-contract tests. Uses the SAME `rdf`
// singleton the app and tools/seed-plugins-catalog.mjs use, so the tests read
// the data exactly as production does.

import { readFileSync } from 'node:fs';
import { rdf } from '../../node_modules/sol-components/core/rdf.js';

export { rdf };

export const NS = {
  rdf:    'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs:   'http://www.w3.org/2000/01/rdf-schema#',
  ui:     'http://www.w3.org/ns/ui#',
  dct:    'http://purl.org/dc/terms/',
  schema: 'http://schema.org/',
  skos:   'http://www.w3.org/2004/02/skos/core#',
};

export const sym = (u) => rdf.sym(u);

/** Parse a Turtle file into a fresh store under `base`. */
export function loadGraph(absPath, base) {
  const store = rdf.graph();
  rdf.parse(readFileSync(absPath, 'utf8'), store, base, 'text/turtle');
  return store;
}

/** True if `subj` has rdf:type ns:ui#<localName> in `store`. */
export function isType(store, subj, localName) {
  return store.statementsMatching(subj, sym(NS.rdf + 'type'), sym(NS.ui + localName)).length > 0;
}
