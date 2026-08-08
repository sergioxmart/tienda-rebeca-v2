// Webhook de Mercado Pago Checkout Pro.
// La URL de retorno informa al comprador, pero únicamente este webhook
// firmado y la consulta server-to-server del pago pueden actualizar el pedido.

import { WebhookSignatureValidator } from 'mercadopago';
import { query, tx } from '../../lib/db.js';
import { json } from '../../lib/json.js';
import { env } from '../../lib/env.js';
import { getMercadoPagoPayment } from '../../lib/mercadopago.js';
import { commitOrderStock } from '../../lib/order-stock.js';

const FINAL_PAYMENT_STATUSES = new Set(['approved', 'declined', 'error', 'refunded', 'voided']);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 128 * 1024) {
        reject(new Error('webhook_too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      const type = String(req.headers['content-type'] || '').toLowerCase();
      if (type.includes('application/json')) {
        try { return resolve(JSON.parse(raw)); } catch { return reject(new Error('invalid_json')); }
      }
      resolve(Object.fromEntries(new URLSearchParams(raw).entries()));
    });
    req.on('error', reject);
  });
}

function paymentStatus(status) {
  if (status === 'approved') return 'approved';
  if (['refunded', 'charged_back'].includes(status)) return 'refunded';
  if (['rejected', 'cancelled'].includes(status)) return 'declined';
  return 'pending';
}

function validatePaymentAmount(order, payment) {
  return payment.currency_id === 'COP'
    && Number.isFinite(Number(payment.transaction_amount))
    && Math.round(Number(payment.transaction_amount) * 100) === Math.round(Number(order.total) * 100);
}

export async function handleMercadoPagoWebhook(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
  if (!env.MERCADOPAGO_WEBHOOK_SECRET) {
    return json(res, 503, { ok: false, error: 'mercadopago_webhook_not_configured' });
  }

  let payload;
  try {
    payload = await readBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'invalid_webhook_body' });
  }

  const url = new URL(req.url || '/', 'http://localhost');
  const type = String(payload.type || payload.topic || url.searchParams.get('type') || '');
  if (type !== 'payment') return json(res, 200, { ok: true, ignored: true });

  const dataId = String(payload?.data?.id || payload?.id || url.searchParams.get('data.id') || '').trim();
  if (!dataId) return json(res, 400, { ok: false, error: 'payment_id_required' });

  try {
    WebhookSignatureValidator.validate({
      xSignature: req.headers['x-signature'],
      xRequestId: req.headers['x-request-id'],
      dataId,
      secret: env.MERCADOPAGO_WEBHOOK_SECRET,
      toleranceSeconds: 300,
    });
  } catch {
    return json(res, 401, { ok: false, error: 'invalid_mercadopago_signature' });
  }

  try {
    const { rows: known } = await query(
      `SELECT status FROM payments
        WHERE provider = 'mercadopago' AND provider_transaction_id = $1
        LIMIT 1`,
      [dataId],
    );
    if (known[0] && FINAL_PAYMENT_STATUSES.has(known[0].status)) {
      return json(res, 200, { ok: true, duplicate: true, status: known[0].status });
    }

    const payment = await getMercadoPagoPayment(dataId);
    const orderNumber = String(payment.external_reference || '').trim();
    if (!orderNumber) return json(res, 400, { ok: false, error: 'order_reference_missing' });

    const result = await tx(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`mercadopago:${dataId}`]);
      const { rows: repeated } = await client.query(
        `SELECT status FROM payments
          WHERE provider = 'mercadopago' AND provider_transaction_id = $1
          FOR UPDATE`,
        [dataId],
      );
      if (repeated[0] && FINAL_PAYMENT_STATUSES.has(repeated[0].status)) return { duplicate: true, status: repeated[0].status };

      const { rows: orders } = await client.query(
        `SELECT id, order_number, total, status FROM orders WHERE order_number = $1 FOR UPDATE`,
        [orderNumber],
      );
      const order = orders[0];
      if (!order) return { error: 'order_not_found' };
      if (!validatePaymentAmount(order, payment)) return { error: 'amount_mismatch' };

      const status = paymentStatus(payment.status);
      const raw = JSON.stringify(payment);
      const method = String(payment.payment_method_id || '');
      const { rows: pending } = await client.query(
        `SELECT id FROM payments
          WHERE order_id = $1 AND provider = 'mercadopago' AND status = 'pending'
          ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [order.id],
      );
      if (pending[0]) {
        await client.query(
          `UPDATE payments
              SET provider_transaction_id = $1, status = $2, payment_method = $3,
                  amount = $4, raw_response = $5::jsonb
            WHERE id = $6`,
          [dataId, status, method, Math.round(Number(payment.transaction_amount) || 0), raw, pending[0].id],
        );
      } else {
        await client.query(
          `INSERT INTO payments
             (order_id, provider, provider_transaction_id, status, amount, currency, payment_method, raw_response)
           VALUES ($1, 'mercadopago', $2, $3, $4, 'COP', $5, $6::jsonb)`,
          [order.id, dataId, status, Math.round(Number(payment.transaction_amount) || 0), method, raw],
        );
      }
      if (status === 'approved' && order.status === 'pending') {
        await commitOrderStock(client, order.id);
        await client.query(`UPDATE orders SET status = 'paid' WHERE id = $1`, [order.id]);
      }
      return { duplicate: false, status };
    });

    if (result.error === 'order_not_found') return json(res, 404, { ok: false, error: result.error });
    if (result.error === 'amount_mismatch') return json(res, 400, { ok: false, error: result.error });
    return json(res, 200, { ok: true, duplicate: result.duplicate, status: result.status });
  } catch {
    return json(res, 500, { ok: false, error: 'webhook_processing_failed' });
  }
}
