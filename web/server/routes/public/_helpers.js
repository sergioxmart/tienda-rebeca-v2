// Helpers compartidos por los routers públicos (sin auth).

import { json } from '../../lib/json.js';

export function notFound(res) {
  return json(res, 404, { ok: false, error: 'not_found' });
}

/**
 * Parsea un query param y devuelve un número entero, o null si no es válido.
 * Para filtros tipo `?category_id=1` o `?page=2`.
 */
export function parseIntParam(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n)) return null;
  return n;
}

/**
 * Parsea un query param y devuelve un boolean, o null si no es válido.
 * Acepta 'true'/'false'/'1'/'0'.
 */
export function parseBoolParam(value) {
  if (value === undefined || value === null) return null;
  const v = String(value).toLowerCase();
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return null;
}
