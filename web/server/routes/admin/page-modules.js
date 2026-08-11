// Rutas admin para page_modules (Web Builder).
//
// Endpoints:
//   GET    /api/admin/page-modules            → lista (todos)
//   POST   /api/admin/page-modules            → crear
//                                              body: { type, position?, settings?, active? }
//   PATCH  /api/admin/page-modules/:id        → editar (cualquier subset)
//   PATCH  /api/admin/page-modules/reorder    → reordenar masivamente
//                                              body: { ids: [id1, id2, ...] }
//                                              asigna position = i+1
//                                              en el orden del array
//   DELETE /api/admin/page-modules/:id        → borrar
//
// Validación:
//   - type: string no vacío (miramos MODULE_TYPES abajo)
//   - position: integer >= 0
//   - settings: objeto (cualquier shape; el front lo valida al renderizar)
//   - active: boolean

import { query, tx } from '../../lib/db.js';
import { log } from '../../lib/logger.js';
import { json } from '../../lib/json.js';
import { protect, recordAudit, validators, validate, notFound } from './_helpers.js';

// Tipos permitidos. El front tiene un registry de renderers por cada uno.
// Si agregás un type nuevo, agregalo acá Y en web-store/src/modules/registry.js.
const MODULE_TYPES = new Set([
  'hero',
  'banner',
  'categories',
  'categories_grid',
  'carousel',
  'collections',
  'text',
  'contact',
  'featured_products',
  'recent_products',
  'footer',
]);

export async function listModules(req, res) {
  const { rows } = await query(
    `SELECT id, type, position, settings, active, created_at, updated_at
       FROM page_modules
      ORDER BY position, id`,
  );
  return json(res, 200, { ok: true, modules: rows });
}

export async function createModule(req, res) {
  const p = req.body || {};
  if (!validate(res, p, [
    validators.requiredString(p.type, 'type'),
    p.type && !MODULE_TYPES.has(p.type) ? `type no soportado: ${p.type}` : null,
    p.position !== undefined && validators.int(p.position, 'position', { min: 0 }),
    p.settings !== undefined && (typeof p.settings !== 'object' || Array.isArray(p.settings) || p.settings === null)
      ? 'settings debe ser un objeto' : null,
    p.active !== undefined && validators.bool(p.active, 'active'),
  ])) return;

  // Si no pasan position, le asignamos el siguiente.
  let position = p.position;
  if (position === undefined) {
    const { rows } = await query(`SELECT COALESCE(MAX(position), 0) + 1 AS next FROM page_modules`);
    position = rows[0].next;
  }

  const settings = p.settings || {};

  const { rows } = await query(
    `INSERT INTO page_modules (type, position, settings, active)
     VALUES ($1, $2, $3::jsonb, COALESCE($4, TRUE))
     RETURNING id, type, position, settings, active, created_at, updated_at`,
    [p.type, position, JSON.stringify(settings), p.active],
  );
  await recordAudit(req.user?.id, 'page_module.create', req.ip, { id: rows[0].id, type: p.type });
  log.info('page_module created', { id: rows[0].id, type: p.type, by: req.user?.email });
  return json(res, 201, { ok: true, module: rows[0] });
}

export async function updateModule(req, res, id) {
  const { rows: existing } = await query(`SELECT id FROM page_modules WHERE id = $1`, [id]);
  if (existing.length === 0) return notFound(res);

  const p = req.body || {};
  if (!validate(res, p, [
    p.type !== undefined && validators.requiredString(p.type, 'type'),
    p.type !== undefined && !MODULE_TYPES.has(p.type) ? `type no soportado: ${p.type}` : null,
    p.position !== undefined && validators.int(p.position, 'position', { min: 0 }),
    p.settings !== undefined && (typeof p.settings !== 'object' || Array.isArray(p.settings) || p.settings === null)
      ? 'settings debe ser un objeto' : null,
    p.active !== undefined && validators.bool(p.active, 'active'),
  ])) return;

  const fields = [];
  const values = [];
  let i = 1;
  if (p.type !== undefined)     { fields.push(`type = $${i++}`);     values.push(p.type); }
  if (p.position !== undefined) { fields.push(`position = $${i++}`); values.push(p.position); }
  if (p.settings !== undefined) { fields.push(`settings = $${i++}::jsonb`); values.push(JSON.stringify(p.settings)); }
  if (p.active !== undefined)   { fields.push(`active = $${i++}`);   values.push(p.active); }
  if (fields.length === 0) return json(res, 400, { ok: false, error: 'nothing_to_update' });
  values.push(id);

  const { rows } = await query(
    `UPDATE page_modules SET ${fields.join(', ')} WHERE id = $${i}
      RETURNING id, type, position, settings, active, created_at, updated_at`,
    values,
  );
  await recordAudit(req.user?.id, 'page_module.update', req.ip, { id, fields: Object.keys(p) });
  return json(res, 200, { ok: true, module: rows[0] });
}

export async function reorderModules(req, res) {
  const p = req.body || {};
  if (!validate(res, p, [
    Array.isArray(p.ids) ? null : 'ids debe ser un array de enteros',
    p.ids && !p.ids.every((x) => Number.isInteger(Number(x))) ? 'todos los ids deben ser enteros' : null,
  ])) return;

  await tx(async (client) => {
    for (let i = 0; i < p.ids.length; i++) {
      await client.query(
        `UPDATE page_modules SET position = $1 WHERE id = $2`,
        [i + 1, Number(p.ids[i])],
      );
    }
  });
  await recordAudit(req.user?.id, 'page_module.reorder', req.ip, { ids: p.ids });
  log.info('page_modules reordered', { count: p.ids.length, by: req.user?.email });
  return json(res, 200, { ok: true });
}

export async function deleteModule(req, res, id) {
  const { rows: existing } = await query(`SELECT id, type FROM page_modules WHERE id = $1`, [id]);
  if (existing.length === 0) return notFound(res);
  await query(`DELETE FROM page_modules WHERE id = $1`, [id]);
  await recordAudit(req.user?.id, 'page_module.delete', req.ip, { id, type: existing[0].type });
  log.info('page_module deleted', { id, type: existing[0].type, by: req.user?.email });
  return json(res, 200, { ok: true });
}

// --- Router ---------------------------------------------------------------

const routes = [
  { method: 'GET',    pattern: /^\/api\/admin\/page-modules\/?$/,            handler: listModules,    section: 'site_config' },
  { method: 'POST',   pattern: /^\/api\/admin\/page-modules\/?$/,            handler: createModule,   section: 'site_config' },
  { method: 'PATCH',  pattern: /^\/api\/admin\/page-modules\/reorder\/?$/,  handler: reorderModules, section: 'site_config' },
  { method: 'PATCH',  pattern: /^\/api\/admin\/page-modules\/(\d+)\/?$/,    handler: updateModule,   section: 'site_config' },
  { method: 'DELETE', pattern: /^\/api\/admin\/page-modules\/(\d+)\/?$/,    handler: deleteModule,   section: 'site_config' },
];

export async function tryHandlePageModules(req, res) {
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
