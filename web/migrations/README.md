# Migrations — TechStore

> **Última actualización: 2026-08-06**

## Estado actual

**Vacía.** Pendiente de diseñar el schema inicial de TechStore (tienda de
tecnología: laptops, celulares, accesorios).

Las migraciones que estaban acá eran de Rebeca (boutique de vestidos de
novia / 15 años / trajes / zapatos) y **no aplican** a este proyecto — el
modelo de datos es totalmente distinto (variantes por color/spec en vez
de tallas, stock por SKU en vez de unidades por talle, sin alquiler, sin
kanban de reservas). Se borraron en el commit de
`feature/techstore-migrations-reset`.

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

## Lo que falta decidir

- **Pasarela de pago**: la tabla `payments` es agnóstica (`provider TEXT`).
  Cuando Sergio elija Wompi / ePayco / MercadoPago / Stripe, se agrega una
  migration con las columnas específicas del provider. Ver
  `Contexto/db-schema.md`.
- **Categorías adicionales**: hoy solo hay `accesorios-telefono`. Cuando
  Sergio sume `laptops`, `celulares`, etc., es un `INSERT` en `categories`.
- **Foto por variante**: en v1 las fotos son del producto (template). Si se
  quiere foto por variante, se agrega `variant_id` a `product_media`.
