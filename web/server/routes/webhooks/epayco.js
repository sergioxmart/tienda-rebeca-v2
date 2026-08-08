// Confirmación de ePayco. La respuesta del navegador no cambia pedidos: solo
// esta notificación firmada puede aprobarlos.

import { createHash, timingSafeEqual } from 'node:crypto';
import { tx } from '../../lib/db.js';
import { json } from '../../lib/json.js';
import { env } from '../../lib/env.js';
import { commitOrderStock } from '../../lib/order-stock.js';

const FINAL_PAYMENT_STATUSES = new Set(['approved', 'declined', 'error', 'refunded', 'voided']);

function readBody(req) {
  if (req.method === 'GET') {
    const url = new URL(req.url || '/', 'http://localhost');
    return Promise.resolve(Object.fromEntries(url.searchParams.entries()));
  }
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

function value(payload, ...keys) {
  for (const key of keys) {
    if (payload[key] !== undefined && payload[key] !== null) return String(payload[key]);
  }
  return '';
}

function signatureMatches(payload) {
  const ref = value(payload, 'x_ref_payco');
  const transaction = value(payload, 'x_transaction_id');
  const amount = value(payload, 'x_amount');
  const currency = value(payload, 'x_currency_code');
  const received = value(payload, 'x_signature').toLowerCase();
  if (!env.EPAYCO_CUSTOMER_ID || !env.EPAYCO_P_KEY || !ref || !transaction || !amount || !currency || !received) return false;
  const expected = createHash('sha256')
    .update(`${env.EPAYCO_CUSTOMER_ID}^${env.EPAYCO_P_KEY}^${ref}^${transaction}^${amount}^${currency}`)
    .digest('hex');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(received, 'utf8');
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

function paymentStatus(payload) {
  const response = value(payload, 'x_response', 'x_respuesta').toLowerCase();
  const code = value(payload, 'x_cod_response', 'x_cod_respuesta');
  const state = value(payload, 'x_transaction_state', 'x_cod_transaction_state').toLowerCase();
  if (code === '1' || ['aceptada', 'accepted', 'aprobada', 'approved', 'ok'].includes(response) || ['aceptada', 'accepted', 'aprobada', 'approved'].includes(state)) return 'approved';
  if (['2', '3', '4', '5'].includes(code) || ['rechazada', 'rejected', 'declined', 'fallida', 'failed', 'error'].includes(response) || ['rechazada', 'rejected', 'declined', 'fallida', 'failed', 'error'].includes(state)) return 'declined';
  return 'pending';
}

function amountMatches(order, payload) {
  const received = Number(value(payload, 'x_amount'));
  return Number.isFinite(received) && Math.round(received * 100) === Math.round(Number(order.total) * 100);
}

export async function handleEpaycoWebhook(req, res) {
  let payload;
  try {
    payload = await readBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'invalid_webhook_body' });
  }

  const ref = value(payload, 'x_ref_payco');
  const invoice = value(payload, 'x_id_invoice', 'x_id_factura', 'x_extra2');
  if (!ref || !invoice || !signatureMatches(payload)) {
    return json(res, 400, { ok: false, error: 'invalid_epayco_signature' });
  }
  if (value(payload, 'x_test_request') && env.EPAYCO_TEST !== ['true', '1', 'yes'].includes(value(payload, 'x_test_request').toLowerCase())) {
    return json(res, 400, { ok: false, error: 'epayco_environment_mismatch' });
  }

  try {
    const result = await tx(async (client) => {
      // x_ref_payco es la llave de idempotencia. El advisory lock cubre el
      // caso de dos reintentos que llegan exactamente al mismo tiempo.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`epayco:${ref}`]);
      const { rows: known } = await client.query(
        `SELECT id, status FROM payments
          WHERE provider = 'epayco' AND provider_transaction_id = $1
          FOR UPDATE`,
        [ref],
      );
      if (known[0] && FINAL_PAYMENT_STATUSES.has(known[0].status)) return { duplicate: true, status: known[0].status };

      const { rows: orders } = await client.query(
        `SELECT id, order_number, total, status FROM orders WHERE order_number = $1 FOR UPDATE`,
        [invoice],
      );
      const order = orders[0];
      if (!order) return { error: 'order_not_found' };
      if (!amountMatches(order, payload) || value(payload, 'x_currency_code').toUpperCase() !== 'COP') return { error: 'amount_mismatch' };

      const status = paymentStatus(payload);
      const raw = JSON.stringify(payload);
      const method = value(payload, 'x_franchise', 'x_business');
      const { rows: pending } = await client.query(
        `SELECT id FROM payments
          WHERE order_id = $1 AND provider = 'epayco' AND status = 'pending'
          ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [order.id],
      );
      if (pending[0]) {
        await client.query(
          `UPDATE payments
              SET provider_transaction_id = $1, status = $2, payment_method = $3,
                  raw_response = $4::jsonb
            WHERE id = $5`,
          [ref, status, method, raw, pending[0].id],
        );
      } else {
        await client.query(
          `INSERT INTO payments
             (order_id, provider, provider_transaction_id, status, amount, currency, payment_method, raw_response)
           VALUES ($1, 'epayco', $2, $3, $4, 'COP', $5, $6::jsonb)`,
          [order.id, ref, status, Math.round(Number(order.total) || 0), method, raw],
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
  } catch (error) {
    // ePayco reintenta cuando no recibe 200. Un fallo transitorio de DB debe
    // conservar un 500 para que el proveedor vuelva a enviar el evento.
    return json(res, 500, { ok: false, error: 'webhook_processing_failed' });
  }
}
