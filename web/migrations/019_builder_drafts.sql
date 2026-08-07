-- ============================================================================
-- TechStore — 019_builder_drafts
-- ============================================================================
-- Estado de trabajo aislado del catálogo publicado. Solo al publicar se
-- copian modules y configuración al estado que consume la tienda pública.
-- ============================================================================

CREATE TABLE IF NOT EXISTS builder_drafts (
  id                  SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  modules             JSONB NOT NULL DEFAULT '[]'::jsonb,
  site_config_subset  JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_theme_id     INTEGER REFERENCES themes(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'builder_drafts_updated_at') THEN
    CREATE TRIGGER builder_drafts_updated_at BEFORE UPDATE ON builder_drafts
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;
