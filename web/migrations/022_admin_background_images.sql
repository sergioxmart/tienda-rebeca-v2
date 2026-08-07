-- ==========================================================================
-- TechStore — 022_admin_background_images
-- ==========================================================================
-- Configuración inicial para fondos visuales del sidebar y área principal.

INSERT INTO site_config (key, value) VALUES
  ('admin_sidebar_bg_mode',       '"solid"'::jsonb),
  ('admin_sidebar_bg_image_url',  'null'::jsonb),
  ('admin_sidebar_bg_position_x', '50'::jsonb),
  ('admin_sidebar_bg_position_y', '50'::jsonb),
  ('admin_sidebar_bg_zoom',       '100'::jsonb),
  ('admin_main_bg_mode',          '"solid"'::jsonb),
  ('admin_main_bg_image_url',     'null'::jsonb),
  ('admin_main_bg_position_x',    '50'::jsonb),
  ('admin_main_bg_position_y',    '50'::jsonb),
  ('admin_main_bg_zoom',          '100'::jsonb)
ON CONFLICT (key) DO NOTHING;
