// Creación pública de pedidos desde el checkout.
//
// El navegador solo envía identificadores y cantidades. El servidor vuelve a
// consultar nombres, precios y stock para que el pedido conserve snapshots
// confiables y no dependa de datos manipulables del carrito.

import { tx } from '../../lib/db.js';
import { readJsonBody } from '../../lib/body.js';
import { json } from '../../lib/json.js';
import { expirePendingOrders, ORDER_PENDING_TTL_MINUTES } from '../../lib/order-expiration.js';
import { reserveOrderStock, InsufficientReservationError } from '../../lib/order-stock.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function positiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function positiveQuantity(value) {
  const quantity = Number(value);
  return Number.isInteger(quantity) && quantity > 0 && quantity <= 99 ? quantity : null;
}

function cleanString(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function createOrder(req, res) {
  await expirePendingOrders().catch(() => {});
  const body = await readJsonBody(req).catch(() => null);
  const customer = body?.customer;
  const rawItems = body?.items;

  if (!customer || typeof customer !== 'object' || Array.isArray(customer) || !Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 50) {
    return json(res, 400, { ok: false, error: 'invalid_checkout', message: 'Completa los datos del cliente y agrega al menos un producto.' });
  }

  const customerName = cleanString(customer.name, 160);
  const customerEmail = cleanString(customer.email, 254).toLowerCase();
  const customerPhone = cleanString(customer.phone, 40);
  const address = cleanString(customer.address, 300);
  const city = cleanString(customer.city, 120);
  const notes = cleanString(customer.notes, 1000);
  const requestedLocation = customer.delivery_location;
  const latitude = Number(requestedLocation?.lat);
  const longitude = Number(requestedLocation?.lon);
  const hasLatitude = Number.isFinite(latitude) && latitude >= -90 && latitude <= 90;
  const hasLongitude = Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
  if (requestedLocation && (hasLatitude !== hasLongitude)) {
    return json(res, 400, { ok: false, error: 'invalid_delivery_location', message: 'La ubicación de entrega está incompleta.' });
  }
  if (!customerName || !customerEmail || !EMAIL_RE.test(customerEmail) || !customerPhone || !address || !city) {
    return json(res, 400, { ok: false, error: 'invalid_customer', message: 'Revisa nombre, correo, teléfono, dirección y ciudad.' });
  }

  const items = [];
  const keys = new Set();
  for (const raw of rawItems) {
    const variantId = positiveId(raw?.variant_id);
    const productId = positiveId(raw?.product_id);
    const quantity = positiveQuantity(raw?.qty);
    if ((!variantId && !productId) || !quantity) {
      return json(res, 400, { ok: false, error: 'invalid_items', message: 'El carrito contiene una línea inválida.' });
    }
    const key = `${variantId || 'product'}:${variantId || productId}`;
    if (keys.has(key)) {
      return json(res, 400, { ok: false, error: 'duplicate_items', message: 'El carrito contiene productos repetidos.' });
    }
    keys.add(key);
    items.push({ variantId, productId, quantity });
  }

  try {
    const result = await tx(async (client) => {
      const variantIds = [...new Set(items.map((item) => item.variantId).filter(Boolean))];
      const productIds = [...new Set(items.map((item) => item.productId).filter(Boolean))];
      const { rows: variants } = variantIds.length > 0
        ? await client.query(
          `SELECT v.id AS variant_id, v.product_id, v.sku, v.stock,
                  p.sku AS product_sku, p.name AS product_name,
                  CASE WHEN COALESCE(v.price, 0) > 0 THEN v.price ELSE p.base_price END AS unit_price
             FROM product_variants v
             JOIN products p ON p.id = v.product_id
            WHERE v.id = ANY($1) AND p.id = ANY($2)
              AND v.active = TRUE AND p.active = TRUE
            FOR UPDATE OF v`,
          [variantIds, productIds],
        )
        : { rows: [] };
      const { rows: products } = productIds.length > 0
        ? await client.query(
          `SELECT p.id AS product_id, p.sku, p.name AS product_name, p.base_price AS unit_price
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
      const missing = [];
      const insufficient = [];
      for (const item of items) {
        const variant = variantById.get(item.variantId);
        const row = variant && Number(variant.product_id) === item.productId
          ? { ...variant, variant_id: Number(variant.variant_id) }
          : (!item.variantId ? productById.get(item.productId) : null);
        if (!row) {
          missing.push(item.variantId || item.productId);
          continue;
        }
        if (row.variant_id && Number(row.stock) < item.quantity) {
          insufficient.push({ variant_id: row.variant_id, stock: Number(row.stock), requested: item.quantity });
          continue;
        }
        const unitPrice = Math.max(0, Math.round(Number(row.unit_price) || 0));
        resolved.push({ ...item, variantId: row.variant_id || null, productName: row.product_name, sku: row.sku || row.product_sku || '', unitPrice });
      }
      if (missing.length > 0) return { error: 'cart_changed', missing };
      if (insufficient.length > 0) return { error: 'insufficient_stock', insufficient };

      const { rows: sequence } = await client.query(`SELECT nextval(pg_get_serial_sequence('orders', 'id'))::integer AS id`);
      const orderId = sequence[0].id;
      const orderNumber = `TS-${new Date().getFullYear()}-${String(orderId).padStart(5, '0')}`;
      const subtotal = resolved.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      // Conservamos las notas dentro del bloque de despacho porque pueden
      // contener el conjunto, torre y apartamento que necesita logística.
      const shippingAddress = JSON.stringify({
        address,
        city,
        notes,
        ...(hasLatitude && hasLongitude ? { latitude, longitude } : {}),
      });
      await client.query(
        `INSERT INTO orders
           (id, order_number, customer_email, customer_name, customer_phone,
            status, subtotal, shipping, tax, total, shipping_address, notes, expires_at)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6, 0, 0, $6, $7::jsonb, $8,
                 NOW() + ($9::integer * INTERVAL '1 minute'))`,
        [orderId, orderNumber, customerEmail, customerName, customerPhone, subtotal, shippingAddress, notes, ORDER_PENDING_TTL_MINUTES],
      );
      for (const item of resolved) {
        await client.query(
          `INSERT INTO order_items
             (order_id, variant_id, product_name, variant_sku, quantity, unit_price, line_total)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [orderId, item.variantId, item.productName, item.sku, item.quantity, item.unitPrice, item.unitPrice * item.quantity],
        );
      }
      await reserveOrderStock(client, {
        orderId,
        orderNumber,
        items: resolved,
      });
      return {
        order: {
          id: orderId,
          order_number: orderNumber,
          status: 'pending',
          total: subtotal,
          expires_at: new Date(Date.now() + ORDER_PENDING_TTL_MINUTES * 60 * 1000).toISOString(),
        },
      };
    });

    if (result.error === 'cart_changed') {
      return json(res, 409, { ok: false, error: result.error, message: 'El carrito cambió. Actualiza la página y revisa tus productos.', missing_variant_ids: result.missing });
    }
    if (result.error === 'insufficient_stock') {
      return json(res, 409, { ok: false, error: result.error, message: 'Una o más cantidades ya no están disponibles. Actualiza el carrito.', items: result.insufficient });
    }
    return json(res, 201, { ok: true, order: result.order });
  } catch (error) {
    if (error instanceof InsufficientReservationError) {
      return json(res, 409, {
        ok: false,
        error: 'insufficient_stock',
        message: 'Una o más cantidades ya no están disponibles. Actualiza el carrito.',
        items: error.items,
      });
    }
    return json(res, 500, { ok: false, error: 'order_creation_failed', message: 'No pudimos registrar el pedido. Intenta nuevamente.' });
  }
}
