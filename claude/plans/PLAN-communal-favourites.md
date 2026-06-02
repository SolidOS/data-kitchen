# PLAN — Communal favourites wall

> **Status: BUILT + verified — 2026-05-31.** Images (collections + loose
> images), News (articles), Music (tracks) favouriting all feed one shared
> wall; guests can no longer create/modify playlists. See
> [[project_source_adapters]] · the favourites live wholly in omp + small
> `favouritable` affordances in swc components.

## Concept
A single **shared, communal favourites wall** (the 5th `★` tab). Anyone —
guest or owner — can **star** an item from any tab; the star is **appended**
to one public `favourites/` folder (one file per star). The wall reads that
folder and shows items **grouped by item** with a ★count + the contributors
(and their custom names). It renders **only from the snapshots** in the
folder — it never loads a source library. **Append-only:** guests can star
but not un-star; only the owner removes (moderation).

## Record (standard vocab only — no invented terms)
One Turtle file per star:
```turtle
<>  a schema:BookmarkAction ;
    dct:creator "Jeff" ;                       # contributor (anonymous name)
    dct:title   "my pick" ;                    # custom favourite name (favourite-only)
    dct:created "…"^^xsd:dateTime ;
    dct:references <ITEM> .                     # the item IRI — the GROUPING KEY
<ITEM> a dctype:StillImage, schema:ImageObject ;  # dctype bucket + schema fine type
    schema:name "…" ;                           # CANONICAL title (card heading)
    schema:thumbnailUrl <…> ;
    dcat:downloadURL <…> .                      # link (dcat:landingPage for pages)
```
Buckets → renderer: `dctype:StillImage|MovingImage|Sound|Text|Collection`.
Fine types reused from the catalogs: `schema:ImageObject|ImageGallery|
AudioObject|VideoObject|Article`.

## Click behaviour (A)
- leaf **image** → in-place lightbox · **article** → reader window
- **track/film** → play (leaf) · **collection** → jump to the home tab + open
  (`omp:open-favourite` → the shell routes by `schemaType`)

## Where the code lives
- **omp** (the app owns favourites): `src/omp-favourites-store.js` (read folder
  → group · `POST` append · owner `DELETE`), `omp-favourites-ui.js` (the
  two-field star prompt + `installFavouriteRouter`), `omp-favourites.js` (the
  `<omp-favourites>` wall), wiring in `omp-images.js` / `ia3.js`+`ia-ui.js` /
  `index.html` (5th tab + click router).
- **swc** (tiny source-blind affordances — emit `item-favourite`, opt-in via a
  `favouritable` attribute): `sol-gallery` lightbox ★, `sol-feed` article ★.
- **The seam:** any component dispatches `item-favourite` with a ready
  snapshot; one document router calls `star()`. omp-images maps its gallery's
  raw event itself.

## Verified (e2e, no console errors)
- Images: star a collection (+ loose image via lightbox ★) → Images column +
  wall card → click jumps/opens → owner ✕ removes. (`run-favourites.sh`)
- News: article ★ → wall "article" card. Music: track ☆ (69 rendered) →
  "track" card + filled ★ on return.
- Guest playlist-gating: `+ Playlist` + playlist kebabs hidden in guest mode;
  message no longer promises playlist creation; `addPlaylist` guards the path.

## Owner ACL guidance (apply on your pod)
The app assumes the perms; **you set them**. On the `favourites/` container:
- **Public** (`foaf:Agent`): `acl:Read, acl:Append` — anyone can see the wall
  and add a star, but **cannot** overwrite or delete others' stars.
- **Owner** (your WebID): `acl:Read, acl:Write, acl:Control` — full
  read/add/remove for moderation.
- Everything else (libraries, playlists, feeds, images) stays **owner-Write,
  public-Read** as before. Favourites is the *only* publicly-writable surface.

Example `favourites/.acl` (WAC):
```turtle
@prefix acl: <http://www.w3.org/ns/auth/acl#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
<#owner> a acl:Authorization ; acl:agent <https://you.example/profile/card#me> ;
  acl:accessTo <./> ; acl:default <./> ; acl:mode acl:Read, acl:Write, acl:Control .
<#public> a acl:Authorization ; acl:agentClass foaf:Agent ;
  acl:accessTo <./> ; acl:default <./> ; acl:mode acl:Read, acl:Append .
```
(`acl:Append` lets anyone `POST` a new star file but not modify/delete existing
ones. The dev CSS server already permits unauthenticated writes, so no ACL is
needed locally.)

## Films
Films aren't in the tracklist — they're the album ("Movies") column and play
via the **film-intro overlay**. So a ★ lives on that overlay
(`.ia-film-intro-fav`); selecting a film sets `_currentFilm`, clicking ★
dispatches `item-favourite` (bucket `MovingImage`, `schema:VideoObject`).
Verified present in the player DOM + identical plumbing to the track ★ (full
network click→wall e2e is blocked only by archive.org film-load flakiness).

## Not done / follow-ups
- Optional: a representative thumbnail per collection card; richer per-item
  Wikidata detail on the wall lightbox; reach-a-film e2e is network-flaky.
