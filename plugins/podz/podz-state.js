/**
 * Persistence for podz.
 *
 * Storage layout:
 *   localStorage[STORAGE_KEY]  — single JSON blob with layout, pod
 *                                selection, the session-pods list, and
 *                                user prefs. Persists indefinitely.
 *   localStorage[OAUTH_KEY]    — short-lived OAuth-redirect crumb
 *                                (5-min TTL). Lives in its own key
 *                                because its lifetime is fundamentally
 *                                different.
 *
 * On first load after upgrade, the four legacy keys (podzPanelLayout,
 * podzPodSelection, podz_session_pods, solidFileBrowserPrefs_v3) are
 * read once and merged into the unified blob. Legacy keys are not
 * deleted — a one-version overlap lets users downgrade without losing
 * state.
 */

const STORAGE_KEY = 'podz_v4';
const OAUTH_KEY = 'solidFileBrowserState';

const LEGACY_KEYS = {
  layout:      'podzPanelLayout',
  selection:   'podzPodSelection',
  sessionPods: 'podz_session_pods',
  prefs:       'solidFileBrowserPrefs_v3',
};

class StorageWriter {
  constructor(onError) {
    this._onError = onError || (() => {});
    this._erroredOnce = false;
  }
  read(key) {
    try { return localStorage.getItem(key); }
    catch (e) { this._fire(e, 'read', key); return null; }
  }
  write(key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch (e) { this._fire(e, 'write', key); return false; }
  }
  remove(key) {
    try { localStorage.removeItem(key); return true; }
    catch (e) { this._fire(e, 'remove', key); return false; }
  }
  _fire(e, op, key) {
    // Only surface the first failure per session — repeated toasts on
    // every save would be worse than silence.
    if (this._erroredOnce) return;
    this._erroredOnce = true;
    try { this._onError(e, op, key); } catch {}
  }
}

class OAuthCrumb {
  constructor(writer, maxAge = 5 * 60 * 1000) {
    this._w = writer;
    this._maxAge = maxAge;
  }
  save(state) {
    this._w.write(OAUTH_KEY, JSON.stringify({ ...state, timestamp: Date.now() }));
  }
  load() {
    const raw = this._w.read(OAUTH_KEY);
    if (!raw) return null;
    try {
      const obj = JSON.parse(raw);
      if (Date.now() - obj.timestamp > this._maxAge) { this.clear(); return null; }
      return obj;
    } catch { this.clear(); return null; }
  }
  clear() { this._w.remove(OAUTH_KEY); }
}

export class StateManager {
  /**
   * @param {(err:Error, op:'read'|'write'|'remove', key:string) => void} [onStorageError]
   *   Called once on the first storage failure (read/write/remove).
   *   Pass a UI toast hook here so the user knows persistence broke.
   */
  constructor(onStorageError) {
    this._writer = new StorageWriter(onStorageError);
    this._oauth = new OAuthCrumb(this._writer);
    this._blob = this._loadOrMigrate();
  }

  _loadOrMigrate() {
    const raw = this._writer.read(STORAGE_KEY);
    if (raw) {
      try { return JSON.parse(raw) || {}; } catch { /* fall through */ }
    }
    return this._migrate();
  }

  _migrate() {
    const out = {};
    for (const [field, legacyKey] of Object.entries(LEGACY_KEYS)) {
      const raw = this._writer.read(legacyKey);
      if (!raw) continue;
      try { out[field] = JSON.parse(raw); } catch { /* skip malformed */ }
    }
    if (Object.keys(out).length > 0) {
      this._writer.write(STORAGE_KEY, JSON.stringify(out));
    }
    return out;
  }

  _save() {
    this._writer.write(STORAGE_KEY, JSON.stringify(this._blob));
  }

  // ── OAuth-redirect crumb (TTL'd, separate key) ─────────────────────

  save(state) { this._oauth.save(state); }
  load()      { return this._oauth.load(); }
  clear()     { this._oauth.clear(); }
  createState(leftPodUrl, rightPodUrl, leftPath, rightPath, pendingCopy = null) {
    return { leftPodUrl, rightPodUrl, leftPath, rightPath, pendingCopy };
  }

  // ── Layout (collapsed flags, splitRatio) ───────────────────────────

  saveLayout(layout) {
    this._blob.layout = { ...(this._blob.layout || {}), ...(layout || {}) };
    this._save();
  }
  loadLayout() { return this._blob.layout ? { ...this._blob.layout } : null; }

  // ── Pod selection (URLs + current paths per side) ──────────────────

  savePodSelection(selection) {
    this._blob.selection = selection;
    this._save();
  }
  loadPodSelection() { return this._blob.selection ? { ...this._blob.selection } : null; }

  // ── Session pods list ──────────────────────────────────────────────

  saveSessionPods(arr) {
    this._blob.sessionPods = Array.isArray(arr) ? [...arr] : [];
    this._save();
  }
  loadSessionPods() {
    return Array.isArray(this._blob.sessionPods) ? [...this._blob.sessionPods] : [];
  }

  // ── User preferences ───────────────────────────────────────────────

  savePrefs(prefs) {
    this._blob.prefs = prefs;
    this._save();
  }
  loadPrefs() { return this._blob.prefs ? { ...this._blob.prefs } : null; }
}
