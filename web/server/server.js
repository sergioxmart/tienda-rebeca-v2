// Entry point del backend TechStore.
// Arranca un HTTP server con `node:http` nativo y enruta por prefijo.

// NOTA: el .env se carga con `--env-file=../.env` (ver ecosystem.config.cjs,
// nodo `node_args`). En ESM no hay forma de cargar .env al principio del
// archivo via `import` porque los imports se ejecutan en topological order,
// no textual, y los otros imports (lib/env.js, lib/db.js) leen process.env
// antes de que se ejecute cualquier codigo top-level de este archivo.
// El webhook usa el mismo truco (node --env-file equivalente via loadEnv
// inline en webhook/server.mjs).

import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { env } from './lib/env.js';
import { log } from './lib/logger.js';
import { pool } from './lib/db.js';
import { runMigrations } from './scripts/migrate.js';
import { createStaticHandler } from './lib/static.js';
import { securityHeaders } from './middleware/security-headers.js';
import { handlePublic } from './routes/public/index.js';
import { handleAdmin } from './routes/admin/index.js';
import { handleAuth } from './routes/auth.js';
import { handleMedia } from './routes/media.js';
import { handleWebhooks } from './routes/webhooks/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Dists de store/ y admin/ viven en web/server/public/ (los copia deploy.sh).
// Antes el server los buscaba en core/../public (que no existía) — bug latente
// que rompía los estáticos en producción.
const serveStatic = createStaticHandler({ publicDir: join(__dirname, 'public') });

async function main() {
  // 1. Migraciones (idempotente, se puede llamar en cada boot)
  log.info('running migrations…');
  await runMigrations();
  log.info('migrations done');

  // 2. Smoke test DB
  try {
    const r = await pool.query('SELECT NOW() AS now');
    log.info('db ok', { now: r.rows[0].now });
  } catch (err) {
    log.error('db connection failed', err.message);
    process.exit(1);
  }

  log.info('uploads dir', { dir: env.UPLOADS_DIR });

  // 3. HTTP server
  const server = createServer(async (req, res) => {
    // Security headers (aplican incluso a 500)
    securityHeaders(req, res, () => {});

    try {
      const url = req.url || '/';

      if (url.startsWith('/api/public/')) return handlePublic(req, res);
      if (url.startsWith('/api/webhooks/')) return handleWebhooks(req, res);
      if (url.startsWith('/api/admin/'))  return handleAdmin(req, res);
      if (url.startsWith('/api/auth/'))   return handleAuth(req, res);
      if (url.startsWith('/media/'))      return handleMedia(req, res);
      if (url === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, service: 'techstore-web' }));
      }
      return serveStatic(req, res);
    } catch (err) {
      log.error('unhandled', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
      }
      res.end(JSON.stringify({ ok: false, error: 'internal_error' }));
    }
  });

  server.listen(env.PORT, env.HOST, () => {
    log.info(`listening on http://${env.HOST}:${env.PORT}`);
  });

  // Graceful shutdown
  const shutdown = async (sig) => {
    log.info(`received ${sig}, shutting down…`);
    server.close();
    await pool.end().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  log.error('fatal', err);
  process.exit(1);
});
