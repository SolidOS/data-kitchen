// The base menu invariants, run against each release VARIANT's effective
// main menu (variants/{web,mobile} overlays over the base — resolved by the
// same assembler the builds use).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registerMenuInvariants } from '../helpers/menu-invariants.mjs';
import { resolveVariantFiles } from '../../tools/assemble-variant.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MENU_DEST = join('dk-pod', 'dk', 'ui-data', 'data-kitchen-main-menu.ttl');

for (const variant of ['web', 'mobile']) {
  const files = resolveVariantFiles(variant);
  const menuSrc = files.get(MENU_DEST);
  test(`${variant}: variant resolves a main menu`, () => {
    assert.ok(menuSrc, 'variant file map must include the main menu');
  });
  if (menuSrc) registerMenuInvariants(variant, menuSrc);
}

test('web: overlay actually replaces the base menu', () => {
  const files = resolveVariantFiles('web');
  assert.ok(files.get(MENU_DEST).includes(join('variants', 'web')),
    'web main menu must come from the overlay');
});
