-- ==========================================================================
-- TechStore — 016_media_variant_links
-- ============================================================================
-- Una misma multimedia puede pertenecer a varias variantes. La relación se
-- guarda aparte para no duplicar filas de product_media ni archivos físicos.

CREATE TABLE IF NOT EXISTS product_media_variants (
  media_id    INTEGER NOT NULL REFERENCES product_media(id) ON DELETE CASCADE,
  variant_id  INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (media_id, variant_id)
);

CREATE INDEX IF NOT EXISTS product_media_variants_variant_idx
  ON product_media_variants(variant_id);
