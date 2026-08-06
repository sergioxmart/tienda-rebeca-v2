// Rutas admin para users (cuentas admin del panel).
//
// El admin gestiona las cuentas: crear, cambiar role, activar/desactivar,
// reset password. Cada acción se registra en auth_audit_log.
//
// Endpoints:
//   GET    /api/admin/users                    → lista
//   GET    /api/admin/users/:id                → detalle
//   POST   /api/admin/users                    → crear (body: { email, password, name?, role? })
//   PATCH  /api/admin/users/:id                → editar (body: { name?, role?, active? })
//   POST   /api/admin/users/:id/reset-password → reset (body: { new_password })
//   DELETE /api/admin/users/:id                → soft-delete (active=false, no se borra de DB)
//
// Notas:
//   - Solo admin puede escribir (SECCIÓN users.write: ['admin']).
//   - El user no puede desactivarse a sí mismo (defensa en profundidad).
//   - El password se hashea con bcrypt (factor 10 de core/lib/auth.js).
//   - 2FA NO se toca desde acá. El user la activa/desactiva por su cuenta
//     desde /api/auth/2fa/*.

import { query } from '../../lib/db.js';
import { log } from '../../lib/logger.js';
import { json } from '../../lib/json.js';
import { hashPassword } from '../../../../core/lib/auth.js';
import { isValidEmail } from '../../../../core/lib/email.js';
import { protect, recordAudit, validators, validate, notFound, conflict } from './_helpers.js';

// --- Handlers -------------------------------------------------------------

export async function listUsers(req, res) {
  const { rows } = await query(
    `SELECT id, email, name, role, active, totp_enabled, last_login_at, created_at, updated_at
       FROM auth_users
       ORDER BY created_at, id`,
  );
  return json(res, 200, { ok: true, users: rows });
}

export async function getUser(req, res, id) {
  const { rows } = await query(
    `SELECT id, email, name, role, active, totp_enabled, last_login_at, created_at, updated_at
       FROM auth_users WHERE id = $1`,
    [id],
  );
  if (rows.length === 0) return notFound(res);
  return json(res, 200, { ok: true, user: rows[0] });
}

export async function createUser(req, res) {
  const p = req.body || {};
  if (!validate(res, p, [
    validators.requiredString(p.email, 'email', { max: 200 }),
    validators.requiredString(p.password, 'password', { max: 200 }),
    p.name !== undefined && validators.optionalString(p.name, 'name', { max: 100 }),
    p.role !== undefined && validators.oneOf(p.role, 'role', ['admin', 'operator', 'viewer']),
  ])) return;

  if (!isValidEmail(p.email)) return json(res, 400, { ok: false, error: 'invalid_email' });
  if (p.password.length < 8) {
    return json(res, 400, { ok: false, error: 'password_too_short', min: 8 });
  }

  const hash = await hashPassword(p.password);
  try {
    const { rows } = await query(
      `INSERT INTO auth_users (email, password_hash, name, role, active)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING id, email, name, role, active, totp_enabled, last_login_at, created_at, updated_at`,
      [p.email.toLowerCase(), hash, p.name ?? '', p.role ?? 'admin'],
    );
    await recordAudit(req.user?.id, 'user.create', req.ip, { id: rows[0].id, email: rows[0].email });
    log.info('user created', { id: rows[0].id, email: rows[0].email, by: req.user?.email });
    return json(res, 201, { ok: true, user: rows[0] });
  } catch (err) {
    if (err.code === '23505') return conflict(res, 'email_already_exists', { email: p.email });
    throw err;
  }
}

export async function updateUser(req, res, id) {
  const { rows: existing } = await query('SELECT id, email FROM auth_users WHERE id = $1', [id]);
  if (existing.length === 0) return notFound(res);

  // Defensa: el admin no se puede desactivar a sí mismo.
  if (Number(req.user?.id) === Number(id) && req.body?.active === false) {
    return json(res, 400, { ok: false, error: 'cannot_deactivate_self' });
  }

  const p = req.body || {};
  if (!validate(res, p, [
    p.name !== undefined && validators.optionalString(p.name, 'name', { max: 100 }),
    p.role !== undefined && validators.oneOf(p.role, 'role', ['admin', 'operator', 'viewer']),
    p.active !== undefined && validators.bool(p.active, 'active'),
  ])) return;

  const fields = [];
  const values = [];
  let i = 1;
  if (p.name !== undefined)   { fields.push(`name = $${i++}`);   values.push(p.name); }
  if (p.role !== undefined)   { fields.push(`role = $${i++}`);   values.push(p.role); }
  if (p.active !== undefined) { fields.push(`active = $${i++}`); values.push(p.active); }
  if (fields.length === 0) return json(res, 400, { ok: false, error: 'nothing_to_update' });
  values.push(id);

  const { rows } = await query(
    `UPDATE auth_users SET ${fields.join(', ')} WHERE id = $${i}
      RETURNING id, email, name, role, active, totp_enabled, last_login_at, created_at, updated_at`,
    values,
  );
  await recordAudit(req.user?.id, 'user.update', req.ip, { id, fields: Object.keys(p) });
  return json(res, 200, { ok: true, user: rows[0] });
}

export async function resetUserPassword(req, res, id) {
  const { rows: existing } = await query('SELECT id FROM auth_users WHERE id = $1', [id]);
  if (existing.length === 0) return notFound(res);

  const p = req.body || {};
  if (typeof p.new_password !== 'string' || p.new_password.length < 8) {
    return json(res, 400, { ok: false, error: 'password_too_short', min: 8 });
  }

  const hash = await hashPassword(p.new_password);
  await query(`UPDATE auth_users SET password_hash = $1 WHERE id = $2`, [hash, id]);
  // Revocar todos los refresh tokens del user (lo fuerza a relogin)
  await query(
    `UPDATE auth_refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
    [id],
  );
  await recordAudit(req.user?.id, 'user.reset_password', req.ip, { id });
  log.info('user password reset', { id, by: req.user?.email });
  return json(res, 200, { ok: true });
}

export async function deleteUser(req, res, id) {
  if (Number(req.user?.id) === Number(id)) {
    return json(res, 400, { ok: false, error: 'cannot_delete_self' });
  }
  const { rows: existing } = await query('SELECT id FROM auth_users WHERE id = $1', [id]);
  if (existing.length === 0) return notFound(res);

  // Soft-delete: en vez de borrar la fila (que rompería audit_log FK),
  // marcamos active=false. El user no puede loguear pero su historial queda.
  await query(`UPDATE auth_users SET active = FALSE WHERE id = $1`, [id]);
  await query(
    `UPDATE auth_refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
    [id],
  );
  await recordAudit(req.user?.id, 'user.delete', req.ip, { id });
  log.info('user soft-deleted', { id, by: req.user?.email });
  return json(res, 200, { ok: true });
}

// --- Router ---------------------------------------------------------------

const routes = [
  { method: 'GET',    pattern: /^\/api\/admin\/users\/?$/,                     handler: listUsers,        section: 'users' },
  { method: 'GET',    pattern: /^\/api\/admin\/users\/(\d+)\/?$/,              handler: getUser,          section: 'users' },
  { method: 'POST',   pattern: /^\/api\/admin\/users\/?$/,                     handler: createUser,       section: 'users' },
  { method: 'PATCH',  pattern: /^\/api\/admin\/users\/(\d+)\/?$/,              handler: updateUser,       section: 'users' },
  { method: 'POST',   pattern: /^\/api\/admin\/users\/(\d+)\/reset-password\/?$/, handler: resetUserPassword, section: 'users' },
  { method: 'DELETE', pattern: /^\/api\/admin\/users\/(\d+)\/?$/,              handler: deleteUser,       section: 'users' },
];

export async function tryHandleUsers(req, res) {
  const method = req.method || 'GET';
  const pathname = (req.url || '/').split('?')[0];
  for (const route of routes) {
    if (route.method !== method) continue;
    const m = route.pattern.exec(pathname);
    if (!m) continue;
    return protect(route.handler, route.section)(req, res, m[1]) || true;
  }
  return false;
}
