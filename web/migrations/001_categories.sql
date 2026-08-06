-- ============================================================================
-- TechStore — 001_categories
-- 2026-08-06
-- ============================================================================
-- Categorías del catálogo. v1 arranca con una sola ('accesorios-telefono');
-- el modelo es extensible: agregar 'laptops', 'celulares' u otros es solo
-- INSERT en esta tabla. La FK de products.category_id no obliga a nada más.
-- ============================================================================

CREATE TABLE IF NOT EXISTS categories (
  id            SERIAL PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  hero_image    TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS categories_active_idx
  ON categories(active, display_order);

-- Función reutilizable para set_updated_at. La usan todas las tablas con
-- columna `updated_at`. Idempotente: CREATE OR REPLACE.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'categories_updated_at') THEN
    CREATE TRIGGER categories_updated_at BEFORE UPDATE ON categories
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;

-- Seed: una sola categoría por ahora. Sergio decide después si suma más.
INSERT INTO categories (slug, name, description, display_order) VALUES
  ('accesorios-telefono', 'Accesorios de teléfono',
   'Fundas, vidrios templados, cargadores, cables, audífonos y más.', 0)
ON CONFLICT (slug) DO NOTHING;
