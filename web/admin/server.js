// Servidor del panel admin en su hostname dedicado (subdominio propio del
// cliente; ver cloudflared). Sirve la SPA compilada y hace proxy interno
// de API/media al backend :3000, de modo que el navegador conserva el
// mismo origen para cookies y CSRF.

import { createServer, request as proxyRequest } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createStaticHandler } from '../server/lib/static.js';
import { securityHeaders } from '../server/middleware/security-headers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.ADMIN_PORT || 3001);
const BACKEND_HOST = process.env.BACKEND_HOST || '127.0.0.1';
const BACKEND_PORT = Number(process.env.BACKEND_PORT || 3000);
const serveAdmin = createStaticHandler({
  publicDir: join(__dirname, '..', 'server', 'public'),
  adminPath: '/',
});

function proxyToBackend(req, res) {
  const headers = { ...req.headers, host: `${BACKEND_HOST}:${BACKEND_PORT}` };
  const upstream = proxyRequest({
    host: BACKEND_HOST,
    port: BACKEND_PORT,
    method: req.method,
    path: req.url,
    headers,
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });

  upstream.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
    }
    res.end(JSON.stringify({ ok: false, error: 'backend_unavailable' }));
  });
  req.pipe(upstream);
}

const server = createServer((req, res) => {
  securityHeaders(req, res, () => {});
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;

  if (pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, service: 'techstore-admin' }));
  }
  if (pathname.startsWith('/api/') || pathname.startsWith('/media/')) {
    return proxyToBackend(req, res);
  }
  return serveAdmin(req, res);
});

server.listen(PORT, HOST, () => {
  console.info(`[techstore-admin] listening on http://${HOST}:${PORT} → backend ${BACKEND_HOST}:${BACKEND_PORT}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
