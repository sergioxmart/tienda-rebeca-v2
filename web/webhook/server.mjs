// Webhook de deploy específico de TechStore. Cablea el receptor genérico de
// core/webhook/server.js con el deploy script de TechStore (webhook/deploy.sh).
//
// El server vive en core/ porque la verificación de firma, el matching de
// branch y el fire-and-forget son 100% genéricos. Lo único cliente de acá es:
//   - El subdominio dedicado (deploy.<cliente> → este server)
//   - El branch (`main`)
//   - La reacción al push (correr `deploy.sh` en background)
//
// Endpoints:
//   POST /        → dispara deploy (cualquier path que llegue desde cloudflared
//                   al subdominio deploy.<cliente>)
//   GET  /healthz → smoke check
//
// Puerto: 9001 (configurable via WEBHOOK_PORT).

import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { createWebhookServer } from '../../core/webhook/server.js';
import { createLogger } from '../../core/lib/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Quita las comillas envolventes SOLO si abren y cierran. Ver el comentario
// largo en server/env-loader.js: tratando cada extremo por separado, un valor
// como 'self' http://localhost:5173 perdia la comilla inicial y quedaba roto.
function unquote(v) {
  const quoted = v.length >= 2
    && (v[0] === '"' || v[0] === "'")
    && v[v.length - 1] === v[0];
  return quoted ? v.slice(1, -1) : v;
}

// Carga .env desde la raíz del repo (mismo que el server)
function loadEnv() {
  const envPath = join(__dirname, '..', '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    if (!(k in process.env)) process.env[k] = unquote(t.slice(eq + 1).trim());
  }
}
loadEnv();

const PORT         = Number(process.env.WEBHOOK_PORT || 9001);
// El default de desarrollo vivía en el script `dev:webhook` con sintaxis bash
// (`WEBHOOK_SECRET=${WEBHOOK_SECRET:-test_secret} node ...`), que revienta en
// cmd/PowerShell. Acá es portable y el comportamiento no cambia: en producción
// sigue siendo obligatorio definirlo explícitamente.
const SECRET       = process.env.WEBHOOK_SECRET
  || (process.env.NODE_ENV === 'production' ? '' : 'test_secret');
const REPO_DIR     = process.env.REPO_DIR || join(__dirname, '..');
const DEPLOY_SCRIPT = join(__dirname, 'deploy.sh');
const LOG_DIR      = process.env.LOG_DIR || '/var/log/pm2-techstore';

if (!SECRET) {
  console.error('[techstore-webhook] FATAL: WEBHOOK_SECRET no está configurado');
  process.exit(1);
}

if (!existsSync(LOG_DIR)) {
  try { mkdirSync(LOG_DIR, { recursive: true }); } catch { /* best effort */ }
}

const DEPLOY_LOG = join(LOG_DIR, 'deploy.log');
const log = createLogger({ tag: 'techstore-webhook' });
const logFile = (...args) => {
  try { appendFileSync(DEPLOY_LOG, [new Date().toISOString(), '[techstore-webhook]', ...args].join(' ') + '\n'); } catch { /* best effort */ }
};

function runDeploy(reason) {
  return new Promise((resolve) => {
    const child = spawn('bash', [DEPLOY_SCRIPT], {
      cwd: REPO_DIR,
      env: { ...process.env, DEPLOY_REASON: reason || 'webhook' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    log.info('deploy started', { pid: child.pid, reason });
    logFile('deploy started', JSON.stringify({ pid: child.pid, reason }));

    const rl = createInterface({ input: child.stdout });
    rl.on('line', (l) => { log.info(l); logFile('deploy> ' + l); });
    const rlErr = createInterface({ input: child.stderr });
    rlErr.on('line', (l) => { log.warn(l); logFile('deploy! ' + l); });

    child.on('close', (code) => {
      log.info('deploy finished', { code });
      logFile('deploy finished', JSON.stringify({ code }));
      resolve(code);
    });
  });
}

const server = createWebhookServer({
  path: '/',
  secret: SECRET,
  log,
  onPush: async ({ headSha, log }) => {
    await runDeploy(headSha);
  },
});

server.listen(PORT, '0.0.0.0', () => {
  log.info(`listening on http://0.0.0.0:${PORT}`);
});

process.on('SIGINT',  () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
