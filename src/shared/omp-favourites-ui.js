// omp-favourites-ui.js — the "★ favourite this" affordance.
//
// A small prompt (just a name for this favourite — we no longer ask who's
// adding it), then an append to the communal folder. Fires `omp:favourited`
// so open wall views refresh.

import { addFavourite } from './omp-favourites-store.js';

// We no longer ask for the contributor's name. If one was set in a previous
// version it's honoured; otherwise stars are added as "anonymous".
const NAME_KEY = 'omp:fav-contributor';
const rememberedName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } };

const CSS = `
  .omp-fav-overlay { position: fixed; inset: 0; z-index: 1100; background: rgba(0,0,0,.55);
    display: flex; align-items: flex-start; justify-content: center; padding: 12vh 16px; }
  .omp-fav-modal { width: min(420px, 100%); background: var(--ia-bg, #15161a); color: var(--ia-text, #e7e7ea);
    border: 1px solid var(--ia-border, #2a2d33); border-radius: 14px; padding: 18px 20px 16px;
    box-shadow: 0 24px 60px -16px rgba(0,0,0,.7); font-family: var(--ia-font-body, system-ui, sans-serif); }
  .omp-fav-modal h2 { margin: 0 0 .6em; font-size: 1.1rem; }
  .omp-fav-modal label { display: block; font-size: .82rem; margin: .5em 0 .15em; color: var(--ia-text-soft, #c8c8cc); }
  .omp-fav-modal input { width: 100%; box-sizing: border-box; font: inherit; padding: .4em .55em;
    border: 1px solid var(--ia-border, #2a2d33); border-radius: 7px; background: var(--ia-bg-elev, #1c1d22); color: inherit; }
  .omp-fav-note { font-size: .74rem; color: var(--ia-text-muted, #9aa0a6); margin: .8em 0 0; line-height: 1.4; }
  .omp-fav-row { display: flex; justify-content: flex-end; gap: .5em; margin-top: 1em; }
  .omp-fav-row button { font: inherit; font-size: .85rem; padding: .4em .9em; border-radius: 8px; cursor: pointer;
    border: 1px solid var(--ia-border, #2a2d33); background: var(--ia-bg-btn, #2a2a2a); color: inherit; }
  .omp-fav-row button.primary { background: var(--ia-accent, #e6b800); color: #1a1a1a; border-color: transparent; font-weight: 600; }
`;

/** One-field prompt (just a name for this favourite) → {contributor, title} or null. */
export function favouritePrompt(defaultTitle) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'omp-fav-overlay';
    overlay.innerHTML = `<style>${CSS}</style>
      <div class="omp-fav-modal" role="dialog" aria-modal="true" aria-label="Add to favourites">
        <h2>★ Add to favourites</h2>
        <label>Name this favourite<input class="omp-fav-title" type="text"></label>
        <p class="omp-fav-note">Favourites are a shared, public wall — anyone can add; only the owner can remove.</p>
        <div class="omp-fav-row">
          <button class="omp-fav-cancel" type="button">Cancel</button>
          <button class="omp-fav-add primary" type="button">Add ★</button>
        </div>
      </div>`;
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
