// Helpers compartidos por los tests.

export function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    writableEnded: false,
    headersSent: false,
    writeHead(s, h) { this.statusCode = s; if (h) this.headers = h; this.headersSent = true; return this; },
    end(body) { this.body = body; this.writableEnded = true; return this; },
    setHeader(k, v) { this.headers[k] = v; },
  };
  return res;
}

export function parse(res) {
  return JSON.parse(res.body);
}

export function mockReq(body = {}, user = { id: null, role: 'admin' }) {
  return { body, user, ip: '127.0.0.1' };
}
