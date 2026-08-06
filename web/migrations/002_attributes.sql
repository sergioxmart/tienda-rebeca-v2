-- ============================================================================
-- TechStore — 002_attributes
-- 2026-08-06
-- ============================================================================
-- Atributos configurables para las variantes de un producto.
--
-- Modelo:
--   attributes         = "qué preguntar al cliente" (color, modelo, capacidad…)
--   attribute_values   = "qué opciones hay para cada atributo"
--                        (color: rojo|azul|negro; modelo-telefono: iPhone 15|…)
--   product_attributes = "qué atributos aplican a este producto"
--                        (M2M products ↔ attributes, con is_required)
--   variant_attribute_values = "qué valores eligió esta variante"
--                              (M2M variants ↔ attribute_values)
--
-- Ejemplo real:
--   attributes:        ('color', 'Color', 'color'), ('modelo-telefono', 'Modelo', 'text')
--   attribute_values:  ('color', 'Rojo'), ('color', 'Azul'),
--                      ('modelo-telefono', 'iPhone 15'), ('modelo-telefono', 'iPhone 14')
--   product_attributes: ('Funda iPhone', 'color', is_required=true),
--                       ('Funda iPhone', 'modelo-telefono', is_required=true)
--   variants:
--     ('SKU-FND-IP15-ROJO', 35000, stock=10)  → color=Rojo, modelo=iPhone 15
--     ('SKU-FND-IP15-AZUL', 35000, stock=5)
--     ('SKU-FND-IP14-ROJO', 35000, stock=8)
-- ============================================================================

-- Definición de cada atributo
CREATE TABLE IF NOT EXISTS attributes (
  id            SERIAL PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,                -- label visible ("Color", "Modelo")
  type          TEXT NOT NULL DEFAULT 'text'  -- 'text' | 'color' | 'number'
                    CHECK (type IN ('text', 'color', 'number')),
  display_order INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS attributes_active_idx
  ON attributes(active, display_order);

-- Valores posibles por atributo
CREATE TABLE IF NOT EXISTS attribute_values (
  id            SERIAL PRIMARY KEY,
  attribute_id  INTEGER NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
  value         TEXT NOT NULL,                -- "Rojo", "iPhone 15", "1m"
  display_order INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (attribute_id, value)
);

CREATE INDEX IF NOT EXISTS attribute_values_attribute_idx
  ON attribute_values(attribute_id, active, display_order);

-- Triggers de updated_at
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'attributes_updated_at') THEN
    CREATE TRIGGER attributes_updated_at BEFORE UPDATE ON attributes
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'attribute_values_updated_at') THEN
    CREATE TRIGGER attribute_values_updated_at BEFORE UPDATE ON attribute_values
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;

-- Seed de atributos comunes en accesorios de teléfono. El admin agrega valores
-- desde el panel. Los slugs son estables: NO renombrar (se referencian desde
-- código y migraciones futuras).
INSERT INTO attributes (slug, name, type, display_order) VALUES
  ('color',             'Color',             'color', 0),
  ('modelo-telefono',   'Modelo de teléfono','text',  1),
  ('tipo-conexion',     'Tipo de conexión',  'text',  2),
  ('largo',             'Largo',             'text',  3),
  ('capacidad-carga',   'Capacidad de carga','text',  4)
ON CONFLICT (slug) DO NOTHING;
