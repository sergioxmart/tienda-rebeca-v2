// Captura pública de leads de alquiler desde la ficha de producto.

import { query, tx } from '../../lib/db.js';
import { readJsonBody } from '../../lib/body.js';
import { json } from '../../lib/json.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function clean(value, max = 300) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function positiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function createReservationLead(req, res) {
  const body = await readJsonBody(req).catch(() => null);
  const productId = positiveId(body?.product_id);
  const variantId = positiveId(body?.variant_id);
  const name = clean(body?.name, 160);
  const email = clean(body?.email, 254).toLowerCase();
  const phone = clean(body?.phone, 40);
  const useDate = clean(body?.use_date, 10);
  const pickupDate = clean(body?.pickup_date, 10);
  const requestedType = body?.requested_type;

  if (!productId || !name || !phone || !EMAIL_RE.test(email)) {
    return json(res, 400, { ok: false, error: 'invalid_lead_contact', message: 'Completa nombre, correo y teléfono.' });
  }
  if (!DATE_RE.test(useDate) || !DATE_RE.test(pickupDate)) {
    return json(res, 400, { ok: false, error: 'invalid_reservation_date', message: 'Revisa las fechas de uso y recogida.' });
  }
  if (!['alquiler', 'alquiler_nuevo'].includes(requestedType)) {
    return json(res, 400, { ok: false, error: 'invalid_requested_type' });
  }

  try {
    const result = await tx(async (client) => {
      const { rows: products } = await client.query(
        `SELECT p.id, p.name, p.base_price, p.active,
                v.id AS variant_id, v.sku AS variant_sku,
                COALESCE(v.price, p.base_price) AS quoted_amount
           FROM products p
           LEFT JOIN product_variants v ON v.id = $2 AND v.product_id = p.id AND v.active = TRUE
          WHERE p.id = $1 AND p.active = TRUE`,
        [productId, variantId],
      );
      const product = products[0];
      if (!product || (variantId && !product.variant_id)) return { error: 'product_not_found' };

      const { rows: customerRows } = await client.query(
        `INSERT INTO customer_accounts (email, name, phone)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE
           SET name = CASE WHEN EXCLUDED.name <> '' THEN EXCLUDED.name ELSE customer_accounts.name END,
               phone = CASE WHEN EXCLUDED.phone <> '' THEN EXCLUDED.phone ELSE customer_accounts.phone END
         RETURNING id`,
        [email, name, phone],
      );
      const customerId = customerRows[0].id;

      const { rows: existing } = await client.query(
        `SELECT id, reservation_number
           FROM reservations
          WHERE lower(customer_email) = $1
            AND product_id = $2
            AND (variant_id = $3 OR (variant_id IS NULL AND $3::integer IS NULL))
            AND status = 'lead'
            AND created_at > NOW() - INTERVAL '12 hours'
          ORDER BY created_at DESC
          LIMIT 1
          FOR UPDATE`,
        [email, productId, variantId],
      );

      let reservation;
      if (existing[0]) {
        const { rows } = await client.query(
          `UPDATE reservations
              SET customer_id = $1, product_name = $2, variant_sku = $3,
                  requested_type = $4, customer_name = $5, customer_phone = $6,
                  use_date = $7, pickup_date = $8, quoted_amount = $9,
                  updated_at = NOW()
            WHERE id = $10
            RETURNING id, reservation_number, status`,
          [customerId, product.name, product.variant_sku || '', requestedType, name, phone, useDate, pickupDate, Math.max(0, Math.round(Number(product.quoted_amount) || 0)), existing[0].id],
        );
        reservation = rows[0];
      } else {
        const { rows: sequence } = await client.query(`SELECT nextval(pg_get_serial_sequence('reservations', 'id'))::integer AS id`);
        const reservationNumber = `LEAD-${new Date().getFullYear()}-${String(sequence[0].id).padStart(5, '0')}`;
        const { rows } = await client.query(
          `INSERT INTO reservations
             (id, reservation_number, customer_id, product_id, variant_id,
              product_name, variant_sku, requested_type, customer_email,
              customer_name, customer_phone, use_date, pickup_date,
              status, quoted_amount, lead_source)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'lead', $14, 'store')
           RETURNING id, reservation_number, status`,
          [sequence[0].id, reservationNumber, customerId, productId, product.variant_id || null,
            product.name, product.variant_sku || '', requestedType, email, name, phone,
            useDate, pickupDate, Math.max(0, Math.round(Number(product.quoted_amount) || 0))],
        );
        reservation = rows[0];
      }
      return { reservation };
    });

    if (result.error === 'product_not_found') {
      return json(res, 404, { ok: false, error: result.error, message: 'El producto o la variante ya no está disponible.' });
    }
    return json(res, 201, { ok: true, reservation: result.reservation });
  } catch {
    return json(res, 500, { ok: false, error: 'reservation_lead_failed', message: 'No pudimos guardar la solicitud de reserva.' });
  }
}
