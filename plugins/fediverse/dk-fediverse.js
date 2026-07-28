// dk-fediverse — minimal fediverse pane (plan 6c, Phase 3): timeline list,
// compose box, follow field. All federation machinery lives in ap-agent/
// (reached same-origin via the router's /ap-admin proxy); the timeline is
// read straight from the local pod's /fediverse/timeline/ (AS2 RDF, see
// claude/plans/ap-pod-mapping.md). Bundled into dist/dk.bundle.js via
// dk-shell.js, like dk-podz.

import * as $rdf from 'rdflib';
import DOMPurify from 'dompurify';

const API = '/ap-admin';
const AS = $rdf.Namespace('https://www.w3.org/ns/activitystreams#');

const CSS = `
dk-fediverse { display: flex; flex-direction: column; height: 100%; min-height: 0;
  font-size: 1rem; gap: 0.5rem; padding: 0.5rem; box-sizing: border-box; }
dk-fediverse .dk-fedi-status { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
dk-fediverse .dk-fedi-handle { font-weight: 600; }
dk-fediverse .dk-fedi-msg { min-height: 1.4em; }
dk-fediverse form { display: flex; gap: 0.5rem; align-items: flex-start; }
dk-fediverse textarea, dk-fediverse input[type="text"] {
  font-size: 1rem; flex: 1; padding: 0.4rem; border-radius: 4px;
  background: var(--input-bg, #eef); color: var(--input-text, #1a1a1a);
  border: 1px solid var(--input-border, #9aa0a8); }
dk-fediverse textarea { min-height: 3.5em; resize: vertical; }
dk-fediverse button { font-size: 1rem; padding: 0.4rem 0.9rem; }
dk-fediverse .dk-fedi-timeline { flex: 1; min-height: 0; overflow: auto;
  list-style: none; margin: 0; padding: 0; }
dk-fediverse .dk-fedi-timeline li { padding: 0.6rem 0.25rem; border-bottom: 1px solid var(--input-border, #9aa0a8); }
dk-fediverse .dk-fedi-meta { display: flex; gap: 0.6rem; flex-wrap: wrap; font-size: 1rem; opacity: 0.8; }
dk-fediverse .dk-fedi-content p { margin: 0.3em 0; }
`;

function ensureCss() {
  if (document.querySelector('style[data-dk-fediverse]')) return;
  const style = document.createElement('style');
  style.dataset.dkFediverse = '1';
  style.textContent = CSS;
  document.head.appendChild(style);
}

async function api(pathname, body) {
  const res = await fetch(API + pathname, body === undefined
    ? undefined
    : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `HTTP ${res.status}`);
  return out;
}

// One timeline item document (AS2 turtle, subject = the doc) → plain object.
async function loadItem(url) {
  const res = await fetch(url, { headers: { accept: 'text/turtle' } });
  if (!res.ok) return null;
  const g = $rdf.graph();
  $rdf.parse(await res.text(), g, url, 'text/turtle');
  const s = $rdf.sym(url);
  return {
    content: g.anyValue(s, AS('content')) || '',
    published: g.anyValue(s, AS('published')) || '',
    actor: g.any(s, AS('attributedTo'))?.value || '',
    url: g.any(s, AS('url'))?.value || '',
  };
}

class DkFediverse extends HTMLElement {
  connectedCallback() {
    if (this._rendered) return;
    this._rendered = true;
    ensureCss();
    this.innerHTML = `
      <div class="dk-fedi-status" role="status">
        <span class="dk-fedi-handle"></span>
        <span class="dk-fedi-counts"></span>
        <button type="button" class="dk-fedi-refresh" title="Refresh">↻ Refresh</button>
      </div>
      <form class="dk-fedi-compose">
        <textarea placeholder="Write a post…" aria-label="Write a post"></textarea>
        <button type="submit">Post</button>
      </form>
      <form class="dk-fedi-follow">
        <input type="text" placeholder="user@server.example to follow" aria-label="Handle to follow">
        <button type="submit">Follow</button>
      </form>
      <div class="dk-fedi-msg" role="status"></div>
      <ol class="dk-fedi-timeline" aria-label="Timeline"></ol>`;

    this.querySelector('.dk-fedi-refresh').addEventListener('click', () => this.refresh());
    this.querySelector('.dk-fedi-compose').addEventListener('submit', (e) => { e.preventDefault(); this.post(); });
    this.querySelector('.dk-fedi-follow').addEventListener('submit', (e) => { e.preventDefault(); this.follow(); });
    this.refresh();
  }

  get source() { return this.getAttribute('source') || '/dk-pod/fediverse/timeline/'; }

  say(text) { this.querySelector('.dk-fedi-msg').textContent = text; }

  async refresh() {
    await Promise.all([this.refreshStatus(), this.refreshTimeline()])
      .catch((e) => this.say(e.message));
  }

  async refreshStatus() {
    try {
      const s = await api('/status');
      this.querySelector('.dk-fedi-handle').textContent = s.configured
        ? `@${s.handle}@${new URL(s.actor).host}` : 'Fediverse agent not configured';
      this.querySelector('.dk-fedi-counts').textContent = s.configured
        ? `${s.followers} follower${s.followers === 1 ? '' : 's'} · following ${s.following}` +
          (s.queue ? ` · ${s.queue} queued` : '')
        : '';
    } catch (e) {
      this.querySelector('.dk-fedi-handle').textContent = 'Fediverse agent unreachable';
      this.querySelector('.dk-fedi-counts').textContent = '';
    }
  }

  async refreshTimeline() {
    const list = this.querySelector('.dk-fedi-timeline');
    const res = await fetch(this.source, { headers: { accept: 'text/turtle' } });
    if (!res.ok) { list.innerHTML = ''; return; }
    const text = await res.text();
    const base = new URL(this.source, location.href).href;
    const children = new Set();
    for (const m of text.matchAll(/<([^>]+)>/g)) {
      const child = new URL(m[1], base).href;
      if (child.startsWith(base) && child !== base && !/\.(acl|meta)$/.test(child)) children.add(child);
    }
    const items = (await Promise.all([...children].map(loadItem))).filter(Boolean)
      .sort((a, b) => String(b.published).localeCompare(String(a.published)));
    list.innerHTML = '';
    for (const item of items) {
      const li = document.createElement('li');
      const meta = document.createElement('div');
      meta.className = 'dk-fedi-meta';
      const who = document.createElement('a');
      who.href = item.actor; who.target = '_blank'; who.rel = 'noopener';
      who.textContent = item.actor ? new URL(item.actor).host + new URL(item.actor).pathname : '';
      const when = document.createElement('span');
      when.textContent = item.published ? new Date(item.published).toLocaleString() : '';
      meta.append(who, when);
      const content = document.createElement('div');
      content.className = 'dk-fedi-content';
      content.innerHTML = DOMPurify.sanitize(item.content);
      li.append(meta, content);
      list.append(li);
    }
  }

  async post() {
    const box = this.querySelector('.dk-fedi-compose textarea');
    if (!box.value.trim()) return;
    this.say('posting…');
    try {
      const out = await api('/post', { content: box.value.trim() });
      box.value = '';
      this.say('posted: ' + out.id);
      this.refresh();
    } catch (e) { this.say('post failed: ' + e.message); }
  }

  async follow() {
    const box = this.querySelector('.dk-fedi-follow input');
    if (!box.value.trim()) return;
    this.say('sending follow…');
    try {
      const out = await api('/follow', { handle: box.value.trim() });
      box.value = '';
      this.say('follow sent to ' + out.actor + ' (awaiting accept)');
      this.refresh();
    } catch (e) { this.say('follow failed: ' + e.message); }
  }
}

if (!customElements.get('dk-fediverse')) customElements.define('dk-fediverse', DkFediverse);
