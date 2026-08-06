// CSRF middleware. Para métodos no seguros, verifica que el header
// X-CSRF-Token coincida con la cookie csrf_token.

import { verifyCsrf } from '../lib/csrf.js';
import { getCsrfFromCookie } from '../lib/cookies.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrf(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const cookie = getCsrfFromCookie(req);
  const header = req.headers['x-csrf-token'];
  if (!verifyCsrf(cookie, header)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'csrf_failed' }));
    return;
  }
  next();
}
