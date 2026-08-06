// Rutas admin para products (template) + product_attributes (M2M).
//
// Products son el TEMPLATE. Las variantes (combinaciones vendibles con
// stock y precio) viven en variants.js. Acá manejamos:
//   - CRUD del template: nombre, descripción, marca, base_price, etc.
//   - Qué atributos aplican al producto (M2M con attributes).
//
// Endpoints:
//   GET    /api/admin/products                          → lista con filtros
//   GET    /api/admin/products/:id                      → detalle + atributos
//   POST   /api/admin/products                          → crea
//   PATCH  /api/admin/products/:id                      → edita
//   DELETE /api/admin/products/:id                      → borra (cascade a variants + media)
//   POST   /api/admin/products/:id/attributes           → vincula attribute
//   DELETE /api/admin/products/:id/attributes/:attrId   → desvincula attribute
//
// Borrar un producto cascadea a variants y product_attributes (FK ON
// DELETE CASCADE). Product_media queda con product_id=NULL (SET NULL) y
// queda como huérfana (limpieza > 30d vía job).

import { query, tx } from '../../lib/db.js';
import { log } from '../../lib/logger.js';
import { json } from '../../lib/json.js';
import { protect, recordAudit, slugify, validators, validate, notFound, conflict } from './_helpers.js';

// --- Handlers (products CRUD) --------------------------------------------

export async function listProducts(req, res) {
  const url = new URL(req.url, 'http://x');
  const categoryId = url.searchParams.get('category_id');
  const active = url.searchParams.get('active');
  const q = url.searchParams.get('q');

  const where = [];
  const params = [];
  if (categoryId) { params.push(Number(categoryId)); where.push(`p.category_id = $${params.length}`); }
  if (active === 'true')  where.push('p.active = TRUE');
  if (active === 'false') where.push('p.active = FALSE');
  if (q) { params.push(`%${q}%`); where.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length})`); }

  const sql = `SELECT p.id, p.category_id, p.sku, p.name, p.slug, p.description,
                       p.brand, p.base_price, p.compare_at, p.active, p.featured,
                       p.display_order, p.created_at, p.updated_at,
                       c.slug AS category_slug, c.name AS category_name
                  FROM products p
                  JOIN categories c ON c.id = p.category_id
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY p.display_order, p.name`;
  const { rows } = await query(sql, params);
  return json(res, 200, { ok: true, products: rows });
}

export async function getProduct(req, res, id) {
  const { rows } = await query(
    `SELECT p.*, c.slug AS category_slug, c.name AS category_name
       FROM products p
       JOIN categories c ON c.id = p.category_id
      WHERE p.id = $1`,
    [id],
  );
  if (rows.length === 0) return notFound(res);
  const product = rows[0];
  // Atributos aplicables
  const attrs = await query(
    `SELECT pa.attribute_id, pa.is_required, pa.display_order,
            a.slug AS attribute_slug, a.name AS attribute_name, a.type AS attribute_type
       FROM product_attributes pa
       JOIN attributes a ON a.id = pa.attribute_id
      WHERE pa.product_id = $1
      ORDER BY pa.display_order, a.name`,
    [id],
  );
  product.attributes = attrs.rows;
  return json(res, 200, { ok: true, product });
}

export async function createProduct(req, res) {
  const p = req.body || {};
  if (!validate(res, p, [
    validators.requiredString(p.name, 'name', { max: 200 }),
    validators.required(p.category_id, 'category_id'),
    validators.required(p.base_price, 'base_price'),
  ])) return;

  const categoryId = Number(p.category_id);
  if (!Number.isInteger(categoryId)) {
    return json(res, 400, { ok: false, error: 'category_id_must_be_integer' });
  }
  const basePrice = Number(p.base_price);
  if (!Number.isFinite(basePrice) || basePrice < 0) {
    return json(res, 400, { ok: false, error: 'base_price_invalid' });
  }
  const compareAt = p.compare_at !== undefined && p.compare_at !== null ? Number(p.compare_at) : null;
  if (compareAt !== null && (!Number.isFinite(compareAt) || compareAt < 0)) {
    return json(res, 400, { ok: false, error: 'compare_at_invalid' });
  }

  const slug = (p.slug ?? slugify(p.name)).trim();
  if (!validate(res, { slug }, [validators.slug(slug, 'slug')])) return;

  // category_id debe existir
  const { rows: cat } = await query('SELECT id FROM categories WHERE id = $1', [categoryId]);
  if (cat.length === 0) return notFound(res);

  try {
    const { rows } = await query(
      `INSERT INTO products (category_id, sku, name, slug, description, brand,
                              base_price, compare_at, active, featured, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [categoryId, p.sku ?? null, p.name.trim(), slug, p.description ?? '', p.brand ?? '',
       basePrice, compareAt, p.active ?? true, p.featured ?? false, p.display_order ?? 0],
    );
    await recordAudit(req.user?.id, 'product.create', req.ip, { id: rows[0].id, name: rows[0].name });
    log.info('product created', { id: rows[0].id, name: rows[0].name, by: req.user?.email });
    return json(res, 201, { ok: true, product: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      // 23505 puede ser slug o sku (ambos son UNIQUE)
      return conflict(res, 'product_already_exists', { detail: err.detail });
    }
    throw err;
  }
}

export async function updateProduct(req, res, id) {
  const { rows: existing } = await query('SELECT id FROM products WHERE id = $1', [id]);
  if (existing.length === 0) return notFound(res);

  const p = req.body || {};
  if (!validate(res, p, [
    validators.optionalString(p.name, 'name', { max: 200 }),
    validators.optionalString(p.slug, 'slug', { max: 80 }),
    validators.optionalString(p.sku, 'sku', { max: 80 }),
    validators.optionalString(p.description, 'description', { max: 5000 }),
    validators.optionalString(p.brand, 'brand', { max: 100 }),
    p.base_price !== undefined && validators.int(Number(p.base_price), 'base_price', { min: 0 }),
    p.compare_at !== undefined && (p.compare_at === null || validators.int(Number(p.compare_at), 'compare_at', { min: 0 })),
    p.category_id !== undefined && validators.int(Number(p.category_id), 'category_id'),
    p.active !== undefined && validators.bool(p.active, 'active'),
    p.featured !== undefined && validators.bool(p.featured, 'featured'),
    p.display_order !== undefined && validators.int(p.display_order, 'display_order'),
  ])) return;

  // Si cambia category_id, verificar que existe
  if (p.category_id !== undefined) {
    const { rows: cat } = await query('SELECT id FROM categories WHERE id = $1', [Number(p.category_id)]);
    if (cat.length === 0) return notFound(res);
  }

  const fields = [];
  const values = [];
  let i = 1;
  if (p.name !== undefined)          { fields.push(`name = $${i++}`);          values.push(p.name.trim()); }
  if (p.slug !== undefined)          { fields.push(`slug = $${i++}`);          values.push(p.slug); }
  if (p.sku !== undefined)           { fields.push(`sku = $${i++}`);           values.push(p.sku); }
  if (p.description !== undefined)   { fields.push(`description = $${i++}`);   values.push(p.description); }
  if (p.brand !== undefined)         { fields.push(`brand = $${i++}`);         values.push(p.brand); }
  if (p.base_price !== undefined)    { fields.push(`base_price = $${i++}`);    values.push(Number(p.base_price)); }
  if (p.compare_at !== undefined)    { fields.push(`compare_at = $${i++}`);    values.push(p.compare_at); }
  if (p.category_id !== undefined)   { fields.push(`category_id = $${i++}`);   values.push(Number(p.category_id)); }
  if (p.active !== undefined)        { fields.push(`active = $${i++}`);        values.push(p.active); }
  if (p.featured !== undefined)      { fields.push(`featured = $${i++}`);      values.push(p.featured); }
  if (p.display_order !== undefined) { fields.push(`display_order = $${i++}`); values.push(p.display_order); }
  if (fields.length === 0) return json(res, 400, { ok: false, error: 'nothing_to_update' });
  values.push(id);

  try {
    const { rows } = await query(
      `UPDATE products SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values,
    );
    await recordAudit(req.user?.id, 'product.update', req.ip, { id, fields: Object.keys(p) });
    return json(res, 200, { ok: true, product: rows[0] });
  } catch (err) {
    if (err.code === '23505') return conflict(res, 'product_already_exists', { detail: err.detail });
    throw err;
  }
}

export async function deleteProduct(req, res, id) {
  const { rows: existing } = await query('SELECT id FROM products WHERE id = $1', [id]);
  if (existing.length === 0) return notFound(res);

  // CASCADE borra variants y product_attributes. product_media queda
  // huérfana (product_id=NULL, deleted_at=NULL) y se limpia en el job.
  await query('DELETE FROM products WHERE id = $1', [id]);
  await recordAudit(req.user?.id, 'product.delete', req.ip, { id });
  log.info('product deleted', { id, by: req.user?.email });
  return json(res, 200, { ok: true });
}

// --- Handlers (product_attributes M2M) ----------------------------------

export async function addProductAttribute(req, res, productId) {
  const { rows: p } = await query('SELECT id FROM products WHERE id = $1', [productId]);
  if (p.length === 0) return notFound(res);

  const body = req.body || {};
  if (!validate(res, body, [
    validators.required(body.attribute_id, 'attribute_id'),
  ])) return;
  const attributeId = Number(body.attribute_id);
  if (!Number.isInteger(attributeId)) {
    return json(res, 400, { ok: false, error: 'attribute_id_must_be_integer' });
  }
  const { rows: a } = await query('SELECT id FROM attributes WHERE id = $1', [attributeId]);
  if (a.length === 0) return notFound(res);

  try {
    const { rows } = await query(
      `INSERT INTO product_attributes (product_id, attribute_id, is_required, display_order)
       VALUES ($1, $2, $3, $4)
       RETURNING product_id, attribute_id, is_required, display_order, created_at`,
      [productId, attributeId, body.is_required ?? true, body.display_order ?? 0],
    );
    await recordAudit(req.user?.id, 'product_attribute.add', req.ip, { productId, attributeId });
    return json(res, 201, { ok: true, product_attribute: rows[0] });
  } catch (err) {
    if (err.code === '23505') return conflict(res, 'attribute_already_linked', { attribute_id: attributeId });
    throw err;
  }
}

export async function removeProductAttribute(req, res, productId, attributeId) {
  const result = await query(
    `DELETE FROM product_attributes WHERE product_id = $1 AND attribute_id = $2`,
    [productId, Number(attributeId)],
  );
  if (result.rowCount === 0) return notFound(res);
  await recordAudit(req.user?.id, 'product_attribute.remove', req.ip, { productId, attributeId });
  return json(res, 200, { ok: true });
}

// --- Router ---------------------------------------------------------------

const routes = [
  { method: 'GET',    pattern: /^\/api\/admin\/products\/?$/,                                  handler: listProducts,        section: 'products' },
  { method: 'GET',    pattern: /^\/api\/admin\/products\/(\d+)\/?$/,                           handler: getProduct,          section: 'products' },
  { method: 'POST',   pattern: /^\/api\/admin\/products\/?$/,                                  handler: createProduct,       section: 'products' },
  { method: 'PATCH',  pattern: /^\/api\/admin\/products\/(\d+)\/?$/,                           handler: updateProduct,       section: 'products' },
  { method: 'DELETE', pattern: /^\/api\/admin\/products\/(\d+)\/?$/,                           handler: deleteProduct,       section: 'products' },
  { method: 'POST',   pattern: /^\/api\/admin\/products\/(\d+)\/attributes\/?$/,              handler: addProductAttribute,    section: 'products' },
  { method: 'DELETE', pattern: /^\/api\/admin\/products\/(\d+)\/attributes\/(\d+)\/?$/,       handler: removeProductAttribute, section: 'products' },
];

// Dispatcher: matchea cada ruta y pasa el número correcto de args al handler.
export async function tryHandleProducts(req, res) {
  const method = req.method || 'GET';
  const pathname = (req.url || '/').split('?')[0];
  for (const route of routes) {
    if (route.method !== method) continue;
    const m = route.pattern.exec(pathname);
    if (!m) continue;
    return protect(route.handler, route.section)(req, res, ...m.slice(1)) || true;
  }
  return false;
}
