// The base menu invariants, run against each release VARIANT's effective
// main menu (variants/{web,mobile} overlays over the base — resolved by the
// same assembler the builds use).
//
// RELEASE VARIANTS PARKED (Jeff, 2026-07-06): these contracts run only with
// DK_VARIANTS=1 so the parked system can't block unrelated pushes.

import { test } from 'node:test';

if (!process.env.DK_VARIANTS) {
  test('release variants parked — set DK_VARIANTS=1 to run these contracts', { skip: true }, () => {});
} else {
  const assert = (await import('node:assert/strict')).default;
  const { join } = await import('node:path');
  const { registerMenuInvariants } = await import('../helpers/menu-invariants.mjs');
  const { resolveVariantFiles } = await import('../../tools/assemble-variant.mjs');

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
}
