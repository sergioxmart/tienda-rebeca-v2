-- ============================================================================
-- TechStore — 025_epayco_idempotency
-- ============================================================================
-- Una referencia x_ref_payco solo puede procesarse una vez. Las filas de
-- intención todavía usan un identificador de sesión, por eso el índice
-- parcial excluye únicamente el valor vacío heredado de la tabla base.

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_transaction_unique_idx
  ON payments(provider, provider_transaction_id)
  WHERE provider_transaction_id <> '';

