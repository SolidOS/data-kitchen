// Side-effect imports — order matters.
// bundle-init runs first, installing inlined CSS and About-HTML before ia3.js
// defines the <ia-player> custom element.
import './bundle-init.js';
// <sol-login> Solid OIDC button, bundled from source (not the prebuilt
// web-components bundle) so build.js's rdflib alias dedupes it onto the
// player's single rdflib + the one shared `rdf` singleton — sol-login's
// _integrateWithRdflib() then patches the very fetcher the player uses.
import '../../solid-web-components/web/sol-login.js';
// <sol-default> publishes page-wide knobs (the CORS proxy URL) that
// <sol-feed> reads via getDefault('proxy'); <sol-feed> is the News tab's
// newsstand viewer (view="topics"). Both bundle from source like sol-login.
import '../../solid-web-components/web/sol-default.js';
import '../../solid-web-components/web/sol-feed.js';
// <sol-tabs from-rdf keep-alive> is the app shell — builds the five tabs from
// data/tabs.ttl and keeps every panel mounted so audio survives a switch.
// <sol-button> is the launcher for the About / login-help menu items; its
// sol-include + sol-modal handlers are imported so the in-bundle ensureHandler
// finds them already defined (no dynamic import in the IIFE bundle).
import '../../solid-web-components/web/sol-tabs.js';
import '../../solid-web-components/web/sol-button.js';
import '../../solid-web-components/web/sol-include.js';
import '../../solid-web-components/web/sol-modal.js';
// <sol-dropdown-button> drives the ⋮ "More" menu from data/menu.ttl — its items
// are command items that dispatch sol-command to omp's COMMANDS registry.
// (Imports sol-menu transitively, which it extends.)
import '../../solid-web-components/web/sol-dropdown-button.js';
// from-rdf is now an opt-in add-on in swc — this enables <sol-tabs from-rdf> /
// <sol-dropdown-button from-rdf> (rdf-first.html, data/tabs.ttl, data/menu.ttl).
// rdflib is already in this bundle (sol-feed/ia3), so it adds no weight here.
import '../../solid-web-components/web/menu-from-rdf.js';
// <omp-images> is the Images tab shell: it owns the Topics/Collections
// selectors + owner-only +Topic/+Collection controls and pumps a source
// adapter's pages into a display-only <sol-gallery> (which it imports).
import './omp-images.js';
// One document-level router so any tab can favourite by dispatching
// `item-favourite` with a ready snapshot. (Favourites are no longer a tab —
// each media tab surfaces its own slice of the communal wall.)
import { installFavouriteRouter } from './omp-favourites-ui.js';
installFavouriteRouter();
import './ia3.js';
// Theme / text-size / dev-write are declared on <sol-default> (theme, fontsize,
// solid-kitchen) and resolved by the omp.css :has() cascade + omp-boot (saved
// localStorage). The old data/omp-settings.ttl bridge (omp-settings-applier)
// was retired with the rest of the SHACL settings system.
