// Carga el .env desde web/.env al inicio del proceso, antes de cualquier
// otro import del server. Lo hacemos asi para que el `env` de lib/env.js
// (que es importado por el server) encuentre las variables ya seteadas.
//
// ESM ejecuta los imports en topological order: si este modulo es el
// PRIMER import del archivo, se ejecuta antes que `lib/env.js` y `lib/db.js`,
// y `process.env.PGHOST`, `JWT_SECRET`, etc. quedan disponibles a tiempo.
//
// Por que no usamos --env-file de Node: el ecosistema de PM2 no setea
// el flag, y arrancar con paths absolutas era fragil. Cargar aca es
// consistente con `webhook/server.mjs` que tiene su propio loadEnv().

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Quita las comillas envolventes SOLO si abren y cierran. La version anterior
// usaba .replace(/^["']|["']$/g, ''), que trata cada extremo por separado: con
// CSP_FRAME_ANCESTORS='self' http://localhost:5173 comia la comilla inicial y
// dejaba `self' http://...`, una CSP malformada que rompe el preview del
// Builder. Mismo criterio que server/scripts/setup-db.js.
function unquote(v) {
  const quoted = v.length >= 2
    && (v[0] === '"' || v[0] === "'")
    && v[v.length - 1] === v[0];
  return quoted ? v.slice(1, -1) : v;
}
// server.js esta en web/server/, asi que .env vive en web/.env
const envPath = join(__dirname, '..', '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    if (!(k in process.env)) process.env[k] = unquote(t.slice(eq + 1).trim());
  }
}
