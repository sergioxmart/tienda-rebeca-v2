// Crea o reutiliza la intención de pago de un pedido pendiente.
// POST /api/public/checkout/payment-intent

import { query, tx } from '../../lib/db.js';
import { readJsonBody } from '../../lib/body.js';
import { json } from '../../lib/json.js';
import { expirePendingOrders } from '../../lib/order-expiration.js';
import { env } from '../../lib/env.js';
import {
  createCheckoutSession,
  EpaycoApiError,
  EpaycoConfigurationError,
} from '../../lib/epayco.js';
import {
  createCheckoutPreference,
  MercadoPagoApiError,
  MercadoPagoConfigurationError,
} from '../../lib/mercadopago.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkoutShape(sessionId) {
  return {
    session_id: sessionId,
    script_url: env.EPAYCO_CHECKOUT_URL,
    type: 'onpage',
    test: env.EPAYCO_TEST,
  };
}

function paymentResponse(sessionId, reused = false) {
  return {
    ok: true,
    payment: {
      provider: 'epayco',
      reused,
      checkout: checkoutShape(sessionId),
    },
  };
}

function mercadoPagoResponse(preference, reused = false) {
  const redirectUrl = env.MERCADOPAGO_TEST
    ? (preference.sandbox_init_point || preference.init_point)
    : preference.init_point;
  return {
    ok: true,
    payment: {
      provider: 'mercadopago',
      reused,
      checkout: {
        type: 'redirect',
        preference_id: String(preference.id),
        redirect_url: redirectUrl,
        test: env.MERCADOPAGO_TEST,
      },
    },
  };
}

async function createMercadoPagoIntent(res, orderNumber, email) {
  const { rows: orders } = await query(
    `SELECT id, order_number, customer_email, customer_name, customer_phone,
            total, shipping_address, status
       FROM orders WHERE order_number = $1 LIMIT 1`,
    [orderNumber],
  );
  const order = orders[0];
  if (!order || order.customer_email !== email) {
    return json(res, 404, { ok: false, error: 'order_not_found', message: 'No encontramos ese pedido.' });
  }
  if (order.status !== 'pending') {
    return json(res, 409, { ok: false, error: 'order_not_pending', message: 'Este pedido ya no está pendiente de pago.' });
  }

  const { rows: existing } = await query(
    `SELECT raw_response->>'preferenceId' AS preference_id,
            raw_response->>'initPoint' AS init_point,
            raw_response->>'sandboxInitPoint' AS sandbox_init_point
       FROM payments
      WHERE order_id = $1 AND provider = 'mercadopago' AND status = 'pending'
        AND raw_response->>'preferenceId' IS NOT NULL
      ORDER BY created_at DESC LIMIT 1`,
    [order.id],
  );
  if (existing[0]?.preference_id) {
    return json(res, 200, mercadoPagoResponse({
      id: existing[0].preference_id,
      init_point: existing[0].init_point,
      sandbox_init_point: existing[0].sandbox_init_point,
    }, true));
  }

  const { rows: items } = await query(
    `SELECT id AS item_id, variant_id, product_name, variant_sku, quantity, unit_price
       FROM order_items WHERE order_id = $1 ORDER BY id`,
    [order.id],
  );
  if (items.length === 0) {
    return json(res, 409, { ok: false, error: 'order_without_items', message: 'El pedido no tiene productos para cobrar.' });
  }
  const { rows: siteRows } = await query(
    `SELECT COALESCE(value #>> '{}', 'TechStore') AS site_name
       FROM site_config WHERE key = 'site_name' LIMIT 1`,
  );
  const preference = await createCheckoutPreference({
    order: { ...order, items },
    siteName: siteRows[0]?.site_name,
  });
  if (!preference?.id || !(preference.init_point || preference.sandbox_init_point)) {
    throw new MercadoPagoApiError('Mercado Pago no devolvió una URL de Checkout Pro.');
  }

  const inserted = await tx(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`mercadopago:${order.order_number}`]);
    const { rows: concurrent } = await client.query(
      `SELECT raw_response FROM payments
        WHERE order_id = $1 AND provider = 'mercadopago' AND status = 'pending'
          AND raw_response->>'preferenceId' IS NOT NULL
        ORDER BY created_at DESC LIMIT 1`,
      [order.id],
    );
    if (concurrent[0]?.raw_response?.preferenceId) return { preference: concurrent[0].raw_response, reused: true };
    const snapshot = {
      preferenceId: String(preference.id),
      initPoint: preference.init_point || null,
      sandboxInitPoint: preference.sandbox_init_point || null,
    };
    await client.query(
      `INSERT INTO payments
         (order_id, provider, provider_transaction_id, status, amount, currency, raw_response)
       VALUES ($1, 'mercadopago', $2, 'pending', $3, 'COP', $4::jsonb)`,
      [order.id, `preference:${preference.id}`, Math.round(Number(order.total) || 0), JSON.stringify(snapshot)],
    );
    return { preference: snapshot, reused: false };
  });
  return json(res, 200, mercadoPagoResponse({
    id: inserted.preference.preferenceId,
    init_point: inserted.preference.initPoint,
    sandbox_init_point: inserted.preference.sandboxInitPoint,
  }, inserted.reused));
}

export async function createPaymentIntent(req, res) {
  await expirePendingOrders().catch(() => {});
  const body = await readJsonBody(req).catch(() => null);
  const orderNumber = typeof body?.order_number === 'string' ? body.order_number.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const provider = body?.provider === 'mercadopago' ? 'mercadopago' : 'epayco';
  if (!/^TS-[0-9]{4}-[0-9]+$/.test(orderNumber) || !EMAIL_RE.test(email)) {
    return json(res, 400, {
      ok: false,
      error: 'invalid_payment_intent',
      message: 'El pedido y el correo no tienen un formato válido.',
    });
  }

  try {
    if (provider === 'mercadopago') return await createMercadoPagoIntent(res, orderNumber, email);
    const { rows: orders } = await query(
      `SELECT id, order_number, customer_email, customer_name, customer_phone,
              total, shipping_address, status
         FROM orders
        WHERE order_number = $1
        LIMIT 1`,
      [orderNumber],
    );
    const order = orders[0];
    if (!order || order.customer_email !== email) {
      return json(res, 404, { ok: false, error: 'order_not_found', message: 'No encontramos ese pedido.' });
    }
    if (order.status !== 'pending') {
      return json(res, 409, { ok: false, error: 'order_not_pending', message: 'Este pedido ya no está pendiente de pago.' });
    }

    const { rows: existing } = await query(
      `SELECT raw_response->>'sessionId' AS session_id
         FROM payments
        WHERE order_id = $1 AND provider = 'epayco' AND status = 'pending'
          AND raw_response->>'sessionId' IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 1`,
      [order.id],
    );
    if (existing[0]?.session_id) return json(res, 200, paymentResponse(existing[0].session_id, true));

    const { rows: siteRows } = await query(
      `SELECT COALESCE(value #>> '{}', 'TechStore') AS site_name
         FROM site_config WHERE key = 'site_name' LIMIT 1`,
    );
    const { sessionId } = await createCheckoutSession({ order, siteName: siteRows[0]?.site_name });

    const inserted = await tx(async (client) => {
      // Evita crear dos registros para el mismo pedido si el usuario hace
      // doble clic mientras una petición anterior termina con ePayco.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [order.order_number]);
      const { rows: concurrent } = await client.query(
        `SELECT raw_response->>'sessionId' AS session_id
           FROM payments
          WHERE order_id = $1 AND provider = 'epayco' AND status = 'pending'
            AND raw_response->>'sessionId' IS NOT NULL
          ORDER BY created_at DESC LIMIT 1`,
        [order.id],
      );
      if (concurrent[0]?.session_id) return { sessionId: concurrent[0].session_id, reused: true };

      await client.query(
        `INSERT INTO payments
           (order_id, provider, provider_transaction_id, status, amount, currency, raw_response)
         VALUES ($1, 'epayco', $2, 'pending', $3, 'COP', $4::jsonb)`,
        [order.id, `session:${sessionId}`, Math.round(Number(order.total) || 0), JSON.stringify({ sessionId, checkout_version: '2' })],
      );
      return { sessionId, reused: false };
    });

    return json(res, 200, paymentResponse(inserted.sessionId, inserted.reused));
  } catch (error) {
    if (error instanceof EpaycoConfigurationError) {
      return json(res, 503, { ok: false, error: error.code, message: error.message });
    }
    if (error instanceof EpaycoApiError) {
      return json(res, 502, { ok: false, error: error.code, message: error.message });
    }
    if (error instanceof MercadoPagoConfigurationError) {
      return json(res, 503, { ok: false, error: error.code, message: error.message });
    }
    if (error instanceof MercadoPagoApiError) {
      return json(res, 502, { ok: false, error: error.code, message: error.message });
    }
    return json(res, 500, { ok: false, error: 'payment_intent_failed', message: 'No pudimos iniciar el pago. Intenta nuevamente.' });
  }
}
