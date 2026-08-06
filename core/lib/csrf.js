// CSRF: genera token, verifica token contra cookie.

import { randomBytes, timingSafeEqual } from 'node:crypto';

export function generateCsrfToken() {
  return randomBytes(24).toString('base64url');
}

export function verifyCsrf(cookieToken, headerToken) {
  if (!cookieToken || !headerToken) return false;
  if (cookieToken.length !== headerToken.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(cookieToken),
      Buffer.from(headerToken),
    );
  } catch {
    return false;
  }
}
