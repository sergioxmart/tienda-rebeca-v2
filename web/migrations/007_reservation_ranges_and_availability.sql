-- Rangos de uso y atributos base para alquileres.

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS use_end_date DATE;

UPDATE reservations
   SET use_end_date = use_date
 WHERE use_end_date IS NULL;

ALTER TABLE reservations
  ALTER COLUMN use_end_date SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservations_use_range_check') THEN
    ALTER TABLE reservations
      ADD CONSTRAINT reservations_use_range_check CHECK (use_end_date >= use_date);
  END IF;
END $$;

-- Valores mínimos que necesita la tienda para distinguir venta y alquiler.
WITH availability AS (
  INSERT INTO attributes (slug, name, type, display_order, active)
  VALUES ('disponibilidad', 'Disponibilidad', 'text', 10, TRUE)
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, active = TRUE
  RETURNING id
)
INSERT INTO attribute_values (attribute_id, value, display_order, active)
SELECT availability.id, seed.value, seed.display_order, TRUE
  FROM availability
 CROSS JOIN (VALUES
   ('Compra', 1),
   ('Alquiler', 2),
   ('Alquiler como nuevo', 3)
 ) AS seed(value, display_order)
ON CONFLICT (attribute_id, value) DO UPDATE
  SET display_order = EXCLUDED.display_order, active = TRUE;
