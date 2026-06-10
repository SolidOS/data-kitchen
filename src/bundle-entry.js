// Side-effect imports — order matters.
// bundle-init runs first, installing inlined CSS and About-HTML before ia3.js
// defines the <ia-player> custom element.
import './bundle-init.js';
// The sol-components this app uses — <sol-login>, <sol-default>, <sol-feed>,
// <sol-tabs>, <sol-button>, <sol-include>, <sol-modal>, <sol-dropdown-button>,
// <sol-gallery> — are loaded by component-interop (see index.html), NOT bundled
// here. Coherence (the single rdflib + the one `core/rdf` singleton sol-login's
// _integrateWithRdflib() patches) is guaranteed by sol-components itself:
// core/rdf.js is a window-level singleton and `rdflib` resolves to the shared
// instance via component-interop's injected importmap. This module keeps only
// omp's own code, with rdflib externalized (resolved by that importmap).
// <omp-images> is the Images tab shell: it owns the Topics/Collections
// selectors + owner-only +Topic/+Collection controls and pumps a source
// adapter's pages into a display-only <sol-gallery> (which it imports).
import './omp-images.js';
// One document-level router so any tab can favourite by dispatching
// `item-favourite` with a ready snapshot. (Favourites are no longer a tab —
// each media tab surfaces its own slice of the communal wall.)
import { installFavouriteRouter } from './omp-favourites-ui.js';
installFavouriteRouter();
// <omp-calendar-popout> — the 📅 chrome button (a dropdown over <sol-calendar>).
import './omp-calendar-popout.js';
import './ia3.js';
// Theme / text-size / dev-write are declared on <sol-default> (theme, fontsize,
// solid-kitchen) and resolved by the omp.css :has() cascade + omp-boot (saved
// localStorage). The old data/omp-settings.ttl bridge (omp-settings-applier)
// was retired with the rest of the SHACL settings system.
