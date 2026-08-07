// Rutas admin para product_variants (SKU real) + variant_attribute_values (M2M).
//
// Variantes son las combinaciones vendibles de un producto. Cada una
// tiene su propio SKU, stock, y (opcionalmente) override de precio. Los
// valores de atributos que la definen van en variant_attribute_values.
//
// Endpoints:
//   GET    /api/admin/products/:productId/variants        → lista
//   POST   /api/admin/products/:productId/variants        → crea
//                                                             body: { sku?, price?,
//                                                                     stock?, active?,
//                                                                     display_order?,
//                                                                     attribute_values: [
//                                                                       { attribute_id, value }
//                                                                     ] }
//   GET    /api/admin/variants/:id                         → detalle + valores
//   PATCH  /api/admin/variants/:id                         → edita (sin attribute_values)
//   DELETE /api/admin/variants/:id                         → borra
//   PATCH  /api/admin/variants/:id/stock                  → ajuste rápido de stock
//                                                             body: { stock, reason? }
//
// Invariante enforced por la app al crear:
//   "Para este product, no debe existir OTRA variante con la misma
//    combinación de valores de atributos."
// Si el POST rompe la invariante, rollback y 409 con `duplicate_variant`.
//
// El `price` puede ser null → usa products.base_price.

import { query, tx } from '../../lib/db.js';
import { log } from '../../lib/logger.js';
import { json } from '../../lib/json.js';
import { protect, recordAudit, validators, validate, notFound, conflict } from './_helpers.js';

// --- Helpers --------------------------------------------------------------

/**
 * Compara dos combinaciones de (attribute_id, attribute_value_id) ordenadas.
 * Devuelve true si son iguales (mismo set de valores para los mismos atributos).
 */
function combinationsEqual(a, b) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x.attribute_id - y.attribute_id);
  const sb = [...b].sort((x, y) => x.attribute_id - y.attribute_id);
  return sa.every((x, i) => x.attribute_id === sb[i].attribute_id && x.attribute_value_id === sb[i].attribute_value_id);
}

/**
 * Verifica que la combinación propuesta no choque con otra variante del mismo
 * product. Devuelve `null` si está OK, o un objeto con la variante que choca.
 */
async function findDuplicateVariant(productId, excludeId, combo) {
  // Trae todas las variantes del producto (con sus valores) y compara en JS.
  // En v1 con pocas variantes por producto está bien. Si crece, se puede
  // hacer con un query que normalice los valores.
  const { rows: variants } = await query(
    `SELECT v.id FROM product_variants v
       WHERE v.product_id = $1 AND v.id != $2`,
    [productId, excludeId ?? 0],
  );
  for (const v of variants) {
    const { rows: values } = await query(
      `SELECT attribute_id, attribute_value_id
         FROM variant_attribute_values WHERE variant_id = $1`,
      [v.id],
    );
    if (combinationsEqual(combo, values)) return v;
  }
  return null;
}

/**
 * Resuelve los `attribute_values` del body a una lista de (attribute_id,
 * attribute_value_id) lista para insertar en variant_attribute_values.
 *
 * Para cada item del body:
 *   - Si viene attribute_value_id: usar ese directo (chequeamos que exista).
 *   - Si viene value (string): buscar o crear el attribute_value para ese
 *     attribute_id, y usar su id.
 *
 * Devuelve la lista de IDs resueltos. Tira error si:
 *   - Falta attribute_id
 *   - El attribute_id no existe
 *   - El attribute_value_id no existe o no pertenece al attribute_id
 *   - Hay attributes repetidos en el body
 */
async function resolveAttributeValues(items) {
  if (!Array.isArray(items) || items.length === 0) return [];
  // Chequear duplicates
  const seen = new Set();
  const resolved = [];
  for (const it of items) {
    const attrId = Number(it.attribute_id);
    if (!Number.isInteger(attrId)) {
      throw new Error(`attribute_id inválido: ${it.attribute_id}`);
    }
    if (seen.has(attrId)) {
      throw new Error(`atributo ${attrId} repetido en attribute_values`);
    }
    seen.add(attrId);

    let valueId;
    if (it.attribute_value_id !== undefined && it.attribute_value_id !== null) {
      valueId = Number(it.attribute_value_id);
      // Verificar que pertenece al attribute
      const { rows } = await query(
        `SELECT attribute_id FROM attribute_values WHERE id = $1`,
        [valueId],
      );
      if (rows.length === 0) throw new Error(`attribute_value_id ${valueId} no existe`);
      if (rows[0].attribute_id !== attrId) {
        throw new Error(`attribute_value_id ${valueId} no pertenece al attribute ${attrId}`);
      }
    } else if (typeof it.value === 'string' && it.value.trim()) {
      // Buscar o crear
      const v = it.value.trim();
      const { rows: existing } = await query(
        `SELECT id FROM attribute_values WHERE attribute_id = $1 AND value = $2`,
        [attrId, v],
      );
      if (existing.length > 0) {
        valueId = existing[0].id;
      } else {
        const { rows: created } = await query(
          `INSERT INTO attribute_values (attribute_id, value) VALUES ($1, $2) RETURNING id`,
          [attrId, v],
        );
        valueId = created[0].id;
      }
    } else {
      throw new Error(`item de attribute_values sin value ni attribute_value_id (attribute ${attrId})`);
    }
    resolved.push({ attribute_id: attrId, attribute_value_id: valueId });
  }
  return resolved;
}

// --- Handlers (variants CRUD) ---------------------------------------------

export async function listVariants(req, res, productId) {
  const { rows: p } = await query('SELECT id FROM products WHERE id = $1', [productId]);
  if (p.length === 0) return notFound(res);

  const { rows } = await query(
    `SELECT v.id, v.product_id, v.sku, v.price, v.compare_at, v.stock,
            v.description, v.active, v.display_order, v.created_at, v.updated_at
       FROM product_variants v
      WHERE v.product_id = $1
      ORDER BY v.display_order, v.id`,
    [productId],
  );
  // Para cada variante, traer sus valores
  for (const v of rows) {
    const { rows: values } = await query(
      `SELECT vav.attribute_id, vav.attribute_value_id,
              a.slug AS attribute_slug, a.name AS attribute_name,
              av.value AS value
         FROM variant_attribute_values vav
         JOIN attributes a       ON a.id = vav.attribute_id
         JOIN attribute_values av ON av.id = vav.attribute_value_id
        WHERE vav.variant_id = $1
        ORDER BY a.display_order, a.name`,
      [v.id],
    );
    v.attribute_values = values;
  }
  return json(res, 200, { ok: true, variants: rows });
}

export async function getVariant(req, res, id) {
  const { rows } = await query(
    `SELECT v.* FROM product_variants v WHERE v.id = $1`, [id],
  );
  if (rows.length === 0) return notFound(res);
  const v = rows[0];
  const { rows: values } = await query(
    `SELECT vav.attribute_id, vav.attribute_value_id,
            a.slug AS attribute_slug, a.name AS attribute_name,
            av.value AS value
       FROM variant_attribute_values vav
       JOIN attributes a       ON a.id = vav.attribute_id
       JOIN attribute_values av ON av.id = vav.attribute_value_id
      WHERE vav.variant_id = $1
      ORDER BY a.display_order, a.name`,
    [id],
  );
  v.attribute_values = values;
  return json(res, 200, { ok: true, variant: v });
}

export async function createVariant(req, res, productId) {
  const { rows: p } = await query('SELECT id FROM products WHERE id = $1', [productId]);
  if (p.length === 0) return notFound(res);

  const body = req.body || {};
  if (!validate(res, body, [
    body.price !== undefined && body.price !== null && validators.int(Number(body.price), 'price', { min: 0 }),
    body.compare_at !== undefined && (body.compare_at === null || validators.int(Number(body.compare_at), 'compare_at', { min: 0 })),
    body.stock !== undefined && validators.int(Number(body.stock), 'stock', { min: 0 }),
    body.description !== undefined && validators.optionalString(body.description, 'description', { max: 5000 }),
    body.display_order !== undefined && validators.int(body.display_order, 'display_order'),
    body.active !== undefined && validators.bool(body.active, 'active'),
    !Array.isArray(body.attribute_values) || body.attribute_values.length === 0 ? 'attribute_values requerido (array no vacío)' : null,
  ])) return;

  // Resolver attribute_values
  let combo;
  try {
    combo = await resolveAttributeValues(body.attribute_values);
  } catch (e) {
    return json(res, 400, { ok: false, error: 'invalid_attribute_values', message: e.message });
  }

  // Verificar invariante de unicidad
  const dup = await findDuplicateVariant(productId, null, combo);
  if (dup) return conflict(res, 'duplicate_variant', { existing_variant_id: dup.id });

  // Crear variante + values en una transacción
  const result = await tx(async (client) => {
    const { rows: v } = await client.query(
      `INSERT INTO product_variants (product_id, sku, price, compare_at, stock, description, active, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [productId, body.sku ?? null,
       body.price !== undefined ? Number(body.price) : null,
       body.compare_at !== undefined ? (body.compare_at === null ? null : Number(body.compare_at)) : null,
       Number(body.stock ?? 0), body.description ?? '', body.active ?? true, body.display_order ?? 0],
    );
    const variantId = v[0].id;
    for (const c of combo) {
      await client.query(
        `INSERT INTO variant_attribute_values (variant_id, attribute_id, attribute_value_id)
         VALUES ($1, $2, $3)`,
        [variantId, c.attribute_id, c.attribute_value_id],
      );
    }
    return v[0];
  });
  await recordAudit(req.user?.id, 'variant.create', req.ip, { id: result.id, productId });
  log.info('variant created', { id: result.id, productId, by: req.user?.email });
  return json(res, 201, { ok: true, variant: result });
}

export async function updateVariant(req, res, id) {
  const { rows: existing } = await query('SELECT id, product_id FROM product_variants WHERE id = $1', [id]);
  if (existing.length === 0) return notFound(res);
  const productId = existing[0].product_id;

  const body = req.body || {};
  if (!validate(res, body, [
    body.price !== undefined && (body.price === null || validators.int(Number(body.price), 'price', { min: 0 })),
    body.compare_at !== undefined && (body.compare_at === null || validators.int(Number(body.compare_at), 'compare_at', { min: 0 })),
    body.stock !== undefined && validators.int(Number(body.stock), 'stock', { min: 0 }),
    body.description !== undefined && validators.optionalString(body.description, 'description', { max: 5000 }),
    body.display_order !== undefined && validators.int(body.display_order, 'display_order'),
    body.active !== undefined && validators.bool(body.active, 'active'),
  ])) return;

  // Si vienen nuevos attribute_values, resolver y chequear invariante
  let combo = null;
  if (body.attribute_values !== undefined) {
    try {
      combo = await resolveAttributeValues(body.attribute_values);
    } catch (e) {
      return json(res, 400, { ok: false, error: 'invalid_attribute_values', message: e.message });
    }
    const dup = await findDuplicateVariant(productId, id, combo);
    if (dup) return conflict(res, 'duplicate_variant', { existing_variant_id: dup.id });
  }

  const result = await tx(async (client) => {
    // Update campos escalares
    const fields = [];
    const values = [];
    let i = 1;
    if (body.sku !== undefined)         { fields.push(`sku = $${i++}`);         values.push(body.sku); }
    if (body.price !== undefined)       { fields.push(`price = $${i++}`);       values.push(body.price === null ? null : Number(body.price)); }
    if (body.compare_at !== undefined)   { fields.push(`compare_at = $${i++}`);   values.push(body.compare_at === null ? null : Number(body.compare_at)); }
    if (body.stock !== undefined)       { fields.push(`stock = $${i++}`);       values.push(Number(body.stock)); }
    if (body.description !== undefined) { fields.push(`description = $${i++}`); values.push(body.description); }
    if (body.active !== undefined)      { fields.push(`active = $${i++}`);      values.push(body.active); }
    if (body.display_order !== undefined){ fields.push(`display_order = $${i++}`); values.push(body.display_order); }
    if (fields.length > 0) {
      values.push(id);
      await client.query(
        `UPDATE product_variants SET ${fields.join(', ')} WHERE id = $${i}`,
        values,
      );
    }
    // Reemplazar attribute_values si vinieron
    if (combo) {
      await client.query(`DELETE FROM variant_attribute_values WHERE variant_id = $1`, [id]);
      for (const c of combo) {
        await client.query(
          `INSERT INTO variant_attribute_values (variant_id, attribute_id, attribute_value_id)
           VALUES ($1, $2, $3)`,
          [id, c.attribute_id, c.attribute_value_id],
        );
      }
    }
    const { rows: v } = await client.query(`SELECT * FROM product_variants WHERE id = $1`, [id]);
    return v[0];
  });
  await recordAudit(req.user?.id, 'variant.update', req.ip, { id, fields: Object.keys(body) });
  return json(res, 200, { ok: true, variant: result });
}

export async function deleteVariant(req, res, id) {
  const { rows: existing } = await query('SELECT id FROM product_variants WHERE id = $1', [id]);
  if (existing.length === 0) return notFound(res);
  await query('DELETE FROM product_variants WHERE id = $1', [id]);
  await recordAudit(req.user?.id, 'variant.delete', req.ip, { id });
  return json(res, 200, { ok: true });
}

// Ajuste rápido de stock (sin tocar precio ni otros campos)
export async function adjustVariantStock(req, res, id) {
  const { rows: existing } = await query('SELECT id, stock FROM product_variants WHERE id = $1', [id]);
  if (existing.length === 0) return notFound(res);

  const body = req.body || {};
  if (body.stock === undefined) {
    return json(res, 400, { ok: false, error: 'stock_required' });
  }
  const newStock = Number(body.stock);
  if (!Number.isInteger(newStock) || newStock < 0) {
    return json(res, 400, { ok: false, error: 'stock_invalid' });
  }

  const { rows } = await query(
    `UPDATE product_variants SET stock = $1 WHERE id = $2 RETURNING id, stock`,
    [newStock, id],
  );
  await recordAudit(req.user?.id, 'variant.stock_adjust', req.ip, { id, from: existing[0].stock, to: newStock, reason: body.reason || '' });
  return json(res, 200, { ok: true, variant: rows[0] });
}

// --- Router ---------------------------------------------------------------

const routes = [
  { method: 'GET',    pattern: /^\/api\/admin\/products\/(\d+)\/variants\/?$/,     handler: listVariants,         section: 'variants' },
  { method: 'POST',   pattern: /^\/api\/admin\/products\/(\d+)\/variants\/?$/,     handler: createVariant,        section: 'variants' },
  { method: 'GET',    pattern: /^\/api\/admin\/variants\/(\d+)\/?$/,                handler: getVariant,           section: 'variants' },
  { method: 'PATCH',  pattern: /^\/api\/admin\/variants\/(\d+)\/?$/,                handler: updateVariant,        section: 'variants' },
  { method: 'DELETE', pattern: /^\/api\/admin\/variants\/(\d+)\/?$/,                handler: deleteVariant,        section: 'variants' },
  { method: 'PATCH',  pattern: /^\/api\/admin\/variants\/(\d+)\/stock\/?$/,         handler: adjustVariantStock,   section: 'variants' },
];

export async function tryHandleVariants(req, res) {
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
