// mastoapi.mjs — Mastodon client-API facade over ap-agent (M1: read + post).
// Modeled on snac2's approach: real implementations for the endpoints
// clients actually exercise, empty-collection stubs for the rest. Reached
// through the router (/api/*, /oauth/* → this port), so requests carry the
// gate; OAuth here is theater for a single already-trusted local user.
//
// Surface: oauth trio · instance v1/v2 · verify_credentials · timelines/home
// (M1) · notifications, relationships, lookup, follow/unfollow, thread
// context, /v2/search (M2) · favourite/reblog, media upload, markers,
// DELETE status (M3) · stub farm. Unknown /api/* GETs 404 and are LOGGED —
// that log is the running punch list.

import crypto from 'node:crypto';
import * as social from './social.mjs';

const STUBS = new Map(Object.entries({
  '/api/v1/filters': [], '/api/v2/filters': [],
  '/api/v1/custom_emojis': [],
  '/api/v1/lists': [],
  '/api/v1/conversations': [],
  '/api/v1/announcements': [],
  '/api/v1/follow_requests': [],
  '/api/v1/favourites': [],
  '/api/v1/bookmarks': [],
  '/api/v1/scheduled_statuses': [],
  '/api/v1/instance/peers': [],
  '/api/v1/trends/tags': [], '/api/v1/trends/links': [],
  '/api/v2/suggestions': [],
  '/api/v1/preferences': {},
  '/api/v1/followed_tags': [],
}));

export class MastoApi {
  constructor({ agent, log = console.log }) {
    this.agent = agent;
    this.log = log;
  }

  get store() { return this.agent.store; }
  get urls() { return this.agent.publisher?.urls; }
  get host() { return this.urls ? new URL(this.urls.base).host : 'unconfigured.invalid'; }

  // ---- tokens ----
  tokens() { return this.store.read('masto-tokens.json', []); }
  mintToken() {
    const t = crypto.randomBytes(24).toString('hex');
    this.store.write('masto-tokens.json', [...this.tokens(), t].slice(-20));
    return t;
  }
  authed(req) {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    return !!m && this.tokens().includes(m[1]);
  }

  // ---- object rendering ----
  selfAccount() {
    const cfg = this.store.getConfig();
    return this.account(this.urls.actor, { selfAcct: cfg?.handle || 'jeff' });
  }

  account(actorUrl, { selfAcct } = {}) {
    const cached = this.store.getActors()[actorUrl] || {};
    let host = '', user = cached.preferredUsername || '';
    try { host = new URL(actorUrl).host; if (!user) user = new URL(actorUrl).pathname.split('/').pop(); } catch {}
    const self = actorUrl === this.urls?.actor;
    if (self) user = selfAcct || this.store.getConfig()?.handle || user;
    return {
      id: this.store.idFor(actorUrl),
      username: user,
      // Self gets the FULL acct (Mastodon proper returns the bare local part
      // here): the client's login domain is the loopback facade, so the bare
      // form would display as user@127.0.0.1 — the full form shows the real
      // fediverse identity, and every client renders @-containing accts as-is.
      acct: `${self ? (selfAcct || user) : user}@${host}`,
      display_name: cached.name || user,
      locked: false, bot: false, group: false, discoverable: true,
      created_at: '2026-01-01T00:00:00.000Z',
      note: '', url: actorUrl, uri: actorUrl,
      avatar: cached.icon || TRANSPARENT_PNG, avatar_static: cached.icon || TRANSPARENT_PNG,
      header: TRANSPARENT_PNG, header_static: TRANSPARENT_PNG,
      followers_count: self ? this.store.getContacts().followers.length : 0,
      following_count: self ? this.store.getContacts().following.length : 0,
      statuses_count: self ? this.store.getStatuses().filter(s => s.kind === 'post').length : 0,
      last_status_at: null, emojis: [], fields: [],
    };
  }

  status(s, { all } = {}) {
    const replies = (all || this.store.getStatuses()).filter(x => x.inReplyTo === s.noteId).length;
    return {
      id: this.store.idFor(s.noteId),
      created_at: s.published || new Date().toISOString(),
      in_reply_to_id: s.inReplyTo ? this.store.idFor(s.inReplyTo) : null,
      in_reply_to_account_id: null,
      sensitive: false, spoiler_text: '', visibility: 'public', language: null,
      uri: s.noteId, url: s.noteId,
      replies_count: replies, reblogs_count: 0, favourites_count: 0,
      favourited: !!s.favourited, reblogged: !!s.reblogged,
      muted: false, bookmarked: false, pinned: false,
      content: s.content || '',
      reblog: null, application: null,
      account: this.account(s.actor),
      media_attachments: (s.attachments || []).map(a => this.mediaJson(a)),
      mentions: [], tags: [], emojis: [],
      card: null, poll: null,
    };
  }

  mediaJson(a) {
    const kind = /^video\//.test(a.mediaType) ? 'video'
      : /^audio\//.test(a.mediaType) ? 'audio'
        : /^image\/gif/.test(a.mediaType) ? 'gifv' : 'image';
    return {
      id: a.id || this.store.idFor(a.url),
      type: kind, url: a.url, preview_url: a.url, remote_url: null,
      description: a.description || null, blurhash: null, meta: {},
    };
  }

  relationship(actorUrl) {
    const c = this.store.getContacts();
    const fol = c.following.find(f => f.actor === actorUrl);
    return {
      id: this.store.idFor(actorUrl),
      following: !!fol?.accepted, requested: !!fol && !fol.accepted,
      followed_by: c.followers.some(f => f.actor === actorUrl),
      showing_reblogs: true, notifying: false, languages: null,
      blocking: false, blocked_by: false, domain_blocking: false,
      muting: false, muting_notifications: false, endorsed: false, note: '',
    };
  }

  notification(n) {
    const out = { id: n.id, type: n.type, created_at: n.at, account: this.account(n.actor) };
    if (n.noteId) {
      const s = this.store.getStatuses().find(x => x.noteId === n.noteId);
      if (s) out.status = this.status(s);
    }
    return out;
  }

  // Every account this instance knows whose handle or name matches: self,
  // contacts, cached actor docs. Handle-shaped queries resolve via webfinger.
  async accountSearch(q) {
    const needle = String(q || '').replace(/^@/, '').toLowerCase().trim();
    if (!needle) return [];
    if (/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(needle)) {
      try {
        const doc = await social.resolveHandle(this.agent, needle);
        return [this.account(doc.id)];
      } catch (e) { this.log(`account search resolve ${needle}: ${e.message}`); }
      return [];
    }
    const cfg = this.store.getConfig();
    const seen = new Set();
    const out = [];
    const add = (actorUrl) => {
      if (actorUrl && !seen.has(actorUrl)) { seen.add(actorUrl); out.push(this.account(actorUrl)); }
    };
    if ((cfg?.handle || '').toLowerCase().includes(needle)
      || (cfg?.name || '').toLowerCase().includes(needle)) add(this.urls.actor);
    const contacts = this.store.getContacts();
    for (const rec of [...contacts.followers, ...contacts.following]) {
      if ((rec.handle || rec.actor || '').toLowerCase().includes(needle)) add(rec.actor);
    }
    for (const [u, a] of Object.entries(this.store.getActors())) {
      if ((a.preferredUsername + ' ' + a.name + ' ' + u).toLowerCase().includes(needle)) add(u);
    }
    return out.slice(0, 20);
  }

  // ---- request handling; returns true when handled ----
  async handle(req, res, pathname, url) {
    const send = (status, obj, headers = {}) => {
      const body = JSON.stringify(obj);
      res.writeHead(status, { 'content-type': 'application/json', ...headers });
      res.end(body);
      return true;
    };

    // --- oauth theater ---
    if (pathname === '/api/v1/apps' && req.method === 'POST') {
      const body = await readBody(req);
      return send(200, {
        id: '1', name: body.client_name || 'client',
        client_id: 'dk-ap-client', client_secret: 'dk-ap-secret',
        redirect_uri: body.redirect_uris || 'urn:ietf:wg:oauth:2.0:oob', vapid_key: '',
      });
    }
    if (pathname === '/oauth/authorize' && req.method === 'GET') {
      const redirect = url.searchParams.get('redirect_uri') || '';
      const code = this.mintToken();          // code doubles as the token seed
      if (!redirect || redirect === 'urn:ietf:wg:oauth:2.0:oob') return send(200, { code });
      const target = new URL(redirect);
      target.searchParams.set('code', code);
      res.writeHead(302, { location: target.href });
      res.end();
      return true;
    }
    if (pathname === '/oauth/token' && req.method === 'POST') {
      const body = await readBody(req);
      const token = this.tokens().includes(body.code) ? body.code : this.mintToken();
      return send(200, { access_token: token, token_type: 'Bearer', scope: body.scope || 'read write follow push', created_at: Math.floor(Date.now() / 1000) });
    }
    if (pathname === '/oauth/revoke' && req.method === 'POST') return send(200, {});

    if (!pathname.startsWith('/api/')) return false;

    // --- instance (public) ---
    if (pathname === '/api/v1/instance') {
      return send(200, {
        uri: this.host, title: 'data kitchen', short_description: 'Solid pod ActivityPub actor',
        description: '', email: '', version: '4.2.0 (compatible; dk-ap-agent)',
        urls: {}, stats: { user_count: 1, status_count: this.store.getStatuses().length, domain_count: 1 },
        languages: ['en'], registrations: false, approval_required: false, invites_enabled: false,
        configuration: instanceConfig(),
        contact_account: null, rules: [],
      });
    }
    if (pathname === '/api/v2/instance') {
      return send(200, {
        domain: this.host, title: 'data kitchen', version: '4.2.0 (compatible; dk-ap-agent)',
        source_url: 'https://github.com/SolidOS/data-kitchen', description: 'Solid pod ActivityPub actor',
        usage: { users: { active_month: 1 } },
        thumbnail: { url: TRANSPARENT_PNG },
        languages: ['en'],
        configuration: { ...instanceConfig(), urls: { streaming: '' }, vapid: { public_key: '' } },
        registrations: { enabled: false, approval_required: false, message: null },
        contact: { email: '', account: null }, rules: [],
      });
    }

    const stub = STUBS.get(pathname);
    if (stub !== undefined && req.method === 'GET') return send(200, stub);

    // --- everything below needs a bearer token + a configured agent ---
    if (!this.authed(req)) return send(401, { error: 'The access token is invalid' });
    if (!this.agent.configured()) return send(503, { error: 'agent not configured' });

    if (pathname === '/api/v1/accounts/verify_credentials') {
      return send(200, { ...this.selfAccount(), source: { privacy: 'public', sensitive: false, language: 'en', note: '', fields: [] } });
    }

    // home + public = everything known (follows, boosts, tag feed, own);
    // public?local=true = own posts; trends/statuses = the same activity (a
    // single-actor instance has no firehose — what it knows IS its public
    // face). Sorted by publish time so tag-feed backfill interleaves.
    if (pathname === '/api/v1/timelines/home' || pathname === '/api/v1/timelines/public'
      || pathname === '/api/v1/trends/statuses') {
      const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 40);
      const maxId = url.searchParams.get('max_id');
      const localOnly = pathname === '/api/v1/timelines/public' && url.searchParams.get('local') === 'true';
      let items = this.store.getStatuses()
        .filter(s => s.kind !== 'remote')                  // search ingests stay out
        .filter(s => !localOnly || s.kind === 'post')
        .sort((a, b) => String(b.published || '').localeCompare(String(a.published || '')));
      if (maxId) {
        const i = items.findIndex(s => this.store.idFor(s.noteId) === maxId);
        if (i >= 0) items = items.slice(i + 1);
      }
      return send(200, items.slice(0, limit).map(s => this.status(s)));
    }

    if (pathname === '/api/v1/statuses' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body.status) return send(422, { error: 'status text required' });
      const inReplyTo = body.in_reply_to_id ? this.store.urlFor(body.in_reply_to_id) : undefined;
      const mediaIds = [].concat(body.media_ids || body['media_ids[]'] || []).filter(Boolean);
      const media = this.store.getMedia();
      const attachments = mediaIds.map(id => media[id] && { id, ...media[id] }).filter(Boolean);
      const note = await this.agent.publisher.publishNote(body.status, { inReplyTo, attachments });
      const s = this.store.getStatuses().find(x => x.noteId === note.id);
      return send(200, this.status(s));
    }

    const mStatus = /^\/api\/v1\/statuses\/([a-f0-9]+)$/.exec(pathname);
    if (mStatus && req.method === 'GET') {
      const noteUrl = this.store.urlFor(mStatus[1]);
      const s = noteUrl && this.store.getStatuses().find(x => x.noteId === noteUrl);
      return s ? send(200, this.status(s)) : send(404, { error: 'Record not found' });
    }
    if (mStatus && req.method === 'DELETE') {
      const noteUrl = this.store.urlFor(mStatus[1]);
      const s = noteUrl && this.store.getStatuses().find(x => x.noteId === noteUrl);
      if (!s) return send(404, { error: 'Record not found' });
      if (s.actor !== this.urls.actor) return send(403, { error: 'not your status' });
      const rendered = this.status(s);
      await social.deleteNote(this.agent, s);
      return send(200, { ...rendered, text: s.content || '' });
    }

    // Threads from the mirror's inReplyTo chains.
    const mContext = /^\/api\/v1\/statuses\/([a-f0-9]+)\/context$/.exec(pathname);
    if (mContext) {
      const noteUrl = this.store.urlFor(mContext[1]);
      const all = this.store.getStatuses();
      const byId = new Map(all.map(s => [s.noteId, s]));
      const ancestors = [];
      let cur = noteUrl && byId.get(noteUrl)?.inReplyTo;
      while (cur && byId.has(cur) && ancestors.length < 40) {
        const s = byId.get(cur);
        ancestors.unshift(s);
        cur = s.inReplyTo;
      }
      const descendants = [];
      const queue = noteUrl ? [noteUrl] : [];
      while (queue.length && descendants.length < 60) {
        const id = queue.shift();
        for (const s of all) if (s.inReplyTo === id) { descendants.push(s); queue.push(s.noteId); }
      }
      return send(200, {
        ancestors: ancestors.map(s => this.status(s, { all })),
        descendants: descendants.map(s => this.status(s, { all })),
      });
    }

    const mAction = /^\/api\/v1\/statuses\/([a-f0-9]+)\/(favourite|unfavourite|reblog|unreblog)$/.exec(pathname);
    if (mAction && req.method === 'POST') {
      const noteUrl = this.store.urlFor(mAction[1]);
      const s = noteUrl && this.store.getStatuses().find(x => x.noteId === noteUrl);
      if (!s) return send(404, { error: 'Record not found' });
      const updated = await social[mAction[2]](this.agent, s);
      return send(200, this.status(updated || s));
    }

    if (pathname === '/api/v1/notifications') {
      const limit = Math.min(Number(url.searchParams.get('limit')) || 30, 60);
      let items = this.store.getNotifications();
      const maxId = url.searchParams.get('max_id');
      if (maxId) {
        const i = items.findIndex(n => n.id === maxId);
        if (i >= 0) items = items.slice(i + 1);
      }
      return send(200, items.slice(0, limit).map(n => this.notification(n)));
    }

    if (pathname === '/api/v1/markers') {
      if (req.method === 'POST') {
        const body = await readBody(req);
        const markers = this.store.read('masto-markers.json', {});
        for (const [k, v] of Object.entries(body)) {
          const lastId = v?.last_read_id || v;
          if (typeof lastId === 'string') {
            markers[k] = { last_read_id: lastId, version: (markers[k]?.version || 0) + 1, updated_at: new Date().toISOString() };
          }
        }
        this.store.write('masto-markers.json', markers);
        return send(200, markers);
      }
      return send(200, this.store.read('masto-markers.json', {}));
    }

    if (pathname === '/api/v1/accounts/relationships') {
      const ids = [...url.searchParams.getAll('id[]'), ...url.searchParams.getAll('id')];
      const rels = ids.map(id => this.store.urlFor(id)).filter(Boolean).map(u => this.relationship(u));
      return send(200, rels);
    }

    if (pathname === '/api/v1/accounts/search') {
      return send(200, await this.accountSearch(url.searchParams.get('q')));
    }

    if (pathname === '/api/v1/accounts/lookup') {
      const acct = String(url.searchParams.get('acct') || '').replace(/^@/, '');
      const cfg = this.store.getConfig();
      if (acct === cfg?.handle || acct === `${cfg?.handle}@${this.host}`) {
        return send(200, this.selfAccount());
      }
      const hit = Object.entries(this.store.getActors()).find(([u, a]) => {
        try { return `${a.preferredUsername}@${new URL(u).host}` === acct; } catch { return false; }
      });
      return hit ? send(200, this.account(hit[0])) : send(404, { error: 'Record not found' });
    }

    const mFollow = /^\/api\/v1\/accounts\/([a-f0-9]+)\/(follow|unfollow)$/.exec(pathname);
    if (mFollow && req.method === 'POST') {
      const actorUrl = this.store.urlFor(mFollow[1]);
      if (!actorUrl) return send(404, { error: 'Record not found' });
      if (mFollow[2] === 'follow') await social.followActor(this.agent, actorUrl);
      else await social.unfollowActor(this.agent, actorUrl).catch(() => {});   // already-gone is fine
      return send(200, this.relationship(actorUrl));
    }

    const mAccount = /^\/api\/v1\/accounts\/([a-f0-9]+)$/.exec(pathname);
    if (mAccount && req.method === 'GET') {
      const actorUrl = this.store.urlFor(mAccount[1]);
      return actorUrl ? send(200, this.account(actorUrl)) : send(404, { error: 'Record not found' });
    }
    const mAccStatuses = /^\/api\/v1\/accounts\/([a-f0-9]+)\/statuses$/.exec(pathname);
    if (mAccStatuses) {
      const actorUrl = this.store.urlFor(mAccStatuses[1]);
      const items = this.store.getStatuses().filter(s => s.actor === actorUrl).slice(0, 20);
      return send(200, items.map(s => this.status(s)));
    }

    // Search: @user@host → webfinger resolve; URL → actor or note ingest;
    // plain text → local mirror + actor-cache scan.
    if (pathname === '/api/v2/search' || pathname === '/api/v1/search') {
      const q = String(url.searchParams.get('q') || '').trim();
      const type = url.searchParams.get('type');
      const out = { accounts: [], statuses: [], hashtags: [] };
      const asHandle = /^@?[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(q);
      if (asHandle && type !== 'statuses') {
        try {
          const doc = await social.resolveHandle(this.agent, q);
          out.accounts.push(this.account(doc.id));
        } catch (e) { this.log(`search resolve ${q}: ${e.message}`); }
      } else if (/^https?:\/\//.test(q)) {
        const doc = await this.agent.intake.fetchAP(q).catch(() => null);
        if (doc?.type === 'Person' && doc.id) out.accounts.push(this.account(doc.id));
        else if (doc?.type === 'Note' && doc.id) {
          let s = this.store.getStatuses().find(x => x.noteId === doc.id);
          if (!s) {
            s = {
              noteId: doc.id, actor: doc.attributedTo, content: doc.content,
              published: doc.published, inReplyTo: doc.inReplyTo, kind: 'remote',
            };
            this.store.addStatus(s);
          }
          out.statuses.push(this.status(s));
        }
      } else if (q) {
        const needle = q.toLowerCase();
        if (type !== 'accounts') {
          out.statuses = this.store.getStatuses()
            .filter(s => (s.content || '').toLowerCase().includes(needle)).slice(0, 20)
            .map(s => this.status(s));
        }
        if (type !== 'statuses') out.accounts = await this.accountSearch(q);
      }
      return send(200, out);
    }

    // Media upload: file → remote pod /ap/media/ (public-Read), entry in the
    // media registry so a later POST /statuses can attach it.
    if ((pathname === '/api/v2/media' || pathname === '/api/v1/media') && req.method === 'POST') {
      const { fields, file } = await readMultipart(req);
      if (!file?.data?.length) return send(422, { error: 'file required' });
      const ext = (file.filename || '').includes('.') ? file.filename.split('.').pop().replace(/[^\w]/g, '') : 'bin';
      const slug = new Date().toISOString().slice(0, 10) + '-' + crypto.randomBytes(4).toString('hex') + '.' + ext;
      const mediaUrl = this.urls.media + slug;
      await this.agent.publisher.ensureMediaContainer();
      await this.agent.remote.put(mediaUrl, file.data, file.contentType);
      const entry = { url: mediaUrl, mediaType: file.contentType, description: fields.description || '' };
      const id = this.store.idFor(mediaUrl);
      this.store.setMedia(id, entry);
      return send(200, this.mediaJson({ id, ...entry }));
    }
    const mMedia = /^\/api\/v1\/media\/([a-f0-9]+)$/.exec(pathname);
    if (mMedia) {
      const entry = this.store.getMedia()[mMedia[1]];
      if (!entry) return send(404, { error: 'Record not found' });
      if (req.method === 'PUT') {
        const body = await readBody(req);
        if (typeof body.description === 'string') {
          entry.description = body.description;
          this.store.setMedia(mMedia[1], entry);
        }
      }
      return send(200, this.mediaJson({ id: mMedia[1], ...entry }));
    }

    this.log(`mastoapi: unhandled ${req.method} ${pathname} — punch list`);
    return send(404, { error: `Unimplemented: ${req.method} ${pathname}` });
  }
}

function instanceConfig() {
  return {
    statuses: { max_characters: 5000, max_media_attachments: 4, characters_reserved_per_url: 23 },
    media_attachments: {
      supported_mime_types: ['image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'video/mp4', 'video/webm', 'audio/mpeg', 'audio/ogg'],
      image_size_limit: 10 * 1024 * 1024, video_size_limit: 40 * 1024 * 1024,
      image_matrix_limit: 16777216, video_matrix_limit: 2304000,
    },
    polls: { max_options: 0 },
    accounts: { max_featured_tags: 0 },
  };
}

// 1x1 transparent PNG — placeholder avatar/header for accounts without icons.
const TRANSPARENT_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// Minimal multipart/form-data reader for media uploads: string fields plus
// at most one file part (Mastodon's media endpoints send exactly one).
function readMultipart(req, limit = 50e6) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on('data', c => {
      n += c.length;
      if (n > limit) { reject(new Error('upload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('error', reject);
    req.on('end', () => {
      try {
        const m = /boundary=(?:"([^"]+)"|([^;]+))/.exec(String(req.headers['content-type'] || ''));
        if (!m) return resolve({ fields: {}, file: null });
        const buf = Buffer.concat(chunks);
        const boundary = Buffer.from('--' + (m[1] || m[2]).trim());
        const fields = {};
        let file = null;
        let i = buf.indexOf(boundary);
        while (i >= 0) {
          const start = i + boundary.length;
          if (buf.slice(start, start + 2).toString() === '--') break;
          const next = buf.indexOf(boundary, start);
          if (next < 0) break;
          const part = buf.slice(start + 2, next - 2);        // strip the CRLFs framing the part
          const sep = part.indexOf('\r\n\r\n');
          if (sep >= 0) {
            const head = part.slice(0, sep).toString();
            const body = part.slice(sep + 4);
            const name = /name="([^"]*)"/.exec(head)?.[1];
            const filename = /filename="([^"]*)"/.exec(head)?.[1];
            if (filename !== undefined) {
              file = {
                filename,
                contentType: /content-type:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim() || 'application/octet-stream',
                data: body,
              };
            } else if (name) fields[name] = body.toString();
          }
          i = next;
        }
        resolve({ fields, file });
      } catch (e) { reject(e); }
    });
  });
}

// Accepts JSON or form-encoded bodies (OAuth posts are often form-encoded).
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => {
      const ct = String(req.headers['content-type'] || '');
      try {
        if (ct.includes('application/json')) return resolve(data ? JSON.parse(data) : {});
        resolve(Object.fromEntries(new URLSearchParams(data)));
      } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}
