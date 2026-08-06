-- ============================================================================
-- TechStore — 007_payments
-- 2026-08-06
-- ============================================================================
-- Pagos: una fila por transacción con la pasarela. Un pedido puede tener
-- varios pagos (ej: primer intento declined, segundo aprobado).
--
-- En v1 no sabemos cuál pasarela va a usar Sergio. La tabla es genérica:
-- `provider` guarda el nombre ('wompi' | 'epayco' | 'mercadopago' |
-- 'stripe' | 'manual'). Los detalles específicos de cada provider (firma
-- de webhook, campos de status, etc.) viven en código de la app, NO en SQL.
-- Cuando se elija la pasarela, agregamos columnas en una migration nueva
-- (ej: `wompi_payment_link_id`, `epayco_transaction_state`).
--
-- raw_response guarda el body completo de la respuesta de la pasarela
-- para debug. Pensado para que un dev pueda pegarlo en un ticket sin
-- tener que ir a la consola de la pasarela.
--
-- Status:
--   pending   → intent creado, esperando confirmación
--   approved  → OK, plata en cuenta
--   declined  → rechazado por la pasarela o el banco
--   error     → falló la integración (no se pudo comunicar)
--   refunded  → devuelto al cliente (parcial o total)
--   voided    → anulado antes de capturar
-- ============================================================================

CREATE TABLE IF NOT EXISTS payments (
  id                      SERIAL PRIMARY KEY,
  order_id                INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  provider                TEXT NOT NULL,             -- 'wompi', 'epayco', etc.
  provider_transaction_id TEXT NOT NULL DEFAULT '',  -- ID del lado de la pasarela
  status                  TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN (
                              'pending', 'approved', 'declined',
                              'error', 'refunded', 'voided'
                            )),
  amount                  NUMERIC(10,2) NOT NULL,
  currency                TEXT NOT NULL DEFAULT 'COP',
  payment_method          TEXT NOT NULL DEFAULT '',  -- 'card', 'pse', 'nequi', etc.
  raw_response            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (amount >= 0)
);

CREATE INDEX IF NOT EXISTS payments_order_idx ON payments(order_id);
CREATE INDEX IF NOT EXISTS payments_provider_txn_idx
  ON payments(provider, provider_transaction_id);
CREATE INDEX IF NOT EXISTS payments_status_idx
  ON payments(status, created_at DESC);

-- Triggers
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'payments_updated_at') THEN
    CREATE TRIGGER payments_updated_at BEFORE UPDATE ON payments
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;
