// tagfeed.mjs — topical firehose for a single-actor instance: polls public
// no-auth hashtag timelines on a configured instance and mirrors NEW notes
// into the statuses index as kind 'tag'. View cache only — tag content is
// NOT written to the pod; the pod holds followed/own content.
//
// Config in tagfeed.json: { instance, tags: [...], intervalMin }. Every note
// is still verified by dereference at its origin before it is mirrored.

const DEFAULTS = {
  instance: 'https://mastodon.social',
  tags: ['solidproject', 'linkeddata', 'rdf'],
  intervalMin: 15,
};
const PER_TAG = 20;              // statuses requested per tag per sweep
const MAX_NEW_PER_SWEEP = 12;    // dereference budget per sweep — stay light
const MAX_TAG_ENTRIES = 200;     // oldest tag entries pruned beyond this

export class TagFeed {
  constructor({ store, intake, log = console.log, fetcher = globalThis.fetch }) {
    Object.assign(this, { store, intake, log, fetcher });
    this.lastSweep = null;
    this.lastAdded = 0;
  }

  config() { return { ...DEFAULTS, ...this.store.read('tagfeed.json', {}) }; }

  setConfig(patch) {
    const clean = {};
    if (patch.instance) clean.instance = String(patch.instance).replace(/\/+$/, '');
    if (Array.isArray(patch.tags)) clean.tags = patch.tags.map(t => String(t).replace(/^#/, '').trim()).filter(Boolean);
    if (patch.intervalMin) clean.intervalMin = Math.max(5, Number(patch.intervalMin) || DEFAULTS.intervalMin);
    this.store.write('tagfeed.json', { ...this.config(), ...clean });
    this.stop();
    this.start();
    return this.config();
  }

  start() {
    this.sweep().catch(e => this.log(`tagfeed: ${e.message}`));
    this.timer = setInterval(
      () => this.sweep().catch(e => this.log(`tagfeed: ${e.message}`)),
      this.config().intervalMin * 60_000,
    );
    this.timer.unref?.();
  }

  stop() { clearInterval(this.timer); }

  async sweep() {
    const { instance, tags } = this.config();
    if (!tags.length) return;
    this.lastSweep = new Date().toISOString();
    const known = new Set(this.store.getStatuses().map(s => s.noteId));
    let budget = MAX_NEW_PER_SWEEP;
    let added = 0;
    for (const tag of tags) {
      let list;
      try {
        const res = await this.fetcher(
          `${instance}/api/v1/timelines/tag/${encodeURIComponent(tag)}?limit=${PER_TAG}`,
          { headers: { accept: 'application/json' } },
        );
        if (res.status >= 400) { this.log(`tagfeed #${tag}: ${res.status}`); continue; }
        list = await res.json();
      } catch (e) { this.log(`tagfeed #${tag}: ${e.message}`); continue; }
      for (const st of Array.isArray(list) ? list : []) {
        const noteId = st?.uri;
        if (!noteId || known.has(noteId) || this.store.isBlocked(noteId)) continue;
        if (budget-- <= 0) break;
        const note = await this.intake.fetchAP(noteId).catch(() => null);
        if (!note || note.id !== noteId || note.type !== 'Note') continue;
        if (note.attributedTo && !this.store.getActors()[note.attributedTo]) {
          await this.intake.fetchAP(note.attributedTo).catch(() => {});   // warm name+avatar
        }
        const { attachmentsOf } = await import('./wire.mjs');
        const attachments = attachmentsOf(note);
        this.store.addStatus({
          noteId, actor: note.attributedTo, content: note.content,
          published: note.published, inReplyTo: note.inReplyTo, kind: 'tag', tag,
          ...(attachments.length ? { attachments } : {}),
        });
        known.add(noteId);
        added++;
      }
    }
    const all = this.store.getStatuses();
    const tagged = all.filter(s => s.kind === 'tag');
    if (tagged.length > MAX_TAG_ENTRIES) {
      const drop = new Set(tagged.slice(MAX_TAG_ENTRIES).map(s => s.noteId));   // arrival order: tail = oldest
      this.store.write('statuses.json', all.filter(s => !drop.has(s.noteId)));
    }
    this.lastAdded = added;
    if (added) this.log(`tagfeed: +${added} from #${tags.join(' #')}`);
  }
}
