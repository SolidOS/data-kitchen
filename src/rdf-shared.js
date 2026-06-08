// Single rdflib + shared `rdf` singleton.
//
// The player used to `import … from 'rdflib'` directly and build its own
// store/Fetcher. For Solid login, sol-login patches the web-components
// `core/rdf.js` singleton's Fetcher so authenticated fetch covers every
// pod read/write. For that patch to reach the player, the player and
// `core/rdf.js` must share ONE rdflib module instance and ONE `rdf`
// singleton.
//
// - build.js aliases every `rdflib` specifier to the player's single
//   copy, so the named re-exports below and `core/rdf.js`'s own
//   `import 'rdflib'` resolve to the same module (term `instanceof`,
//   Statement/NamedNode identity all hold).
// - `rdf` is the shared singleton. With no sol-login on the page it is
//   just a plain shared rdflib store/Fetcher — i.e. the standalone
//   fallback needs no special-casing.
//
// ia-rdf.js imports term/util constructors from here instead of
// 'rdflib'; the Solid-library load path additionally uses `rdf.store` /
// `rdf.storeFetcher` so it joins the singleton (see PLAN store model A).

export { Namespace, graph, Fetcher, sym, st, literal, UpdateManager, parse } from 'rdflib';
export { default as rdf } from 'sol-components/core/rdf.js';
// Page-wide authenticated-fetch lookup (finds the live <sol-login>'s
// session.fetch covering a URL's origin, else global fetch). Reused for
// authed pod writes instead of relying on the vanilla rdf.storeFetcher.
export { getAuthFetch } from 'sol-components/core/auth-fetch.js';
