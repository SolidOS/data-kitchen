// Structural invariants of the RDF-first shell (ui-data/data-kitchen-main-menu.ttl).
// The shell renders from this file at runtime; these are the contracts
// src/dk-tabs-rdf.js and sol-components' menu builders assume. The assertions
// live in test/helpers/menu-invariants.mjs so the release variants
// (test/data/variant-menus.test.mjs) run the same contracts on their menus.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registerMenuInvariants } from '../helpers/menu-invariants.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
registerMenuInvariants('base', join(root, 'ui-data/data-kitchen-main-menu.ttl'));
