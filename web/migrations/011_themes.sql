-- ============================================================================
-- TechStore — 011_themes
-- 2026-08-06
-- ============================================================================
-- Temas: snapshots de la configuración de la home (page_modules + subset
-- de site_config) que se pueden importar/exportar como zip y aplicar.
--
-- Un tema = { name, modules: [...], site_config_subset: {...} }.
-- `data` es JSONB libre con el shape del theme.
-- `version` es el schema del theme (1 en v1) para futuras migraciones.
--
-- Aplicar un theme significa: borrar los page_modules activos actuales
-- y reemplazarlos por los del theme. Los site_config_subset (colores,
-- textos) se hacen PATCH al site_config. NO toca imágenes ni productos.
-- ============================================================================

CREATE TABLE IF NOT EXISTS themes (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  version     INTEGER NOT NULL DEFAULT 1,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'themes_updated_at') THEN
    CREATE TRIGGER themes_updated_at BEFORE UPDATE ON themes
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;
