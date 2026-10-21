-- Permite agregar módulos del Web Builder a una categoría sin reemplazar su catálogo.
-- Forward-only: no modificar migraciones ya aplicadas.

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS is_custom_page BOOLEAN NOT NULL DEFAULT FALSE;
