-- ============================================================================
-- TechStore — 003_products
-- 2026-08-06
-- ============================================================================
-- Productos + sus atributos aplicables + galería de medios.
--
-- Diferencia con Rebeca: acá el "producto" es el TEMPLATE (ej: "Funda iPhone
-- transparente"). Las VARIANTS (combinaciones de color + modelo) viven en
-- 004_variants.sql. El precio default vive en products.base_price; cada
-- variante puede override (o null = usa el del producto).
--
-- Media (fotos): vive en product_media. En v1 las fotos son del PRODUCTO
-- (template), no por variante. Si después se quiere foto por variante,
-- se agrega variant_id a product_media en una migration nueva.
-- ============================================================================

-- Productos (template)
CREATE TABLE IF NOT EXISTS products (
  id            SERIAL PRIMARY KEY,
  category_id   INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  sku           TEXT UNIQUE,                  -- código interno opcional
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,         -- URL-friendly: 'funda-iphone-15'
  description   TEXT NOT NULL DEFAULT '',
  brand         TEXT NOT NULL DEFAULT '',
  base_price    NUMERIC(10,2) NOT NULL DEFAULT 0,
  compare_at    NUMERIC(10,2),                -- precio tachado (oferta); null = no
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  featured      BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS products_category_idx
  ON products(category_id, active, display_order);
CREATE INDEX IF NOT EXISTS products_featured_idx
  ON products(featured) WHERE featured = TRUE;
CREATE INDEX IF NOT EXISTS products_brand_idx
  ON products(brand) WHERE brand <> '';

-- M2M: qué atributos aplican a este producto.
-- is_required: si true, el cliente DEBE elegir un valor al armar variante.
--   Si false, el atributo es opcional (ej: "Color" puede ser null).
-- El admin configura esto por producto.
CREATE TABLE IF NOT EXISTS product_attributes (
  product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  attribute_id  INTEGER NOT NULL REFERENCES attributes(id) ON DELETE RESTRICT,
  is_required   BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, attribute_id)
);

CREATE INDEX IF NOT EXISTS product_attributes_attribute_idx
  ON product_attributes(attribute_id);

-- Galería: fotos (v1) y embeds de video (YouTube/Vimeo).
-- v1 las fotos son DEL PRODUCTO (template), no por variante.
-- Huérfanas (product_id NULL, deleted_at NOT NULL) se limpian >30 días.
CREATE TABLE IF NOT EXISTS product_media (
  id            SERIAL PRIMARY KEY,
  product_id    INTEGER REFERENCES products(id) ON DELETE SET NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('image', 'video_embed')),
  url           TEXT NOT NULL,
  mime          TEXT NOT NULL DEFAULT '',
  size_bytes    BIGINT NOT NULL DEFAULT 0,
  width         INTEGER,
  height        INTEGER,
  alt_text      TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS product_media_product_idx
  ON product_media(product_id, deleted_at, display_order);
CREATE INDEX IF NOT EXISTS product_media_orphan_idx
  ON product_media(deleted_at) WHERE product_id IS NULL;

-- Triggers
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'products_updated_at') THEN
    CREATE TRIGGER products_updated_at BEFORE UPDATE ON products
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'product_attributes_updated_at') THEN
    CREATE TRIGGER product_attributes_updated_at BEFORE UPDATE ON product_attributes
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;
