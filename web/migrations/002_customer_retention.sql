-- TechStore — Retención de cuentas de clientes
-- Cuentas desactivadas: reactivables durante 30 días y luego anonimizadas.

ALTER TABLE customer_accounts
  ADD COLUMN deleted_at TIMESTAMPTZ,
  ADD COLUMN deletion_expires_at TIMESTAMPTZ,
  ADD CONSTRAINT customer_accounts_deletion_window_check
    CHECK ((deleted_at IS NULL AND deletion_expires_at IS NULL)
       OR (deleted_at IS NOT NULL AND deletion_expires_at IS NOT NULL));

CREATE INDEX customer_accounts_retention_idx
  ON customer_accounts(deletion_expires_at)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX customer_accounts_created_at_idx
  ON customer_accounts(created_at);
