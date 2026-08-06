// Rutas admin para attributes (atributos configurables de variantes).
//
// Atributos son globales: color, modelo-telefono, tipo-conexion, etc.
// El admin define el atributo y después crea los valores (attribute_values)
// desde la ruta /api/admin/attributes/:id/values (ver attribute-values.js).
//
// Validación:
//   - slug: a-z, 0-9, -. Estable (NO renombrar después: se referencia).
//   - name: 1-100 chars.
//   - type: 'text' | 'color' | 'number'.
//   - display_order: entero, default 0.

import { query } from '../../lib/db.js';
import { log } from '../../lib/logger.js';
import { json } from '../../lib/json.js';
import { protect, recordAudit, slugify, validators, validate, notFound, conflict } from './_helpers.js';

// --- Handlers -------------------------------------------------------------
// Exportados con `export` además del array `routes` para que los tests
// unitarios puedan llamarlos sin pasar por `protect` (que requiere auth).

export async function listAttributes(req, res) {
  const { rows } = await query(
    `SELECT id, slug, name, type, display_order, active,
            created_at, updated_at
       FROM attributes
       ORDER BY display_order, name`,
  );
  return json(res, 200, { ok: true, attributes: rows });
}

export async function getAttribute(req, res, id) {
  const { rows } = await query(
    `SELECT id, slug, name, type, display_order, active,
            created_at, updated_at
       FROM attributes WHERE id = $1`,
    [id],
  );
  if (rows.length === 0) return notFound(res);
  return json(res, 200, { ok: true, attribute: rows[0] });
}

export async function createAttribute(req, res) {
  const p = req.body || {};
  if (!validate(res, p, [
    validators.requiredString(p.name, 'name', { max: 100 }),
    validators.oneOf(p.type ?? 'text', 'type', ['text', 'color', 'number']),
  ])) return;

  // slug: si no viene, lo generamos del name. Si viene, validamos formato.
  const slug = (p.slug ?? slugify(p.name)).trim();
  if (!validate(res, { slug }, [
    validators.slug(slug, 'slug'),
  ])) return;

  if (p.display_order !== undefined
      && !validate(res, p, [validators.int(p.display_order, 'display_order')])) {
    return;
  }

  try {
    const { rows } = await query(
      `INSERT INTO attributes (slug, name, type, display_order, active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, slug, name, type, display_order, active, created_at, updated_at`,
      [slug, p.name.trim(), p.type ?? 'text', p.display_order ?? 0, p.active ?? true],
    );
    await recordAudit(req.user.id, 'attribute.create', req.ip, { id: rows[0].id, slug });
    log.info('attribute created', { id: rows[0].id, slug, by: req.user.email });
    return json(res, 201, { ok: true, attribute: rows[0] });
  } catch (err) {
    if (err.code === '23505') return conflict(res, 'slug_already_exists', { slug });
    throw err;
  }
}

export async function updateAttribute(req, res, id) {
  // Confirmar que existe
  const { rows: existing } = await query('SELECT id FROM attributes WHERE id = $1', [id]);
  if (existing.length === 0) return notFound(res);

  const p = req.body || {};
  if (!validate(res, p, [
    validators.optionalString(p.name, 'name', { max: 100 }),
    validators.optionalString(p.slug, 'slug', { max: 60 }),
    p.type !== undefined && validators.oneOf(p.type, 'type', ['text', 'color', 'number']),
    p.display_order !== undefined && validators.int(p.display_order, 'display_order'),
    p.active !== undefined && validators.bool(p.active, 'active'),
  ])) return;

  // Construir UPDATE dinámico solo con los campos presentes
  const fields = [];
  const values = [];
  let i = 1;
  if (p.name !== undefined)         { fields.push(`name = $${i++}`);          values.push(p.name.trim()); }
  if (p.slug !== undefined)         { fields.push(`slug = $${i++}`);          values.push(p.slug); }
  if (p.type !== undefined)         { fields.push(`type = $${i++}`);          values.push(p.type); }
  if (p.display_order !== undefined){ fields.push(`display_order = $${i++}`); values.push(p.display_order); }
  if (p.active !== undefined)       { fields.push(`active = $${i++}`);        values.push(p.active); }
  if (fields.length === 0) {
    return json(res, 400, { ok: false, error: 'nothing_to_update' });
  }
  values.push(id);

  try {
    const { rows } = await query(
      `UPDATE attributes SET ${fields.join(', ')}
        WHERE id = $${i}
        RETURNING id, slug, name, type, display_order, active, created_at, updated_at`,
      values,
    );
    await recordAudit(req.user.id, 'attribute.update', req.ip, { id, fields: Object.keys(p) });
    return json(res, 200, { ok: true, attribute: rows[0] });
  } catch (err) {
    if (err.code === '23505') return conflict(res, 'slug_already_exists');
    throw err;
  }
}

export async function deleteAttribute(req, res, id) {
  // ON DELETE CASCADE borra los values, pero antes chequeamos que no haya
  // product_attributes referenciando (la FK attribute_id es ON DELETE RESTRICT,
  // así que el DB rechaza si hay productos usándolo).
  const { rows: existing } = await query('SELECT id FROM attributes WHERE id = $1', [id]);
  if (existing.length === 0) return notFound(res);

  try {
    await query('DELETE FROM attributes WHERE id = $1', [id]);
    await recordAudit(req.user.id, 'attribute.delete', req.ip, { id });
    log.info('attribute deleted', { id, by: req.user.email });
    return json(res, 200, { ok: true });
  } catch (err) {
    if (err.code === '23503') {
      return conflict(res, 'attribute_in_use', {
        message: 'hay productos usando este atributo. Quitá las referencias primero.',
      });
    }
    throw err;
  }
}

// --- Router ---------------------------------------------------------------

const routes = [
  { method: 'GET',    pattern: /^\/api\/admin\/attributes\/?$/,           handler: listAttributes,     section: 'attributes' },
  { method: 'GET',    pattern: /^\/api\/admin\/attributes\/(\d+)\/?$/,    handler: getAttribute,       section: 'attributes' },
  { method: 'POST',   pattern: /^\/api\/admin\/attributes\/?$/,           handler: createAttribute,    section: 'attributes' },
  { method: 'PATCH',  pattern: /^\/api\/admin\/attributes\/(\d+)\/?$/,    handler: updateAttribute,    section: 'attributes' },
  { method: 'DELETE', pattern: /^\/api\/admin\/attributes\/(\d+)\/?$/,    handler: deleteAttribute,    section: 'attributes' },
];

export async function tryHandleAttributes(req, res) {
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
