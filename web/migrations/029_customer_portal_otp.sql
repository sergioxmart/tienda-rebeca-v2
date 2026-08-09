-- ============================================================================
-- TechStore — 029_customer_portal_otp
-- 2026-08-09
-- ============================================================================
-- Portal del cliente autenticado por OTP enviado al correo.
-- Los pedidos existentes siguen siendo válidos: client_id es nullable y se
-- conserva el customer_email como snapshot histórico.
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_accounts (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_otp_challenges (
  id            SERIAL PRIMARY KEY,
  customer_id   INTEGER NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  code_hash     TEXT NOT NULL,
  purpose       TEXT NOT NULL DEFAULT 'login' CHECK (purpose IN ('login')),
  expires_at    TIMESTAMPTZ NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  consumed_at   TIMESTAMPTZ,
  request_ip    TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_otp_active_idx
  ON customer_otp_challenges(customer_id, purpose, created_at DESC)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS customer_sessions (
  id            SERIAL PRIMARY KEY,
  customer_id   INTEGER NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS customer_sessions_active_idx
  ON customer_sessions(token_hash, expires_at);

CREATE TABLE IF NOT EXISTS customer_addresses (
  id              SERIAL PRIMARY KEY,
  customer_id     INTEGER NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  label           TEXT NOT NULL DEFAULT 'Casa',
  recipient_name  TEXT NOT NULL DEFAULT '',
  phone           TEXT NOT NULL DEFAULT '',
  address         TEXT NOT NULL,
  city            TEXT NOT NULL,
  notes           TEXT NOT NULL DEFAULT '',
  latitude        NUMERIC(9,6),
  longitude       NUMERIC(9,6),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180))
);

CREATE INDEX IF NOT EXISTS customer_addresses_customer_idx
  ON customer_addresses(customer_id, created_at DESC);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES customer_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_client_idx
  ON orders(client_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'customer_accounts_updated_at') THEN
    CREATE TRIGGER customer_accounts_updated_at BEFORE UPDATE ON customer_accounts
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'customer_addresses_updated_at') THEN
    CREATE TRIGGER customer_addresses_updated_at BEFORE UPDATE ON customer_addresses
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;

-- Permite que clientes con pedidos anteriores también puedan usar el portal.
-- Se toma el registro más reciente por correo y no se modifican snapshots.
INSERT INTO customer_accounts (email, name, phone)
SELECT DISTINCT ON (lower(trim(customer_email)))
       lower(trim(customer_email)), customer_name, customer_phone
  FROM orders
 WHERE trim(customer_email) <> ''
 ORDER BY lower(trim(customer_email)), created_at DESC, id DESC
ON CONFLICT (email) DO NOTHING;

-- Vincula los pedidos históricos con una cuenta cuando el correo ya coincide.
UPDATE orders o
   SET client_id = c.id
  FROM customer_accounts c
 WHERE o.client_id IS NULL
   AND lower(o.customer_email) = c.email;
