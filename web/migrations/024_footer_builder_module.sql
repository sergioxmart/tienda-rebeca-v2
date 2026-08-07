-- ==========================================================================
-- TechStore — 024_footer_builder_module
-- ==========================================================================
-- Convierte el Footer global existente en un módulo configurable del Builder
-- sin quitarlo de las tiendas que ya están funcionando.

INSERT INTO page_modules (type, position, settings, active)
SELECT 'footer', COALESCE(MAX(position), 0) + 1, '{}'::jsonb, TRUE
  FROM page_modules
 WHERE NOT EXISTS (
   SELECT 1 FROM page_modules WHERE type = 'footer'
 );
