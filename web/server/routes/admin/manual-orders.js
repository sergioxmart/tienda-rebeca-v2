// Creación administrativa de pedidos manuales y reservas confirmadas.

import { query, tx } from '../../lib/db.js';
import { json } from '../../lib/json.js';
import { commitOrderStock, reserveOrderStock, InsufficientReservationError } from '../../lib/order-stock.js';
import { protect, recordAudit } from './_helpers.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PAYMENT_METHODS = new Set(['transferencia', 'contraentrega', 'efectivo', 'tarjeta', 'otro']);

function clean(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function id(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
}

function paymentMethod(value) {
  const method = clean(value, 80).toLowerCase();
  return PAYMENT_METHODS.has(method) ? method : 'otro';
}

function itemKey(item) {
  return item.variant_id ? `variant:${item.variant_id}` : `product:${item.product_id}`;
}

async function resolveItems(client, rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 50) return { error: 'invalid_items' };
  const items = rawItems.map((item) => ({
    variantId: id(item?.variant_id),
    productId: id(item?.product_id),
    quantity: integer(item?.qty, 0),
  }));
  if (items.some((item) => (!item.variantId && !item.productId) || item.quantity < 1 || item.quantity > 99)) return { error: 'invalid_items' };
  if (new Set(items.map(itemKey)).size !== items.length) return { error: 'duplicate_items' };

  const variantIds = [...new Set(items.map((item) => item.variantId).filter(Boolean))];
  const productIds = [...new Set(items.map((item) => item.productId).filter(Boolean))];
  const { rows: variants } = variantIds.length
    ? await client.query(
      `SELECT v.id AS variant_id, v.product_id, v.sku AS variant_sku, v.stock,
              p.sku AS product_sku, p.name AS product_name,
              COALESCE(v.price, p.base_price) AS unit_price
         FROM product_variants v JOIN products p ON p.id = v.product_id
        WHERE v.id = ANY($1) AND p.active = TRUE
        FOR UPDATE OF v`,
      [variantIds],
    )
    : { rows: [] };
  const { rows: products } = productIds.length
    ? await client.query(
      `SELECT p.id AS product_id, p.sku AS product_sku, p.name AS product_name,
              p.base_price AS unit_price
         FROM products p
        WHERE p.id = ANY($1) AND p.active = TRUE
          AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id)
        FOR UPDATE`,
      [productIds],
    )
    : { rows: [] };
  const variantById = new Map(variants.map((row) => [Number(row.variant_id), row]));
  const productById = new Map(products.map((row) => [Number(row.product_id), row]));
  const resolved = [];
  for (const item of items) {
    const row = item.variantId ? variantById.get(item.variantId) : productById.get(item.productId);
    if (!row || (item.variantId && Number(row.product_id) !== item.productId)) return { error: 'product_not_found' };
    if (item.variantId && Number(row.stock) < item.quantity) {
      return { error: 'insufficient_stock', items: [{ variant_id: item.variantId, stock: Number(row.stock), requested: item.quantity }] };
    }
    resolved.push({ ...item, variantId: item.variantId, productId: Number(row.product_id || item.productId), productName: row.product_name, sku: row.variant_sku || row.product_sku || '', unitPrice: Math.max(0, integer(row.unit_price)) });
  }
  return { items: resolved };
}

async function upsertCustomer(client, customer) {
  const email = clean(customer?.email, 254).toLowerCase();
  const name = clean(customer?.name, 160);
  const phone = clean(customer?.phone, 40);
  if (!name || !phone || !EMAIL_RE.test(email)) return { error: 'invalid_customer' };
  const { rows } = await client.query(
    `INSERT INTO customer_accounts (email, name, phone)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE
       SET name = CASE WHEN EXCLUDED.name <> '' THEN EXCLUDED.name ELSE customer_accounts.name END,
           phone = CASE WHEN EXCLUDED.phone <> '' THEN EXCLUDED.phone ELSE customer_accounts.phone END
     RETURNING id, email, name, phone`,
    [email, name, phone],
  );
  return { customer: rows[0] };
}

export async function listManualProducts(req, res) {
  const url = new URL(req.url, 'http://x');
  const q = clean(url.searchParams.get('q'), 120);
  const params = [];
  const where = ['p.active = TRUE'];
  if (q) {
    params.push(`%${q}%`);
    where.push(`(p.name ILIKE $${params.length} OR COALESCE(p.sku, '') ILIKE $${params.length} OR COALESCE(v.sku, '') ILIKE $${params.length})`);
  }
  params.push(80);
  const { rows } = await query(
    `SELECT v.id AS variant_id, v.product_id, p.name AS product_name,
            COALESCE(v.sku, p.sku, '') AS sku, v.stock,
            COALESCE(v.price, p.base_price) AS unit_price,
            COALESCE(string_agg(a.name || ': ' || av.value, ' · ' ORDER BY a.display_order, a.name), '') AS combination
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
       LEFT JOIN variant_attribute_values vav ON vav.variant_id = v.id
       LEFT JOIN attributes a ON a.id = vav.attribute_id
       LEFT JOIN attribute_values av ON av.id = vav.attribute_value_id
      WHERE ${where.join(' AND ')}
      GROUP BY v.id, p.id
      UNION ALL
      SELECT NULL AS variant_id, p.id AS product_id, p.name AS product_name,
             COALESCE(p.sku, '') AS sku, NULL AS stock, p.base_price AS unit_price,
             '' AS combination
        FROM products p
       WHERE p.active = TRUE AND NOT EXISTS (SELECT 1 FROM product_variants v0 WHERE v0.product_id = p.id)
         ${q ? `AND (p.name ILIKE $1 OR COALESCE(p.sku, '') ILIKE $1)` : ''}
      ORDER BY product_name, combination
      LIMIT $${params.length}`,
    params,
  );
  return json(res, 200, { ok: true, products: rows });
}

export async function searchManualCustomers(req, res) {
  const url = new URL(req.url, 'http://x');
  const q = clean(url.searchParams.get('q'), 254).toLowerCase();
  if (q.length < 2) return json(res, 200, { ok: true, customers: [] });
  const pattern = `%${q}%`;
  const { rows: accounts } = await query(
    `SELECT c.id, c.email, c.name, c.phone,
            r.id AS reservation_id, r.reservation_number,
            r.product_id, r.variant_id, r.product_name,
            r.requested_type, r.use_date, r.use_end_date, r.pickup_date, r.status AS reservation_status
       FROM customer_accounts c
       LEFT JOIN LATERAL (
         SELECT id, reservation_number, product_id, variant_id, product_name,
                requested_type, use_date, use_end_date, pickup_date, status
           FROM reservations
          WHERE customer_id = c.id AND status IN ('lead', 'pending', 'confirmed')
          ORDER BY created_at DESC LIMIT 1
       ) r ON TRUE
      WHERE lower(c.email) LIKE $1 OR lower(c.name) LIKE $1 OR lower(c.phone) LIKE $1
      ORDER BY c.updated_at DESC LIMIT 20`,
    [pattern],
  );
  const { rows: leads } = await query(
    `SELECT NULL::integer AS id, customer_email AS email, customer_name AS name,
            customer_phone AS phone, id AS reservation_id, reservation_number,
            product_id, variant_id, product_name, requested_type, use_date,
            use_end_date, pickup_date, status AS reservation_status
       FROM reservations
      WHERE status = 'lead'
        AND (lower(customer_email) LIKE $1 OR lower(customer_name) LIKE $1 OR lower(customer_phone) LIKE $1)
      ORDER BY created_at DESC LIMIT 20`,
    [pattern],
  );
  const merged = new Map();
  [...accounts, ...leads].forEach((row) => { if (!merged.has(row.email)) merged.set(row.email, row); });
  return json(res, 200, { ok: true, customers: [...merged.values()].slice(0, 20) });
}

export async function listReservations(req, res) {
  const { rows } = await query(
    `SELECT id, reservation_number, product_name, variant_sku, requested_type,
            customer_email, customer_name, customer_phone, use_date, use_end_date, pickup_date,
            status, quoted_amount, payment_method, shipping_method, notes,
            created_at, updated_at
       FROM reservations
      ORDER BY created_at DESC, id DESC
      LIMIT 200`,
  );
  return json(res, 200, { ok: true, reservations: rows });
}

export async function createManualRecord(req, res) {
  const body = req.body || {};
  const kind = body.kind === 'reservation' ? 'reservation' : 'order';
  try {
    const result = await tx(async (client) => {
      const customerResult = await upsertCustomer(client, body.customer);
      if (customerResult.error) return customerResult;
      const customer = customerResult.customer;

      if (kind === 'reservation') {
        const reservation = body.reservation || {};
        const productId = id(reservation.product_id);
        const variantId = id(reservation.variant_id);
        const useDate = clean(reservation.use_date, 10);
        const useEndDate = clean(reservation.use_end_date || useDate, 10);
        const pickupDate = clean(reservation.pickup_date, 10);
        const requestedType = ['alquiler', 'alquiler_nuevo'].includes(reservation.requested_type) ? reservation.requested_type : null;
        if (!productId || !DATE_RE.test(useDate) || !DATE_RE.test(useEndDate) || !DATE_RE.test(pickupDate) || useEndDate < useDate || !requestedType) return { error: 'invalid_reservation' };
        const resolved = await resolveItems(client, [{ product_id: productId, variant_id: variantId, qty: 1 }]);
        if (resolved.error) return resolved;
        const item = resolved.items[0];
        const status = ['pending', 'confirmed'].includes(reservation.status) ? reservation.status : 'confirmed';
        const start = [useDate, useEndDate, pickupDate].sort()[0];
        const end = [useDate, useEndDate, pickupDate].sort().at(-1);
        const { rows: conflicts } = await client.query(
          `SELECT id, reservation_number FROM reservations
            WHERE id <> COALESCE($1, 0)
              AND product_id = $2
              AND (variant_id = $3 OR (variant_id IS NULL AND $3::integer IS NULL))
              AND status IN ('pending', 'confirmed')
              AND NOT (LEAST(use_date, pickup_date) > $5::date OR GREATEST(use_end_date, pickup_date) < $4::date)
            LIMIT 1`,
          [id(reservation.reservation_id), productId, variantId, start, end],
        );
        if (conflicts.length) return { error: 'reservation_conflict', conflict: conflicts[0] };
        const leadId = id(reservation.reservation_id);
        if (leadId) {
          const { rows } = await client.query(
            `UPDATE reservations
                SET customer_id = $1, product_id = $2, variant_id = $3,
                    product_name = $4, variant_sku = $5, requested_type = $6,
                    customer_email = $7, customer_name = $8, customer_phone = $9,
                    use_date = $10, use_end_date = $11, pickup_date = $12, status = $13,
                    quoted_amount = $14, payment_method = $15, shipping_method = $16,
                    notes = $17, lead_source = 'admin', updated_at = NOW()
              WHERE id = $18 AND status = 'lead'
              RETURNING *`,
            [customer.id, productId, variantId, item.productName, item.sku, requestedType,
              customer.email, customer.name, customer.phone, useDate, useEndDate, pickupDate, status,
              Math.max(0, integer(reservation.quoted_amount)), paymentMethod(reservation.payment_method), clean(reservation.shipping_method, 80), clean(reservation.notes, 1000), leadId],
          );
          if (rows[0]) return { reservation: rows[0] };
        }
        const { rows: sequence } = await client.query(`SELECT nextval(pg_get_serial_sequence('reservations', 'id'))::integer AS id`);
        const number = `RS-${new Date().getFullYear()}-${String(sequence[0].id).padStart(5, '0')}`;
        const { rows } = await client.query(
          `INSERT INTO reservations
             (id, reservation_number, customer_id, product_id, variant_id,
              product_name, variant_sku, requested_type, customer_email,
              customer_name, customer_phone, use_date, use_end_date, pickup_date, status,
              quoted_amount, payment_method, shipping_method, notes, lead_source, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, 'admin', $20)
           RETURNING *`,
          [sequence[0].id, number, customer.id, productId, variantId, item.productName, item.sku,
            requestedType, customer.email, customer.name, customer.phone, useDate, useEndDate, pickupDate, status,
            Math.max(0, integer(reservation.quoted_amount)), paymentMethod(reservation.payment_method), clean(reservation.shipping_method, 80), clean(reservation.notes, 1000), req.user?.id || null],
        );
        return { reservation: rows[0] };
      }

      const resolved = await resolveItems(client, body.items);
      if (resolved.error) return resolved;
      const shipping = Math.max(0, integer(body.shipping));
      const tax = Math.max(0, integer(body.tax));
      const discount = Math.max(0, integer(body.discount));
      const subtotal = resolved.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      if (discount > subtotal + shipping + tax) return { error: 'invalid_discount' };
      const total = subtotal + shipping + tax - discount;
      const paymentStatus = body.payment_status === 'paid' ? 'paid' : 'pending';
      const orderStatus = paymentStatus === 'paid' ? 'paid' : 'processing';
      const { rows: sequence } = await client.query(`SELECT nextval(pg_get_serial_sequence('orders', 'id'))::integer AS id`);
      const orderNumber = `MAN-${new Date().getFullYear()}-${String(sequence[0].id).padStart(5, '0')}`;
      const shippingAddress = JSON.stringify({
        address: clean(body.customer?.address, 300),
        department: clean(body.customer?.department, 100),
        city: clean(body.customer?.city, 120),
        shipping_method: clean(body.shipping_method, 80),
      });
      await client.query(
        `INSERT INTO orders
           (id, order_number, client_id, customer_email, customer_name, customer_phone,
            status, subtotal, shipping, tax, total, discount, shipping_address, notes, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, NULL)`,
        [sequence[0].id, orderNumber, customer.id, customer.email, customer.name, customer.phone,
          orderStatus, subtotal, shipping, tax, total, discount, shippingAddress, clean(body.notes, 1000)],
      );
      for (const item of resolved.items) {
        await client.query(
          `INSERT INTO order_items (order_id, variant_id, product_name, variant_sku, quantity, unit_price, line_total)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [sequence[0].id, item.variantId, item.productName, item.sku, item.quantity, item.unitPrice, item.unitPrice * item.quantity],
        );
      }
      await reserveOrderStock(client, { orderId: sequence[0].id, orderNumber, items: resolved.items });
      if (paymentStatus === 'paid') await commitOrderStock(client, sequence[0].id);
      await client.query(
        `INSERT INTO payments (order_id, provider, provider_transaction_id, status, amount, currency, payment_method, raw_response)
         VALUES ($1, 'manual', '', $2, $3, 'COP', $4, $5::jsonb)`,
        [sequence[0].id, paymentStatus === 'paid' ? 'approved' : 'pending', total, paymentMethod(body.payment_method), JSON.stringify({ source: 'admin_manual' })],
      );
      return { order: { id: sequence[0].id, order_number: orderNumber, status: orderStatus, total } };
    });
    if (result.error === 'insufficient_stock') return json(res, 409, { ok: false, error: result.error, items: result.items });
    if (result.error === 'reservation_conflict') return json(res, 409, { ok: false, error: result.error, conflict: result.conflict });
    if (result.error) return json(res, 400, { ok: false, error: result.error });
    await recordAudit(req.user?.id, kind === 'order' ? 'order.manual_create' : 'reservation.manual_create', req.ip, { id: result.order?.id || result.reservation?.id });
    return json(res, 201, { ok: true, ...result });
  } catch (error) {
    if (error instanceof InsufficientReservationError) return json(res, 409, { ok: false, error: 'insufficient_stock', items: error.items });
    throw error;
  }
}

const routes = [
  { method: 'GET', pattern: /^\/api\/admin\/orders\/manual-products\/?$/, handler: listManualProducts, section: 'orders' },
  { method: 'GET', pattern: /^\/api\/admin\/orders\/customer-search\/?$/, handler: searchManualCustomers, section: 'orders' },
  { method: 'GET', pattern: /^\/api\/admin\/orders\/reservations\/?$/, handler: listReservations, section: 'orders' },
  { method: 'POST', pattern: /^\/api\/admin\/orders\/manual\/?$/, handler: createManualRecord, section: 'orders' },
];

export async function tryHandleManualOrders(req, res) {
  const method = req.method || 'GET';
  const pathname = (req.url || '/').split('?')[0];
  for (const route of routes) {
    if (route.method !== method || !route.pattern.test(pathname)) continue;
    return protect(route.handler, route.section)(req, res) || true;
  }
  return false;
}
