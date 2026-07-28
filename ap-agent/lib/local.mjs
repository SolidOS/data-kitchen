// local.mjs — writes to the LOCAL dk pod (the RDF source of truth) through
// the router, authorized by the gate token. Layout + vocabulary per
// claude/plans/ap-pod-mapping.md (approved 2026-07-28): AS2 terms only.

const AS = 'https://www.w3.org/ns/activitystreams#';
const PREFIXES = `@prefix as: <${AS}>.\n@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.\n`;

function lit(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '') + '"';
}

export class LocalPod {
  constructor({ base, gateToken }) {
    this.base = base.endsWith('/') ? base : base + '/';   // e.g. http://localhost:8000/dk-pod/
    this.gateToken = gateToken;
    this.fedi = this.base + 'fediverse/';
  }

  async get(url) {
    const res = await fetch(url, {
      headers: { accept: 'text/turtle', ...(this.gateToken ? { 'x-dk-token': this.gateToken } : {}) },
    });
    if (res.status >= 400) throw new Error(`local GET ${url} → ${res.status}`);
    return res.text();
  }

  // Child resource URLs of /fediverse/{kind}/ (empty when the container is absent).
  async listNotes(kind) {
    const base = `${this.fedi}${kind}/`;
    let ttl;
    try { ttl = await this.get(base); }
    catch (e) { if (/ 404$/.test(e.message)) return []; throw e; }
    const urls = new Set();
    for (const m of ttl.matchAll(/<([^>]*)>/g)) {
      let u;
      try { u = new URL(m[1], base).href; } catch { continue; }
      if (u.startsWith(base) && u !== base && !u.endsWith('/')) urls.add(u);
    }
    return [...urls];
  }

  // Inverse of writeNote for one resource (the exact shape this class writes).
  async readNote(url) {
    const ttl = await this.get(url);
    const iri = (p) => (ttl.match(new RegExp(`as:${p} <([^>]+)>`)) || [])[1];
    const unesc = (s) => s.replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c));
    const str = (p) => {
      const m = ttl.match(new RegExp(`as:${p} "((?:[^"\\\\]|\\\\.)*)"`));
      return m ? unesc(m[1]) : undefined;
    };
    const attachments = [...ttl.matchAll(/as:attachment <([^>]+)>/g)].map(m => m[1]).map(u => {
      const esc = u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const block = (ttl.match(new RegExp(`<${esc}> a as:Document([\\s\\S]*?) \\.\\n`)) || [])[1] || '';
      const mt = block.match(/as:mediaType "((?:[^"\\]|\\.)*)"/);
      const nm = block.match(/as:name "((?:[^"\\]|\\.)*)"/);
      return { url: u, mediaType: mt ? unesc(mt[1]) : '', ...(nm ? { description: unesc(nm[1]) } : {}) };
    });
    return {
      noteId: iri('url'), actor: iri('attributedTo'),
      published: str('published'), inReplyTo: iri('inReplyTo'), content: str('content'),
      ...(attachments.length ? { attachments } : {}),
    };
  }

  async put(url, body, contentType = 'text/turtle') {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': contentType, ...(this.gateToken ? { 'x-dk-token': this.gateToken } : {}) },
      body,
    });
    if (res.status >= 400) throw new Error(`local PUT ${url} → ${res.status}`);
  }

  async delete(url) {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.gateToken ? { 'x-dk-token': this.gateToken } : {},
    });
    if (res.status >= 400 && res.status !== 404) throw new Error(`local DELETE ${url} → ${res.status}`);
  }

  // Incoming or own post → one RDF resource. kind: 'timeline' | 'posts'
  async writeNote(kind, slug, { noteId, actor, published, content, inReplyTo, attachments }) {
    let ttl = PREFIXES +
      `<> a as:Note ;\n` +
      `  as:url <${noteId}> ;\n` +
      `  as:attributedTo <${actor}> ;\n` +
      (published ? `  as:published ${lit(published)}^^xsd:dateTime ;\n` : '') +
      (inReplyTo ? `  as:inReplyTo <${inReplyTo}> ;\n` : '') +
      (attachments || []).map(a => `  as:attachment <${a.url}> ;\n`).join('') +
      `  as:content ${lit(content || '')} .\n`;
    for (const a of attachments || []) {
      ttl += `<${a.url}> a as:Document` +
        (a.mediaType ? ` ;\n  as:mediaType ${lit(a.mediaType)}` : '') +
        (a.description ? ` ;\n  as:name ${lit(a.description)}` : '') + ' .\n';
    }
    await this.put(`${this.fedi}${kind}/${slug}`, ttl);
  }

  // Contacts doc — the followers/following truth, rebuilt whole each change.
  async writeContacts({ followers, following }) {
    let ttl = PREFIXES + `<#me> a as:Person`;
    if (followers.length) ttl += ` ;\n  as:followers ${followers.map(f => `<${f.actor}>`).join(', ')}`;
    if (following.length) ttl += ` ;\n  as:following ${following.map(f => `<${f.actor}>`).join(', ')}`;
    await this.put(this.fedi + 'contacts', ttl + ' .\n');
  }

  // Settings doc — handle + pointer to the public face.
  async writeSettings({ handle, actorUrl }) {
    const ttl = PREFIXES +
      `<#me> a as:Person ;\n  as:preferredUsername ${lit(handle)} ;\n  as:url <${actorUrl}> .\n`;
    await this.put(this.fedi + 'settings', ttl);
  }
}
