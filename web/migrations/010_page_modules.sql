-- ============================================================================
-- TechStore — 010_page_modules
-- 2026-08-06
-- ============================================================================
-- Web Builder. Cada fila es un "módulo" renderizable en la home del store.
-- Se ordenan por `position` (campo numérico) y se filtran por `active`.
--
-- `type` define qué componente se renderiza (registry en el front).
-- `settings` es JSONB libre con la config del módulo (texto, image_url,
-- max items, etc.). El backend NO valida la forma de `settings` — la
-- validación la hace el front al mostrar/editar.
--
-- Endpoints:
--   GET    /api/admin/page-modules                lista (todos, incluso inactivos)
--   POST   /api/admin/page-modules                crear
--   PATCH  /api/admin/page-modules/:id            editar type/settings/active
--   PATCH  /api/admin/page-modules/reorder        body: { ids: [id1, id2, ...] }
--                                                asigna position = índice+1
--                                                (orden final = el del array)
--   DELETE /api/admin/page-modules/:id            borrar
--
--   GET    /api/public/page-modules              lista de activos (para store)
-- ============================================================================

CREATE TABLE IF NOT EXISTS page_modules (
  id          SERIAL PRIMARY KEY,
  type        TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  settings    JSONB NOT NULL DEFAULT '{}'::jsonb,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS page_modules_order_idx
  ON page_modules(active, position);

-- Reusar el trigger genérico de updated_at.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'page_modules_updated_at') THEN
    CREATE TRIGGER page_modules_updated_at BEFORE UPDATE ON page_modules
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;

-- Seed: módulos por defecto de la home. El admin puede reordenarlos,
-- editarlos o borrarlos.
INSERT INTO page_modules (type, position, settings, active) VALUES
  ('hero',              1, '{"title": "Todo para tu celular, en un solo lugar", "subtitle": "Carcasas, forros, cargadores, audífonos y más. Envío a todo Colombia.", "cta_text": "Ver catálogo", "cta_link": "/categoria/accesorios-telefono", "image_url": null}'::jsonb, TRUE),
  ('categories',        2, '{"title": "Categorías"}'::jsonb, TRUE),
  ('featured_products', 3, '{"title": "Destacados", "limit": 8}'::jsonb, TRUE),
  ('recent_products',   4, '{"title": "Lo más nuevo", "limit": 8}'::jsonb, TRUE)
ON CONFLICT DO NOTHING;
