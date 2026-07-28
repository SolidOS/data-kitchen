// keys.mjs — actor signing keys. RSA (Mastodon's draft-cavage HTTP Signatures
// require RSA-SHA256) + Ed25519 (stored for future FEP-8b32 use, not yet in
// the actor doc). PEM at rest (0600 via Store), CryptoKey in memory for
// Fedify's signRequest.

import crypto from 'node:crypto';

const RSA_ALG = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };

export async function ensureKeys(store) {
  let rec = store.read('keys.json', null);
  if (!rec) {
    const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const ed = crypto.generateKeyPairSync('ed25519');
    rec = {
      rsa: {
        publicPem: rsa.publicKey.export({ type: 'spki', format: 'pem' }),
        privatePem: rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }),
      },
      ed25519: {
        publicPem: ed.publicKey.export({ type: 'spki', format: 'pem' }),
        privatePem: ed.privateKey.export({ type: 'pkcs8', format: 'pem' }),
      },
    };
    store.write('keys.json', rec);
  }
  const der = crypto.createPrivateKey(rec.rsa.privatePem).export({ type: 'pkcs8', format: 'der' });
  const rsaPrivate = await crypto.subtle.importKey('pkcs8', der, RSA_ALG, true, ['sign']);
  return { rsaPrivate, rsaPublicPem: rec.rsa.publicPem };
}
