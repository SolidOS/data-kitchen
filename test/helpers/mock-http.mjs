// Minimal Node-http req/res doubles for unit-testing request handlers
// (the gate, router/proxy helpers) without opening a socket. Mirrors only the
// surface those handlers touch: req.headers/method/url and res.writeHead/end.

export function makeReq({ method = 'GET', url = '/', headers = {} } = {}) {
  // header lookups in Node are lower-cased; normalize so tests can pass either.
  const lower = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return { method, url, headers: lower };
}

export function makeRes() {
  const res = {
    statusCode: undefined,
    headers: {},
    body: '',
    ended: false,
    writeHead(status, headers = {}) {
      res.statusCode = status;
      for (const [k, v] of Object.entries(headers)) res.headers[k.toLowerCase()] = v;
      return res;
    },
    end(chunk = '') {
      res.body += chunk;
      res.ended = true;
      return res;
    },
  };
  return res;
}
