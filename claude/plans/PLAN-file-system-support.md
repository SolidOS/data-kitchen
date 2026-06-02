# Plan — local-file storage mode for `<ia-player>`

## Interpretation — needs confirmation

When the `remote` attribute is present on `<ia-player>`, all RDF I/O (load, save, update) happens against a *local* file on the user's disk via the File System Access API, instead of the current HTTP/Solid PATCH flow. Plus a "Create new library" affordance that downloads `ia-music.ttl` as a starting template.

⚠️ The attribute name is counterintuitive — "remote" for local-file behavior. Options: rename it (`local`, `file`, or `storage="local"`), or invert (attribute holds a remote URL, and the default with no `remote` is local file). Pending confirmation.

## Open questions

1. **Naming** (above).
2. **First load UX**: FS Access API needs a user gesture. Should the player render an "Open library file…" button on first load when `remote` is set, or auto-open the picker on the first click anywhere?
3. **"Create new library" placement**: in the manage modal? On the loading screen when no file is chosen yet? Both?
4. **Browser support**: File System Access API works in Chrome/Edge/Opera/Brave; not Firefox or Safari. Fallback options:
   - (a) block the feature with a notice,
   - (b) read-only via `<input type="file">` + download-on-save (no in-place writes),
   - (c) IndexedDB-only.
5. **Serialization format**: rdflib's `Serializer` can write Turtle. Acceptable, or roll our own minimal Turtle writer for the schema?

## Sketch of the work

| # | Step | Estimate |
|---|------|----------|
| 1 | Storage backend abstraction (`HttpBackend` wraps current Fetcher/UpdateManager; `FileBackend` wraps FS Access API). Wire `loadRDF` + `runUpdate` to the active backend. | 2–3 h |
| 2 | `IaPlayerElement` reads `remote` attr in `connectedCallback`, picks backend, exposes "Open file" / "Create new" UI. | 1.5 h |
| 3 | Turtle serialization for save (use rdflib's `serialize` — already in bundle — vs. tiny custom serializer for our triples). | 1–2 h |
| 4 | "Create new library" flow: fetch `ia-music.ttl` (configurable URL? defaults to bundled-with-component default?), show `showSaveFilePicker`, write template, switch active handle. | 1.5 h |
| 5 | Fallback path for non-FSA browsers (choose 4b above for one option). | 1 h |
| 6 | Manage-modal integration + status messages + accessibility for new buttons. | 1 h |
| 7 | Error handling: permission denied, user cancels picker, file moved/deleted, write conflicts, quota. | 1 h |
| 8 | Manual testing on real files + the three flows (open existing, save, create-new); update About table. | 1–1.5 h |

**Total: 10–12.5 hours of focused work** if everything is on the happy path. Add ~25 % buffer for the inevitable FS Access API quirks (handle-persistence in IndexedDB if you want the picker not to re-prompt every reload, etc.) → **realistic 12–16 h**.

## Things I'd *not* touch unless told otherwise

- Existing HTTP/Solid path stays exactly as-is when `remote` (or whatever we call it) is absent.
- No change to the manage modal's existing artist/genre logic.
- No bundle/build changes beyond whatever new module file the backend abstraction needs.
