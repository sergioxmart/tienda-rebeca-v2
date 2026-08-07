-- ==========================================================================
-- TechStore — 015_prices_without_decimals
-- ============================================================================
-- Colombia usa pesos enteros para el catálogo. Redondeamos cualquier dato
-- histórico y eliminamos la escala decimal de los importes monetarios.

ALTER TABLE products
  ALTER COLUMN base_price TYPE NUMERIC(10,0) USING ROUND(base_price),
  ALTER COLUMN compare_at TYPE NUMERIC(10,0) USING ROUND(compare_at);

ALTER TABLE product_variants
  ALTER COLUMN price TYPE NUMERIC(10,0) USING ROUND(price),
  ALTER COLUMN compare_at TYPE NUMERIC(10,0) USING ROUND(compare_at);

ALTER TABLE orders
  ALTER COLUMN subtotal TYPE NUMERIC(10,0) USING ROUND(subtotal),
  ALTER COLUMN shipping TYPE NUMERIC(10,0) USING ROUND(shipping),
  ALTER COLUMN tax TYPE NUMERIC(10,0) USING ROUND(tax),
  ALTER COLUMN total TYPE NUMERIC(10,0) USING ROUND(total);

ALTER TABLE order_items
  ALTER COLUMN unit_price TYPE NUMERIC(10,0) USING ROUND(unit_price),
  ALTER COLUMN line_total TYPE NUMERIC(10,0) USING ROUND(line_total);

ALTER TABLE payments
  ALTER COLUMN amount TYPE NUMERIC(10,0) USING ROUND(amount);
