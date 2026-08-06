-- ============================================================================
-- TechStore — 004_variants
-- 2026-08-06
-- ============================================================================
-- Variantes = las combinaciones vendibles de un producto. Cada variante
-- tiene su propio SKU, precio (opcionalmente override), stock y los valores
-- de atributos que la definen.
--
-- Invariantes (enforced por tests + app, no por DB):
--   1. Para cada atributo en product_attributes de este producto con
--      is_required=true, la variante DEBE tener exactamente UN valor en
--      variant_attribute_values.
--   2. No puede haber dos variantes del mismo producto con la misma
--      combinación de valores (la combinación es única).
--      Esto se enforce con un índice único derivado:
--      variante = product_id + (attribute_id, attribute_value_id) ordenados.
--   3. stock >= 0 (CHECK).
--
-- Precio:
--   Si product_variants.price IS NULL, la UI/backend usa products.base_price.
--   Esto permite tener un precio default y overrides puntuales por variante
--   (ej: "el modelo Pro es +$50.000 que el base").
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_variants (
  id              SERIAL PRIMARY KEY,
  product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku             TEXT UNIQUE,                -- código de la variante
  price           NUMERIC(10,2),              -- null = usa products.base_price
  compare_at      NUMERIC(10,2),              -- precio tachado
  stock           INTEGER NOT NULL DEFAULT 0,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  display_order   INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (stock >= 0)
);

CREATE INDEX IF NOT EXISTS product_variants_product_idx
  ON product_variants(product_id, active, display_order);

-- M2M: cada variante tiene UN valor por atributo aplicable.
-- (variant_id, attribute_id) es único: una variante no puede tener dos
-- valores del mismo atributo (sería ambiguo).
CREATE TABLE IF NOT EXISTS variant_attribute_values (
  variant_id        INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  attribute_id      INTEGER NOT NULL REFERENCES attributes(id) ON DELETE RESTRICT,
  attribute_value_id INTEGER NOT NULL REFERENCES attribute_values(id) ON DELETE RESTRICT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (variant_id, attribute_id)
);

-- Para la invariante #2 (no dos variantes con la misma combinación), en v1 lo
-- enforce la app al crear/editar variantes. La validación es: dado un
-- product_id, ordenar los (attribute_id, attribute_value_id) de cada variante
-- y comparar. Si dos coinciden, error.
--
-- No creamos el índice único derivado porque la comparación depende del
-- orden y de los atributos aplicables al producto, no de los valores
-- presentes. Cuando el admin edita variantes lo hace con un script
-- transaccional en la app.

CREATE INDEX IF NOT EXISTS variant_attribute_values_variant_idx
  ON variant_attribute_values(variant_id);
CREATE INDEX IF NOT EXISTS variant_attribute_values_value_idx
  ON variant_attribute_values(attribute_value_id);

-- Triggers
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'product_variants_updated_at') THEN
    CREATE TRIGGER product_variants_updated_at BEFORE UPDATE ON product_variants
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;
