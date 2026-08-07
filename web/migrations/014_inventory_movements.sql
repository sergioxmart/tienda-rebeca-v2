-- ============================================================================
-- TechStore — 014_inventory_movements
-- 2026-08-07
-- ============================================================================
-- El catálogo crea las variantes; este libro mayor administra sus unidades.
-- Cada entrada/salida conserva el saldo anterior y posterior para auditoría.

CREATE TABLE IF NOT EXISTS inventory_movements (
  id            SERIAL PRIMARY KEY,
  variant_id    INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('in', 'out')),
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  stock_before  INTEGER NOT NULL CHECK (stock_before >= 0),
  stock_after   INTEGER NOT NULL CHECK (stock_after >= 0),
  reason        TEXT NOT NULL DEFAULT '',
  created_by    INTEGER REFERENCES auth_users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inventory_movements_variant_idx
  ON inventory_movements(variant_id, created_at DESC, id DESC);
