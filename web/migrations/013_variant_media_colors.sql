-- ============================================================================
-- TechStore — 013_variant_media_colors
-- 2026-08-07
-- ============================================================================
-- Extiende las variantes y los valores de color sin alterar los datos ya
-- existentes. Las fotos antiguas siguen siendo media del producto; las nuevas
-- pueden asociarse también a una variante concreta.

ALTER TABLE attribute_values
  ADD COLUMN IF NOT EXISTS hex TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'attribute_values_hex_format'
  ) THEN
    ALTER TABLE attribute_values
      ADD CONSTRAINT attribute_values_hex_format
      CHECK (hex IS NULL OR hex ~ '^#[0-9A-Fa-f]{6}$');
  END IF;
END$$;

ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';

ALTER TABLE product_media
  ADD COLUMN IF NOT EXISTS variant_id INTEGER
    REFERENCES product_variants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS product_media_variant_idx
  ON product_media(variant_id, deleted_at, display_order);
