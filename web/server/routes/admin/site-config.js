// Rutas admin para site_config.
//
// site_config es key/value JSONB con los globals del sitio (nombre,
// contacto, moneda, branding). El admin edita y el público lee.
//
// API:
//   GET   /api/admin/site-config         → devuelve TODO (objeto)
//   PATCH /api/admin/site-config         → actualiza un subset
//                                          body: { key: value, ... }
//
// El PATCH es por key, no por path. Esto permite mandar varios keys
// en una sola request. Internamente, hace UPSERT por cada key.

import { query, tx } from '../../lib/db.js';
import { log } from '../../lib/logger.js';
import { json } from '../../lib/json.js';
import { protect, recordAudit } from './_helpers.js';

// --- Handlers -------------------------------------------------------------

export async function getSiteConfig(req, res) {
  const { rows } = await query(
    `SELECT key, value, updated_at FROM site_config ORDER BY key`,
  );
  // Devolvemos como objeto { key: value } en vez de array, más cómodo para el cliente.
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return json(res, 200, { ok: true, config: out });
}

export async function updateSiteConfig(req, res) {
  const p = req.body || {};
  const keys = Object.keys(p);
  if (keys.length === 0) {
    return json(res, 400, { ok: false, error: 'empty_payload' });
  }
  // Validación: todas las keys son strings no vacíos.
  for (const k of keys) {
    if (typeof k !== 'string' || !k.trim()) {
      return json(res, 400, { ok: false, error: 'invalid_key', key: k });
    }
  }

  // UPSERT atómico de cada key. ON CONFLICT (key) DO UPDATE.
  await tx(async (client) => {
    for (const key of keys) {
      await client.query(
        `INSERT INTO site_config (key, value, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE
           SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, JSON.stringify(p[key])],
      );
    }
  });
  await recordAudit(req.user?.id, 'site_config.update', req.ip, { keys });
  log.info('site_config updated', { keys, by: req.user?.email });

  // Devolvemos el estado nuevo.
  const { rows } = await query(`SELECT key, value FROM site_config WHERE key = ANY($1)`, [keys]);
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return json(res, 200, { ok: true, config: out });
}

// --- Router ---------------------------------------------------------------

const routes = [
  { method: 'GET',   pattern: /^\/api\/admin\/site-config\/?$/, handler: getSiteConfig,    section: 'site_config' },
  { method: 'PATCH', pattern: /^\/api\/admin\/site-config\/?$/, handler: updateSiteConfig, section: 'site_config' },
];

export async function tryHandleSiteConfig(req, res) {
  const method = req.method || 'GET';
  const pathname = (req.url || '/').split('?')[0];
  for (const route of routes) {
    if (route.method !== method) continue;
    const m = route.pattern.exec(pathname);
    if (!m) continue;
    return protect(route.handler, route.section)(req, res, m[1]) || true;
  }
  return false;
}
