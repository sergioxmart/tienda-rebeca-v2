-- ============================================================================
-- TechStore — 030_colombia_departments
-- 2026-08-09
-- ============================================================================
-- Estandariza la ubicación de entrega en Colombia. Los pedidos conservan su
-- JSONB histórico; los nuevos incluyen department + city.
-- ============================================================================

ALTER TABLE customer_addresses
  ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS customer_addresses_location_idx
  ON customer_addresses(department, city);
