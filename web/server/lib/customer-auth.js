// Sesión de cliente final basada en token opaco httpOnly.
// El token nunca se guarda en claro en PostgreSQL: solo queda su SHA-256.

import { createHash, randomBytes } from 'node:crypto';
import { serialize } from 'cookie';
import { env } from './env.js';
import { query } from './db.js';

const COOKIE_NAME = 'customer_session';
const SESSION_DAYS = 30;

export function normalizeCustomerEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function hashCustomerToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

export function generateCustomerToken() {
  return randomBytes(32).toString('base64url');
}

export function readCustomerCookie(req) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === COOKIE_NAME) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function setCookie(res, value, maxAge) {
  res.setHeader('Set-Cookie', serialize(COOKIE_NAME, value, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  }));
}

export function setCustomerSessionCookie(res, token) {
  setCookie(res, token, SESSION_DAYS * 24 * 60 * 60);
}

export function clearCustomerSessionCookie(res) {
  setCookie(res, '', 0);
}

export async function createCustomerSession(res, customerId) {
  const token = generateCustomerToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await query(
    `INSERT INTO customer_sessions (customer_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [customerId, hashCustomerToken(token), expiresAt],
  );
  setCustomerSessionCookie(res, token);
  return token;
}

export async function getCustomerSession(req) {
  const token = readCustomerCookie(req);
  if (!token) return null;
  const { rows } = await query(
    `SELECT c.id, c.email, c.name, c.phone, c.last_login_at,
            s.id AS session_id
       FROM customer_sessions s
       JOIN customer_accounts c ON c.id = s.customer_id
      WHERE s.token_hash = $1
        AND s.expires_at > NOW()
      LIMIT 1`,
    [hashCustomerToken(token)],
  );
  const customer = rows[0] || null;
  if (customer) {
    await query('UPDATE customer_sessions SET last_used_at = NOW() WHERE id = $1', [customer.session_id]);
  }
  return customer;
}

export async function revokeCustomerSession(req) {
  const token = readCustomerCookie(req);
  if (!token) return;
  await query('DELETE FROM customer_sessions WHERE token_hash = $1', [hashCustomerToken(token)]);
}

export function publicCustomer(row) {
  return row ? {
    id: Number(row.id),
    email: row.email,
    name: row.name || '',
    phone: row.phone || '',
  } : null;
}

export function cleanCustomerString(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

