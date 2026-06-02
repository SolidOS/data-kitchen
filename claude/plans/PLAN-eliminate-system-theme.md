# PLAN — Eliminate the "System" color scheme

**Status: IMPLEMENTED 2026-05-30.** Builds on the Preferences form / applier —
see [[project_settings_forms]]. Done exactly as below: removed `ui:SystemColorScheme`
from `ui-choices.ttl`; dropped the system mapping / resolve branch / matchMedia
listener from `omp-settings-applier.js`; buildTtl + loadAndApply defaults are now
binary. Verified: the color dropdown shows only Light / Dark, no console errors.

## Why
The color scheme has three options (Light / Dark / **System**) but omp's live
theme is binary (`data-theme` = light|dark; `omp:theme` localStorage likewise,
read pre-paint). "System" only ever lives as `ui:SystemColorScheme` in
`data/omp-settings.ttl`; the applier resolves it to a concrete light/dark for
display. Two consequences (see the "System demotion" discussion):

1. **Demotion** — using the chrome 🌙/☀️ or gear toggle writes an explicit
   light/dark back into `omp-settings.ttl` (the write-back reads the binary
   `omp:theme`), silently replacing `ui:SystemColorScheme`.
2. **No live-follow** — the `matchMedia` change handler guards on
   `omp:theme === 'system'`, which is never true (it holds the resolved value),
   so System doesn't actually track OS changes mid-session.

Decision: **drop System entirely** (including from the vocab). Color scheme
becomes Light / Dark — fully symmetric with the chrome toggle, and both bugs
vanish by construction. (The alternative — keep System and track it via a
separate "mode" signal so the toggle doesn't clobber it and it live-follows the
OS — is explicitly NOT chosen.)

## Changes (omp only; no swc)
- **`shapes/ui-choices.ttl`** — remove the `ui:SystemColorScheme`
  instance (keep `ui:LightColorScheme`, `ui:DarkColorScheme`). The form's
  `sh:class ui:ColorScheme` dropdown then offers only Light / Dark.
- **`data/omp-settings.ttl`** — default `ui:colorScheme` to a concrete value
  (Light or Dark) for the seed.
- **`src/omp-settings-applier.js`**:
  - Drop `SystemColorScheme`/`'system'` from `SCHEME_TO_THEME` /
    `THEME_TO_SCHEME`.
  - Remove the `theme === 'system'` resolve branch in `apply()` (use the value
    directly).
  - `loadAndApply()` default `|| 'system'` → `|| 'dark'` (or the chosen default).
  - Remove the `matchMedia('(prefers-color-scheme: …)')` change listener (no
    System left to follow).
  - `writeSettings` / `buildTtl` default → light/dark.

First-ever load (no localStorage, no settings.ttl) still gets a sensible
one-time OS-based default from the existing pre-paint bootstrap in `index.html`
(`matchMedia('(prefers-color-scheme: light)')`), then it's pinned — acceptable.

## Verify
Preferences color dropdown shows only Light / Dark; toggling the chrome button
and the form stay in sync with no demotion; reload preserves the choice. Update
`e2e-settings.mjs`' color-scheme option check (currently asserts Light/Dark/System).

## Effort
Small, omp-only.
