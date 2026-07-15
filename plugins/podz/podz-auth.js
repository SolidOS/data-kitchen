/**
 * Podz auth — surfaces AuthManager from sol-components' shared surface.
 *
 * Prerequisite: window.SolidWebComponents.AuthManager — published when
 * <sol-login> loads (sol-components' services root owns window.SolidWebComponents;
 * a ci host aliases it). A host (e.g. data-kitchen) loads sol-login via the
 * loader's data-components and waits for solLoadReady BEFORE constructing the
 * pod browser, so AuthManager is in place by the time this evaluates.
 *
 * The inrupt Session library (imported via sc core/inrupt-global) is loaded by
 * sol-components' auth capability when a login actually runs, so it is NOT
 * checked here — podz consumes AuthManager, not the raw inrupt global.
 */

const swc = (typeof window !== 'undefined') ? window.SolidWebComponents : null;

if (typeof window !== 'undefined' && !swc?.AuthManager) {
  console.error(
    '[podz-auth] window.SolidWebComponents.AuthManager not found — ' +
    'ensure sol-login is loaded (via component-interop) before the pod browser mounts'
  );
}

export const AuthManager = swc ? swc.AuthManager : null;
