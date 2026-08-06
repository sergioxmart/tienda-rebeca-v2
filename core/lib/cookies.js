// Helpers para cookies httpOnly / SameSite / Secure.

import { serialize } from 'cookie';
import { env } from './env.js';

function isProd() {
  return env.NODE_ENV === 'production';
}

const REFRESH_OPTS = {
  httpOnly: true,
  secure:   isProd(),
  sameSite: 'lax',
  path:     '/',
  // maxAge lo setea el caller en días
};

const CSRF_OPTS = {
  httpOnly: false, // el JS del front lo lee
  secure:   isProd(),
  sameSite: 'strict',
  path:     '/',
  // maxAge lo setea el caller en horas
};

function setCookie(res, name, value, opts = {}) {
  // node:http no soporta múltiples Set-Cookie en setHeader, hay que usar array.
  // Acá acumulamos para que el llamador pueda mandar varias.
  const cookieStr = serialize(name, value, opts);
  const existing = res.getHeader('Set-Cookie');
  if (!existing) {
    res.setHeader('Set-Cookie', cookieStr);
  } else if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookieStr]);
  } else {
    res.setHeader('Set-Cookie', [existing, cookieStr]);
  }
}

export function setRefreshCookie(res, token) {
  setCookie(res, 'refresh_token', token, {
    ...REFRESH_OPTS,
    maxAge: env.REFRESH_TTL_DAYS * 24 * 60 * 60,
  });
}

export function setCsrfCookie(res, token) {
  setCookie(res, 'csrf_token', token, {
    ...CSRF_OPTS,
    maxAge: 24 * 60 * 60, // 24h
  });
}

export function clearAuthCookies(res) {
  setCookie(res, 'refresh_token', '', { ...REFRESH_OPTS, maxAge: 0 });
  setCookie(res, 'csrf_token',    '', { ...CSRF_OPTS,    maxAge: 0 });
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function getRefreshFromCookie(req) {
  return readCookie(req, 'refresh_token');
}

export function getCsrfFromCookie(req) {
  return readCookie(req, 'csrf_token');
}
