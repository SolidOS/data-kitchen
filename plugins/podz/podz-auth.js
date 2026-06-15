/**
 * Podz auth — surfaces AuthManager from sol-components' shared surface.
 *
 * Prerequisite: window.SolidWebComponents.AuthManager — published when
 * <sol-login> loads (component-interop aliases window.SolidWebComponents to its
 * surface). A host (e.g. data-kitchen) loads sol-login via component-interop's
 * data-components and waits for ComponentInterop.ready BEFORE constructing the
 * pod browser, so AuthManager is in place by the time this evaluates.
 *
 * The inrupt Session library (window.solidClientAuthn) is now loaded lazily by
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
