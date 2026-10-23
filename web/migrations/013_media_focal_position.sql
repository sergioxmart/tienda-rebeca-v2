-- Encuadre por imagen para la galería del detalle de producto.
ALTER TABLE product_media
  ADD COLUMN focal_position_x INTEGER NOT NULL DEFAULT 50 CHECK (focal_position_x BETWEEN 0 AND 100),
  ADD COLUMN focal_position_y INTEGER NOT NULL DEFAULT 50 CHECK (focal_position_y BETWEEN 0 AND 100),
  ADD COLUMN focal_zoom INTEGER NOT NULL DEFAULT 100 CHECK (focal_zoom BETWEEN 100 AND 300);
