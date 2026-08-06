// Middleware: verifica JWT del header Authorization.
// Si ok → deja req.user y sigue.
// Si falla → 401 (o sigue sin user si es opcional).

import { verifyAccessToken } from '../lib/auth.js';
import { getRefreshFromCookie } from '../lib/cookies.js';
import { log } from '../lib/logger.js';

const BEARER = /^Bearer\s+(.+)$/i;

function extractToken(req) {
  const h = req.headers.authorization;
  if (h) {
    const m = BEARER.exec(h);
    if (m) return m[1].trim();
  }
  // Permitimos access token también por query solo en casos especiales (downloads)
  // — desactivado por defecto.
  return null;
}

export function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not_authenticated' }));
    return;
  }
  const payload = verifyAccessToken(token);
  if (!payload) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'invalid_token' }));
    return;
  }
  req.user = {
    id: payload.sub,
    email: payload.email,
    role: payload.role,
  };
  next();
}

export function optionalAuth(req, _res, next) {
  const token = extractToken(req);
  if (token) {
    const payload = verifyAccessToken(token);
    if (payload) {
      req.user = { id: payload.sub, email: payload.email, role: payload.role };
    }
  }
  next();
}

// Verifica que el rol esté en la lista permitida.
export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'not_authenticated' }));
      return;
    }
    if (!allowed.includes(req.user.role)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'forbidden' }));
      return;
    }
    next();
  };
}
