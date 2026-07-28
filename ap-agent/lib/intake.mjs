// intake.mjs — drains the remote pod's public-append inbox and applies side
// effects. Inbound authenticity: LDN bodies don't carry the delivery's
// HTTP-Signature headers, so instead of verifying signatures we VERIFY BY
// DEREFERENCING — re-fetch the claimed object/actor from its origin (signed
// GET, so authorized-fetch instances answer) and trust only what the origin
// itself serves.
//
// Failure policy: a REJECTED item (verification says no) goes to the
// dead-letter store and leaves the inbox; a FAILING item (exception —
// network, remote 5xx) stays in the inbox for the next drain, and moves to
// the dead-letter store after MAX_ITEM_ATTEMPTS. Nothing is silently
// destroyed.
//
// Wake-up: WebSocketChannel2023 push on the inbox container (probe P4), plus
// a poll every POLL_MS as fallback, plus a drain at startup.

const POLL_MS = 2 * 60_000;      // the push socket flaps (proxy idle timeout), so poll tight
const RECONNECT_MS = 2_000;
const MAX_ITEM_ATTEMPTS = 5;
const ACCEPT_AP = 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"';

export class Intake {
  constructor({ config, urls, remote, local, store, deliverer, publisher, log = console.log }) {
    Object.assign(this, { config, urls, remote, local, store, deliverer, publisher, log });
    this.serial = Date.now();
    this.stopped = false;
    this.attempts = new Map();        // inbox item URL → failed tries
    this.lastDrain = null;
    this.wsState = 'never-connected';
  }

  async start() {
    await this.drain().catch(e => this.log(`drain: ${e.message}`));
    this.pollTimer = setInterval(() => this.drain().catch(e => this.log(`drain: ${e.message}`)), POLL_MS);
    this.pollTimer.unref?.();
    this.subscribe().catch(e => this.log(`subscribe: ${e.message}`));
  }

  stop() { this.stopped = true; clearInterval(this.pollTimer); this.ws?.close(); }

  // --- push ---
  async subscribe() {
    const descRes = await fetch(this.urls.base + '.well-known/solid', { headers: { accept: 'text/turtle' } });
    const desc = await descRes.text();
    const m = desc.match(/<([^>]*WebSocketChannel2023[^>]*)>/);
    if (!m) { this.wsState = 'unavailable'; this.log('no WebSocketChannel2023 service — polling only'); return; }
    const sub = await this.remote.fetch(m[1], {
      method: 'POST',
      headers: { 'content-type': 'application/ld+json' },
      body: JSON.stringify({
        '@context': ['https://www.w3.org/ns/solid/notification/v1'],
        type: 'http://www.w3.org/ns/solid/notifications#WebSocketChannel2023',
        topic: this.urls.inbox,
      }),
    });
    const body = await sub.json().catch(() => null);
    if (!body?.receiveFrom) {
      this.wsState = `subscribe-failed-${sub.status}`;
      this.log(`subscription failed (${sub.status}) — retrying in 60s (polling meanwhile)`);
      if (!this.stopped) {
        setTimeout(() => this.subscribe().catch(e => this.log(`resubscribe: ${e.message}`)), 60_000);
      }
      return;
    }
    this.ws = new WebSocket(body.receiveFrom);
    this.ws.onopen = () => {
      this.wsState = 'open';
      if (!this._announcedPush) { this.log('inbox push subscription active'); this._announcedPush = true; }
      // Anything that arrived while the socket was down is waiting — sweep it.
      this.drain().catch(e => this.log(`drain: ${e.message}`));
    };
    this.ws.onmessage = () => this.drain().catch(e => this.log(`drain: ${e.message}`));
    this.ws.onclose = () => {
      this.wsState = 'closed';
      if (!this.stopped) {
        setTimeout(() => this.subscribe().catch(e => this.log(`resubscribe: ${e.message}`)), RECONNECT_MS);
      }
    };
    this.ws.onerror = () => { this.wsState = 'error'; };
  }

  // --- drain + dispatch ---
  // Serialized: push events, polls, and manual /drain calls can fire
  // concurrently, and overlapping sweeps double-process items (observed as
  // duplicate Accepts/timeline writes). One sweep at a time; callers that
  // arrive mid-sweep get one follow-up sweep.
  async drain() {
    if (this._draining) { this._drainAgain = true; return this._draining; }
    this._draining = this._drainOnce().finally(() => {
      this._draining = null;
      if (this._drainAgain) { this._drainAgain = false; this.drain().catch(e => this.log(`drain: ${e.message}`)); }
    });
    return this._draining;
  }

  async _drainOnce() {
    this.lastDrain = new Date().toISOString();
    const items = await this.remote.listContainer(this.urls.inbox);
    for (const url of items) {
      if (url.endsWith('.keep')) continue;
      let activity = null;
      try {
        const res = await this.remote.fetch(url, { headers: { accept: '*/*' } });
        const raw = res.status < 400 ? await res.text() : null;
        try { activity = raw ? JSON.parse(raw) : null; } catch { /* kept raw for the dead letter */ }
        const rejection = activity ? await this.handle(activity) : 'unparsable JSON';
        if (rejection) {
          this.store.addDeadLetter({
            inboxUrl: url, reason: rejection, activity,
            ...(activity ? {} : { raw: raw?.slice(0, 2000) ?? null }),
          });
          this.log(`rejected (${rejection}) — dead-lettered: ${url}`);
        }
        await this.remote.delete(url);
        this.attempts.delete(url);
      } catch (e) {
        const n = (this.attempts.get(url) || 0) + 1;
        this.attempts.set(url, n);
        this.log(`inbox item ${url} attempt ${n}/${MAX_ITEM_ATTEMPTS}: ${e.message}`);
        if (n >= MAX_ITEM_ATTEMPTS) {
          this.store.addDeadLetter({ inboxUrl: url, reason: `failed ${n}x: ${e.message}`, activity });
          await this.remote.delete(url);
          this.attempts.delete(url);
        }
      }
    }
  }

  async fetchAP(url) {
    const res = await this.deliverer.signedFetch(url, { headers: { accept: ACCEPT_AP } });
    if (res.status >= 400) return null;
    const doc = await res.json().catch(() => null);
    if (doc?.type === 'Person' && doc.id) this.store.cacheActor(doc.id, doc);
    return doc;
  }

  sameOrigin(a, b) {
    try { return new URL(a).origin === new URL(b).origin; } catch { return false; }
  }

  // Returns a rejection reason string, or undefined when handled.
  async handle(activity) {
    const actor = typeof activity.actor === 'string' ? activity.actor : activity.actor?.id;
    if (!actor) return 'no actor';
    if (this.store.isBlocked(actor)) return `blocked domain (${actor})`;

    switch (activity.type) {
      case 'Follow': return this.onFollow(activity, actor);
      case 'Undo': return this.onUndo(activity, actor);
      case 'Create': return this.onCreate(activity, actor);
      case 'Accept': return this.onAccept(activity, actor);
      case 'Like': case 'Announce': {
        const objectId = typeof activity.object === 'string' ? activity.object : activity.object?.id;
        this.log(`${activity.type} from ${actor} on ${objectId}`);
        if (objectId && objectId.startsWith(this.urls.notes)) {
          this.store.addNotification({
            type: activity.type === 'Like' ? 'favourite' : 'reblog', actor, noteId: objectId,
          });
          return;
        }
        if (activity.type === 'Announce') return this.onAnnounce(activity, actor, objectId);
        return;
      }
      case 'Delete': return;                 // v1: ignore, not an error
      default: this.log(`ignored ${activity.type} from ${actor}`);
    }
  }

  async onFollow(activity, actor) {
    const doc = await this.fetchAP(actor);   // origin must vouch for the actor
    if (!doc) return `actor fetch failed (${actor})`;
    if (doc.id !== actor) return `actor id mismatch (${actor} vs ${doc.id})`;
    if (!doc.inbox) return `actor has no inbox (${actor})`;
    const contacts = this.store.getContacts();
    const existing = contacts.followers.find(f => f.actor === actor);
    if (existing) {
      existing.followId = activity.id || existing.followId;   // refollow supersedes
      this.store.setContacts(contacts);
    } else {
      contacts.followers.push({
        actor, inbox: doc.inbox, sharedInbox: doc.endpoints?.sharedInbox, followId: activity.id,
      });
      this.store.setContacts(contacts);
      this.store.addNotification({ type: 'follow', actor });
      await this.publisher.publishCollections();
      this.log(`new follower: ${actor}`);
    }
    const { acceptActivity } = await import('./wire.mjs');
    await this.deliverer.deliver(doc.inbox,
      acceptActivity({ urls: this.urls, followActivity: activity, serial: this.serial++ }));
    this.log(`Accept sent → ${doc.inbox}`);
  }

  async onUndo(activity, actor) {
    if (activity.object?.type !== 'Follow') return;
    // Deliveries arrive unordered: an Undo may land AFTER the refollow it
    // predates. It names the Follow id it revokes — only honor it when it
    // matches the follow we currently hold for that actor.
    const undoneId = activity.object?.id;
    const contacts = this.store.getContacts();
    const rec = contacts.followers.find(f => f.actor === actor);
    if (!rec) return;
    if (undoneId && rec.followId && undoneId !== rec.followId) {
      this.log(`stale Undo from ${actor} (revokes ${undoneId}, current is ${rec.followId}) — ignored`);
      return;
    }
    contacts.followers = contacts.followers.filter(f => f.actor !== actor);
    this.store.setContacts(contacts);
    await this.publisher.publishCollections();
    this.log(`unfollowed by ${actor}`);
  }

  async onCreate(activity, actor) {
    const objectId = typeof activity.object === 'string' ? activity.object : activity.object?.id;
    if (!objectId) return 'Create without object id';
    if (this.store.isBlocked(objectId)) return `blocked domain (${objectId})`;
    if (!this.sameOrigin(objectId, actor)) return `object/actor origin mismatch (${objectId})`;
    return this.ingestNote(objectId, actor);
  }

  // A boost: ingest the boosted note when the booster is someone we follow —
  // that's what following means, their boosts widen the timeline. Anything
  // else is unsolicited and only logged.
  async onAnnounce(activity, actor, objectId) {
    if (!objectId) return 'Announce without object id';
    const followed = this.store.getContacts().following.some(f => f.actor === actor && f.accepted);
    if (!followed) { this.log(`Announce from unfollowed ${actor} — ignored`); return; }
    if (this.store.isBlocked(objectId)) return `blocked domain (${objectId})`;
    if (this.store.getStatuses().some(s => s.noteId === objectId)) return;   // already known
    return this.ingestNote(objectId, actor, { via: actor });
  }

  // Shared tail of Create/Announce: deref the note at its origin (never trust
  // the delivered copy), mirror it into pod RDF + statuses, notify on replies
  // to our own notes. Returns a rejection reason string, or undefined.
  async ingestNote(objectId, actor, { via } = {}) {
    const note = await this.fetchAP(objectId);
    if (!note) return `object fetch failed (${objectId})`;
    if (note.id !== objectId || note.type !== 'Note') return `object not a verifiable Note (${objectId})`;
    const { attachmentsOf } = await import('./wire.mjs');
    const attachments = attachmentsOf(note);
    const slug = (note.published || new Date().toISOString()).slice(0, 10) + '-' +
      (await import('node:crypto')).createHash('sha256').update(note.id).digest('hex').slice(0, 8);
    await this.local.writeNote('timeline', slug, {
      noteId: note.id,
      actor: note.attributedTo || actor,
      published: note.published,
      content: note.content,
      inReplyTo: note.inReplyTo,
      attachments,
    });
    this.store.addStatus({
      noteId: note.id, actor: note.attributedTo || actor, content: note.content,
      published: note.published, inReplyTo: note.inReplyTo, kind: 'timeline', slug,
      ...(attachments.length ? { attachments } : {}),
      ...(via ? { via } : {}),
    });
    if (note.inReplyTo && String(note.inReplyTo).startsWith(this.urls.notes)) {
      this.store.addNotification({ type: 'mention', actor: note.attributedTo || actor, noteId: note.id });
    }
    this.log(`timeline: ${note.id}${via ? ` (boosted by ${via})` : ''}`);
  }

  async onAccept(activity, actor) {
    const contacts = this.store.getContacts();
    const rec = contacts.following.find(f => f.actor === actor);
    if (rec && !rec.accepted) {
      rec.accepted = true;
      this.store.setContacts(contacts);
      await this.publisher.publishCollections();
      this.log(`follow accepted by ${actor}`);
    }
  }
}
