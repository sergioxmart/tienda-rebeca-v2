-- Configuración aislada para ordenar los productos de "Lo más nuevo".
-- No se crea una fila inicial: su ausencia mantiene el comportamiento actual.
CREATE TABLE new_arrivals_order (
  id           SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  config       JSONB NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
