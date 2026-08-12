// Rutas admin para categories.
//
// Categories son la taxonomía del catálogo. v1 arranca con 1 fila seed
// ('accesorios-telefono'); el admin puede sumar más desde acá (sin
// migration). El modelo es extensible.
//
// Validación:
//   - slug: a-z, 0-9, -. Estable (NO renombrar: se referencia en
//     products.category_id y en /api/public/categories/:slug).
//   - name: 1-100 chars.
//   - description, hero_image: opcionales.

import { query } from '../../lib/db.js';
import { log } from '../../lib/logger.js';
import { json } from '../../lib/json.js';
import { protect, recordAudit, slugify, validators, validate, notFound, conflict } from './_helpers.js';

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function optionalHexColor(value, field) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !HEX_COLOR_RE.test(value.trim())) {
    return `${field} debe ser un color HEX válido`;
  }
  return null;
}

function normalizeHexColor(value) {
  if (value === undefined || value === null || value === '') return null;
  return value.trim().toUpperCase();
}

// --- Handlers -------------------------------------------------------------
// Exportados con `export` además del array `routes` para que los tests
// unitarios puedan llamarlos sin pasar por `protect`.

export async function listCategories(req, res) {
  const { rows } = await query(
    `SELECT id, slug, name, description, hero_image, accent_color, background_color, display_order, active,
            created_at, updated_at
       FROM categories
       ORDER BY display_order, name`,
  );
  return json(res, 200, { ok: true, categories: rows });
}

export async function getCategory(req, res, id) {
  const { rows } = await query(
    `SELECT id, slug, name, description, hero_image, accent_color, background_color, display_order, active,
            created_at, updated_at
       FROM categories WHERE id = $1`,
    [id],
  );
  if (rows.length === 0) return notFound(res);
  return json(res, 200, { ok: true, category: rows[0] });
}

export async function createCategory(req, res) {
  const p = req.body || {};
  if (!validate(res, p, [
    validators.requiredString(p.name, 'name', { max: 100 }),
  ])) return;

  const slug = (p.slug ?? slugify(p.name)).trim();
  if (!validate(res, { slug }, [validators.slug(slug, 'slug')])) return;

  if (p.display_order !== undefined
      && !validate(res, p, [validators.int(p.display_order, 'display_order')])) {
    return;
  }
  if (!validate(res, p, [
    optionalHexColor(p.accent_color, 'accent_color'),
    optionalHexColor(p.background_color, 'background_color'),
  ])) return;

  try {
    const { rows } = await query(
      `INSERT INTO categories (slug, name, description, hero_image, accent_color, background_color, display_order, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, slug, name, description, hero_image, accent_color, background_color, display_order, active, created_at, updated_at`,
      [slug, p.name.trim(), p.description ?? '', p.hero_image ?? null,
        normalizeHexColor(p.accent_color), normalizeHexColor(p.background_color),
        p.display_order ?? 0, p.active ?? true],
    );
    await recordAudit(req.user?.id, 'category.create', req.ip, { id: rows[0].id, slug });
    log.info('category created', { id: rows[0].id, slug, by: req.user?.email });
    return json(res, 201, { ok: true, category: rows[0] });
  } catch (err) {
    if (err.code === '23505') return conflict(res, 'slug_already_exists', { slug });
    throw err;
  }
}

export async function updateCategory(req, res, id) {
  const { rows: existing } = await query('SELECT id FROM categories WHERE id = $1', [id]);
  if (existing.length === 0) return notFound(res);

  const p = req.body || {};
  if (!validate(res, p, [
    validators.optionalString(p.name, 'name', { max: 100 }),
    validators.optionalString(p.slug, 'slug', { max: 60 }),
    validators.optionalString(p.description, 'description', { max: 1000 }),
    p.hero_image !== undefined && p.hero_image !== null && validators.optionalString(p.hero_image, 'hero_image', { max: 500 }),
    optionalHexColor(p.accent_color, 'accent_color'),
    optionalHexColor(p.background_color, 'background_color'),
    p.display_order !== undefined && validators.int(p.display_order, 'display_order'),
    p.active !== undefined && validators.bool(p.active, 'active'),
  ])) return;

  const fields = [];
  const values = [];
  let i = 1;
  if (p.name !== undefined)          { fields.push(`name = $${i++}`);          values.push(p.name.trim()); }
  if (p.slug !== undefined)          { fields.push(`slug = $${i++}`);          values.push(p.slug); }
  if (p.description !== undefined)   { fields.push(`description = $${i++}`);   values.push(p.description); }
  if (p.hero_image !== undefined)    { fields.push(`hero_image = $${i++}`);    values.push(p.hero_image); }
  if (p.accent_color !== undefined)  { fields.push(`accent_color = $${i++}`);  values.push(normalizeHexColor(p.accent_color)); }
  if (p.background_color !== undefined) { fields.push(`background_color = $${i++}`); values.push(normalizeHexColor(p.background_color)); }
  if (p.display_order !== undefined) { fields.push(`display_order = $${i++}`); values.push(p.display_order); }
  if (p.active !== undefined)        { fields.push(`active = $${i++}`);        values.push(p.active); }
  if (fields.length === 0) return json(res, 400, { ok: false, error: 'nothing_to_update' });
  values.push(id);

  try {
    const { rows } = await query(
      `UPDATE categories SET ${fields.join(', ')} WHERE id = $${i}
        RETURNING id, slug, name, description, hero_image, accent_color, background_color, display_order, active, created_at, updated_at`,
      values,
    );
    await recordAudit(req.user?.id, 'category.update', req.ip, { id, fields: Object.keys(p) });
    return json(res, 200, { ok: true, category: rows[0] });
  } catch (err) {
    if (err.code === '23505') return conflict(res, 'slug_already_exists');
    throw err;
  }
}

export async function deleteCategory(req, res, id) {
  const { rows: existing } = await query('SELECT id FROM categories WHERE id = $1', [id]);
  if (existing.length === 0) return notFound(res);

  try {
    await query('DELETE FROM categories WHERE id = $1', [id]);
    await recordAudit(req.user?.id, 'category.delete', req.ip, { id });
    log.info('category deleted', { id, by: req.user?.email });
    return json(res, 200, { ok: true });
  } catch (err) {
    if (err.code === '23503') {
      return conflict(res, 'category_in_use', {
        message: 'hay productos usando esta categoría. Quitá las referencias primero.',
      });
    }
    throw err;
  }
}

// --- Router ---------------------------------------------------------------

const routes = [
  { method: 'GET',    pattern: /^\/api\/admin\/categories\/?$/,         handler: listCategories,   section: 'categories' },
  { method: 'GET',    pattern: /^\/api\/admin\/categories\/(\d+)\/?$/,  handler: getCategory,      section: 'categories' },
  { method: 'POST',   pattern: /^\/api\/admin\/categories\/?$/,         handler: createCategory,   section: 'categories' },
  { method: 'PATCH',  pattern: /^\/api\/admin\/categories\/(\d+)\/?$/,  handler: updateCategory,   section: 'categories' },
  { method: 'DELETE', pattern: /^\/api\/admin\/categories\/(\d+)\/?$/,  handler: deleteCategory,   section: 'categories' },
];

export async function tryHandleCategories(req, res) {
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
