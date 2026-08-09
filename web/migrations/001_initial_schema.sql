-- TechStore — baseline inicial consolidado
-- Este archivo representa el esquema limpio de la aplicación.
-- No contiene credenciales ni usuarios administradores iniciales.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE categories (
  id            SERIAL PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  hero_image    TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX categories_active_order_idx ON categories(active, display_order, name);

CREATE TABLE attributes (
  id            SERIAL PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'color', 'number')),
  display_order INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX attributes_active_order_idx ON attributes(active, display_order, name);

CREATE TABLE attribute_values (
  id            SERIAL PRIMARY KEY,
  attribute_id  INTEGER NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
  value         TEXT NOT NULL,
  hex           TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT attribute_values_hex_format
    CHECK (hex IS NULL OR hex ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT attribute_values_attribute_value_unique UNIQUE (attribute_id, value)
);

CREATE INDEX attribute_values_attribute_idx
  ON attribute_values(attribute_id, active, display_order, value);

CREATE TABLE auth_users (
  id               SERIAL PRIMARY KEY,
  email            TEXT NOT NULL UNIQUE,
  password_hash    TEXT NOT NULL,
  name             TEXT NOT NULL DEFAULT '',
  role             TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'operator', 'viewer')),
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  totp_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  totp_secret_enc  TEXT,
  totp_enabled_at  TIMESTAMPTZ,
  last_login_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX auth_users_role_idx ON auth_users(role, active);

CREATE TABLE customer_accounts (
  id             SERIAL PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL DEFAULT '',
  phone          TEXT NOT NULL DEFAULT '',
  last_login_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE themes (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  version     TEXT NOT NULL DEFAULT '1.0.0',
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE products (
  id           SERIAL PRIMARY KEY,
  category_id  INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  sku          TEXT UNIQUE,
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  description  TEXT NOT NULL DEFAULT '',
  brand        TEXT NOT NULL DEFAULT '',
  base_price   NUMERIC(10, 0) NOT NULL DEFAULT 0 CHECK (base_price >= 0),
  compare_at   NUMERIC(10, 0) CHECK (compare_at IS NULL OR compare_at >= 0),
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  featured     BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX products_category_idx ON products(category_id, active, display_order);
CREATE INDEX products_featured_idx ON products(featured, active, display_order);

CREATE TABLE product_variants (
  id           SERIAL PRIMARY KEY,
  product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku          TEXT UNIQUE,
  price        NUMERIC(10, 0) CHECK (price IS NULL OR price >= 0),
  compare_at   NUMERIC(10, 0) CHECK (compare_at IS NULL OR compare_at >= 0),
  stock        INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  description  TEXT NOT NULL DEFAULT '',
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX product_variants_product_idx
  ON product_variants(product_id, active, display_order);

CREATE TABLE product_media (
  id            SERIAL PRIMARY KEY,
  product_id    INTEGER REFERENCES products(id) ON DELETE SET NULL,
  variant_id    INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
  category_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('image', 'video_embed')),
  url           TEXT NOT NULL,
  mime          TEXT NOT NULL DEFAULT '',
  size_bytes    BIGINT NOT NULL DEFAULT 0,
  width         INTEGER,
  height        INTEGER,
  alt_text      TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX product_media_product_idx
  ON product_media(product_id, deleted_at, display_order);
CREATE INDEX product_media_orphan_idx
  ON product_media(deleted_at, created_at);
CREATE INDEX product_media_variant_idx
  ON product_media(variant_id, deleted_at, display_order);
CREATE INDEX product_media_category_idx
  ON product_media(category_id, deleted_at, display_order);

CREATE TABLE product_attributes (
  product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  attribute_id  INTEGER NOT NULL REFERENCES attributes(id) ON DELETE RESTRICT,
  is_required   BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, attribute_id)
);

CREATE INDEX product_attributes_product_order_idx
  ON product_attributes(product_id, display_order);

CREATE TABLE variant_attribute_values (
  variant_id         INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  attribute_id       INTEGER NOT NULL REFERENCES attributes(id) ON DELETE RESTRICT,
  attribute_value_id INTEGER NOT NULL REFERENCES attribute_values(id) ON DELETE RESTRICT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (variant_id, attribute_id)
);

CREATE INDEX variant_attribute_values_attribute_idx
  ON variant_attribute_values(attribute_id, attribute_value_id);
CREATE INDEX variant_attribute_values_value_idx
  ON variant_attribute_values(attribute_value_id);

CREATE TABLE product_media_variants (
  media_id    INTEGER NOT NULL REFERENCES product_media(id) ON DELETE CASCADE,
  variant_id  INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (media_id, variant_id)
);

CREATE INDEX product_media_variants_variant_idx ON product_media_variants(variant_id);

CREATE TABLE auth_refresh_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  user_agent  TEXT NOT NULL DEFAULT '',
  ip          TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX auth_refresh_tokens_user_idx ON auth_refresh_tokens(user_id, revoked_at, expires_at);

CREATE TABLE auth_totp_backup_codes (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  code_hash  TEXT NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX auth_totp_backup_codes_user_idx ON auth_totp_backup_codes(user_id, used_at);

CREATE TABLE auth_audit_log (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER REFERENCES auth_users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  ip         TEXT NOT NULL DEFAULT '',
  meta       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX auth_audit_log_user_idx ON auth_audit_log(user_id, created_at DESC);
CREATE INDEX auth_audit_log_action_idx ON auth_audit_log(action, created_at DESC);

CREATE TABLE auth_password_recovery_tokens (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  purpose    TEXT NOT NULL CHECK (purpose IN ('email', 'password')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  ip         TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX auth_password_recovery_tokens_user_idx
  ON auth_password_recovery_tokens(user_id, purpose, used_at, expires_at);

CREATE TABLE customer_otp_challenges (
  id          SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,
  purpose     TEXT NOT NULL DEFAULT 'login' CHECK (purpose IN ('login')),
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  consumed_at TIMESTAMPTZ,
  request_ip  TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX customer_otp_active_idx
  ON customer_otp_challenges(customer_id, purpose, expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE customer_sessions (
  id          SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX customer_sessions_customer_idx ON customer_sessions(customer_id, expires_at);

CREATE TABLE customer_addresses (
  id              SERIAL PRIMARY KEY,
  customer_id     INTEGER NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  label           TEXT NOT NULL DEFAULT 'Casa',
  recipient_name  TEXT NOT NULL DEFAULT '',
  phone           TEXT NOT NULL DEFAULT '',
  department      TEXT NOT NULL DEFAULT '',
  address         TEXT NOT NULL DEFAULT '',
  city            TEXT NOT NULL DEFAULT '',
  notes           TEXT NOT NULL DEFAULT '',
  latitude        NUMERIC(9, 6),
  longitude       NUMERIC(9, 6),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT customer_addresses_latitude_range
    CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CONSTRAINT customer_addresses_longitude_range
    CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

CREATE INDEX customer_addresses_customer_idx ON customer_addresses(customer_id, created_at DESC);
CREATE INDEX customer_addresses_location_idx ON customer_addresses(department, city);

CREATE TABLE orders (
  id              SERIAL PRIMARY KEY,
  order_number    TEXT NOT NULL UNIQUE,
  client_id       INTEGER REFERENCES customer_accounts(id) ON DELETE SET NULL,
  customer_email  TEXT NOT NULL,
  customer_name   TEXT NOT NULL,
  customer_phone  TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'expired', 'refunded')),
  subtotal        NUMERIC(10, 0) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  shipping        NUMERIC(10, 0) NOT NULL DEFAULT 0 CHECK (shipping >= 0),
  tax             NUMERIC(10, 0) NOT NULL DEFAULT 0 CHECK (tax >= 0),
  total           NUMERIC(10, 0) NOT NULL DEFAULT 0 CHECK (total >= 0),
  shipping_address JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes           TEXT NOT NULL DEFAULT '',
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX orders_status_idx ON orders(status, created_at DESC);
CREATE INDEX orders_customer_email_idx ON orders(customer_email, created_at DESC);
CREATE INDEX orders_client_idx ON orders(client_id, created_at DESC);
CREATE INDEX orders_expiration_idx ON orders(status, expires_at)
  WHERE status = 'pending' AND expires_at IS NOT NULL;

CREATE TABLE order_items (
  id           SERIAL PRIMARY KEY,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id   INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  variant_sku  TEXT NOT NULL DEFAULT '',
  quantity     INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price   NUMERIC(10, 0) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  line_total   NUMERIC(10, 0) NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX order_items_order_idx ON order_items(order_id);
CREATE INDEX order_items_variant_idx ON order_items(variant_id);

CREATE TABLE payments (
  id                      SERIAL PRIMARY KEY,
  order_id                INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  provider                TEXT NOT NULL,
  provider_transaction_id TEXT NOT NULL DEFAULT '',
  status                  TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'declined', 'error', 'refunded', 'voided')),
  amount                  NUMERIC(10, 0) NOT NULL CHECK (amount >= 0),
  currency                TEXT NOT NULL DEFAULT 'COP',
  payment_method          TEXT NOT NULL DEFAULT '',
  raw_response            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX payments_order_idx ON payments(order_id, created_at DESC);
CREATE INDEX payments_provider_idx ON payments(provider, provider_transaction_id);
CREATE UNIQUE INDEX payments_provider_transaction_unique_idx
  ON payments(provider, provider_transaction_id)
  WHERE provider_transaction_id <> '';

CREATE TABLE page_modules (
  id          SERIAL PRIMARY KEY,
  type        TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  settings    JSONB NOT NULL DEFAULT '{}'::jsonb,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX page_modules_position_idx ON page_modules(active, position);

CREATE TABLE builder_drafts (
  id                  SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  modules             JSONB NOT NULL DEFAULT '[]'::jsonb,
  site_config_subset  JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_theme_id     INTEGER REFERENCES themes(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inventory_movements (
  id           SERIAL PRIMARY KEY,
  variant_id   INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('in', 'out')),
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  stock_before INTEGER NOT NULL CHECK (stock_before >= 0),
  stock_after  INTEGER NOT NULL CHECK (stock_after >= 0),
  reason       TEXT NOT NULL DEFAULT '',
  created_by   INTEGER REFERENCES auth_users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX inventory_movements_variant_idx ON inventory_movements(variant_id, created_at DESC);

CREATE TABLE order_stock_reservations (
  id          SERIAL PRIMARY KEY,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id  INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  status      TEXT NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'committed', 'released')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  UNIQUE (order_id, variant_id)
);

CREATE INDEX order_stock_reservations_variant_idx
  ON order_stock_reservations(variant_id, status);
CREATE INDEX order_stock_reservations_order_idx
  ON order_stock_reservations(order_id, status);

CREATE TABLE attribute_categories (
  attribute_id INTEGER NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
  category_id  INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (attribute_id, category_id)
);

CREATE INDEX attribute_categories_category_idx ON attribute_categories(category_id, attribute_id);

CREATE TABLE attribute_category_values (
  attribute_id       INTEGER NOT NULL,
  category_id        INTEGER NOT NULL,
  attribute_value_id INTEGER NOT NULL REFERENCES attribute_values(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (attribute_id, category_id, attribute_value_id),
  FOREIGN KEY (attribute_id, category_id)
    REFERENCES attribute_categories(attribute_id, category_id) ON DELETE CASCADE
);

CREATE INDEX attribute_category_values_category_idx
  ON attribute_category_values(category_id, attribute_id, attribute_value_id);

CREATE TABLE site_config (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER categories_updated_at
  BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER attributes_updated_at
  BEFORE UPDATE ON attributes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER attribute_values_updated_at
  BEFORE UPDATE ON attribute_values FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER auth_users_updated_at
  BEFORE UPDATE ON auth_users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER customer_accounts_updated_at
  BEFORE UPDATE ON customer_accounts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER themes_updated_at
  BEFORE UPDATE ON themes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER product_variants_updated_at
  BEFORE UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER customer_addresses_updated_at
  BEFORE UPDATE ON customer_addresses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER page_modules_updated_at
  BEFORE UPDATE ON page_modules FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER builder_drafts_updated_at
  BEFORE UPDATE ON builder_drafts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER site_config_updated_at
  BEFORE UPDATE ON site_config FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO categories (slug, name, description, display_order)
VALUES ('accesorios-telefono', 'Accesorios de teléfono', 'Accesorios para tu celular', 1);

INSERT INTO attributes (slug, name, type, display_order)
VALUES
  ('color', 'Color', 'color', 1),
  ('modelo-telefono', 'Modelo de teléfono', 'text', 2),
  ('tipo-conexion', 'Tipo de conexión', 'text', 3),
  ('largo', 'Largo', 'number', 4),
  ('capacidad-carga', 'Capacidad de carga', 'number', 5);

INSERT INTO site_config (key, value)
VALUES
  ('site_name', to_jsonb('TechStore'::text)),
  ('logo_url', 'null'::jsonb),
  ('contact_email', to_jsonb(''::text)),
  ('contact_phone', to_jsonb(''::text)),
  ('contact_phone_display', to_jsonb(''::text)),
  ('contact_instagram', to_jsonb(''::text)),
  ('contact_facebook', to_jsonb(''::text)),
  ('contact_address', to_jsonb(''::text)),
  ('contact_address_lines', '[]'::jsonb),
  ('currency', to_jsonb('COP'::text)),
  ('currency_symbol', to_jsonb('$'::text)),
  ('currency_locale', to_jsonb('es-CO'::text)),
  ('free_shipping_min', to_jsonb(150000)),
  ('navbar_announcement', to_jsonb('Envíos a toda Colombia · Compra fácil y segura'::text)),
  ('navbar_enabled', 'true'::jsonb),
  ('navbar_show_announcement', 'true'::jsonb),
  ('navbar_show_search', 'true'::jsonb),
  ('navbar_show_cart', 'true'::jsonb),
  ('navbar_show_categories', 'true'::jsonb),
  ('navbar_links', '[]'::jsonb),
  ('navbar_custom_code_enabled', 'false'::jsonb),
  ('navbar_custom_code', to_jsonb(''::text)),
  ('store_accent_color', to_jsonb('#FF6B35'::text)),
  ('store_primary_color', to_jsonb('#0F2A47'::text)),
  ('store_surface_color', to_jsonb('#FFFFFF'::text)),
  ('store_background_color', to_jsonb('#F7F8FA'::text)),
  ('store_heading_color', to_jsonb('#0F2A47'::text)),
  ('store_product_name_color', to_jsonb('#0F2A47'::text)),
  ('store_price_color', to_jsonb('#0F2A47'::text)),
  ('store_body_text_color', to_jsonb('#172536'::text)),
  ('admin_sidebar_bg', to_jsonb('#0F2A47'::text)),
  ('admin_active_color', to_jsonb('#FF6B35'::text)),
  ('admin_main_bg', to_jsonb('#F4F6F8'::text)),
  ('admin_surface_bg', to_jsonb('#FFFFFF'::text)),
  ('admin_text_color', to_jsonb('#1A2733'::text)),
  ('admin_login_bg', to_jsonb('#0F2A47'::text)),
  ('admin_login_bg_secondary', to_jsonb('#FF6B35'::text)),
  ('admin_login_bg_mode', to_jsonb('solid'::text)),
  ('admin_login_bg_image_url', 'null'::jsonb),
  ('admin_login_bg_position_x', to_jsonb(50)),
  ('admin_login_bg_position_y', to_jsonb(50)),
  ('admin_login_bg_zoom', to_jsonb(100)),
  ('admin_sidebar_bg_mode', to_jsonb('solid'::text)),
  ('admin_sidebar_bg_image_url', 'null'::jsonb),
  ('admin_sidebar_bg_position_x', to_jsonb(50)),
  ('admin_sidebar_bg_position_y', to_jsonb(50)),
  ('admin_sidebar_bg_zoom', to_jsonb(100)),
  ('admin_main_bg_mode', to_jsonb('solid'::text)),
  ('admin_main_bg_image_url', 'null'::jsonb),
  ('admin_main_bg_position_x', to_jsonb(50)),
  ('admin_main_bg_position_y', to_jsonb(50)),
  ('admin_main_bg_zoom', to_jsonb(100));

INSERT INTO page_modules (type, position, settings)
VALUES
  ('hero', 1, '{"title":"Todo para tu celular, en un solo lugar","subtitle":"Carcasas, forros, cargadores, audífonos y más. Envío a todo Colombia.","cta_text":"Ver catálogo","cta_link":"/categoria/accesorios-telefono","image_url":null}'::jsonb),
  ('categories', 2, '{"title":"Categorías"}'::jsonb),
  ('featured_products', 3, '{"title":"Destacados","limit":8}'::jsonb),
  ('recent_products', 4, '{"title":"Lo más nuevo","limit":8}'::jsonb),
  ('footer', 5, '{}'::jsonb);

-- La relación inicial permite que cada atributo activo esté disponible en las
-- categorías existentes; desde el admin se puede ajustar por categoría.
INSERT INTO attribute_categories (attribute_id, category_id)
SELECT a.id, c.id
FROM attributes a
CROSS JOIN categories c
WHERE a.active AND c.active;

INSERT INTO attribute_category_values (attribute_id, category_id, attribute_value_id)
SELECT ac.attribute_id, ac.category_id, av.id
FROM attribute_categories ac
JOIN attribute_values av ON av.attribute_id = ac.attribute_id
WHERE av.active;

-- Usuarios y pedidos empiezan vacíos. Las secuencias se dejan explícitamente
-- listas para que el primer registro creado vuelva a usar el ID 1.
ALTER SEQUENCE auth_users_id_seq RESTART WITH 1;
ALTER SEQUENCE customer_accounts_id_seq RESTART WITH 1;
ALTER SEQUENCE orders_id_seq RESTART WITH 1;
