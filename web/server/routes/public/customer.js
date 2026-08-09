// Portal público del cliente final.
//
// El acceso no usa contraseña: se envía un PIN de un solo uso al correo y,
// después de validarlo, se crea una sesión opaca en cookie httpOnly.

import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { query, tx } from '../../lib/db.js';
import { readJsonBody } from '../../lib/body.js';
import { json } from '../../lib/json.js';
import { isValidEmail } from '../../../../core/lib/email.js';
import { clientIp } from '../../../../core/lib/client-ip.js';
import { createFailureLimiter } from '../../../../core/middleware/rate-limit.js';
import { sendCustomerOtpEmail } from '../../lib/resend.js';
import {
  cleanCustomerString,
  clearCustomerSessionCookie,
  createCustomerSession,
  getCustomerSession,
  normalizeCustomerEmail,
  publicCustomer,
  revokeCustomerSession,
} from '../../lib/customer-auth.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_TTL_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
const otpLimiter = createFailureLimiter({
  limit: 5,
  windowMs: 15 * 60 * 1000,
  lockoutMs: 15 * 60 * 1000,
});

function keys(req, email = '') {
  const result = [`customer-otp:ip:${clientIp(req)}`];
  if (email) result.push(`customer-otp:email:${email}`);
  return result;
}

function blocked(res) {
  res.setHeader('Retry-After', '900');
  return json(res, 429, {
    ok: false,
    error: 'too_many_attempts',
    message: 'Demasiados intentos. Espera unos minutos e inténtalo nuevamente.',
  });
}

function validateEmail(value) {
  const email = normalizeCustomerEmail(value);
  return EMAIL_RE.test(email) && isValidEmail(email) ? email : '';
}

function hashCode(code) {
  return createHash('sha256').update(String(code)).digest('hex');
}

function codeMatches(code, expectedHash) {
  const actual = Buffer.from(hashCode(code), 'utf8');
  const expected = Buffer.from(String(expectedHash || ''), 'utf8');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function makeOtp() {
  return String(randomInt(100000, 1000000));
}

function addressPayload(row) {
  return {
    id: Number(row.id),
    label: row.label || 'Casa',
    recipient_name: row.recipient_name || '',
    phone: row.phone || '',
    address: row.address,
    city: row.city,
    notes: row.notes || '',
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
  };
}

async function listAddresses(customerId) {
  const { rows } = await query(
    `SELECT id, label, recipient_name, phone, address, city, notes, latitude, longitude
       FROM customer_addresses
      WHERE customer_id = $1
      ORDER BY created_at DESC, id DESC`,
    [customerId],
  );
  return rows.map(addressPayload);
}

async function findCustomerByEmail(email) {
  const { rows } = await query(
    `SELECT id, email, name, phone, last_login_at
       FROM customer_accounts
      WHERE email = $1
      LIMIT 1`,
    [email],
  );
  return rows[0] || null;
}

async function requireCustomer(req, res) {
  const customer = await getCustomerSession(req);
  if (!customer) {
    json(res, 401, { ok: false, error: 'customer_auth_required', message: 'Inicia sesión para continuar.' });
    return null;
  }
  return customer;
}

async function lookupCustomer(req, res) {
  const body = await readJsonBody(req).catch(() => null);
  const email = validateEmail(body?.email);
  if (!email) return json(res, 400, { ok: false, error: 'invalid_email', message: 'Ingresa un correo válido.' });

  const { rows } = await query(
    `SELECT EXISTS (
       SELECT 1 FROM orders WHERE lower(customer_email) = $1
     ) AS has_history`,
    [email],
  );
  return json(res, 200, {
    ok: true,
    has_history: Boolean(rows[0]?.has_history),
    can_login: Boolean(rows[0]?.has_history),
  });
}

async function requestOtp(req, res) {
  const body = await readJsonBody(req).catch(() => null);
  const email = validateEmail(body?.email);
  if (!email) return json(res, 400, { ok: false, error: 'invalid_email', message: 'Ingresa un correo válido.' });

  const rateKeys = keys(req, email);
  if (otpLimiter.check(rateKeys)) return blocked(res);
  const customer = await findCustomerByEmail(email);

  // Respuesta genérica: no revelamos si un correo está registrado. En la
  // práctica las cuentas nacen al crear el primer pedido.
  if (!customer) {
    return json(res, 200, {
      ok: true,
      sent: false,
      message: 'Si el correo tiene pedidos registrados, recibirás un código en unos instantes.',
    });
  }

  const { rows: recent } = await query(
    `SELECT id
       FROM customer_otp_challenges
      WHERE customer_id = $1
        AND purpose = 'login'
        AND created_at > NOW() - INTERVAL '45 seconds'
      LIMIT 1`,
    [customer.id],
  );
  if (recent.length > 0) {
    res.setHeader('Retry-After', '45');
    return json(res, 429, { ok: false, error: 'otp_cooldown', message: 'Espera unos segundos antes de solicitar otro código.' });
  }

  const code = makeOtp();
  await tx(async (client) => {
    await client.query(
      `UPDATE customer_otp_challenges
          SET consumed_at = NOW()
        WHERE customer_id = $1 AND purpose = 'login' AND consumed_at IS NULL`,
      [customer.id],
    );
    await client.query(
      `INSERT INTO customer_otp_challenges
         (customer_id, code_hash, purpose, expires_at, request_ip)
       VALUES ($1, $2, 'login', NOW() + ($3::integer * INTERVAL '1 minute'), $4)`,
      [customer.id, hashCode(code), OTP_TTL_MINUTES, clientIp(req)],
    );
  });

  try {
    const delivery = await sendCustomerOtpEmail({ email, code });
    if (!delivery.sent) throw new Error('email_not_configured');
  } catch (error) {
    // El PIN queda invalidado si el proveedor no pudo entregarlo.
    await query(
      `UPDATE customer_otp_challenges
          SET consumed_at = NOW()
        WHERE customer_id = $1 AND code_hash = $2 AND consumed_at IS NULL`,
      [customer.id, hashCode(code)],
    ).catch(() => {});
    return json(res, 503, { ok: false, error: 'otp_delivery_failed', message: 'No pudimos enviar el código. Intenta nuevamente.' });
  }

  return json(res, 200, { ok: true, sent: true, expires_in_seconds: OTP_TTL_MINUTES * 60 });
}

async function verifyOtp(req, res) {
  const body = await readJsonBody(req).catch(() => null);
  const email = validateEmail(body?.email);
  const code = typeof body?.code === 'string' ? body.code.trim() : String(body?.code || '').trim();
  const rateKeys = keys(req, email);
  if (otpLimiter.check(rateKeys)) return blocked(res);
  if (!email || !/^\d{6}$/.test(code)) {
    otpLimiter.fail(rateKeys);
    return json(res, 401, { ok: false, error: 'invalid_otp', message: 'El código no es válido.' });
  }

  const { rows } = await query(
    `SELECT ch.id AS challenge_id, ch.customer_id, ch.code_hash, ch.attempts,
            c.id AS id, c.email, c.name, c.phone
       FROM customer_otp_challenges ch
       JOIN customer_accounts c ON c.id = ch.customer_id
      WHERE c.email = $1
        AND ch.purpose = 'login'
        AND ch.consumed_at IS NULL
        AND ch.expires_at > NOW()
        AND ch.attempts < $2
      ORDER BY ch.created_at DESC
      LIMIT 1`,
    [email, OTP_MAX_ATTEMPTS],
  );
  const challenge = rows[0];
  if (!challenge || !codeMatches(code, challenge.code_hash)) {
    if (challenge) {
      await query('UPDATE customer_otp_challenges SET attempts = attempts + 1 WHERE id = $1', [challenge.challenge_id]);
    }
    otpLimiter.fail(rateKeys);
    return json(res, 401, { ok: false, error: 'invalid_otp', message: 'El código no es válido o ya expiró.' });
  }

  await query('UPDATE customer_otp_challenges SET consumed_at = NOW() WHERE id = $1', [challenge.challenge_id]);
  await query('UPDATE customer_accounts SET last_login_at = NOW() WHERE id = $1', [challenge.customer_id]);
  otpLimiter.clear(rateKeys);
  await createCustomerSession(res, challenge.customer_id);
  return json(res, 200, {
    ok: true,
    customer: publicCustomer(challenge),
    addresses: await listAddresses(challenge.customer_id),
  });
}

async function getMe(req, res) {
  const customer = await getCustomerSession(req);
  if (!customer) return json(res, 200, { ok: true, authenticated: false, customer: null, addresses: [] });
  return json(res, 200, {
    ok: true,
    authenticated: true,
    customer: publicCustomer(customer),
    addresses: await listAddresses(customer.id),
  });
}

async function logout(req, res) {
  await revokeCustomerSession(req).catch(() => {});
  clearCustomerSessionCookie(res);
  return json(res, 200, { ok: true });
}

async function updateProfile(req, res) {
  const customer = await requireCustomer(req, res);
  if (!customer) return;
  const body = await readJsonBody(req).catch(() => null);
  const name = cleanCustomerString(body?.name, 160);
  const phone = cleanCustomerString(body?.phone, 40);
  if (!name) return json(res, 400, { ok: false, error: 'invalid_profile', message: 'El nombre es obligatorio.' });
  const { rows } = await query(
    `UPDATE customer_accounts
        SET name = $1, phone = $2
      WHERE id = $3
      RETURNING id, email, name, phone`,
    [name, phone, customer.id],
  );
  return json(res, 200, { ok: true, customer: publicCustomer(rows[0]) });
}

async function listOrders(req, res) {
  const customer = await requireCustomer(req, res);
  if (!customer) return;
  const { rows: orders } = await query(
    `SELECT id, order_number, status, subtotal, shipping, tax, total,
            shipping_address, notes, created_at, expires_at
       FROM orders
      WHERE client_id = $1 OR lower(customer_email) = $2
      ORDER BY created_at DESC, id DESC`,
    [customer.id, customer.email],
  );
  const orderIds = orders.map((order) => Number(order.id));
  const { rows: items } = orderIds.length > 0
    ? await query(
      `SELECT order_id, variant_id, product_name, variant_sku, quantity, unit_price, line_total
         FROM order_items WHERE order_id = ANY($1) ORDER BY id`,
      [orderIds],
    )
    : { rows: [] };
  const itemsByOrder = new Map();
  for (const item of items) {
    const list = itemsByOrder.get(Number(item.order_id)) || [];
    list.push({
      variant_id: item.variant_id === null ? null : Number(item.variant_id),
      product_name: item.product_name,
      variant_sku: item.variant_sku,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      line_total: Number(item.line_total),
    });
    itemsByOrder.set(Number(item.order_id), list);
  }
  return json(res, 200, {
    ok: true,
    orders: orders.map((order) => ({
      id: Number(order.id),
      order_number: order.order_number,
      status: order.status,
      subtotal: Number(order.subtotal),
      shipping: Number(order.shipping),
      tax: Number(order.tax),
      total: Number(order.total),
      shipping_address: order.shipping_address || {},
      notes: order.notes || '',
      created_at: order.created_at,
      expires_at: order.expires_at,
      items: itemsByOrder.get(Number(order.id)) || [],
    })),
  });
}

function addressInput(body) {
  const address = cleanCustomerString(body?.address, 300);
  const city = cleanCustomerString(body?.city, 120);
  const latitude = body?.latitude === null || body?.latitude === undefined || body?.latitude === '' ? null : Number(body.latitude);
  const longitude = body?.longitude === null || body?.longitude === undefined || body?.longitude === '' ? null : Number(body.longitude);
  const locationValid = (latitude === null && longitude === null)
    || (Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180);
  if (!address || !city || !locationValid) return null;
  return {
    label: cleanCustomerString(body?.label, 80) || 'Casa',
    recipientName: cleanCustomerString(body?.recipient_name, 160),
    phone: cleanCustomerString(body?.phone, 40),
    address,
    city,
    notes: cleanCustomerString(body?.notes, 1000),
    latitude,
    longitude,
  };
}

async function createAddress(req, res) {
  const customer = await requireCustomer(req, res);
  if (!customer) return;
  const body = await readJsonBody(req).catch(() => null);
  const input = addressInput(body);
  if (!input) return json(res, 400, { ok: false, error: 'invalid_address', message: 'Completa dirección y ciudad, y revisa las coordenadas.' });
  const { rows } = await query(
    `INSERT INTO customer_addresses
       (customer_id, label, recipient_name, phone, address, city, notes, latitude, longitude)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, label, recipient_name, phone, address, city, notes, latitude, longitude`,
    [customer.id, input.label, input.recipientName, input.phone, input.address, input.city, input.notes, input.latitude, input.longitude],
  );
  return json(res, 201, { ok: true, address: addressPayload(rows[0]) });
}

async function updateAddress(req, res, addressId) {
  const customer = await requireCustomer(req, res);
  if (!customer) return;
  const body = await readJsonBody(req).catch(() => null);
  const input = addressInput(body);
  if (!input) return json(res, 400, { ok: false, error: 'invalid_address', message: 'Completa dirección y ciudad, y revisa las coordenadas.' });
  const { rows } = await query(
    `UPDATE customer_addresses
        SET label = $1, recipient_name = $2, phone = $3, address = $4,
            city = $5, notes = $6, latitude = $7, longitude = $8
      WHERE id = $9 AND customer_id = $10
      RETURNING id, label, recipient_name, phone, address, city, notes, latitude, longitude`,
    [input.label, input.recipientName, input.phone, input.address, input.city, input.notes, input.latitude, input.longitude, addressId, customer.id],
  );
  if (!rows[0]) return json(res, 404, { ok: false, error: 'address_not_found', message: 'No encontramos esa dirección.' });
  return json(res, 200, { ok: true, address: addressPayload(rows[0]) });
}

async function deleteAddress(req, res, addressId) {
  const customer = await requireCustomer(req, res);
  if (!customer) return;
  const result = await query('DELETE FROM customer_addresses WHERE id = $1 AND customer_id = $2', [addressId, customer.id]);
  if (result.rowCount === 0) return json(res, 404, { ok: false, error: 'address_not_found', message: 'No encontramos esa dirección.' });
  return json(res, 200, { ok: true });
}

export async function handleCustomer(req, res) {
  const method = req.method || 'GET';
  const pathname = (req.url || '/').split('?')[0];
  if (pathname === '/api/public/customer/lookup' && method === 'POST') return lookupCustomer(req, res);
  if (pathname === '/api/public/customer/auth/request-otp' && method === 'POST') return requestOtp(req, res);
  if (pathname === '/api/public/customer/auth/verify-otp' && method === 'POST') return verifyOtp(req, res);
  if (pathname === '/api/public/customer/auth/logout' && method === 'POST') return logout(req, res);
  if (pathname === '/api/public/customer/me' && method === 'GET') return getMe(req, res);
  if (pathname === '/api/public/customer/profile' && method === 'PATCH') return updateProfile(req, res);
  if (pathname === '/api/public/customer/orders' && method === 'GET') return listOrders(req, res);
  if (pathname === '/api/public/customer/addresses' && method === 'POST') return createAddress(req, res);
  if (pathname === '/api/public/customer/addresses' && method === 'GET') {
    const customer = await requireCustomer(req, res);
    if (!customer) return true;
    return json(res, 200, { ok: true, addresses: await listAddresses(customer.id) });
  }
  const addressMatch = pathname.match(/^\/api\/public\/customer\/addresses\/(\d+)\/?$/);
  if (addressMatch && method === 'PATCH') return updateAddress(req, res, Number(addressMatch[1]));
  if (addressMatch && method === 'DELETE') return deleteAddress(req, res, Number(addressMatch[1]));
  return false;
}
