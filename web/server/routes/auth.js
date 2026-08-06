// Endpoints de auth: login, logout, refresh, me, 2FA setup/enable/disable.
//
// Schema de TechStore (ver 005_admin_auth.sql y 009_auth_admin_extras.sql):
//   auth_users.totp_secret_enc   TEXT  -- AES-GCM cifrado
//   auth_users.totp_enabled      BOOL
//   auth_users.totp_enabled_at   TIMESTAMPTZ
//   auth_users.last_login_at     TIMESTAMPTZ
//   auth_audit_log               tabla para acciones críticas
//
// Flujo de 2FA:
//   1. Cliente loguea → si totp_enabled=true, requiere totp_code.
//   2. Admin quiere activar 2FA:
//      a) POST /api/auth/2fa/setup  → genera secret, guarda totp_secret_enc
//         (totp_enabled sigue false), devuelve otpauth_uri + backup_codes.
//      b) Cliente escanea QR, ingresa código, llama
//         POST /api/auth/2fa/enable { totp_code } → si válido, totp_enabled=true.
//   3. Admin quiere desactivar 2FA:
//      POST /api/auth/2fa/disable { password } → si pass válido, totp_enabled=false
//      y borra el secret.
//
// Rate limit: `recordAttempt` quedó de Rebeca pero la tabla
// `auth_login_attempts` no existe en el schema de TechStore. El rate-limit
// de login se hace en memoria via `rateLimit()` middleware (si lo queremos
// en backend). Por ahora NO hay rate-limit (es lo que tiene Rebeca también
// si mirás el código actual: `recordAttempt` insert en una tabla que sí
// existe en Rebeca pero no en TechStore).

import { query, tx } from '../lib/db.js';
import {
  hashPassword, verifyPassword,
  signAccessToken,
  generateRefreshToken, hashRefreshToken, refreshTokenExpiry,
} from '../lib/auth.js';
import {
  decryptTotpSecret, encryptTotpSecret, generateTotpSecret,
  generateBackupCodes, hashBackupCode, totpUri, verifyTotp,
} from '../../../core/lib/totp.js';
import {
  setRefreshCookie, setCsrfCookie, clearAuthCookies, getRefreshFromCookie,
} from '../lib/cookies.js';
import { generateCsrfToken } from '../lib/csrf.js';
import { requireAuth } from '../middleware/auth.js';
import { log } from '../lib/logger.js';
import { env } from '../lib/env.js';
import { clientIp } from '../lib/client-ip.js';
import { readJsonBody } from '../lib/body.js';
import { json } from '../lib/json.js';
import { isValidEmail } from '../lib/email.js';

// --- Helpers --------------------------------------------------------------

async function recordAudit(userId, action, ip, meta) {
  if (!userId) return;  // defensivo: tests sin user seteado
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

async function issueSession(req, res, user) {
  const ip = clientIp(req);
  const ua = req.headers['user-agent'] || '';
  const access = signAccessToken({ userId: user.id, email: user.email, role: user.role });
  const refresh = generateRefreshToken();
  const refreshHash = hashRefreshToken(refresh);
  const expiresAt = refreshTokenExpiry();

  await query(
    `INSERT INTO auth_refresh_tokens (user_id, token_hash, user_agent, ip, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, refreshHash, ua, ip, expiresAt],
  );
  await query(
    `UPDATE auth_users SET last_login_at = NOW() WHERE id = $1`,
    [user.id],
  );

  const csrf = generateCsrfToken();
  setRefreshCookie(res, refresh);
  setCsrfCookie(res, csrf);
  await recordAudit(user.id, 'login', ip, { ua });

  return json(res, 200, {
    ok: true,
    data: {
      access_token: access,
      expires_in: env.ACCESS_TTL_MIN * 60,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    },
  });
}

// --- POST /api/auth/login ------------------------------------------------

async function handleLogin(req, res) {
  let body;
  try { body = await readJsonBody(req); }
  catch { return json(res, 400, { ok: false, error: 'invalid_json' }); }

  const { email, password, totp_code: totpCode } = body;
  if (!isValidEmail(email) || typeof password !== 'string' || !password) {
    return json(res, 400, { ok: false, error: 'invalid_input' });
  }

  const ip = clientIp(req);
  const emailLower = email.toLowerCase();

  const { rows } = await query(
    `SELECT id, email, password_hash, name, role, active,
            totp_enabled, totp_secret_enc
       FROM auth_users WHERE email = $1`,
    [emailLower],
  );
  const user = rows[0];

  if (!user || !user.active) {
    return json(res, 401, { ok: false, error: 'invalid_credentials' });
  }

  const passOk = await verifyPassword(password, user.password_hash);
  if (!passOk) {
    await recordAudit(user.id, 'login_failed', ip, { reason: 'bad_password' });
    return json(res, 401, { ok: false, error: 'invalid_credentials' });
  }

  // Si 2FA está activo, exigir código TOTP
  if (user.totp_enabled) {
    const secret = user.totp_secret_enc && decryptTotpSecret(user.totp_secret_enc);
    if (!secret || !totpCode || !verifyTotp(secret, totpCode)) {
      await recordAudit(user.id, 'login_failed', ip, { reason: 'bad_totp' });
      return json(res, 401, { ok: false, error: 'two_factor_required' });
    }
  }

  return issueSession(req, res, user);
}

// --- POST /api/auth/logout -----------------------------------------------

async function handleLogout(req, res) {
  const refresh = getRefreshFromCookie(req);
  if (refresh) {
    const hash = hashRefreshToken(refresh);
    await query(
      `UPDATE auth_refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1`,
      [hash],
    );
  }
  clearAuthCookies(res);
  return json(res, 200, { ok: true });
}

// --- POST /api/auth/refresh ----------------------------------------------

async function handleRefresh(req, res) {
  const refresh = getRefreshFromCookie(req);
  if (!refresh) return json(res, 401, { ok: false, error: 'no_refresh' });

  const hash = hashRefreshToken(refresh);
  const { rows } = await query(
    `SELECT t.id, t.user_id, t.expires_at, t.revoked_at,
            u.email, u.role, u.active
       FROM auth_refresh_tokens t
       JOIN auth_users u ON u.id = t.user_id
      WHERE t.token_hash = $1`,
    [hash],
  );
  const tok = rows[0];

  if (!tok || !tok.active || new Date(tok.expires_at) < new Date()) {
    clearAuthCookies(res);
    return json(res, 401, { ok: false, error: 'invalid_refresh' });
  }

  // Período de gracia para rotación concurrente (dos pestañas abiertas).
  if (tok.revoked_at) {
    const ageMs = Date.now() - new Date(tok.revoked_at).getTime();
    if (ageMs > 30_000) {
      clearAuthCookies(res);
      return json(res, 401, { ok: false, error: 'invalid_refresh' });
    }
    const access = signAccessToken({ userId: tok.user_id, email: tok.email, role: tok.role });
    return json(res, 200, {
      ok: true,
      data: { access_token: access, expires_in: env.ACCESS_TTL_MIN * 60 },
    });
  }

  // Rotar
  const newRefresh = generateRefreshToken();
  const newHash = hashRefreshToken(newRefresh);
  const expiresAt = refreshTokenExpiry();
  const ip = clientIp(req);
  const ua = req.headers['user-agent'] || '';

  await query(`UPDATE auth_refresh_tokens SET revoked_at = NOW() WHERE id = $1`, [tok.id]);
  await query(
    `INSERT INTO auth_refresh_tokens (user_id, token_hash, user_agent, ip, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [tok.user_id, newHash, ua, ip, expiresAt],
  );

  const access = signAccessToken({ userId: tok.user_id, email: tok.email, role: tok.role });
  const csrf = generateCsrfToken();
  setRefreshCookie(res, newRefresh);
  setCsrfCookie(res, csrf);
  await recordAudit(tok.user_id, 'refresh', ip, {});

  return json(res, 200, {
    ok: true,
    data: { access_token: access, expires_in: env.ACCESS_TTL_MIN * 60 },
  });
}

// --- GET /api/auth/me ----------------------------------------------------

async function handleMe(req, res) {
  const { rows } = await query(
    `SELECT id, email, name, role, active, totp_enabled, last_login_at, created_at
       FROM auth_users WHERE id = $1`,
    [req.user.id],
  );
  if (!rows[0] || !rows[0].active) {
    return json(res, 401, { ok: false, error: 'user_disabled' });
  }
  const csrf = generateCsrfToken();
  setCsrfCookie(res, csrf);
  return json(res, 200, { ok: true, data: rows[0] });
}

// --- POST /api/auth/2fa/setup --------------------------------------------
// Auth requerida. Genera un secret nuevo, lo guarda (totp_enabled sigue
// false hasta que el user confirme con un código). Devuelve la otpauth URI
// para el QR y los códigos de respaldo.

async function handleTwoFactorSetup(req, res) {
  const { rows: existing } = await query(
    `SELECT totp_enabled, totp_secret_enc FROM auth_users WHERE id = $1`,
    [req.user.id],
  );
  if (existing[0]?.totp_enabled) {
    return json(res, 400, { ok: false, error: 'two_factor_already_enabled' });
  }

  const secret = generateTotpSecret();
  const encrypted = encryptTotpSecret(secret);
  const backupCodes = generateBackupCodes(10);

  // Guardar el secret y los backup codes hasheados. Si falla el enable
  // después, el admin puede llamar /api/auth/2fa/disable para limpiar.
  await tx(async (client) => {
    await client.query(
      `UPDATE auth_users SET totp_secret_enc = $1 WHERE id = $2`,
      [encrypted, req.user.id],
    );
    // Borrar backup codes anteriores (por si reintenta el setup)
    await client.query(
      `DELETE FROM auth_totp_backup_codes WHERE user_id = $1`,
      [req.user.id],
    );
    for (const code of backupCodes) {
      await client.query(
        `INSERT INTO auth_totp_backup_codes (user_id, code_hash) VALUES ($1, $2)`,
        [req.user.id, await hashBackupCode(code)],
      );
    }
  });

  await recordAudit(req.user.id, 'two_factor_setup', clientIp(req), {});

  return json(res, 200, {
    ok: true,
    data: {
      otpauth_uri: totpUri({ email: req.user.email, issuer: 'TechStore Admin', secret }),
      backup_codes: backupCodes,  // se muestran UNA vez; el server guarda solo el hash
    },
  });
}

// --- POST /api/auth/2fa/enable -------------------------------------------
// Auth requerida. Body: { totp_code }. Verifica que el código coincida con
// el secret guardado en setup. Si OK, marca totp_enabled = true.

async function handleTwoFactorEnable(req, res) {
  let body;
  try { body = await readJsonBody(req); }
  catch { return json(res, 400, { ok: false, error: 'invalid_json' }); }
  const { totp_code: totpCode } = body;
  if (typeof totpCode !== 'string' || !/^\d{6}$/.test(totpCode)) {
    return json(res, 400, { ok: false, error: 'invalid_code' });
  }

  const { rows } = await query(
    `SELECT totp_enabled, totp_secret_enc FROM auth_users WHERE id = $1`,
    [req.user.id],
  );
  const user = rows[0];
  if (!user) return json(res, 401, { ok: false, error: 'unknown_user' });
  if (user.totp_enabled) {
    return json(res, 400, { ok: false, error: 'two_factor_already_enabled' });
  }
  if (!user.totp_secret_enc) {
    return json(res, 400, { ok: false, error: 'two_factor_setup_required' });
  }

  const secret = decryptTotpSecret(user.totp_secret_enc);
  if (!secret || !verifyTotp(secret, totpCode)) {
    return json(res, 401, { ok: false, error: 'invalid_code' });
  }

  await query(
    `UPDATE auth_users SET totp_enabled = TRUE, totp_enabled_at = NOW() WHERE id = $1`,
    [req.user.id],
  );
  await recordAudit(req.user.id, 'two_factor_enable', clientIp(req), {});

  return json(res, 200, { ok: true });
}

// --- POST /api/auth/2fa/disable ------------------------------------------
// Auth requerida. Body: { password }. Verifica password, luego desactiva
// 2FA y borra el secret + los backup codes.

async function handleTwoFactorDisable(req, res) {
  let body;
  try { body = await readJsonBody(req); }
  catch { return json(res, 400, { ok: false, error: 'invalid_json' }); }
  const { password } = body;
  if (typeof password !== 'string' || !password) {
    return json(res, 400, { ok: false, error: 'invalid_input' });
  }

  const { rows } = await query(
    `SELECT password_hash, totp_enabled FROM auth_users WHERE id = $1`,
    [req.user.id],
  );
  const user = rows[0];
  if (!user) return json(res, 401, { ok: false, error: 'unknown_user' });

  const passOk = await verifyPassword(password, user.password_hash);
  if (!passOk) return json(res, 401, { ok: false, error: 'invalid_password' });

  await tx(async (client) => {
    await client.query(
      `UPDATE auth_users SET totp_enabled = FALSE, totp_secret_enc = '',
                                 totp_enabled_at = NULL WHERE id = $1`,
      [req.user.id],
    );
    await client.query(
      `DELETE FROM auth_totp_backup_codes WHERE user_id = $1`,
      [req.user.id],
    );
  });
  await recordAudit(req.user.id, 'two_factor_disable', clientIp(req), {});

  return json(res, 200, { ok: true });
}

// --- Router --------------------------------------------------------------

export async function handleAuth(req, res) {
  const url = req.url || '/';
  const method = req.method || 'GET';
  const pathname = url.split('?')[0];

  if (pathname === '/api/auth/health') {
    return json(res, 200, { ok: true, scope: 'auth' });
  }

  if (method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (pathname === '/api/auth/login'    && method === 'POST') return handleLogin(req, res);
  if (pathname === '/api/auth/logout'   && method === 'POST') return handleLogout(req, res);
  if (pathname === '/api/auth/refresh'  && method === 'POST') return handleRefresh(req, res);
  if (pathname === '/api/auth/me'       && method === 'GET')  return requireAuth(req, res, () => handleMe(req, res));
  if (pathname === '/api/auth/2fa/setup'   && method === 'POST') return requireAuth(req, res, () => handleTwoFactorSetup(req, res));
  if (pathname === '/api/auth/2fa/enable'  && method === 'POST') return requireAuth(req, res, () => handleTwoFactorEnable(req, res));
  if (pathname === '/api/auth/2fa/disable' && method === 'POST') return requireAuth(req, res, () => handleTwoFactorDisable(req, res));

  return json(res, 404, { ok: false, error: 'not_found' });
}
