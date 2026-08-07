-- ============================================================================
-- TechStore — 020_media_attribute_categories
-- ============================================================================
-- Clasificación de multimedia y relación reutilizable entre atributos,
-- categorías y valores de atributos.

ALTER TABLE product_media
  ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS product_media_category_idx
  ON product_media(category_id, deleted_at, display_order);

-- Los archivos antiguos con producto heredan su categoría actual.
UPDATE product_media pm
   SET category_id = p.category_id
  FROM products p
 WHERE pm.product_id = p.id
   AND pm.category_id IS NULL;

CREATE TABLE IF NOT EXISTS attribute_categories (
  attribute_id INTEGER NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
  category_id  INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (attribute_id, category_id)
);

CREATE INDEX IF NOT EXISTS attribute_categories_category_idx
  ON attribute_categories(category_id, attribute_id);

CREATE TABLE IF NOT EXISTS attribute_category_values (
  attribute_id       INTEGER NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
  category_id        INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  attribute_value_id INTEGER NOT NULL REFERENCES attribute_values(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (attribute_id, category_id, attribute_value_id)
);

CREATE INDEX IF NOT EXISTS attribute_category_values_lookup_idx
  ON attribute_category_values(attribute_id, category_id, attribute_value_id);

-- Compatibilidad: el catálogo anterior veía todos los atributos y valores en
-- todas las categorías, por lo que conservamos exactamente esa visibilidad.
INSERT INTO attribute_categories (attribute_id, category_id)
SELECT a.id, c.id
  FROM attributes a CROSS JOIN categories c
 WHERE c.active = TRUE
ON CONFLICT DO NOTHING;

INSERT INTO attribute_category_values (attribute_id, category_id, attribute_value_id)
SELECT av.attribute_id, ac.category_id, av.id
  FROM attribute_values av
  JOIN attribute_categories ac ON ac.attribute_id = av.attribute_id
ON CONFLICT DO NOTHING;
