-- Encuadre de la imagen principal en las tarjetas del catálogo.
-- Forward-only: no modificar migrations ya aplicadas.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS catalog_image_position_x INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS catalog_image_position_y INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS catalog_image_zoom INTEGER NOT NULL DEFAULT 100;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_catalog_image_position_x_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_catalog_image_position_x_check
      CHECK (catalog_image_position_x BETWEEN 0 AND 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_catalog_image_position_y_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_catalog_image_position_y_check
      CHECK (catalog_image_position_y BETWEEN 0 AND 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_catalog_image_zoom_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_catalog_image_zoom_check
      CHECK (catalog_image_zoom BETWEEN 100 AND 220);
  END IF;
END $$;
