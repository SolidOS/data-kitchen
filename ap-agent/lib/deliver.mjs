// deliver.mjs — signed outbound delivery + retry queue. Fedify's signRequest
// does draft-cavage HTTP Signatures (what Mastodon verifies). Failures go to
// a JSON-file queue with exponential backoff; peers that stay down are
// dropped after MAX_ATTEMPTS (~3 days).

import { signRequest } from '@fedify/fedify/sig';

const MAX_ATTEMPTS = 12;                       // 2^12 min ≈ 68h of backoff
const TICK_MS = 60_000;

export class Deliverer {
  constructor({ store, keyId, rsaPrivate, log = console.log }) {
    this.store = store;
    this.keyId = keyId;
    this.rsaPrivate = rsaPrivate;
    this.log = log;
    this.timer = setInterval(() => this.drainQueue().catch(e => log(`queue: ${e.message}`)), TICK_MS);
    this.timer.unref?.();
  }

  // Signed fetch — also used for GETs so authorized-fetch instances answer us.
  async signedFetch(url, init = {}) {
    const req = new Request(url, init);
    const signed = await signRequest(req, this.rsaPrivate, new URL(this.keyId));
    return fetch(signed);
  }

  async deliverNow(inbox, activity) {
    const res = await this.signedFetch(inbox, {
      method: 'POST',
      headers: { 'content-type': 'application/activity+json' },
      body: JSON.stringify(activity),
    });
    if (res.status >= 400) throw new Error(`POST ${inbox} → ${res.status}`);
    return res;
  }

  // Deliver, queueing on failure.
  async deliver(inbox, activity) {
    try {
      await this.deliverNow(inbox, activity);
      this.log(`delivered ${activity.type} → ${inbox}`);
    } catch (e) {
      this.log(`delivery failed (${e.message}) — queued`);
      const q = this.store.getQueue();
      q.push({ inbox, activity, attempts: 1, nextAt: Date.now() + 60_000 });
      this.store.setQueue(q);
    }
  }

  async deliverToAll(inboxes, activity) {
    // Shared inboxes deduplicate fan-out to the same server.
    for (const inbox of [...new Set(inboxes)]) await this.deliver(inbox, activity);
  }

  async drainQueue() {
    const q = this.store.getQueue();
    if (!q.length) return;
    const now = Date.now();
    const keep = [];
    for (const item of q) {
      if (item.nextAt > now) { keep.push(item); continue; }
      try {
        await this.deliverNow(item.inbox, item.activity);
        this.log(`retry ok: ${item.activity.type} → ${item.inbox}`);
      } catch (e) {
        item.attempts += 1;
        if (item.attempts > MAX_ATTEMPTS) {
          this.log(`giving up on ${item.inbox} after ${MAX_ATTEMPTS} attempts`);
          continue;
        }
        item.nextAt = now + Math.min(2 ** item.attempts, 2 ** MAX_ATTEMPTS) * 60_000;
        keep.push(item);
      }
    }
    this.store.setQueue(keep);
  }

  stop() { clearInterval(this.timer); }
}
