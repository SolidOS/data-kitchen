# PLAN — per-tab favourites (retire the communal ★ tab)

**Goal (user, 2026-06-01):** drop the standalone 5th ★ Favourites tab; surface
favourites on each media tab instead — music favs on Music, image favs on
Images, movie favs on Movies. Movies' left column *becomes* a Favorites list
(no playlists). Music keeps Playlists and gains a Favorites listing under them.

**Decisions (confirmed):**
- **Data model:** keep the existing *communal* `favourites/` folder (shared,
  multi-contributor stars). Just slice it by `bucket` per tab — no new store,
  no personal-vs-communal change. Reuses the star plumbing already in place.
- **Movies sidebar:** *replace* Playlists with Favorites. Movies loses
  playlist create/manage entirely.

## Already in place (no work)
- ☆-on-track → communal wall write; `loadCommunalFavTracks()` + `_favTrackUrls`
  read it back filtered to `Sound`/`MovingImage` (ia3.js:1801-1817).
- `currentSource = 'favorites'` + `switchSource` branch (ia3.js:421, 963).
- Images tab already has its own ★ Favourites column (omp-images.js).

## Changes
1. **data/tabs.ttl** — remove `<#Favourites>` from `ui:parts` (→ 4 tabs:
   News · Music · Images · Movies) and delete its block. Add a
   `favourites-only` attribute to the Movies `<#Movies>` ia-player.

2. **src/ia3.js**
   - Re-point `refreshFavoritesView()` at the communal favourites for *this*
     player's bucket (audio→`Sound`, video→`MovingImage`, from `activeMediaType`/
     `lib.mediaType`): track list = library tracks whose url ∈ communal fav set,
     **plus** unmatched communal records rendered from the record itself
     (name/link/thumbnail) so externally-starred items still play via `link`.
   - **Music:** pinned "★ Favorites" row at the top of the Playlists sidebar
     (`refreshSources`); click → `switchSource('favorites')`.
   - **Movies (`favourites-only`):** sidebar header → "Favorites", hide
     `+ Playlist`, list only Favorites; default `currentSource = 'favorites'`.
   - Refresh the favorites view on `omp:favourited` so stars reflect live.

3. **src/omp-shell.js** — drop `'favourites'` from `PANEL_KEYS`; remove the
   `omp:open-favourite` wall router (collection jumps now happen inside each
   tab). Keep panel `openByRef` for image collections (used by omp-images).

4. **Retire the wall** — remove `omp-favourites.js` registration/import (in
   bundle-entry / omp-shell). **Keep** `omp-favourites-store.js` (listFavourites/
   addFavourite/star data) and `omp-favourites-ui.js` (the `star` helper) — both
   still power the per-tab favourites + the ☆ affordance. Delete
   `omp-favourites.js` itself once unreferenced.

5. **src/omp-images.js** — verify the existing ★ column still works against the
   communal store (expected: no change).

6. **e2e** — remove the communal-wall test path; add Music-favs + Movies-favs
   checks (Images favs already covered). Update `e2e-coldstart.mjs` tab-count
   (5→4) and order.

7. Rebuild `dist/`; update memory ([[project_communal_favourites]] superseded;
   [[project_media_type_seam]] tab shell now 4 tabs).

## Risk
Playing a favourited item that isn't in any loaded library → fall back to
playing its bare `link` with record metadata (no artist/album/duration).
