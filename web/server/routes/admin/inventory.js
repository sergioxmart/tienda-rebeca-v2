// Inventario TechStore: gestiona unidades de variantes ya existentes.
// El catálogo crea productos/variantes; este módulo solo registra entradas,
// salidas y saldos actuales con trazabilidad.

import { query, tx } from '../../lib/db.js';
import { json } from '../../lib/json.js';
import { protect, recordAudit, validators, validate, notFound, conflict } from './_helpers.js';

function parsePositiveInt(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

export async function listInventory(req, res) {
  const url = new URL(req.url, 'http://x');
  const productId = parsePositiveInt(url.searchParams.get('product_id'));
  const q = url.searchParams.get('q')?.trim();
  const lowStock = parsePositiveInt(url.searchParams.get('low_stock'));
  const where = [];
  const params = [];

  if (productId !== null) { params.push(productId); where.push(`v.product_id = $${params.length}`); }
  if (q) {
    params.push(`%${q}%`);
    where.push(`(p.name ILIKE $${params.length} OR COALESCE(v.sku, '') ILIKE $${params.length})`);
  }
  if (lowStock !== null) { params.push(lowStock); where.push(`v.stock <= $${params.length}`); }

  const { rows } = await query(
    `SELECT v.id AS variant_id, v.product_id, v.sku, v.stock, v.active,
            v.price, v.display_order, p.name AS product_name, p.slug AS product_slug,
            COALESCE(string_agg(a.name || ': ' || av.value, ' · '
              ORDER BY a.display_order, a.name), '') AS combination
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
       LEFT JOIN variant_attribute_values vav ON vav.variant_id = v.id
       LEFT JOIN attributes a ON a.id = vav.attribute_id
       LEFT JOIN attribute_values av ON av.id = vav.attribute_value_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY v.id, p.id
      ORDER BY p.name, v.display_order, v.id`,
    params,
  );
  return json(res, 200, { ok: true, variants: rows });
}

export async function getInventoryVariant(req, res, variantId) {
  const { rows: variants } = await query(
    `SELECT v.id AS variant_id, v.product_id, v.sku, v.stock, v.active,
            v.price, p.name AS product_name, p.slug AS product_slug
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
      WHERE v.id = $1`,
    [variantId],
  );
  if (variants.length === 0) return notFound(res);
  const { rows: movements } = await query(
    `SELECT id, variant_id, movement_type, quantity, stock_before,
            stock_after, reason, created_by, created_at
       FROM inventory_movements
      WHERE variant_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 100`,
    [variantId],
  );
  return json(res, 200, { ok: true, variant: variants[0], movements });
}

export async function createMovement(req, res) {
  const body = req.body || {};
  if (!validate(res, body, [
    validators.int(Number(body.variant_id), 'variant_id', { min: 1 }),
    validators.oneOf(body.movement_type, 'movement_type', ['in', 'out']),
    validators.int(Number(body.quantity), 'quantity', { min: 1 }),
    validators.optionalString(body.reason, 'reason', { max: 500 }),
  ])) return;

  const variantId = Number(body.variant_id);
  const quantity = Number(body.quantity);
  const result = await tx(async (client) => {
    const { rows } = await client.query(
      'SELECT id, product_id, stock FROM product_variants WHERE id = $1 FOR UPDATE',
      [variantId],
    );
    if (rows.length === 0) return { missing: true };
    const before = Number(rows[0].stock);
    const after = body.movement_type === 'in' ? before + quantity : before - quantity;
    if (after < 0) return { insufficient: true, before };

    await client.query('UPDATE product_variants SET stock = $1 WHERE id = $2', [after, variantId]);
    const { rows: movements } = await client.query(
      `INSERT INTO inventory_movements
         (variant_id, movement_type, quantity, stock_before, stock_after, reason, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, variant_id, movement_type, quantity, stock_before,
                 stock_after, reason, created_by, created_at`,
      [variantId, body.movement_type, quantity, before, after, body.reason?.trim() || '', req.user?.id || null],
    );
    return { movement: movements[0], productId: rows[0].product_id };
  });

  if (result.missing) return notFound(res);
  if (result.insufficient) return conflict(res, 'insufficient_stock', { stock: result.before });
  await recordAudit(req.user?.id, `inventory.${body.movement_type}`, req.ip, {
    variantId, quantity, stockBefore: result.movement.stock_before, stockAfter: result.movement.stock_after,
  });
  return json(res, 201, { ok: true, movement: result.movement });
}

const routes = [
  { method: 'GET',  pattern: /^\/api\/admin\/inventory\/variants\/?$/, handler: listInventory, section: 'inventory' },
  { method: 'GET',  pattern: /^\/api\/admin\/inventory\/variants\/(\d+)\/?$/, handler: getInventoryVariant, section: 'inventory' },
  { method: 'POST', pattern: /^\/api\/admin\/inventory\/movements\/?$/, handler: createMovement, section: 'inventory' },
];

export async function tryHandleInventory(req, res) {
  const method = req.method || 'GET';
  const pathname = (req.url || '/').split('?')[0];
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = route.pattern.exec(pathname);
    if (!match) continue;
    return protect(route.handler, route.section)(req, res, ...match.slice(1)) || true;
  }
  return false;
}
