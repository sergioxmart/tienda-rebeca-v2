-- ============================================================================
-- TechStore — 008_site_config
-- 2026-08-06
-- ============================================================================
-- Config global del sitio en pares key/value JSONB. El admin edita desde
-- el panel; el público lo lee en cada request del server.
--
-- v1: solo globals operacionales (nombre, contacto, moneda, branding).
-- Cuando integremos la pasarela, agregamos: pasarela_public_key, pasarela_env.
-- ============================================================================

CREATE TABLE IF NOT EXISTS site_config (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'site_config_updated_at') THEN
    CREATE TRIGGER site_config_updated_at BEFORE UPDATE ON site_config
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;

-- Seeds. El admin los edita desde el panel. El cliente lee los defaults
-- hasta que se cambien.
INSERT INTO site_config (key, value) VALUES
  ('site_name',          '"TechStore"'::jsonb),
  ('logo_url',           'null'::jsonb),
  ('contact_email',      '""'::jsonb),
  ('contact_phone',      '""'::jsonb),
  ('contact_phone_display', '""'::jsonb),
  ('contact_instagram',  '""'::jsonb),
  ('contact_facebook',   '""'::jsonb),
  ('contact_address_lines', '[]'::jsonb),
  ('currency',           '"COP"'::jsonb),
  ('currency_symbol',    '"$"'::jsonb),
  ('currency_locale',    '"es-CO"'::jsonb)
ON CONFLICT (key) DO NOTHING;
