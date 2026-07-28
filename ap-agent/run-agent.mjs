// run-agent.mjs — dk's ActivityPub actor agent (plan: 6c remote-pod-as-relay,
// claude/plans/ap-pod-mapping.md). Spawned by electron-config/servers.cjs as a
// sibling of router/proxy/css via ELECTRON_RUN_AS_NODE; also runs standalone:
//
//   DK_AP_HOME=/tmp/ap DK_AP_PORT=8020 node ap-agent/run-agent.mjs
//
// Env: DK_AP_HOME (state dir), DK_AP_PORT (admin API, default 8020),
//      DK_GATE_TOKEN (admin gate + local pod writes),
//      DK_LOCAL_POD (default http://localhost:8000/dk-pod/).
//
// Until /setup provides a remote-pod credential the agent idles: admin API up,
// no federation. All public traffic flows through the remote pod; this process
// makes only OUTBOUND connections.

import { Store } from './lib/store.mjs';
import { ensureKeys } from './lib/keys.mjs';
import { RemotePod, mintCredential, discoverTokenEndpoint } from './lib/remote.mjs';
import { LocalPod } from './lib/local.mjs';
import { Deliverer } from './lib/deliver.mjs';
import { Publisher } from './lib/publisher.mjs';
import { Intake } from './lib/intake.mjs';
import { TagFeed } from './lib/tagfeed.mjs';
import { startAdmin } from './lib/admin.mjs';
import { apUrls } from './lib/wire.mjs';

const HOME = process.env.DK_AP_HOME;
const PORT = Number(process.env.DK_AP_PORT) || 8020;
const GATE_TOKEN = process.env.DK_GATE_TOKEN || '';
const LOCAL_POD = process.env.DK_LOCAL_POD || 'http://localhost:8000/dk-pod/';

if (!HOME) { console.error('DK_AP_HOME is required'); process.exit(2); }

// Log to stdout (the shell's [ap] capture), a ring buffer (GET /log), and an
// append file in the state dir — diagnosis must not depend on a terminal.
import fs from 'node:fs';
import path from 'node:path';
const logRing = [];
fs.mkdirSync(HOME, { recursive: true, mode: 0o700 });
const logFile = path.join(HOME, 'agent.log');
const log = (...a) => {
  const line = `${new Date().toISOString()} ${a.join(' ')}`;
  console.log('[ap]', ...a);
  logRing.push(line);
  if (logRing.length > 500) logRing.shift();
  try { fs.appendFileSync(logFile, line + '\n'); } catch { /* logging must never throw */ }
};

class Agent {
  constructor() {
    this.store = new Store(HOME);
    this.local = new LocalPod({ base: LOCAL_POD, gateToken: GATE_TOKEN });
  }

  configured() { return !!this.remote; }

  logLines(n = 100) { return logRing.slice(-n); }

  status() {
    const cfg = this.store.getConfig();
    const contacts = this.store.getContacts();
    return {
      configured: this.configured(),
      handle: cfg?.handle || null,
      actor: cfg ? apUrls(cfg.remotePod).actor : null,
      followers: contacts.followers.length,
      following: contacts.following.length,
      queue: this.store.getQueue().length,
      deadLetters: this.store.getDeadLetters().length,
      blockedDomains: this.store.getBlocklist().domains.length,
      push: this.intake?.wsState || 'n/a',
      lastDrain: this.intake?.lastDrain || null,
      tagfeed: this.tagfeed
        ? { ...this.tagfeed.config(), lastSweep: this.tagfeed.lastSweep, lastAdded: this.tagfeed.lastAdded }
        : null,
    };
  }

  // Bring federation up from a stored config (returns false when unconfigured).
  async connect() {
    const config = this.store.getConfig();
    if (!config?.credential) return false;
    const keys = await ensureKeys(this.store);
    this.remote = new RemotePod(config.credential);
    await this.remote.warmup();
    const urls = apUrls(config.remotePod);
    this.deliverer = new Deliverer({
      store: this.store, rsaPrivate: keys.rsaPrivate, keyId: urls.actor + '#main-key', log,
    });
    this.publisher = new Publisher({
      config, remote: this.remote, local: this.local, store: this.store,
      deliverer: this.deliverer, publicKeyPem: keys.rsaPublicPem, log,
    });
    this.intake = new Intake({
      config, urls, remote: this.remote, local: this.local, store: this.store,
      deliverer: this.deliverer, publisher: this.publisher, log,
    });
    await this.intake.start();
    this.tagfeed = new TagFeed({ store: this.store, intake: this.intake, log });
    this.tagfeed.start();
    log(`federating as @${config.handle}@${new URL(urls.base).host}`);
    this.backfillStatuses().catch(e => log(`statuses backfill failed: ${e.message}`));
    return true;
  }

  // The statuses index is an operational mirror of the pod's /fediverse/ RDF —
  // rebuild it from there when absent (fresh state dir, or state pre-dating
  // the Mastodon-API facade). The router may still be starting, so retry.
  async backfillStatuses() {
    if (!fs.existsSync(this.store.file('notifications.json'))) {
      for (const f of this.store.getContacts().followers) {
        this.store.addNotification({ type: 'follow', actor: f.actor });
      }
    }
    if (fs.existsSync(this.store.file('statuses.json'))) return;
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        const entries = [];
        for (const [container, kind] of [['timeline', 'timeline'], ['posts', 'post']]) {
          for (const url of await this.local.listNotes(container)) {
            try {
              const n = await this.local.readNote(url);
              if (n.noteId) entries.push({ ...n, kind, slug: url.split('/').pop() });
            } catch (e) { log(`backfill: skipped ${url}: ${e.message}`); }
          }
        }
        entries.sort((a, b) => String(b.published || '').localeCompare(String(a.published || '')));
        this.store.write('statuses.json', entries.slice(0, 1000));
        log(`backfilled ${entries.length} statuses from pod RDF`);
        return;
      } catch (e) {
        if (attempt === 19) throw e;
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }

  // POST /setup — {remotePod, handle, name, issuer} + credential source:
  // {email, password} (minted via the CSS account API, password transient) or
  // {clientId, secret, webId}.
  async setup(body) {
    const issuer = body.issuer || 'https://solidcommunity.net';
    if (!body.remotePod) throw new Error('remotePod required');
    let credential;
    if (body.clientId && body.secret) {
      credential = {
        clientId: body.clientId, secret: body.secret,
        webId: body.webId || new URL('/profile/card#me', body.remotePod).href,
        tokenEndpoint: await discoverTokenEndpoint(issuer),
        issuerOrigin: issuer,
      };
    } else if (body.email && body.password) {
      credential = await mintCredential({
        origin: issuer, email: body.email, password: body.password, name: 'dk-ap-agent',
      });
    } else {
      throw new Error('need email+password or clientId+secret');
    }
    this.store.setConfig({
      remotePod: body.remotePod,
      handle: body.handle || 'jeff',
      name: body.name || body.handle || 'jeff',
      issuer,
      credential,
    });
    this.intake?.stop();
    this.tagfeed?.stop();
    this.deliverer?.stop();
    this.remote = null;
    await this.connect();
    await this.publisher.publishProfile();
    return this.status();
  }
}

const agent = new Agent();
startAdmin({ port: PORT, gateToken: GATE_TOKEN, agent, log });
agent.connect().then(up => { if (!up) log('unconfigured — POST /setup to begin'); })
  .catch(e => log(`connect failed: ${e.message}`));

process.on('SIGTERM', () => process.exit(0));
