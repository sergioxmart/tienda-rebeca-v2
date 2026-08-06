// TOTP (RFC 6238) y cifrado de secretos 2FA para las cuentas del panel.

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { env } from './env.js';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;

function base32Decode(value) {
  let bits = 0;
  let buffer = 0;
  const bytes = [];
  for (const char of String(value).toUpperCase().replace(/[=\s-]/g, '')) {
    const index = BASE32.indexOf(char);
    if (index < 0) return null;
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret() {
  const bytes = randomBytes(20);
  let bits = 0;
  let buffer = 0;
  let result = '';
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += BASE32[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) result += BASE32[(buffer << (5 - bits)) & 31];
  return result;
}

export function verifyTotp(secret, code, { timestamp = Date.now(), window = 1 } = {}) {
  if (!/^\d{6}$/.test(String(code))) return false;
  const key = base32Decode(secret);
  if (!key?.length) return false;
  const counter = Math.floor(timestamp / 1000 / STEP_SECONDS);
  for (let offset = -window; offset <= window; offset += 1) {
    const input = Buffer.alloc(8);
    input.writeBigUInt64BE(BigInt(counter + offset));
    const digest = createHmac('sha1', key).update(input).digest();
    const start = digest[digest.length - 1] & 0x0f;
    const expected = String(((digest.readUInt32BE(start) & 0x7fffffff) % 1_000_000)).padStart(6, '0');
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(String(code)))) return true;
  }
  return false;
}

function encryptionKey() {
  return createHash('sha256').update(`${env.JWT_SECRET}:totp-secret:v1`).digest();
}

// Los secretos se necesitan para comprobar TOTP, por eso se cifran (AES-GCM)
// y no se hashean. El secreto de JWT deriva la llave sin sumar otra variable.
export function encryptTotpSecret(secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}

export function decryptTotpSecret(value) {
  try {
    const input = Buffer.from(value, 'base64url');
    const iv = input.subarray(0, 12);
    const tag = input.subarray(12, 28);
    const encrypted = input.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export function totpUri({ email, issuer, secret }) {
  const label = `${issuer}:${email}`;
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}

// --- Backup codes --------------------------------------------------------
// Códigos de respaldo para 2FA: si el user pierde el dispositivo, puede
// usar uno de estos en lugar del TOTP. Se generan una sola vez al setup,
// se muestran al user UNA vez, y se guardan hasheados (scrypt) en la DB.

// Genera N códigos aleatorios en formato XXXX-XXXX (16 chars, alfanum).
// Devuelve un array de strings plain (NUNCA se guardan así, solo se muestran).
export function generateBackupCodes(count = 10) {
  const codes = [];
  for (let i = 0; i < count; i += 1) {
    const bytes = randomBytes(8);
    let s = '';
    for (const byte of bytes) {
      s += byte.toString(36).padStart(2, '0');
    }
    // Tomar 8 chars y meter guion: XXXX-XXXX
    const code = `${s.slice(0, 4).toUpperCase()}-${s.slice(4, 8).toUpperCase()}`;
    codes.push(code);
  }
  return codes;
}

// Hashea un código de respaldo con scrypt (derivación de key con salt fijo
// derivado del JWT_SECRET). NO es tan seguro como bcrypt pero es suficiente
// para códigos de un solo uso, y nos ahorra una dep.
//
// El server compara con timingSafeEqual para evitar timing attacks.
export function hashBackupCode(code) {
  const normalized = String(code).trim().toUpperCase();
  const salt = createHash('sha256').update(`${env.JWT_SECRET}:backup-code:v1`).digest();
  return scryptSync(normalized, salt, 32).toString('base64url');
}

export function verifyBackupCode(code, hash) {
  const candidate = hashBackupCode(code);
  const a = Buffer.from(candidate);
  const b = Buffer.from(String(hash));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
