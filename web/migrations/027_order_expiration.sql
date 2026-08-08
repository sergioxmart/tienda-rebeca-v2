-- ============================================================================
-- TechStore — 027_order_expiration
-- 2026-08-08
-- ============================================================================
-- Los pedidos pendientes no deben quedar abiertos indefinidamente. La
-- aplicación asigna `expires_at` al crear cada pedido y el worker de backend
-- cambia a `expired` los que superaron ese límite.
--
-- La migración usa 30 minutos para los pedidos ya existentes. La fase de
-- reservas posterior ajusta los pendientes al nuevo TTL de 15 minutos. El valor de los
-- pedidos nuevos se puede cambiar con ORDER_PENDING_TTL_MINUTES.
-- ============================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_status_check CHECK (status IN (
    'pending', 'paid', 'processing', 'shipped', 'delivered',
    'cancelled', 'expired', 'refunded'
  ));

UPDATE orders
   SET expires_at = created_at + INTERVAL '30 minutes'
 WHERE expires_at IS NULL;

CREATE INDEX IF NOT EXISTS orders_pending_expiration_idx
  ON orders(status, expires_at)
  WHERE status = 'pending';
