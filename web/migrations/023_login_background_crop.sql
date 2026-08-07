-- ==========================================================================
-- TechStore — 023_login_background_crop
-- ==========================================================================
-- Encuadre persistente de la imagen de fondo del login.

INSERT INTO site_config (key, value) VALUES
  ('admin_login_bg_position_x', '50'::jsonb),
  ('admin_login_bg_position_y', '50'::jsonb),
  ('admin_login_bg_zoom',       '100'::jsonb)
ON CONFLICT (key) DO NOTHING;
