-- Permite elegir qué imagen de la galería (incluidas las de variantes)
-- aparece como principal en las tarjetas del catálogo.
-- Forward-only: no modificar migrations ya aplicadas.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS catalog_image_media_id INTEGER
  REFERENCES product_media(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS products_catalog_image_media_idx
  ON products(catalog_image_media_id);
