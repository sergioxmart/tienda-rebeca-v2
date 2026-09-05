-- Colores opcionales por categoría para personalizar la navegación del catálogo.
-- Forward-only: no modificar migrations ya aplicadas.

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS accent_color TEXT,
  ADD COLUMN IF NOT EXISTS background_color TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'categories_accent_color_hex_check'
  ) THEN
    ALTER TABLE categories
      ADD CONSTRAINT categories_accent_color_hex_check
      CHECK (accent_color IS NULL OR accent_color ~ '^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'categories_background_color_hex_check'
  ) THEN
    ALTER TABLE categories
      ADD CONSTRAINT categories_background_color_hex_check
      CHECK (background_color IS NULL OR background_color ~ '^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$');
  END IF;
END $$;
