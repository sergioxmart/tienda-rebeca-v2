-- ============================================================================
-- TechStore — 012_password_recovery
-- ============================================================================
-- Tokens opacos y de un solo uso para el asistente de recuperación:
--   email -> 2FA -> nueva contraseña.
-- Nunca se guarda el token en claro, solo su hash.
-- ============================================================================

CREATE TABLE IF NOT EXISTS auth_password_recovery_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  purpose     TEXT NOT NULL CHECK (purpose IN ('email', 'password')),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  ip          TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_password_recovery_active_idx
  ON auth_password_recovery_tokens(token_hash, expires_at)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS auth_password_recovery_user_idx
  ON auth_password_recovery_tokens(user_id, created_at DESC);
