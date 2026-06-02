# Plan — Rhythmbox-style `<ia-player>`

## Decisions

| Q | Decision |
|---|----------|
| 1 | Fill container — `width:100%`, responsive grid |
| 2 | Drop compact mode for now (revisit later) |
| 3 | Hide native audio, build custom controls |
| 4 | Drop sources sidebar for now |
| 5 | Drop album art for now |
| 6 | Multi-select from the start |

## Target layout

```
┌──────────────────────────────────────────────────────────────────┐
│ [⏮ ⏯ ⏭]   ▬▬▬▬▬▬▬●▬▬   0:42 / 3:15    [🔀] [🔁]   [🔊─●─]      │  toolbar
├───────────────┬──────────────────┬───────────────────────────────┤
│ Genres        │ Artists          │ Albums                        │  browser
│ (All)         │ (All)            │ (All)                         │
│ Funk          │ Bernie Worrell   │ 2009-03-11                    │
│ Jazz  ◄─sel   │ Charles Lloyd ◄  │ 2010-04-22 ◄                  │
│ Indie         │ ...              │ ...                           │
├───────────────┴──────────────────┴───────────────────────────────┤
│  #  Title                      Artist           Album       Time  │  track list
│  1▸ Funky Dollar Bill          Bernie Worrell   2009-03-11 4:32  │
│  2  Cosmic Slop                Bernie Worrell   2009-03-11 5:01  │
│  …                                                                │
├──────────────────────────────────────────────────────────────────┤
│ Now playing: Bernie Worrell — 2009-03-11 — Funky Dollar Bill [IA] │  status
└──────────────────────────────────────────────────────────────────┘
```

## Phases & estimates

| # | Step | Estimate |
|---|------|----------|
| 1 | Layout shell — CSS grid template-areas, drop `.size-medium` and `setSize` | 2–3 h |
| 2 | Multi-select browser columns (Genres / Artists / Albums) with `(All)` sentinel and union-filter cascade | 4–5 h |
| 3 | Track list table (`role="grid"`) with #, Title, Artist, Album, Time, ★; row click plays; ▸ indicator on current | 3–4 h |
| 4 | Custom playback controls — prev / play / pause / next, seek slider, time display, volume slider, shuffle + repeat toggles in toolbar | 3–4 h |
| 5 | Now-playing footer keeping the `[IA]` link and counter | 1–2 h |
| 6 | Manage modal & About refresh (style + key-table update) | 1 h |
| 7 | Keyboard nav & ARIA — listbox semantics in browser columns, grid semantics in track list | 2.5–3 h |
| 8 | Manual testing + polish — empty states, long labels, scrollbars | 2 h |

**Subtotal: 18.5–24 h. With ~25 % buffer: realistic 23–30 h.**

## Multi-select semantics

- Each column tracks an internal `Set<id>` plus an implicit "(All)" state (empty set = "(All)" highlighted).
- Click = replace, Ctrl/Cmd-click = toggle, Shift-click = range.
- Cascade is union-based: artists shown = union over selected genres; albums = union over selected artists; tracks = union over selected albums.
- When a parent column's selection changes, downstream selections are filtered to only ids that still apply (don't blow them away entirely).
- Random play picks one artist → one album → one track and replaces selections (visualized by selecting just those rows in each column). Skip = next track within current track-list view in document order.

## Out of scope here

- RDF model + manage-modal CRUD flow (unchanged).
- `rdflib` Fetcher / UpdateManager (per saved feedback — do not replace).
- The `remote`/local-file feature (tracked in `drafts/PLAN-file-system-support.md`).
- The web-component contract (`<ia-player src="…">`).
