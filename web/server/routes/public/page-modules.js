// Ruta pública: lista los page_modules activos en orden.
//
// Solo lectura. Sin auth. Cache-Control permisivo (60s) para que la home
// del store cargue rápido sin pegarle al server a cada visita.
//
//   GET /api/public/page-modules

import { query } from '../../lib/db.js';
import { json } from '../../lib/json.js';

export async function listPublicModules(req, res) {
  const { rows } = await query(
    `SELECT id, type, position, settings
       FROM page_modules
      WHERE active = TRUE
      ORDER BY position, id`,
  );
  res.setHeader('Cache-Control', 'public, max-age=60');
  return json(res, 200, { ok: true, modules: rows });
}

const routes = [
  { method: 'GET', pattern: /^\/api\/public\/page-modules\/?$/, handler: listPublicModules },
];

export async function tryHandlePageModules(req, res) {
  const method = req.method || 'GET';
  const pathname = (req.url || '/').split('?')[0];
  for (const route of routes) {
    if (route.method !== method) continue;
    const m = route.pattern.exec(pathname);
    if (!m) continue;
    return route.handler(req, res, m[1]) || true;
  }
  return false;
}
