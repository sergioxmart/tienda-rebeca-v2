-- Control global de operación: compras en línea o catálogo con cotización.
-- Se conserva activado por defecto para instalaciones existentes.

INSERT INTO site_config (key, value)
VALUES ('online_purchases_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;
