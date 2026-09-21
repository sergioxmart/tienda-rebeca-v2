-- Categorías de servicios y layouts independientes del Web Builder.
-- Forward-only: no modificar migrations ya aplicadas.

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS is_service BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE page_modules
  ADD COLUMN IF NOT EXISTS page_key TEXT NOT NULL DEFAULT 'store';

CREATE INDEX IF NOT EXISTS page_modules_page_key_position_idx
  ON page_modules(page_key, active, position, id);
