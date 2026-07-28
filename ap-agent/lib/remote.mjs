// remote.mjs — authenticated I/O against the remote (public-face) pod, via
// the same CSS client-credentials + DPoP machinery dk's "remember this IdP"
// uses (electron-config/idp-grant.cjs).

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { mintCredential, discoverTokenEndpoint, createGrantSession } =
  require(path.join(repoRoot, 'electron-config/idp-grant.cjs'));

export { mintCredential, discoverTokenEndpoint };

export class RemotePod {
  constructor(credential) {
    this.session = createGrantSession(credential);
    this.webId = credential.webId;
  }

  async warmup() { return this.session.warmup(); }

  fetch(url, init) { return this.session.fetch(url, init); }

  async put(url, body, contentType) {
    const res = await this.session.fetch(url, {
      method: 'PUT', headers: { 'content-type': contentType }, body,
    });
    if (res.status >= 400) throw new Error(`PUT ${url} → ${res.status}`);
    return res;
  }

  async putJson(url, obj, contentType = 'application/activity+json') {
    return this.put(url, JSON.stringify(obj), contentType);
  }

  async getJson(url) {
    const res = await this.session.fetch(url, { headers: { accept: '*/*' } });
    if (res.status >= 400) return null;
    return res.json().catch(() => null);
  }

  async delete(url) {
    const res = await this.session.fetch(url, { method: 'DELETE' });
    return res.status < 400 || res.status === 404;
  }

  // Child documents of an LDP container (URLs under it, excluding aux docs).
  async listContainer(url) {
    const res = await this.session.fetch(url, { headers: { accept: 'text/turtle' } });
    if (res.status >= 400) return [];
    const text = await res.text();
    const children = new Set();
    for (const m of text.matchAll(/<([^>]+)>/g)) {
      const child = new URL(m[1], url).href;
      if (child.startsWith(url) && child !== url && !/\.(acl|meta)$/.test(child)) children.add(child);
    }
    return [...children];
  }

  // WAC doc granting the public `publicModes` on target, owner full control.
  aclDoc(targetUrl, publicModes) {
    const pub = publicModes.length
      ? `<#public> a acl:Authorization;\n  acl:agentClass foaf:Agent;\n  acl:accessTo <${targetUrl}>;\n  acl:default <${targetUrl}>;\n  acl:mode ${publicModes.map(m => 'acl:' + m).join(', ')}.\n`
      : '';
    return `@prefix acl: <http://www.w3.org/ns/auth/acl#>.\n@prefix foaf: <http://xmlns.com/foaf/0.1/>.\n${pub}<#owner> a acl:Authorization;\n  acl:agent <${this.webId}>;\n  acl:accessTo <${targetUrl}>;\n  acl:default <${targetUrl}>;\n  acl:mode acl:Read, acl:Write, acl:Control.\n`;
  }

  async setAcl(targetUrl, publicModes) {
    return this.put(targetUrl + '.acl', this.aclDoc(targetUrl, publicModes), 'text/turtle');
  }
}
