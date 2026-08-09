# Migrations — TechStore

> **Última actualización: 2026-08-08**

## Estado actual

El schema inicial de TechStore y sus extensiones actuales ya están en esta
carpeta. Las migraciones heredadas de Rebeca no aplican a este proyecto.

## Cómo se corren

```bash
# 1. Una vez por máquina: crear DB y rol
npm run db:setup

# 2. Cada vez que se agrega una migration
npm run migrate
```

`migrate.js` (en `web/server/scripts/`) delega en el runner genérico de
`core/scripts/migrate.js`. Lee `migrations/*.sql` en orden lexicográfico y
aplica las que no estén registradas en la tabla `_migrations`. Es
idempotente.

## Convención de nombres

```text
NNN_descripcion_corta.sql
```

- `NNN` = número zero-padded de 3 dígitos (`001`, `002`, …). Forward-only:
  **nunca** se edita una migration ya aplicada. Cambios → la siguiente.
- `descripcion_corta` = snake_case, en inglés, sin preposición final
  (`products`, `product_variants`, `add_user_email_index`).

## Migraciones actuales (TechStore v1)

| # | Archivo | Cubre |
| - | ------- | ----- |
| 001 | `001_categories.sql` | Tabla `categories` + función `set_updated_at()` + seed inicial |
| 002 | `002_attributes.sql` | `attributes` + `attribute_values` + seed de 5 atributos comunes (color, modelo-telefono, tipo-conexion, largo, capacidad-carga) |
| 003 | `003_products.sql` | `products` (template) + `product_attributes` (M2M) + `product_media` |
| 004 | `004_variants.sql` | `product_variants` + `variant_attribute_values` |
| 005 | `005_admin_auth.sql` | `auth_users` + `auth_refresh_tokens` + `auth_totp_backup_codes` |
| 006 | `006_orders.sql` | `orders` + `order_items` (con snapshots) |
| 007 | `007_payments.sql` | `payments` (genérico por provider; ver nota abajo) |
| 008 | `008_site_config.sql` | `site_config` (key/value JSONB) + seeds |
| 009 | `009_auth_admin_extras.sql` | Extras de autenticación y auditoría del panel |
| 010 | `010_page_modules.sql` | Módulos configurables de páginas |
| 011 | `011_themes.sql` | Temas y configuración visual |
| 012 | `012_password_recovery.sql` | Tokens temporales, hasheados y de un solo uso para recuperar la contraseña |
| 013 | `013_variant_media_colors.sql` | `attribute_values.hex`, descripción de variantes y `product_media.variant_id` para multimedia por variante |
| 014 | `014_inventory_movements.sql` | Libro mayor de entradas y salidas para `product_variants` |
| 015 | `015_prices_without_decimals.sql` | Importes monetarios en COP sin escala decimal |
| 016 | `016_media_variant_links.sql` | Asociaciones reutilizables de multimedia con variantes |
| 017 | `017_fix_product_attributes_trigger.sql` | Elimina trigger incompatible con `product_attributes` |
| 018 | `018_preserve_order_history_on_product_delete.sql` | Conserva snapshots de ventas al eliminar productos |
| 019 | `019_builder_drafts.sql` | Estado borrador aislado del Builder |
| 020 | `020_media_attribute_categories.sql` | Categorías para multimedia y atributos |
| 021 | `021_admin_theme_colors.sql` | Defaults de colores del panel administrativo |
| 022 | `022_admin_background_images.sql` | Fondos con imagen para Sidebar y área principal del admin |
| 023 | `023_login_background_crop.sql` | Encuadre de la imagen del fondo de login |
| 024 | `024_footer_builder_module.sql` | Convierte el Footer global en un módulo configurable del Builder |
| 025 | `025_epayco_idempotency.sql` | Evita procesar dos veces la misma referencia de ePayco |
| 026 | `026_remove_legacy_wompi_config.sql` | Elimina la configuración antigua de la pasarela reemplazada |
| 027 | `027_order_expiration.sql` | Agrega expiración de pedidos pendientes y el estado `expired` |
| 028 | `028_order_stock_reservations.sql` | Reserva, liberación y consolidación transaccional de inventario por pedido |
| 029 | `029_customer_portal_otp.sql` | Cuentas de clientes, login OTP sin contraseña, sesiones, direcciones y vínculo opcional con pedidos |
| 030 | `030_colombia_departments.sql` | Departamento en la libreta de direcciones e integración del snapshot de ubicación de Colombia |

## Lo que falta decidir

- **Pasarela de pago**: la tabla `payments` es agnóstica (`provider TEXT`).
  Cuando Sergio elija Mercado Pago / ePayco / Stripe, se agrega una
  migration con las columnas específicas del provider. Ver
  `Contexto/db-schema.md`.
- **Categorías adicionales**: hoy solo hay `accesorios-telefono`. Cuando
  Sergio sume `laptops`, `celulares`, etc., es un `INSERT` en `categories`.
- **Multimedia por variante**: desde `013` las imágenes pueden cargarse por
  variante y los videos se guardan como enlaces HTTPS embebidos.
- **Inventario separado**: desde `014` `product_variants` es el padre y
  `inventory_movements` registra las unidades como módulo hijo.
- **Expiración de pedidos**: los pedidos `pending` vencen después de 15 minutos
  por defecto; se puede cambiar con `ORDER_PENDING_TTL_MINUTES`. Al vencer se
  libera la reserva de inventario.
