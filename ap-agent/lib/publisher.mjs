// publisher.mjs — builds/maintains the actor's public face on the remote pod
// (webfinger, actor doc, collections, notes) and mirrors truth into the local
// pod. The remote /ap/ tree is disposable: publishProfile() rebuilds it.

import crypto from 'node:crypto';
import * as wire from './wire.mjs';

export class Publisher {
  constructor({ config, remote, local, store, deliverer, publicKeyPem, log = console.log }) {
    this.config = config;
    this.remote = remote;
    this.local = local;
    this.store = store;
    this.deliverer = deliverer;
    this.publicKeyPem = publicKeyPem;
    this.urls = wire.apUrls(config.remotePod);
    this.log = log;
  }

  // Idempotent: (re)write webfinger + actor + collections + container ACLs.
  async publishProfile() {
    const { urls } = this;
    const host = new URL(urls.base).host;

    await this.remote.putJson(urls.webfinger,
      wire.jrd({ handle: this.config.handle, host, actor: urls.actor }), 'application/jrd+json');
    await this.remote.setAcl(urls.webfinger, ['Read']);

    const hostMetaUrl = urls.base + '.well-known/host-meta';
    await this.remote.put(hostMetaUrl, wire.hostMeta(urls.base), 'application/xrd+xml');
    await this.remote.setAcl(hostMetaUrl, ['Read']);

    await this.remote.putJson(urls.actor, wire.actorDoc({
      urls, handle: this.config.handle, name: this.config.name, publicKeyPem: this.publicKeyPem,
    }));
    await this.remote.setAcl(urls.actor, ['Read']);

    // inbox: public may only Append; owner (the agent) reads + drains.
    await this.remote.putJson(urls.inbox + '.keep', { keep: true }, 'application/json');
    await this.remote.setAcl(urls.inbox, ['Append']);

    // notes live under a public-Read container (acl:default covers new notes).
    await this.remote.putJson(urls.notes + '.keep', { keep: true }, 'application/json');
    await this.remote.setAcl(urls.notes, ['Read']);

    await this.publishCollections();
    await this.local.writeSettings({ handle: this.config.handle, actorUrl: urls.actor });
    this.log(`profile published: @${this.config.handle}@${host} → ${urls.actor}`);
  }

  async publishCollections() {
    const { urls } = this;
    const contacts = this.store.getContacts();
    const outbox = this.store.read('outbox.json', []);
    await this.remote.putJson(urls.followers,
      wire.orderedCollection(urls.followers, contacts.followers.map(f => f.actor)));
    await this.remote.setAcl(urls.followers, ['Read']);
    await this.remote.putJson(urls.following,
      wire.orderedCollection(urls.following, contacts.following.filter(f => f.accepted).map(f => f.actor)));
    await this.remote.setAcl(urls.following, ['Read']);
    await this.remote.putJson(urls.outbox, wire.orderedCollection(urls.outbox, outbox));
    await this.remote.setAcl(urls.outbox, ['Read']);
    await this.local.writeContacts(contacts);
  }

  // Media container on the remote pod — public-Read like notes, created lazily
  // at first upload (idempotent; the flag only saves round-trips).
  async ensureMediaContainer() {
    if (this._mediaReady) return;
    await this.remote.putJson(this.urls.media + '.keep', { keep: true }, 'application/json');
    await this.remote.setAcl(this.urls.media, ['Read']);
    this._mediaReady = true;
  }

  // Compose → wire note on remote pod + RDF truth locally + deliver Create.
  async publishNote(content, { inReplyTo, attachments } = {}) {
    const { urls } = this;
    const published = new Date().toISOString();
    const slug = published.slice(0, 10) + '-' + crypto.randomBytes(4).toString('hex');
    const note = wire.noteDoc({ urls, slug, content, published, inReplyTo, attachments });

    await this.remote.putJson(note.id, note);
    const outbox = this.store.read('outbox.json', []);
    outbox.unshift(note.id);
    this.store.write('outbox.json', outbox);
    await this.remote.putJson(urls.outbox, wire.orderedCollection(urls.outbox, outbox));

    await this.local.writeNote('posts', slug, {
      noteId: note.id, actor: urls.actor, published, content: note.content, inReplyTo, attachments,
    });
    this.store.addStatus({
      noteId: note.id, actor: urls.actor, content: note.content, published, inReplyTo,
      kind: 'post', slug, ...(attachments?.length ? { attachments } : {}),
    });

    const create = wire.createActivity(note, urls);
    const contacts = this.store.getContacts();
    const inboxes = contacts.followers.map(f => f.sharedInbox || f.inbox).filter(Boolean);
    await this.deliverer.deliverToAll(inboxes, create);
    this.log(`note published: ${note.id} → ${inboxes.length} inbox(es)`);
    return note;
  }
}
