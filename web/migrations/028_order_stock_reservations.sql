-- ============================================================================
-- TechStore — 028_order_stock_reservations
-- 2026-08-08
-- ============================================================================
-- Reserva temporal de inventario por pedido. La reserva descuenta del saldo
-- disponible al crear el pedido; luego se consolida al pagar o se libera al
-- expirar. Los estados hacen que ambas operaciones sean idempotentes.
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_stock_reservations (
  id          SERIAL PRIMARY KEY,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id  INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  status      TEXT NOT NULL DEFAULT 'reserved'
                CHECK (status IN ('reserved', 'committed', 'released')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  UNIQUE (order_id, variant_id)
);

CREATE INDEX IF NOT EXISTS order_stock_reservations_order_idx
  ON order_stock_reservations(order_id, status);
CREATE INDEX IF NOT EXISTS order_stock_reservations_variant_idx
  ON order_stock_reservations(variant_id, status);

-- Los pedidos pendientes que existían antes de esta fase no tienen reservas.
-- Se ajustan al nuevo TTL de 15 minutos para que no permanezcan abiertos con
-- la regla anterior de 30 minutos.
UPDATE orders
   SET expires_at = created_at + INTERVAL '15 minutes'
 WHERE status = 'pending'
   AND expires_at IS NOT NULL;
