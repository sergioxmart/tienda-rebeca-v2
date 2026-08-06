-- ============================================================================
-- TechStore — 005_admin_auth
-- 2026-08-06
-- ============================================================================
-- Auth de admin: login con email + password (bcrypt) + JWT 15 min en memoria
-- del cliente + refresh token 7 días en cookie httpOnly. CSRF double-submit.
--
-- Roles (idénticos a Rebeca, se mantienen para no romper la lógica común):
--   - admin     → todo
--   - operator  → operación diaria, sin gestión de usuarios ni config
--   - viewer    → solo lectura
--
-- 2FA TOTP: el cifrado AES-GCM del secret vive en core/lib/totp.js, no en SQL.
-- El secret se guarda cifrado en auth_users.totp_secret_enc; si está vacío,
-- 2FA está deshabilitado. Los códigos de respaldo se guardan en
-- auth_totp_backup_codes hasheados (bcrypt) para que el admin pueda entrar
-- si pierde el dispositivo.
-- ============================================================================

CREATE TABLE IF NOT EXISTS auth_users (
  id                  SERIAL PRIMARY KEY,
  email               TEXT NOT NULL UNIQUE,
  password_hash       TEXT NOT NULL,          -- bcrypt
  name                TEXT NOT NULL DEFAULT '',
  role                TEXT NOT NULL DEFAULT 'admin'
                        CHECK (role IN ('admin', 'operator', 'viewer')),
  active              BOOLEAN NOT NULL DEFAULT TRUE,

  -- 2FA TOTP. Si totp_enabled=false, los campos quedan vacíos. El secret
  -- se guarda cifrado con AES-GCM (ver core/lib/totp.js#encryptTotpSecret).
  totp_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
  totp_secret_enc     TEXT NOT NULL DEFAULT '',
  totp_enabled_at     TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_users_role_idx ON auth_users(role) WHERE active = TRUE;

-- Refresh tokens (cookie httpOnly, server-side hash). El cliente solo tiene
-- el token plain; el server guarda el hash. Al validar, se hashea y compara.
CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,         -- sha256 del token plain
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  user_agent    TEXT NOT NULL DEFAULT '',
  ip            TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_refresh_tokens_user_idx
  ON auth_refresh_tokens(user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS auth_refresh_tokens_active_idx
  ON auth_refresh_tokens(token_hash) WHERE revoked_at IS NULL;

-- Códigos de respaldo para 2FA. Hasheados con bcrypt para que un leak
-- de DB no le entregue al atacante códigos válidos.
CREATE TABLE IF NOT EXISTS auth_totp_backup_codes (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,                 -- bcrypt del código plain
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_totp_backup_codes_user_idx
  ON auth_totp_backup_codes(user_id) WHERE used_at IS NULL;

-- Triggers
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'auth_users_updated_at') THEN
    CREATE TRIGGER auth_users_updated_at BEFORE UPDATE ON auth_users
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;
