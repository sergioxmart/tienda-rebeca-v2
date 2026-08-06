import test from 'node:test';
import assert from 'node:assert/strict';
import { decryptTotpSecret, encryptTotpSecret, generateTotpSecret, totpUri, verifyTotp } from '../lib/totp.js';

test('verifica un vector RFC 6238 de seis dígitos', () => {
  // RFC 6238: SHA-1, t=59 → 94287082; la UI usa los últimos seis dígitos.
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(verifyTotp(secret, '287082', { timestamp: 59_000, window: 0 }), true);
  assert.equal(verifyTotp(secret, '287083', { timestamp: 59_000, window: 0 }), false);
});

test('genera, cifra y descifra secretos TOTP', () => {
  const secret = generateTotpSecret();
  assert.match(secret, /^[A-Z2-7]+$/);
  const encrypted = encryptTotpSecret(secret);
  assert.notEqual(encrypted, secret);
  assert.equal(decryptTotpSecret(encrypted), secret);
  assert.match(totpUri({ email: 'admin@example.com', issuer: 'TechStore Admin', secret }), /^otpauth:\/\/totp\//);
});
