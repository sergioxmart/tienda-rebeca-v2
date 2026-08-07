// Rutas admin para attribute_values (valores posibles de un atributo).
//
// Un attribute_value pertenece a un attribute. Ej: el attribute 'color'
// tiene los values 'Rojo', 'Azul', 'Negro'. El admin los crea y edita
// desde acá. El catálogo los usa como filtros.
//
// Endpoints:
//   GET  /api/admin/attributes/:attributeId/values       → lista values del attribute
//   POST /api/admin/attributes/:attributeId/values       → crea uno nuevo
//   PATCH /api/admin/attribute-values/:id                → edita (value, hex, active)
//   DELETE /api/admin/attribute-values/:id               → borra
//
// Validación:
//   - value: 1-100 chars.
//   - display_order: entero, default 0.
//   - active: bool.
//
// Nota: borrar un value que ya está siendo usado por una variante falla
// con 23503 (FK RESTRICT). La app debe avisar al admin antes.

import { query } from '../../lib/db.js';
import { log } from '../../lib/logger.js';
import { json } from '../../lib/json.js';
import { protect, recordAudit, validators, validate, notFound, conflict } from './_helpers.js';

// --- Handlers -------------------------------------------------------------

async function listValues(req, res, attributeId) {
  // Confirmar que el attribute existe (404 explícito, no lista vacía)
  const { rows: attr } = await query('SELECT id FROM attributes WHERE id = $1', [attributeId]);
  if (attr.length === 0) return notFound(res);

  const { rows } = await query(
    `SELECT id, attribute_id, value, hex, display_order, active,
            created_at, updated_at
       FROM attribute_values
       WHERE attribute_id = $1
       ORDER BY display_order, value`,
    [attributeId],
  );
  return json(res, 200, { ok: true, values: rows });
}

async function createValue(req, res, attributeId) {
  const { rows: attr } = await query('SELECT id FROM attributes WHERE id = $1', [attributeId]);
  if (attr.length === 0) return notFound(res);

  const p = req.body || {};
  if (!validate(res, p, [
    validators.requiredString(p.value, 'value', { max: 100 }),
    p.hex !== undefined && p.hex !== null && (!/^#[0-9A-Fa-f]{6}$/.test(p.hex) ? 'hex inválido (usa #RRGGBB)' : null),
  ])) return;
  if (p.display_order !== undefined
      && !validate(res, p, [validators.int(p.display_order, 'display_order')])) {
    return;
  }

  try {
    const { rows } = await query(
      `INSERT INTO attribute_values (attribute_id, value, hex, display_order, active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, attribute_id, value, hex, display_order, active, created_at, updated_at`,
      [attributeId, p.value.trim(), p.hex || null, p.display_order ?? 0, p.active ?? true],
    );
    await recordAudit(req.user.id, 'attribute_value.create', req.ip, { id: rows[0].id, attributeId });
    log.info('attribute_value created', { id: rows[0].id, attributeId, by: req.user.email });
    return json(res, 201, { ok: true, value: rows[0] });
  } catch (err) {
    if (err.code === '23505') return conflict(res, 'value_already_exists', { value: p.value });
    throw err;
  }
}

async function updateValue(req, res, id) {
  const { rows: existing } = await query('SELECT id FROM attribute_values WHERE id = $1', [id]);
  if (existing.length === 0) return notFound(res);

  const p = req.body || {};
  if (!validate(res, p, [
    validators.optionalString(p.value, 'value', { max: 100 }),
    p.hex !== undefined && p.hex !== null && (!/^#[0-9A-Fa-f]{6}$/.test(p.hex) ? 'hex inválido (usa #RRGGBB)' : null),
    p.display_order !== undefined && validators.int(p.display_order, 'display_order'),
    p.active !== undefined && validators.bool(p.active, 'active'),
  ])) return;

  const fields = [];
  const values = [];
  let i = 1;
  if (p.value !== undefined)         { fields.push(`value = $${i++}`);          values.push(p.value.trim()); }
  if (p.hex !== undefined)           { fields.push(`hex = $${i++}`);            values.push(p.hex || null); }
  if (p.display_order !== undefined) { fields.push(`display_order = $${i++}`);  values.push(p.display_order); }
  if (p.active !== undefined)        { fields.push(`active = $${i++}`);         values.push(p.active); }
  if (fields.length === 0) {
    return json(res, 400, { ok: false, error: 'nothing_to_update' });
  }
  values.push(id);

  try {
    const { rows } = await query(
      `UPDATE attribute_values SET ${fields.join(', ')}
        WHERE id = $${i}
        RETURNING id, attribute_id, value, hex, display_order, active, created_at, updated_at`,
      values,
    );
    await recordAudit(req.user.id, 'attribute_value.update', req.ip, { id, fields: Object.keys(p) });
    return json(res, 200, { ok: true, value: rows[0] });
  } catch (err) {
    if (err.code === '23505') return conflict(res, 'value_already_exists');
    throw err;
  }
}

async function deleteValue(req, res, id) {
  const { rows: existing } = await query('SELECT id FROM attribute_values WHERE id = $1', [id]);
  if (existing.length === 0) return notFound(res);

  try {
    await query('DELETE FROM attribute_values WHERE id = $1', [id]);
    await recordAudit(req.user.id, 'attribute_value.delete', req.ip, { id });
    log.info('attribute_value deleted', { id, by: req.user.email });
    return json(res, 200, { ok: true });
  } catch (err) {
    if (err.code === '23503') {
      return conflict(res, 'value_in_use', {
        message: 'hay variantes usando este valor. Quitá las referencias primero.',
      });
    }
    throw err;
  }
}

// --- Router ---------------------------------------------------------------

const routes = [
  { method: 'GET',    pattern: /^\/api\/admin\/attributes\/(\d+)\/values\/?$/,  handler: listValues,    section: 'attribute_values' },
  { method: 'POST',   pattern: /^\/api\/admin\/attributes\/(\d+)\/values\/?$/,  handler: createValue,   section: 'attribute_values' },
  { method: 'PATCH',  pattern: /^\/api\/admin\/attribute-values\/(\d+)\/?$/,     handler: updateValue,   section: 'attribute_values' },
  { method: 'DELETE', pattern: /^\/api\/admin\/attribute-values\/(\d+)\/?$/,     handler: deleteValue,   section: 'attribute_values' },
];

export async function tryHandleAttributeValues(req, res) {
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
