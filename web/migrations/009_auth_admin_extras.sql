-- ============================================================================
-- TechStore — 009_auth_admin_extras
-- 2026-08-06
-- ============================================================================
-- Extras del admin que faltaban en 005_admin_auth.sql:
--
--   1. auth_audit_log: registro de acciones críticas del admin (login,
--      logout, cambios de role, resets de password, etc.) para seguridad
--      y debugging. Best-effort: si falla el INSERT, el handler NO rompe
--      (ver `recordAudit()` en web/server/routes/admin/_helpers.js).
--
--   2. auth_users.last_login_at: timestamp del último login exitoso. Lo
--      actualiza el handler de login. Útil para que el admin vea la
--      actividad de los users desde el panel.
--
-- Forward-only: si en el futuro queremos más campos (last_login_ip,
-- failed_login_count, etc.), se agregan acá en una nueva migration.
-- ============================================================================

CREATE TABLE IF NOT EXISTS auth_audit_log (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES auth_users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,                   -- 'login', 'logout', 'attribute.create', etc.
  ip          TEXT NOT NULL DEFAULT '',
  meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_audit_log_user_idx
  ON auth_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_audit_log_action_idx
  ON auth_audit_log(action, created_at DESC);

-- last_login_at en auth_users. ALTER ADD IF NOT EXISTS no es estándar, así
-- que usamos un DO block que verifica information_schema.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'auth_users'
      AND column_name  = 'last_login_at'
  ) THEN
    ALTER TABLE auth_users ADD COLUMN last_login_at TIMESTAMPTZ;
  END IF;
END$$;
