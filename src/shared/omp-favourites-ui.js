// omp-favourites-ui.js — the "★ favourite this" affordance.
//
// A small prompt (just a name for this favourite — we no longer ask who's
// adding it), then an append to the communal folder. Fires `omp:favourited`
// so open wall views refresh.

import { addFavourite } from './omp-favourites-store.js';
// Markup + styles live in their own files, inlined at build time (esbuild
// text imports).
import promptHtml from './modal-favourite-prompt.html';
import promptCss from './favourite-prompt.css';

// We no longer ask for the contributor's name. If one was set in a previous
// version it's honoured; otherwise stars are added as "anonymous".
const NAME_KEY = 'omp:fav-contributor';
const rememberedName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } };

/** One-field prompt (just a name for this favourite) → {contributor, title} or null. */
export function favouritePrompt(defaultTitle) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'omp-fav-overlay';
    overlay.innerHTML = `<style>${promptCss}</style>${promptHtml}`;
    document.body.appendChild(overlay);
    const titleI = overlay.querySelector('.omp-fav-title');
    titleI.value = defaultTitle || '';
    titleI.focus();
    titleI.select?.();

    const close = (val) => { overlay.remove(); resolve(val); };
    const submit = () => {
      const title = titleI.value.trim();
      close({ contributor: rememberedName() || 'anonymous', title: title || defaultTitle });
    };
    overlay.querySelector('.omp-fav-cancel').addEventListener('click', () => close(null));
    overlay.querySelector('.omp-fav-add').addEventListener('click', submit);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close(null);
      else if (e.key === 'Enter') { e.preventDefault(); submit(); }
    });
  });
}

/**
 * Prompt + write a favourite. `fav` is the item snapshot (item, bucket,
 * schemaType, name, thumbnail, link, download). Returns the saved record or null.
 */
export async function star(fav) {
  const ans = await favouritePrompt(fav.name);
  if (!ans) return null;
  const full = { ...fav, contributor: ans.contributor, title: ans.title };
  await addFavourite(full);
  document.dispatchEvent(new CustomEvent('omp:favourited', { detail: full }));
  return full;
}

/**
 * Install one document-level router so any component can favourite by just
 * dispatching `item-favourite` with a ready snapshot ({item,bucket,schemaType,
 * name,link,download,thumbnail}). Components that emit RAW fields (e.g.
 * sol-gallery) are handled by their own host (omp-images) and carry no
 * `bucket`, so they're ignored here. Idempotent.
 */
export function installFavouriteRouter() {
  if (window.__ompFavRouter) return;
  window.__ompFavRouter = true;
  document.addEventListener('item-favourite', (e) => {
    const d = e.detail;
    if (d && d.bucket && d.item) star(d).catch((err) => console.warn('[favourite]', err.message));
  });
}
