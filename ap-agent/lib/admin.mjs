// admin.mjs — loopback-only admin API for the dk pane (and smoke tests).
// Gated with the shared DK_GATE_TOKEN (electron-config/gate.cjs) exactly like
// the other bundled servers. Never reachable off-box.

import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { followHandle, unfollowActor } from './social.mjs';
import { MastoApi } from './mastoapi.mjs';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { makeGate } = require(path.join(repoRoot, 'electron-config/gate.cjs'));

function json(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj) + '\n');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

export function startAdmin({ port, gateToken, agent, log = console.log }) {
  const gate = makeGate(gateToken);
  const masto = new MastoApi({ agent, log });

  const server = http.createServer(async (req, res) => {
    if (gate(req, res)) return;
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    try {
      // Mastodon client API + OAuth (router forwards /api/* and /oauth/*
      // with paths intact; the /ap-admin prefix is stripped before us).
      if (p.startsWith('/api/') || p.startsWith('/oauth/')) {
        if (await masto.handle(req, res, p, url)) return;
      }
      if (req.method === 'GET' && (p === '/' || p === '/status')) return json(res, 200, agent.status());
      if (req.method === 'GET' && p === '/log') return json(res, 200, { lines: agent.logLines(200) });
      if (req.method === 'GET' && p === '/deadletter') return json(res, 200, { items: agent.store.getDeadLetters() });
      if (req.method === 'GET' && p === '/tagfeed') {
        return json(res, 200, agent.tagfeed
          ? { ...agent.tagfeed.config(), lastSweep: agent.tagfeed.lastSweep, lastAdded: agent.tagfeed.lastAdded }
          : { error: 'agent not configured' });
      }
      if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
      const body = await readBody(req);
      if (p !== '/setup' && p !== '/block' && !agent.configured()) {
        return json(res, 409, { error: 'agent not configured — POST /setup first' });
      }
      switch (p) {
        case '/setup': return json(res, 200, await agent.setup(body));
        case '/drain': await agent.intake.drain(); return json(res, 200, agent.status());
        case '/publish-profile': await agent.publisher.publishProfile(); return json(res, 200, { ok: true });
        case '/post': {
          if (!body.content) return json(res, 400, { error: 'content required' });
          const note = await agent.publisher.publishNote(body.content, { inReplyTo: body.inReplyTo });
          return json(res, 200, { ok: true, id: note.id });
        }
        case '/tagfeed': return json(res, 200, agent.tagfeed.setConfig(body));
        case '/follow': return json(res, 200, await followHandle(agent, body.handle));
        case '/unfollow': return json(res, 200, await unfollowActor(agent, body.actor));
        case '/block': {
          if (!body.domain) return json(res, 400, { error: 'domain required' });
          const b = agent.store.getBlocklist();
          if (!b.domains.includes(body.domain)) { b.domains.push(body.domain); agent.store.setBlocklist(b); }
          return json(res, 200, { ok: true, domains: b.domains });
        }
        default: return json(res, 404, { error: 'unknown endpoint' });
      }
    } catch (e) {
      log(`admin ${p}: ${e.message}`);
      return json(res, 500, { error: e.message });
    }
  });

  server.listen(port, '127.0.0.1', () => log(`admin API on 127.0.0.1:${port}`));
  return server;
}
