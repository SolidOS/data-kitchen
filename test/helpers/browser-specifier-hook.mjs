// Node resolve hook for browser-only specifiers. Plugin modules import
// 'sol-components/<file>.js', which the component-interop importmap serves
// from sol-components/web/ in the browser; node's exports map has no such
// subpath, so map it to web/ here. Registered by tests via
// module.register('./browser-specifier-hook.mjs', import.meta.url).
export async function resolve(specifier, context, nextResolve) {
  const m = specifier.match(/^sol-components\/([^/]+\.js)$/);
  if (m) return nextResolve(`sol-components/web/${m[1]}`, context);
  return nextResolve(specifier, context);
}
