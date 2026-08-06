-- ============================================================================
-- TechStore — 006_orders
-- 2026-08-06
-- ============================================================================
-- Pedidos. Se crean desde el checkout del cliente (después del pago
-- aprobado) o desde el panel admin (pedidos manuales / WhatsApp legacy).
--
-- Snapshots: las líneas guardan nombre + sku + precio unitario del momento
-- de la compra. Si después se edita el producto o cambia el precio, la
-- historia del pedido NO se altera. Esto es regla del e-commerce.
--
-- Status (el admin mueve el pedido por el kanban):
--   pending    → creado, pago aún no confirmado (o pasarela en proceso)
--   paid       → pago aprobado por la pasarela
--   processing → admin está preparando el envío
--   shipped    → despachado
--   delivered  → entregado
--   cancelled  → cancelado antes de despachar
--   refunded   → devuelto y reembolsado
--
-- Shipping: por ahora guardamos la dirección completa en JSONB. Cuando
-- integremos una pasarela de envíos (Coordinadora, Servientrega, etc.),
-- agregamos columnas: carrier, tracking_number, label_url.
-- ============================================================================

CREATE TABLE IF NOT EXISTS orders (
  id                SERIAL PRIMARY KEY,
  order_number      TEXT NOT NULL UNIQUE,     -- 'TS-2026-00001' (formato año-sec)
  customer_email    TEXT NOT NULL,
  customer_name     TEXT NOT NULL DEFAULT '',
  customer_phone    TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN (
                        'pending', 'paid', 'processing',
                        'shipped', 'delivered', 'cancelled', 'refunded'
                      )),

  -- Montos. Todos en COP. NUMERIC(10,2) alcanza hasta 99.999.999,99
  -- (suficiente para casi cualquier pedido de accesorios).
  subtotal          NUMERIC(10,2) NOT NULL DEFAULT 0,
  shipping          NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax               NUMERIC(10,2) NOT NULL DEFAULT 0,
  total             NUMERIC(10,2) NOT NULL DEFAULT 0,

  -- Snapshot de la dirección de envío al momento del pedido.
  shipping_address  JSONB NOT NULL DEFAULT '{}'::jsonb,

  notes             TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS orders_status_idx
  ON orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_customer_email_idx
  ON orders(customer_email);
CREATE INDEX IF NOT EXISTS orders_number_idx
  ON orders(order_number);

-- Líneas del pedido. UNA fila por variant (no agrupamos cantidad en la
-- línea: cada fila es 1 unidad, y quantity se repite en cada fila con
-- el mismo variant). Decisión: preferible legibilidad y queries simples.
CREATE TABLE IF NOT EXISTS order_items (
  id            SERIAL PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id    INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  product_name  TEXT NOT NULL,               -- snapshot
  variant_sku   TEXT NOT NULL DEFAULT '',    -- snapshot
  quantity      INTEGER NOT NULL DEFAULT 1,
  unit_price    NUMERIC(10,2) NOT NULL,      -- snapshot
  line_total    NUMERIC(10,2) NOT NULL,      -- snapshot = quantity * unit_price
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (quantity > 0),
  CHECK (line_total >= 0)
);

CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id);
CREATE INDEX IF NOT EXISTS order_items_variant_idx ON order_items(variant_id);

-- Triggers
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'orders_updated_at') THEN
    CREATE TRIGGER orders_updated_at BEFORE UPDATE ON orders
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;
