// Lectura de pedidos del checkout público.
//
//   GET /api/admin/orders
//   GET /api/admin/orders/:id

import { query } from '../../lib/db.js';
import { json } from '../../lib/json.js';
import { protect, notFound } from './_helpers.js';
import { expirePendingOrders } from '../../lib/order-expiration.js';
import { geocodeShippingAddress } from '../../lib/geocoding.js';

export async function listOrders(req, res) {
  await expirePendingOrders().catch(() => {});
  const url = new URL(req.url, 'http://x');
  const status = url.searchParams.get('status');
  const q = url.searchParams.get('q');
  const where = [];
  const params = [];
  if (status) { params.push(status); where.push(`o.status = $${params.length}`); }
  if (q) {
    params.push(`%${q}%`);
    where.push(`(o.order_number ILIKE $${params.length} OR o.customer_name ILIKE $${params.length} OR o.customer_email ILIKE $${params.length})`);
  }
  const { rows } = await query(
    `SELECT o.id, o.order_number, o.customer_email, o.customer_name,
            o.customer_phone, o.status, o.total, o.created_at, o.updated_at,
            COUNT(oi.id)::integer AS item_count
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT 200`,
    params,
  );
  return json(res, 200, { ok: true, orders: rows });
}

export async function getOrder(req, res, id) {
  await expirePendingOrders().catch(() => {});
  const { rows } = await query('SELECT * FROM orders WHERE id = $1', [id]);
  if (rows.length === 0) return notFound(res);
  const shippingLocation = await geocodeShippingAddress({
    ...(rows[0].shipping_address || {}),
    notes: rows[0].notes,
  });
  const { rows: items } = await query(
    `SELECT id, variant_id, product_name, variant_sku, quantity,
            unit_price, line_total, created_at
       FROM order_items
      WHERE order_id = $1
      ORDER BY id`,
    [id],
  );
  return json(res, 200, { ok: true, order: { ...rows[0], items, shipping_location: shippingLocation } });
}

const routes = [
  { method: 'GET', pattern: /^\/api\/admin\/orders\/?$/, handler: listOrders, section: 'orders' },
  { method: 'GET', pattern: /^\/api\/admin\/orders\/(\d+)\/?$/, handler: getOrder, section: 'orders' },
];

export async function tryHandleOrders(req, res) {
  const method = req.method || 'GET';
  const pathname = (req.url || '/').split('?')[0];
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = route.pattern.exec(pathname);
    if (!match) continue;
    return protect(route.handler, route.section)(req, res, match[1]) || true;
  }
  return false;
}
