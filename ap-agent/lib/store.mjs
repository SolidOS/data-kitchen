// store.mjs — agent state under DK_AP_HOME (Electron userData/ap): config,
// delivery queue, blocklist, contacts working copy. Plain JSON files, 0600,
// outside any pod root. The local pod's /fediverse/ RDF is the source of
// truth; everything here is operational state the agent can rebuild from it.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export class Store {
  constructor(home) {
    this.home = home;
    fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  }

  file(name) { return path.join(this.home, name); }

  read(name, fallback) {
    try { return JSON.parse(fs.readFileSync(this.file(name), 'utf8')); }
    catch { return fallback; }
  }

  write(name, obj) {
    fs.writeFileSync(this.file(name), JSON.stringify(obj, null, 2) + '\n', { mode: 0o600 });
  }

  // config: { remotePod, handle, name, issuer, credential:{clientId, secret,
  //           webId, tokenEndpoint, issuerOrigin} }
  getConfig() { return this.read('config.json', null); }
  setConfig(cfg) { this.write('config.json', cfg); }

  // queue: [{ inbox, activity, attempts, nextAt }]
  getQueue() { return this.read('queue.json', []); }
  setQueue(q) { this.write('queue.json', q); }

  // blocklist: { domains: ["spam.example", ...] }
  getBlocklist() { return this.read('blocklist.json', { domains: [] }); }
  setBlocklist(b) { this.write('blocklist.json', b); }
  isBlocked(url) {
    let host;
    try { host = new URL(url).hostname; } catch { return true; }   // unparsable → treat as hostile
    return this.getBlocklist().domains.some(d => host === d || host.endsWith('.' + d));
  }

  // contacts: { followers: [{actor, inbox, sharedInbox}], following: [{actor, inbox, accepted}] }
  getContacts() { return this.read('contacts.json', { followers: [], following: [] }); }
  setContacts(c) { this.write('contacts.json', c); }

  // dead letters: inbox items that failed verification or exhausted retries —
  // kept for inspection (GET /deadletter) instead of being destroyed.
  getDeadLetters() { return this.read('deadletter.json', []); }
  addDeadLetter(entry) {
    const dl = this.getDeadLetters();
    dl.unshift({ at: new Date().toISOString(), ...entry });
    this.write('deadletter.json', dl.slice(0, 200));
  }

  // statuses index: operational mirror of what lives in the pod as RDF, in
  // arrival order — the Mastodon-API facade serves timelines from this.
  // [{ noteId, actor, content, published, inReplyTo, kind: 'timeline'|'post' }]
  getStatuses() { return this.read('statuses.json', []); }
  addStatus(s) {
    const all = this.getStatuses();
    if (all.some(x => x.noteId === s.noteId)) return;
    all.unshift(s);
    this.write('statuses.json', all.slice(0, 1000));
  }
  updateStatus(noteId, patch) {
    const all = this.getStatuses();
    const i = all.findIndex(x => x.noteId === noteId);
    if (i < 0) return null;
    all[i] = { ...all[i], ...patch };
    this.write('statuses.json', all);
    return all[i];
  }
  removeStatus(noteId) {
    this.write('statuses.json', this.getStatuses().filter(x => x.noteId !== noteId));
  }

  // notifications: what other actors did to us — the facade serves
  // /api/v1/notifications from this. [{ id, type, actor, noteId?, at }]
  // The id is a content hash, so a re-delivered activity dedupes.
  getNotifications() { return this.read('notifications.json', []); }
  addNotification(n) {
    const all = this.getNotifications();
    const id = crypto.createHash('sha256').update(JSON.stringify(n)).digest('hex').slice(0, 16);
    if (all.some(x => x.id === id)) return;
    all.unshift({ id, at: new Date().toISOString(), ...n });
    this.write('notifications.json', all.slice(0, 500));
  }

  // uploaded media registry: opaque id → { url, mediaType, description }
  getMedia() { return this.read('media.json', {}); }
  setMedia(id, entry) {
    const m = this.getMedia();
    m[id] = entry;
    this.write('media.json', m);
  }

  // actor-doc cache for account rendering (display name, avatar).
  getActors() { return this.read('actors.json', {}); }
  cacheActor(url, doc) {
    const a = this.getActors();
    a[url] = {
      name: doc.name || doc.preferredUsername || '',
      preferredUsername: doc.preferredUsername || '',
      icon: typeof doc.icon === 'object' ? doc.icon?.url : doc.icon,
      fetchedAt: new Date().toISOString(),
    };
    this.write('actors.json', a);
  }

  // Mastodon-API opaque ids ↔ URLs (snac-style: hashes are fine for clients).
  getIds() { return this.read('ids.json', {}); }
  idFor(url) {
    const ids = this.getIds();
    for (const [id, u] of Object.entries(ids)) if (u === url) return id;
    const id = crypto.createHash('sha256').update(url).digest('hex').slice(0, 16);
    ids[id] = url;
    this.write('ids.json', ids);
    return id;
  }
  urlFor(id) { return this.getIds()[id] || null; }
}
