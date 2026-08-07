-- ============================================================================
-- TechStore — 018_preserve_order_history_on_product_delete
-- ============================================================================
-- Los order_items conservan nombre, SKU y precios como snapshot inmutable.
-- Permitir que la variante se elimine sin tocar ese histórico: el vínculo
-- técnico queda en NULL cuando se borra el producto, pero los snapshots
-- siguen completos.
-- ============================================================================

ALTER TABLE order_items
  ALTER COLUMN variant_id DROP NOT NULL;

ALTER TABLE order_items
  DROP CONSTRAINT IF EXISTS order_items_variant_id_fkey;

ALTER TABLE order_items
  ADD CONSTRAINT order_items_variant_id_fkey
  FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL;
