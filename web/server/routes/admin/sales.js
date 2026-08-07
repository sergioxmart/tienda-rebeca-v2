// Ventas del ecommerce TechStore.
//
// En este proyecto una venta nace de un pedido pagado; no se deben usar las
// tablas legacy `sales`, `sale_items` o `sizes` de Rebeca. Esta ruta consulta
// el modelo actual de orders/payments/order_items y conserva los snapshots.

import { query } from '../../lib/db.js';
import { json } from '../../lib/json.js';
import { protect } from './_helpers.js';

export async function listSales(req, res) {
  const url = new URL(req.url, 'http://x');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const where = ["(o.status IN ('paid', 'processing', 'shipped', 'delivered', 'refunded') OR last_payment.status = 'approved')"];
  const params = [];

  if (from) {
    params.push(from);
    where.push(`o.created_at >= $${params.length}::date`);
  }
  if (to) {
    params.push(to);
    where.push(`o.created_at < ($${params.length}::date + INTERVAL '1 day')`);
  }

  const { rows } = await query(
    `SELECT o.id, o.order_number, o.created_at AS sold_at, o.created_at,
            o.customer_name, o.customer_email, o.status, o.total,
            COALESCE(last_payment.payment_method, '') AS payment_method,
            COALESCE(items.item_count, 0)::integer AS item_count
       FROM orders o
  LEFT JOIN LATERAL (
         SELECT p.status, p.payment_method
           FROM payments p
          WHERE p.order_id = o.id
          ORDER BY CASE WHEN p.status = 'approved' THEN 0 ELSE 1 END, p.created_at DESC
          LIMIT 1
       ) last_payment ON TRUE
  LEFT JOIN LATERAL (
         SELECT COUNT(*)::integer AS item_count
           FROM order_items oi
          WHERE oi.order_id = o.id
       ) items ON TRUE
      WHERE ${where.join(' AND ')}
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT 200`,
    params,
  );

  return json(res, 200, { ok: true, sales: rows, data: rows });
}

const routes = [
  { method: 'GET', pattern: /^\/api\/admin\/sales\/?$/, handler: listSales, section: 'sales' },
];

export async function tryHandleSales(req, res) {
  const method = req.method || 'GET';
  const pathname = (req.url || '/').split('?')[0];
  for (const route of routes) {
    if (route.method !== method) continue;
    if (!route.pattern.test(pathname)) continue;
    return protect(route.handler, route.section)(req, res) || true;
  }
  return false;
}
