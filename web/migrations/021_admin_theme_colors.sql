-- ==========================================================================
-- TechStore — 021_admin_theme_colors
-- ==========================================================================
-- Defaults de la paleta configurable del panel administrativo.

INSERT INTO site_config (key, value) VALUES
  ('admin_sidebar_bg',  '"#0F2A47"'::jsonb),
  ('admin_active_color','"#FF6B35"'::jsonb),
  ('admin_main_bg',     '"#F4F6F8"'::jsonb),
  ('admin_surface_bg',  '"#FFFFFF"'::jsonb),
  ('admin_text_color',  '"#1A2733"'::jsonb)
ON CONFLICT (key) DO NOTHING;
