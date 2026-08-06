// Receptor genérico de webhooks de GitHub. Multi-boutique.
//
// Crea un HTTP server con dos endpoints:
//   POST /<path>     → dispara el callback `onPush(payload, log)` si la firma
//                      y el branch matchean. Fire-and-forget (responde 202 ya).
//   GET  /healthz    → smoke check
//
// El cableado (puerto, secret, branch, path) y la reacción al push son
// responsabilidad del llamador (típicamente `web/webhook/server.mjs`).
//
// Uso:
//   import { createWebhookServer } from 'techstore-core/webhook/server.js';
//   const server = createWebhookServer({
//     path: '/deploy-techstore',
//     secret: process.env.WEBHOOK_SECRET,
//     onPush: async ({ ref, headSha, rawBody, log }) => {
//       log.info('deploying', { ref, headSha });
//       await runDeployScript(headSha);
//     },
//     log: createLogger({ tag: 'techstore-webhook' }),
//   });
//   server.listen(9001, '0.0.0.0');

import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifySignature(body, signature, secret) {
  if (!signature) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export function createWebhookServer({ path, secret, onPush, log, healthzPath = '/healthz' } = {}) {
  if (!path)    throw new Error('createWebhookServer: path es obligatorio');
  if (!secret)  throw new Error('createWebhookServer: secret es obligatorio');
  if (typeof onPush !== 'function') throw new Error('createWebhookServer: onPush debe ser función');
  if (!log)     throw new Error('createWebhookServer: log es obligatorio');

  function json(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  }

  return createHttpServer(async (req, res) => {
    // Health
    if (req.method === 'GET' && req.url === healthzPath) {
      return json(res, 200, { ok: true, service: 'webhook' });
    }

    // Push
    if (req.method === 'POST' && req.url === path) {
      const body = await readBody(req);
      const sig  = req.headers['x-hub-signature-256'];
      if (!verifySignature(body, sig, secret)) {
        log.warn('rejected: bad signature');
        return json(res, 401, { ok: false, error: 'bad_signature' });
      }

      // Parse y validación de ref
      let payload = {};
      try { payload = JSON.parse(body.toString('utf8')); } catch { /* ignore */ }
      if (payload.ref && payload.ref !== 'refs/heads/main') {
        log.info('skipped: not main', { ref: payload.ref });
        return json(res, 200, { ok: true, skipped: true, ref: payload.ref });
      }

      // Fire and forget
      json(res, 202, { ok: true, status: 'deploying' });
      const headSha = payload.head_commit?.id || 'manual';
      Promise.resolve()
        .then(() => onPush({ ref: payload.ref, headSha, rawBody: body, payload, log }))
        .catch((err) => log.error('onPush error', err.message));
      return;
    }

    return json(res, 404, { ok: false, error: 'not_found' });
  });
}
