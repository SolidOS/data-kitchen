/**
 * sources/commons.js — turn a Wikimedia Commons *category* into ImageItem RDF.
 *
 * This is the shared "expand a collection into its images" routine: once you
 * hold a Commons category URL, fetching its files is identical whether the
 * category came from a curated file or a live Wikidata search. Both image
 * providers delegate their `load()` here, so all Commons network access — and
 * all Commons-specific knowledge — lives in exactly one place.
 *
 * `imagesToStore` is a pure transform (no network, no DOM) so it is unit
 * testable; `loadCategory` is the async-iterable paging primitive a host
 * pumps into a display.
 */

import { rdf } from 'sol-components/core/rdf.js';
import { getCategoryImages } from './commons-fetch.js';
import { addImageItem } from 'sol-components/web/utils/contract.js';

/**
 * Convert one page of getCategoryImages() results into an ImageItem store.
 * Pure — safe to unit-test without a network or a DOM.
 *
 * @param {Array} images        getCategoryImages().images
 * @param {object} [opts]
 * @param {number} [opts.startIndex=0]  running offset, so schema:position is
 *                                      globally monotonic across pages
 * @returns {object} an rdflib store of schema:ImageObject records
 */
export function imagesToStore(images, { startIndex = 0 } = {}) {
  const store = rdf.graph();
  images.forEach((img, i) => {
    const position = startIndex + i;
    // Prefer the Commons File: page as the stable IRI (it's also the
    // "View on…" detail link); fall back to the full-res URL.
    const iri = img.descUrl || img.full || `urn:commons:image:${position}`;
    addImageItem(store, {
      iri,
      thumb:     img.thumb,
      full:      img.full,
      width:     img.width,
      height:    img.height,
      caption:   img.title,
      license:   img.license,
      author:    img.artist,
      detailUrl: img.descUrl,
      position,
    });
  });
  return store;
}

/**
 * Page a Commons category, yielding one ImageItem store per page. The host
 * pumps each yielded store into the display (`gallery.add(store)`); pass an
 * AbortSignal to cancel when the user selects another collection.
 *
 * @param {string} ref                a Commons `…/wiki/Category:X` URL
 * @param {object} [opts]
 * @param {number} [opts.pageSize=60]
 * @param {number} [opts.thumbWidth=300]
 * @param {AbortSignal} [opts.signal]
 * @yields {object} an rdflib store (one page of schema:ImageObject)
 */
export async function* loadCategory(ref, { pageSize = 60, thumbWidth = 300, signal } = {}) {
  let cont;
  let index = 0;
  do {
    const { images, cont: next } = await getCategoryImages(ref, {
      thumbWidth, limit: pageSize, cont, signal,
    });
    yield imagesToStore(images, { startIndex: index });
    index += images.length;
    cont = next;
  } while (cont);
}
