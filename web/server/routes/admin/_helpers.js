// Helpers compartidos por los routers de admin.
//
// Patrón:
//   - protect(handler, section) envuelve un handler con requireAuth + CSRF +
//     check de SECTION_PERMS. Cualquier ruta nueva DEBE tener section (si
//     falta, devuelve 403 — defensa en profundidad).
//   - recordAudit registra acción en auth_audit_log. Best-effort (no rompe
//     el handler si falla).
//   - slugify genera slugs URL-friendly.
//   - json / error son shortcuts para responder.
//
// Estas funciones reemplazan las que estaban duplicadas en el admin.js
// monolítico. Mantienen la misma firma para que migrar handlers sea
// cambiar el `import` de lugar.

import { query } from '../../lib/db.js';
import { requireAuth } from '../../../../core/middleware/auth.js';
import { csrf } from '../../../../core/middleware/csrf.js';
import { log } from '../../lib/logger.js';
import { json } from '../../lib/json.js';
import { readJsonBody } from '../../lib/body.js';
import { SECTION_PERMS } from './_section_perms.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Envuelve un handler con auth + CSRF + check de permisos.
 *
 *   protect(handler, 'products')(req, res, ...args)
 *
 * El `section` es la clave en SECTION_PERMS. Si falta, devuelve 403.
 */
const BODY_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Envuelve un handler con la lectura del body JSON.
 *
 * Los handlers asumen que `req.body` ya está parseado. Si el método es
 * POST/PATCH/PUT/DELETE, leemos el body UNA vez (el stream se consume).
 * Si falla el parse, respondemos 400 invalid_json.
 *
 * Para métodos seguros (GET/HEAD/OPTIONS) no leemos body.
 */
export function withJsonBody(handler) {
  return async (req, res, ...args) => {
    if (BODY_METHODS.has(req.method) && req.body === undefined) {
      try {
        req.body = await readJsonBody(req);
      } catch {
        return json(res, 400, { ok: false, error: 'invalid_json' });
      }
    }
    if (req.body === undefined) req.body = {};
    return handler(req, res, ...args);
  };
}

export function protect(handler, section) {
  return (req, res, ...args) => {
    requireAuth(req, res, () => {
      const perms = SECTION_PERMS[section];
      if (!perms) {
        log.error('admin route sin SECTION_PERMS', { section, url: req.url });
        return json(res, 403, { ok: false, error: 'forbidden' });
      }
      const role = req.user?.role;
      const isSafe = SAFE_METHODS.has(req.method);
      const allowed = isSafe ? perms.read : perms.write;
      if (!allowed.includes(role)) {
        return json(res, 403, { ok: false, error: 'forbidden' });
      }
      csrf(req, res, () => {
        Promise.resolve(withJsonBody(handler)(req, res, ...args))
          .catch((err) => {
            log.error('admin handler error', { url: req.url, msg: err.message });
            if (!res.headersSent) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: 'internal_error' }));
            }
          });
      });
    });
  };
}

/**
 * Registra una acción en auth_audit_log. Best-effort: si falla, loggea
 * pero no rompe el handler principal.
 *
 * Si `userId` es falsy (tests, scripts sin auth), no hace nada. En
 * producción SIEMPRE va a haber userId porque `protect` lo setea.
 */
export async function recordAudit(userId, action, ip, meta) {
  if (!userId) return;
  try {
    await query(
      `INSERT INTO auth_audit_log (user_id, action, ip, meta)
       VALUES ($1, $2, $3, $4)`,
      [userId, action, ip || '', meta || {}],
    );
  } catch (e) {
    log.error('recordAudit failed', e.message);
  }
}

/**
 * Genera un slug URL-friendly: lowercase, sin tildes, solo a-z 0-9 y `-`,
 * max 60 chars. Si el input queda vacío, devuelve ''.
 */
export function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // sin tildes
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Validadores reusables. Devuelven `null` si está OK, o un string con
 * el mensaje de error si está mal. Pensados para usar con `errors.push(...)`.
 */
export const validators = {
  required(v, field, { max = 500 } = {}) {
    // Acepta string no-vacío o number distinto de 0.
    if (v === undefined || v === null) return `${field} requerido`;
    if (typeof v === 'string') {
      if (!v.trim()) return `${field} requerido`;
      if (v.length > max) return `${field} demasiado largo (max ${max})`;
      return null;
    }
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return `${field} inválido`;
      return null;
    }
    return `${field} requerido`;
  },
  requiredString(v, field, { max = 500 } = {}) {
    if (typeof v !== 'string' || !v.trim()) return `${field} requerido`;
    if (v.length > max) return `${field} demasiado largo (max ${max})`;
    return null;
  },
  optionalString(v, field, { max = 500 } = {}) {
    if (v === undefined || v === null) return null;
    if (typeof v !== 'string') return `${field} debe ser string`;
    if (v.length > max) return `${field} demasiado largo (max ${max})`;
    return null;
  },
  slug(v, field) {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v !== 'string' || !/^[a-z0-9-]+$/.test(v)) {
      return `${field} inválido (solo a-z, 0-9, -)`;
    }
    return null;
  },
  int(v, field, { min = -Infinity, max = Infinity } = {}) {
    const n = Number(v);
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      return `${field} debe ser entero`;
    }
    if (n < min) return `${field} debe ser >= ${min}`;
    if (n > max) return `${field} debe ser <= ${max}`;
    return null;
  },
  bool(v, field) {
    if (typeof v !== 'boolean') return `${field} debe ser boolean`;
    return null;
  },
  oneOf(v, field, options) {
    if (!options.includes(v)) {
      return `${field} debe ser uno de: ${options.join(', ')}`;
    }
    return null;
  },
};

/**
 * Helper para validar payload. Itera los validadores declarados, junta
 * los errores. Si hay, responde 400 con `{ ok:false, error, errors }`.
 *
 *   validate(res, payload, [
 *     validators.requiredString(payload.name, 'name'),
 *     validators.slug(payload.slug, 'slug'),
 *   ]);
 *   if (res.writableEnded) return;  // ya respondió
 *
 * Cada item del array `checks` es un string de error o null. Se filtran
 * los nulls y se concatenan los mensajes. Si hay errores, responde 400.
 *
 * Devuelve `true` si OK, `false` si ya respondió con 400.
 */
export function validate(res, payload, checks) {
  const errors = [];
  for (const err of checks) {
    if (err) errors.push(err);
  }
  if (errors.length) {
    json(res, 400, { ok: false, error: 'invalid_payload', errors });
    return false;
  }
  return true;
}

/** Shortcut para 404. */
export function notFound(res) {
  return json(res, 404, { ok: false, error: 'not_found' });
}

/** Shortcut para 409 con mensaje custom. */
export function conflict(res, error = 'conflict', extras = {}) {
  return json(res, 409, { ok: false, error, ...extras });
}
