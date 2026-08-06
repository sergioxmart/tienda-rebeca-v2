// Helpers de auth: hash, JWT, refresh tokens.

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'node:crypto';
import { env } from './env.js';

const BCRYPT_ROUNDS = 10;

// --- Passwords -------------------------------------------------------------

export async function hashPassword(plain) {
  if (typeof plain !== 'string' || plain.length < 8) {
    throw new Error('Password debe tener al menos 8 caracteres');
  }
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain, hash) {
  if (!plain || !hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

// --- Access tokens (JWT) ---------------------------------------------------

export function signAccessToken({ userId, email, role }) {
  return jwt.sign(
    { sub: userId, email, role, typ: 'access' },
    env.JWT_SECRET,
    { expiresIn: env.ACCESS_TTL_MIN * 60, algorithm: 'HS256' },
  );
}

export function verifyAccessToken(token) {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    if (payload.typ !== 'access') return null;
    return payload;
  } catch {
    return null;
  }
}

// Token breve, de un único propósito, para finalizar el enrolamiento 2FA
// después de que email y contraseña ya fueron validados.
export function signTwoFactorSetupToken({ userId, email }) {
  return jwt.sign(
    { sub: userId, email, typ: 'two_factor_setup' },
    env.JWT_SECRET,
    { expiresIn: '10m', algorithm: 'HS256' },
  );
}

export function verifyTwoFactorSetupToken(token) {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    return payload.typ === 'two_factor_setup' ? payload : null;
  } catch {
    return null;
  }
}

// --- Refresh tokens (opacos, hasheados en DB) ------------------------------

export function generateRefreshToken() {
  // 32 bytes random, base64url
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function refreshTokenExpiry() {
  const d = new Date();
  d.setDate(d.getDate() + env.REFRESH_TTL_DAYS);
  return d;
}

// --- Roles ----------------------------------------------------------------

export const ROLES = ['admin', 'operator', 'viewer'];
export function isValidRole(r) {
  return ROLES.includes(r);
}
