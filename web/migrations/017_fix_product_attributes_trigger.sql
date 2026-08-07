-- ==========================================================================
-- TechStore — 017_fix_product_attributes_trigger
-- ============================================================================
-- product_attributes no tiene updated_at. El trigger heredado de la primera
-- definición de la tabla provocaba 500 al cambiar display_order.

DROP TRIGGER IF EXISTS product_attributes_updated_at ON product_attributes;
