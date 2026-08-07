// Rutas públicas para site_config.
//
// Devuelve los globals del sitio que el cliente puede leer (nombre del
// sitio, contacto, moneda, branding). Lo que el admin NO edita en la UI
// no se expone (si más adelante hay keys sensibles, se filtran acá).
//
//   GET /api/public/site-config

import { query } from '../../lib/db.js';
import { json } from '../../lib/json.js';

// Keys que NO se exponen al público (sensibles o internas).
const PRIVATE_KEYS = new Set([
  // 'payment_providers',  // cuando se agregue, NO exponer al público
  // 'admin_internal_*',
]);

function normalizeMediaUrl(value) {
  return typeof value === 'string' && value.startsWith('/site/')
    ? `/media/site/${value.slice('/site/'.length)}`
    : value;
}

export async function getSiteConfig(req, res) {
  const { rows } = await query(
    `SELECT key, value, updated_at FROM site_config ORDER BY key`,
  );
  const out = {};
  for (const r of rows) {
    if (PRIVATE_KEYS.has(r.key)) continue;
    out[r.key] = ['logo_url', 'admin_login_bg_image_url'].includes(r.key)
      ? normalizeMediaUrl(r.value)
      : r.value;
  }
  res.setHeader('Cache-Control', 'public, max-age=60');  // 1 min, más conservador
  return json(res, 200, { ok: true, config: out });
}
