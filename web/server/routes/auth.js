// Endpoints de auth: login, logout, refresh, me, recuperación de contraseña,
// 2FA setup/enable/disable y enrolamiento obligatorio del primer ingreso.
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
  signTwoFactorSetupToken, verifyTwoFactorSetupToken,
} from '../lib/auth.js';
import {
  decryptTotpSecret, encryptTotpSecret, generateTotpSecret,
  generateBackupCodes, hashBackupCode, verifyBackupCode, totpUri, verifyTotp,
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

// El usuario #1 es la cuenta bootstrap: puede entrar sin 2FA y activarlo
// desde Usuarios. Todas las demás cuentas deben completar el enrolamiento
// antes de recibir una sesión.
export const BOOTSTRAP_USER_ID = 1;

export async function createTwoFactorSetup(userId, email) {
  const secret = generateTotpSecret();
  const encrypted = encryptTotpSecret(secret);
  const backupCodes = generateBackupCodes(10);

  await tx(async (client) => {
    await client.query(
      `UPDATE auth_users
          SET totp_secret_enc = $1, totp_enabled = FALSE, totp_enabled_at = NULL
        WHERE id = $2`,
      [encrypted, userId],
    );
    await client.query(`DELETE FROM auth_totp_backup_codes WHERE user_id = $1`, [userId]);
    for (const code of backupCodes) {
      await client.query(
        `INSERT INTO auth_totp_backup_codes (user_id, code_hash) VALUES ($1, $2)`,
        [userId, await hashBackupCode(code)],
      );
    }
  });

  return {
    otpauth_uri: totpUri({ email, issuer: 'TechStore Admin', secret }),
    backup_codes: backupCodes,
  };
}

export async function resetTwoFactor(userId) {
  await tx(async (client) => {
    await client.query(
      `UPDATE auth_users
          SET totp_enabled = FALSE, totp_secret_enc = '', totp_enabled_at = NULL
        WHERE id = $1`,
      [userId],
    );
    await client.query(`DELETE FROM auth_totp_backup_codes WHERE user_id = $1`, [userId]);
  });
}

async function verifySecondFactor(userId, encryptedSecret, code) {
  const normalized = String(code || '').trim().toUpperCase();
  const secret = encryptedSecret && decryptTotpSecret(encryptedSecret);
  if (secret && verifyTotp(secret, normalized)) return true;

  // Los códigos de respaldo son de un solo uso. El lock evita que dos
  // solicitudes simultáneas consuman el mismo código.
  return tx(async (client) => {
    const { rows } = await client.query(
      `SELECT id, code_hash
         FROM auth_totp_backup_codes
        WHERE user_id = $1 AND used_at IS NULL
        FOR UPDATE`,
      [userId],
    );
    for (const row of rows) {
      if (verifyBackupCode(normalized, row.code_hash)) {
        await client.query(`UPDATE auth_totp_backup_codes SET used_at = NOW() WHERE id = $1`, [row.id]);
        return true;
      }
    }
    return false;
  });
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

  // User #1 es la única cuenta exenta del enrolamiento automático.
  if (!user.totp_enabled && Number(user.id) !== BOOTSTRAP_USER_ID) {
    return json(res, 403, {
      ok: false,
      error: 'two_factor_setup_required',
      data: {
        setup_token: signTwoFactorSetupToken({ userId: user.id, email: user.email }),
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      },
    });
  }

  // Si 2FA está activo, exigir TOTP o código de respaldo.
  if (user.totp_enabled) {
    if (!totpCode || !(await verifySecondFactor(user.id, user.totp_secret_enc, totpCode))) {
      await recordAudit(user.id, 'login_failed', ip, { reason: 'bad_totp' });
      return json(res, 401, { ok: false, error: 'two_factor_required' });
    }
  }

  return issueSession(req, res, user);
}

// --- Password recovery wizard -------------------------------------------
// El navegador solo recibe un token opaco para la siguiente etapa. Cada
// token se guarda hasheado, expira en 10 minutos y se consume una sola vez.
async function handlePasswordRecoveryStart(req, res) {
  let body;
  try { body = await readJsonBody(req); }
  catch { return json(res, 400, { ok: false, error: 'invalid_json' }); }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!isValidEmail(email)) {
    return json(res, 400, { ok: false, error: 'invalid_input' });
  }

  const { rows } = await query(
    `SELECT id, email, active, totp_enabled
       FROM auth_users WHERE email = $1`,
    [email],
  );
  const user = rows[0];
  if (!user || !user.active || !user.totp_enabled) {
    return json(res, 401, { ok: false, error: 'recovery_email_not_available' });
  }

  const token = generateRefreshToken();
  await query(
    `INSERT INTO auth_password_recovery_tokens (user_id, token_hash, purpose, expires_at, ip)
     VALUES ($1, $2, 'email', NOW() + INTERVAL '10 minutes', $3)`,
    [user.id, hashRefreshToken(token), clientIp(req)],
  );
  return json(res, 200, { ok: true, data: { recovery_token: token } });
}

async function handlePasswordRecoveryVerify(req, res) {
  let body;
  try { body = await readJsonBody(req); }
  catch { return json(res, 400, { ok: false, error: 'invalid_json' }); }
  if (typeof body.recovery_token !== 'string' || typeof body.totp_code !== 'string') {
    return json(res, 400, { ok: false, error: 'invalid_input' });
  }

  const { rows } = await query(
    `SELECT r.id, r.user_id, u.email, u.active, u.totp_enabled, u.totp_secret_enc
       FROM auth_password_recovery_tokens r
       JOIN auth_users u ON u.id = r.user_id
      WHERE r.token_hash = $1 AND r.purpose = 'email'
        AND r.used_at IS NULL AND r.expires_at > NOW()`,
    [hashRefreshToken(body.recovery_token)],
  );
  const recovery = rows[0];
  if (!recovery || !recovery.active || !recovery.totp_enabled ||
      !(await verifySecondFactor(recovery.user_id, recovery.totp_secret_enc, body.totp_code))) {
    if (recovery) await recordAudit(recovery.user_id, 'password_recovery_failed', clientIp(req), { stage: 'two_factor' });
    return json(res, 401, { ok: false, error: 'invalid_recovery_code' });
  }

  const passwordToken = generateRefreshToken();
  const promoted = await tx(async (client) => {
    const consumed = await client.query(
      `UPDATE auth_password_recovery_tokens
          SET used_at = NOW()
        WHERE id = $1 AND used_at IS NULL AND expires_at > NOW()
      RETURNING id`,
      [recovery.id],
    );
    if (consumed.rowCount !== 1) return false;
    await client.query(
      `INSERT INTO auth_password_recovery_tokens (user_id, token_hash, purpose, expires_at, ip)
       VALUES ($1, $2, 'password', NOW() + INTERVAL '10 minutes', $3)`,
      [recovery.user_id, hashRefreshToken(passwordToken), clientIp(req)],
    );
    return true;
  });
  if (!promoted) return json(res, 401, { ok: false, error: 'invalid_recovery_code' });
  return json(res, 200, { ok: true, data: { password_token: passwordToken } });
}

async function handlePasswordRecoveryComplete(req, res) {
  let body;
  try { body = await readJsonBody(req); }
  catch { return json(res, 400, { ok: false, error: 'invalid_json' }); }
  if (typeof body.password_token !== 'string' ||
      typeof body.new_password !== 'string' || body.new_password.length < 8) {
    return json(res, 400, { ok: false, error: 'invalid_input' });
  }

  const passwordHash = await hashPassword(body.new_password);
  const result = await tx(async (client) => {
    const { rows } = await client.query(
      `SELECT id, user_id
         FROM auth_password_recovery_tokens
        WHERE token_hash = $1 AND purpose = 'password'
          AND used_at IS NULL AND expires_at > NOW()
        FOR UPDATE`,
      [hashRefreshToken(body.password_token)],
    );
    const token = rows[0];
    if (!token) return null;
    await client.query(`UPDATE auth_password_recovery_tokens SET used_at = NOW() WHERE id = $1`, [token.id]);
    await client.query(`UPDATE auth_users SET password_hash = $1 WHERE id = $2`, [passwordHash, token.user_id]);
    await client.query(
      `UPDATE auth_refresh_tokens SET revoked_at = NOW()
        WHERE user_id = $1 AND revoked_at IS NULL`,
      [token.user_id],
    );
    return token.user_id;
  });
  if (!result) return json(res, 401, { ok: false, error: 'invalid_recovery_token' });
  await recordAudit(result, 'password_recovered', clientIp(req), {});
  return json(res, 200, { ok: true });
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

  const setup = await createTwoFactorSetup(req.user.id, req.user.email);

  await recordAudit(req.user.id, 'two_factor_setup', clientIp(req), {});

  return json(res, 200, {
    ok: true,
    data: {
      ...setup, // los códigos se muestran UNA vez; el server guarda solo el hash
    },
  });
}

// --- POST /api/auth/2fa/first-setup --------------------------------------
// Completa la preparación del QR usando el token emitido tras validar la
// contraseña en el login, sin crear todavía una sesión autenticada.
async function handleFirstTwoFactorSetup(req, res) {
  let body;
  try { body = await readJsonBody(req); }
  catch { return json(res, 400, { ok: false, error: 'invalid_json' }); }
  const payload = verifyTwoFactorSetupToken(body.setup_token);
  if (!payload) return json(res, 401, { ok: false, error: 'invalid_setup_token' });

  const { rows } = await query(
    `SELECT id, email, name, role, active, totp_enabled FROM auth_users WHERE id = $1`,
    [Number(payload.sub)],
  );
  const user = rows[0];
  if (!user || !user.active || user.totp_enabled || Number(user.id) === BOOTSTRAP_USER_ID) {
    return json(res, 400, { ok: false, error: 'two_factor_setup_unavailable' });
  }
  const setup = await createTwoFactorSetup(user.id, user.email);
  return json(res, 200, { ok: true, data: setup });
}

// --- POST /api/auth/2fa/first-enable -------------------------------------
async function handleFirstTwoFactorEnable(req, res) {
  let body;
  try { body = await readJsonBody(req); }
  catch { return json(res, 400, { ok: false, error: 'invalid_json' }); }
  const payload = verifyTwoFactorSetupToken(body.setup_token);
  if (!payload || typeof body.totp_code !== 'string') {
    return json(res, 401, { ok: false, error: 'invalid_setup_token' });
  }

  const { rows } = await query(
    `SELECT id, email, name, role, active, totp_enabled, totp_secret_enc
       FROM auth_users WHERE id = $1`,
    [Number(payload.sub)],
  );
  const user = rows[0];
  if (!user || !user.active || user.totp_enabled || !user.totp_secret_enc) {
    return json(res, 400, { ok: false, error: 'two_factor_setup_unavailable' });
  }
  if (!(await verifySecondFactor(user.id, user.totp_secret_enc, body.totp_code))) {
    return json(res, 401, { ok: false, error: 'invalid_code' });
  }

  await query(
    `UPDATE auth_users SET totp_enabled = TRUE, totp_enabled_at = NOW() WHERE id = $1`,
    [user.id],
  );
  await recordAudit(user.id, 'two_factor_enable_first_login', clientIp(req), {});
  return issueSession(req, res, user);
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
  if (pathname === '/api/auth/password-recovery/start' && method === 'POST') return handlePasswordRecoveryStart(req, res);
  if (pathname === '/api/auth/password-recovery/verify' && method === 'POST') return handlePasswordRecoveryVerify(req, res);
  if (pathname === '/api/auth/password-recovery/complete' && method === 'POST') return handlePasswordRecoveryComplete(req, res);
  if (pathname === '/api/auth/logout'   && method === 'POST') return handleLogout(req, res);
  if (pathname === '/api/auth/refresh'  && method === 'POST') return handleRefresh(req, res);
  if (pathname === '/api/auth/me'       && method === 'GET')  return requireAuth(req, res, () => handleMe(req, res));
  if (pathname === '/api/auth/2fa/setup'   && method === 'POST') return requireAuth(req, res, () => handleTwoFactorSetup(req, res));
  if (pathname === '/api/auth/2fa/enable'  && method === 'POST') return requireAuth(req, res, () => handleTwoFactorEnable(req, res));
  if (pathname === '/api/auth/2fa/disable' && method === 'POST') return requireAuth(req, res, () => handleTwoFactorDisable(req, res));
  if (pathname === '/api/auth/2fa/first-setup' && method === 'POST') return handleFirstTwoFactorSetup(req, res);
  if (pathname === '/api/auth/2fa/first-enable' && method === 'POST') return handleFirstTwoFactorEnable(req, res);

  return json(res, 404, { ok: false, error: 'not_found' });
}
