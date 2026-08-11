-- TechStore — identidad visual editorial para la tienda pública.
-- Solo actualiza los valores del baseline; si el admin ya personalizó un
-- color, se conserva su elección.

UPDATE site_config
   SET value = to_jsonb('#B89A5E'::text), updated_at = NOW()
 WHERE key = 'store_accent_color' AND value = to_jsonb('#FF6B35'::text);

UPDATE site_config
   SET value = to_jsonb('#1A1D21'::text), updated_at = NOW()
 WHERE key IN ('store_primary_color', 'store_heading_color', 'store_product_name_color')
   AND value = to_jsonb('#0F2A47'::text);

UPDATE site_config
   SET value = to_jsonb('#FAF7F2'::text), updated_at = NOW()
 WHERE key = 'store_background_color' AND value = to_jsonb('#F7F8FA'::text);

UPDATE site_config
   SET value = to_jsonb('#B89A5E'::text), updated_at = NOW()
 WHERE key = 'store_price_color' AND value = to_jsonb('#0F2A47'::text);

UPDATE site_config
   SET value = to_jsonb('#1A1D21'::text), updated_at = NOW()
 WHERE key = 'store_body_text_color' AND value = to_jsonb('#172536'::text);
