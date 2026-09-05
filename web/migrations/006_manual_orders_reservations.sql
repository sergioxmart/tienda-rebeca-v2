-- Pedidos manuales y reservas/leads de alquiler para Rebeca Andrade v2.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS discount NUMERIC(10, 0) NOT NULL DEFAULT 0
    CHECK (discount >= 0);

CREATE TABLE IF NOT EXISTS reservations (
  id               SERIAL PRIMARY KEY,
  reservation_number TEXT NOT NULL UNIQUE,
  customer_id      INTEGER REFERENCES customer_accounts(id) ON DELETE SET NULL,
  product_id       INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id       INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
  product_name     TEXT NOT NULL,
  variant_sku      TEXT NOT NULL DEFAULT '',
  requested_type   TEXT NOT NULL DEFAULT 'alquiler'
    CHECK (requested_type IN ('alquiler', 'alquiler_nuevo')),
  customer_email   TEXT NOT NULL,
  customer_name    TEXT NOT NULL,
  customer_phone   TEXT NOT NULL,
  use_date         DATE NOT NULL,
  pickup_date      DATE NOT NULL,
  status           TEXT NOT NULL DEFAULT 'lead'
    CHECK (status IN ('lead', 'pending', 'confirmed', 'cancelled', 'completed')),
  quoted_amount    NUMERIC(10, 0) NOT NULL DEFAULT 0 CHECK (quoted_amount >= 0),
  payment_method   TEXT NOT NULL DEFAULT '',
  shipping_method  TEXT NOT NULL DEFAULT '',
  notes            TEXT NOT NULL DEFAULT '',
  lead_source      TEXT NOT NULL DEFAULT 'store',
  created_by       INTEGER REFERENCES auth_users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reservations_email_idx
  ON reservations(lower(customer_email), created_at DESC);
CREATE INDEX IF NOT EXISTS reservations_schedule_idx
  ON reservations(product_id, variant_id, use_date, pickup_date, status);
CREATE INDEX IF NOT EXISTS reservations_status_idx
  ON reservations(status, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'reservations_updated_at') THEN
    CREATE TRIGGER reservations_updated_at
      BEFORE UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
