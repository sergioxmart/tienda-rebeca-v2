// Carga y valida variables de entorno. Falla rápido si falta algo crítico.
// Lee solo de process.env (el archivo .env se carga con --env-file al ejecutar).

import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Este archivo vive en <repo>/core/lib/env.js, así que dos niveles arriba es
// la raíz del repo.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function req(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Falta variable de entorno obligatoria: ${name}`);
  }
  return v;
}

function opt(name, def) {
  return process.env[name] ?? def;
}

export const env = {
  NODE_ENV:   opt('NODE_ENV', 'development'),
  HOST:       opt('HOST', '0.0.0.0'),
  PORT:       Number(opt('PORT', '3000')),

  // Postgres
  PGHOST:     opt('PGHOST', 'localhost'),
  PGPORT:     Number(opt('PGPORT', '5432')),
  PGUSER:     req('PGUSER'),
  PGPASSWORD: req('PGPASSWORD'),
  PGDATABASE: req('PGDATABASE'),

  // Auth
  JWT_SECRET:        req('JWT_SECRET'),
  REFRESH_SECRET:    req('REFRESH_SECRET'),
  COOKIE_SECRET:     req('COOKIE_SECRET'),
  ACCESS_TTL_MIN:    Number(opt('ACCESS_TTL_MIN', '15')),
  REFRESH_TTL_DAYS:  Number(opt('REFRESH_TTL_DAYS', '7')),

  // Webhook
  WEBHOOK_PORT:      Number(opt('WEBHOOK_PORT', '9001')),
  WEBHOOK_SECRET:    opt('WEBHOOK_SECRET', ''),

  // Uploads
  MAX_UPLOAD_BYTES:  Number(opt('MAX_UPLOAD_BYTES', String(20 * 1024 * 1024))), // 20 MB

  // Directorio de archivos subidos. Lo comparten quien escribe
  // (core/lib/uploads.js) y quien sirve (web/server/routes/media.js): si cada
  // uno lo resuelve por su cuenta terminan en carpetas distintas y /media/*
  // devuelve 404 con el archivo sano en disco. Que salga de acá lo hace
  // imposible.
  //
  // El resolve() no es cosmético: quien sirve compara este valor contra un path
  // ya normalizado (`fullPath.startsWith(env.UPLOADS_DIR)` en media.js). Sin
  // canonizar, un UPLOADS_DIR con el separador "equivocado" (C:/x en Windows) o
  // relativo no matchea nunca, el guard anti-traversal rechaza todo y cada
  // /media/* da 404 con la foto sana en disco. Las rutas relativas se anclan a
  // la raíz del repo, no al cwd: el server arranca desde web/server.
  UPLOADS_DIR:       resolve(REPO_ROOT, opt('UPLOADS_DIR', 'uploads')),
};
