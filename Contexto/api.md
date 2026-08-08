# TechStore — API reference

> **Última actualización: 2026-08-06**

Documento de referencia de los endpoints HTTP. La fuente de verdad es el
código en `web/server/routes/`. Este doc se mantiene al día con cada
cambio (regla del proyecto).

## Convenciones

- **Prefijos**:
  - `/api/auth/*`   → login, refresh, me. Sin auth requerida.
  - `/api/public/*` → cliente final (catálogo, checkout, etc). Sin auth.
  - `/api/admin/*`  → panel admin. Requiere JWT + CSRF en mutaciones.
  - `/api/webhooks/*` → webhooks entrantes (pagos, deploy). Sin auth JWT,
    validados por firma HMAC.
- **Content type**: `application/json` en body y respuesta (excepto
  upload de media que es `multipart/form-data`).
- **Errores**: `{ ok: false, error: '<slug>', ...extras }`. HTTP status
  apropiado (400, 401, 403, 404, 409, 500).
- **IDs**: `SERIAL` (entero positivo). En el API van como `id: number`.
- **Fechas**: ISO 8601 (`2026-08-06T15:30:00Z`).
- **Slugs**: `a-z`, `0-9`, `-` (validado en el server, no asumido).
- **Auth**: JWT 15 min en memoria del cliente + refresh 7d en cookie
  httpOnly. CSRF double-submit en mutaciones.

## Roles

| Rol | Puede escribir | Puede leer |
| --- | -------------- | ---------- |
| `admin` | Todo | Todo |
| `operator` | Operación: products (stock), orders, payments | Todo lo de lectura |
| `viewer` | — | Todo |

Cada ruta declara un `section` (en el array `routes` interno). El
`SECTION_PERMS` en `web/server/routes/admin/_section_perms.js` mapea
sección → roles permitidos. Defensa en profundidad: si una ruta nueva
no tiene `section`, devuelve 403.

## `/api/auth/*`

| Método | Path | Body | Notas |
| ------ | ---- | ---- | ----- |
| POST | `/api/auth/login` | `{ email, password, totp_code? }` | Devuelve JWT + setea refresh cookie. Si el user tiene 2FA, `totp_code` es obligatorio. |
| POST | `/api/auth/password-recovery/start` | `{ email }` | Valida el correo y devuelve un token temporal para la etapa 2FA. |
| POST | `/api/auth/password-recovery/verify` | `{ recovery_token, totp_code }` | Valida TOTP o un código de respaldo de un solo uso y devuelve un token temporal para cambiar la clave. |
| POST | `/api/auth/password-recovery/complete` | `{ password_token, new_password }` | Cambia la contraseña y revoca sesiones activas. |
| POST | `/api/auth/logout` | — | Revoca el refresh token actual. |
| POST | `/api/auth/refresh` | — | Lee el refresh cookie, devuelve nuevo JWT. |
| GET  | `/api/auth/me` | — | Devuelve el user logueado. Útil para que el panel sepa quién es y qué rol tiene. |
| POST | `/api/auth/2fa/setup` | — | Genera secret TOTP + códigos de respaldo. Devuelve URI otpauth para QR. |
| POST | `/api/auth/2fa/enable` | `{ totp_code }` | Activa 2FA después de verificar un código con el secret. |
| POST | `/api/auth/2fa/disable` | `{ password }` | Desactiva 2FA (requiere password). |
| POST | `/api/auth/2fa/first-setup` | `{ setup_token }` | Prepara el QR del enrolamiento obligatorio tras validar el password del primer ingreso. |
| POST | `/api/auth/2fa/first-enable` | `{ setup_token, totp_code }` | Confirma el enrolamiento y crea la sesión. |

## `/api/public/*` (catálogo)

| Método | Path | Query / Body | Notas |
| ------ | ---- | ------------ | ----- |
| GET | `/api/public/site-config` | — | `site_name`, contacto, moneda, branding. Cacheable. |
| GET | `/api/public/categories` | — | Lista categorías activas. Para el nav. |
| GET | `/api/public/categories/:slug` | — | Detalle de una categoría. |
| GET | `/api/public/attributes` | — | Lista de atributos globales con sus valores. Para los filtros del catálogo. |
| GET | `/api/public/products` | `?category=&featured=&q=&attribute=&page=&limit=` | Catálogo. `attribute` se puede repetir (`?attribute=color:Rojo&attribute=modelo-telefono:iPhone 15`). |
| GET | `/api/public/products/:slug` | — | Detalle: producto + variantes + media + atributos. |
| POST | `/api/public/cart/validate` | `{ items: [{ variant_id, product_id }] }` | Revalida eliminaciones y devuelve nombre, precio, imagen, atributos y stock vigentes. Sin auth. |
| POST | `/api/public/orders` | `{ customer: { name, email, phone, address, city, notes? }, items: [{ variant_id, product_id, qty }] }` | Recalcula precios y valida stock en el servidor. Crea `orders` + `order_items` con estado `pending`, reserva las unidades de forma transaccional y asigna expiración configurable (15 minutos por defecto); no requiere pasarela. |
| POST | `/api/public/checkout/payment-intent` | `{ order_number, email, provider: "mercadopago"|"epayco" }` | Recalcula el total desde el pedido pendiente y crea/reutiliza una preferencia de Mercado Pago Checkout Pro (`redirect_url`) o una sesión ePayco (`session_id`). Las llaves privadas nunca salen del backend. |
| GET  | `/api/public/orders/:order_number` | `?email=` | Lookup de pedido por número + email (sin login). El cliente puede ver el estado de su pedido. |

## `/api/admin/*` (panel)

### Pedidos y ventas

| Método | Path | Body / Query | Section |
| ------ | ---- | ------------ | ------- |
| GET | `/api/admin/orders` | `?status=&q=` | `orders` |
| GET | `/api/admin/orders/:id` | — | `orders` + `order_items` y `shipping_location` (`lat`, `lon`, `display_name`) cuando la dirección puede geocodificarse |
| GET | `/api/admin/sales` | `?from=&to=&payment_method=&status=` | `sales` |

### Categorías

| Método | Path | Body | Section |
| ------ | ---- | ---- | ------- |
| GET | `/api/admin/categories` | — | `categories` |
| GET | `/api/admin/categories/:id` | — | `categories` |
| POST | `/api/admin/categories` | `{ slug, name, description?, hero_image?, display_order?, active? }` | `categories` |
| PATCH | `/api/admin/categories/:id` | (cualquier subset) | `categories` |
| DELETE | `/api/admin/categories/:id` | — | `categories` |

### Atributos

| Método | Path | Body | Section |
| ------ | ---- | ---- | ------- |
| GET | `/api/admin/attributes` | — | `attributes` |
| GET | `/api/admin/attributes/:id` | — | `attributes` |
| POST | `/api/admin/attributes` | `{ slug, name, type?, display_order?, active?, category_ids? }` | `attributes` |
| PATCH | `/api/admin/attributes/:id` | `{ name?, slug?, type?, display_order?, active?, category_ids? }` | `attributes` |
| DELETE | `/api/admin/attributes/:id` | — | `attributes` |

### Valores de atributos

| Método | Path | Body | Section |
| ------ | ---- | ---- | ------- |
| GET | `/api/admin/attributes/:attributeId/values` | `?category_id=` opcional | `attribute_values` |
| POST | `/api/admin/attributes/:attributeId/values` | `{ value, hex?, display_order?, active?, category_id? }` | `attribute_values` |
| PATCH | `/api/admin/attribute-values/:id` | `{ value?, hex?, active? }` | `attribute_values` |
| DELETE | `/api/admin/attribute-values/:id` | `?category_id=` desvincula solo de esa categoría; sin parámetro elimina el valor global | `attribute_values` |

### Productos

| Método | Path | Body | Section |
| ------ | ---- | ---- | ------- |
| GET | `/api/admin/products` | `?category=&q=&active=&page=&limit=` | `products` |
| GET | `/api/admin/products/:id` | — | `products` |
| POST | `/api/admin/products` | `{ category_id, name, slug, sku?, description?, brand?, base_price, compare_at?, active?, featured?, display_order? }` | `products` |
| PATCH | `/api/admin/products/:id` | (subset) | `products` |
| DELETE | `/api/admin/products/:id` | — | `products` |
| POST | `/api/admin/products/:id/attributes` | `{ attribute_id, is_required?, display_order? }` | `products` |
| DELETE | `/api/admin/products/:id/attributes/:attributeId` | — | `products` |

### Variantes

| Método | Path | Body | Section |
| ------ | ---- | ---- | ------- |
| GET | `/api/admin/products/:productId/variants` | — | `variants` |
| GET | `/api/admin/variants/:id` | — | `variants` |
| POST | `/api/admin/products/:productId/variants` | `{ sku?, price?, compare_at?, stock?, description?, active?, display_order?, attribute_values: [{ attribute_id, attribute_value_id }] }` | `variants` |
| PATCH | `/api/admin/variants/:id` | `{ sku?, price?, compare_at?, stock?, description?, active?, display_order?, attribute_values?: [{ attribute_id, attribute_value_id }] }` | `variants` |
| DELETE | `/api/admin/variants/:id` | — | `variants` |
| PATCH | `/api/admin/variants/:id/stock` | `{ stock, reason? }` | `variants` (ajuste rápido de stock, queda en audit log) |

### Inventario

El inventario es hijo del catálogo: solo trabaja con variantes que ya
existen. Las entradas y salidas actualizan el saldo de la variante dentro
de una transacción y crean un movimiento auditable.

| Método | Path | Body / Query | Section |
| ------ | ---- | ------------ | ------- |
| GET | `/api/admin/inventory/variants` | `?product_id=&q=&low_stock=` | `inventory` |
| GET | `/api/admin/inventory/variants/:id` | — (incluye movimientos recientes) | `inventory` |
| POST | `/api/admin/inventory/movements` | `{ variant_id, movement_type: "in"\|"out", quantity, reason? }` | `inventory` |

### Media

| Método | Path | Body | Section |
| ------ | ---- | ---- | ------- |
| GET | `/api/admin/media` | `?product_id=&variant_id=&category_id=&kind=&page=&limit=` | `media` |
| POST | `/api/admin/media` | `multipart/form-data` con `file`, `product_id?`, `variant_id?`, `category_id?`, `alt_text?`; o JSON `{ kind: "video_embed", url, product_id, variant_id, category_id? }` | `media` |
| POST | `/api/admin/media/:id/attach` | `{ product_id, variant_id }` | `media` (reutiliza un archivo existente en una variante) |
| PATCH | `/api/admin/media/:id` | `{ alt_text?, display_order?, category_id? }` | `media` |
| DELETE | `/api/admin/media/:id` | — | `media` (borrado definitivo del registro y archivo físico) |
| DELETE | `/api/admin/media/:id/variants/:variantId` | — | `media` (desvincula de una variante, conserva el archivo) |
| POST | `/api/admin/media/cleanup` | — | `media` (borra huérfanas >30d) |

### Site config

| Método | Path | Body | Section |
| ------ | ---- | ---- | ------- |
| GET | `/api/admin/site-config` | — | `site_config` |
| PATCH | `/api/admin/site-config` | `{ key: value, ... }` (incluye colores admin y posiciones/zoom `admin_*_bg_position_x`, `admin_*_bg_position_y`, `admin_*_bg_zoom`) | `site_config` |
| POST | `/api/admin/site-config/logo` | `multipart/form-data` con `file` | Sube o reemplaza el logo. Devuelve una URL pública `/media/site/...`. |
| DELETE | `/api/admin/site-config/logo` | — | Elimina el logo actual y deja `logo_url` en `null`. |
| POST | `/api/admin/site-config/login-background` | `multipart/form-data` con `file` | Sube o reemplaza la imagen de fondo del login. |
| DELETE | `/api/admin/site-config/login-background` | — | Elimina la imagen de fondo del login. |
| POST | `/api/admin/site-config/admin-sidebar-background` | `multipart/form-data` con `file` | Sube o reemplaza el fondo del Sidebar del admin. |
| DELETE | `/api/admin/site-config/admin-sidebar-background` | — | Elimina la imagen del Sidebar y vuelve a color. |
| POST | `/api/admin/site-config/admin-main-background` | `multipart/form-data` con `file` | Sube o reemplaza el fondo principal del admin. |
| DELETE | `/api/admin/site-config/admin-main-background` | — | Elimina la imagen principal y vuelve a color. |

### Temas

| Método | Path | Body | Section |
| ------ | ---- | ---- | ------- |
| GET | `/api/admin/themes` | — | `site_config` |
| POST | `/api/admin/themes` | `{ name, description? }` | `site_config` |
| GET | `/api/admin/themes/:id/export` | — | `site_config` |
| GET | `/api/admin/themes/current/export` | — | `site_config` (descarga el snapshot del estado aplicado actualmente) |
| POST | `/api/admin/themes/import/preview` | `multipart/form-data` con `file`; devuelve módulos y configuración para seleccionar | `site_config` |
| POST | `/api/admin/themes/import` | `multipart/form-data` con `file`, `module_indexes` JSON opcional | `site_config` |
| POST | `/api/admin/themes/:id/apply` | —; carga el tema al borrador, no modifica la tienda publicada | `site_config` |
| DELETE | `/api/admin/themes/:id` | — | `site_config` |

### Web Builder y borradores

El Builder trabaja sobre un único borrador aislado. La tienda pública
continúa leyendo `page_modules` y `site_config` publicados hasta que el
administrador confirma la publicación.

| Método | Path | Body / Resultado | Section |
| ------ | ---- | --------------- | ------- |
| GET | `/api/admin/builder/draft` | Devuelve el borrador o un snapshot del estado publicado si no existe | `site_config` |
| POST | `/api/admin/builder/draft` | `{ modules, site_config_subset }` | `site_config` |
| POST | `/api/admin/builder/draft/from-theme/:id` | Carga un tema al borrador | `site_config` |
| DELETE | `/api/admin/builder/draft` | Descarta el borrador | `site_config` |
| POST | `/api/admin/builder/publish` | Copia el borrador al estado publicado y lo elimina | `site_config` |

### Pedidos (admin)

| Método | Path | Body | Section |
| ------ | ---- | ---- | ------- |
| GET | `/api/admin/orders` | `?status=&q=&from=&to=&page=&limit=` | `orders` |
| GET | `/api/admin/orders/:id` | — | `orders` + `order_items` y `shipping_location` (`lat`, `lon`, `display_name`) cuando la dirección puede geocodificarse |
| PATCH | `/api/admin/orders/:id` | `{ status?, notes? }` (cambiar status mueve el pedido en el kanban) | `orders` |
| POST | `/api/admin/orders/:id/refund` | `{ amount?, reason? }` (amount=null = total) | `orders` |

### Ventas (admin)

| Método | Path | Body / Query | Section |
| ------ | ---- | ------------ | ------- |
| GET | `/api/admin/sales` | `?from=YYYY-MM-DD&to=YYYY-MM-DD` opcionales | `sales` |

### Pagos (admin)

| Método | Path | Body | Section |
| ------ | ---- | ---- | ------- |
| GET | `/api/admin/payments` | `?order_id=&provider=&status=&page=&limit=` | `payments` |
| GET | `/api/admin/payments/:id` | — | `payments` |

### Usuarios admin

| Método | Path | Body | Section |
| ------ | ---- | ---- | ------- |
| GET | `/api/admin/users` | — | `users` |
| GET | `/api/admin/users/:id` | — | `users` |
| POST | `/api/admin/users` | `{ email, password, name?, role? }` | `users` |
| PATCH | `/api/admin/users/:id` | `{ name?, role?, active? }` | `users` |
| POST | `/api/admin/users/:id/reset-password` | `{ new_password }` | `users` |
| POST | `/api/admin/users/:id/reset-2fa` | — | Elimina el 2FA, el secreto y los códigos de respaldo; el siguiente login vuelve a exigir configuración. |
| POST | `/api/admin/users/:id/2fa/setup` | — | Solo para el usuario `id=1` y ejecutado por él mismo desde Usuarios. Devuelve QR y códigos de respaldo. |
| DELETE | `/api/admin/users/:id` | — | `users` |

## `/api/webhooks/*` (entrantes)

| Método | Path | Notas |
| ------ | ---- | ----- |
| GET/POST | `/api/webhooks/epayco` | Confirmación ePayco. Valida la firma SHA-256 con `EPAYCO_CUSTOMER_ID` + `EPAYCO_P_KEY`, valida factura/monto/moneda, procesa `x_ref_payco` de forma idempotente y actualiza el pedido aprobado a `paid`. |
| POST | `/api/webhooks/mercadopago` | Notificaciones de pagos. Valida `x-signature` con el secreto de Mercado Pago, consulta el pago en server-to-server, valida referencia/monto/moneda, procesa el ID de pago de forma idempotente y actualiza el pedido aprobado a `paid`. |
| POST | `/api/webhooks/deploy` | (futuro) Deploy desde GitHub. Cableado en `web/webhook/server.mjs`; ver [`webhook.md`](./webhook.md) para el setup cuando se deploye. |

## Lo que falta implementar

Esta lista refleja el **roadmap por sesión** (ver `Contexto/plan.md` o
donde se documente):

- [x] `Contexto/api.md` (este doc)
- [x] Admin: `attributes` + `attribute_values` (sesión 1)
- [ ] Admin: `categories`, `products`, `variants`, `media`, `site_config`
- [ ] Admin: `orders`, `payments`, `users`
- [ ] Public: `categories`, `attributes`, `products`, `products/:slug`
- [ ] Public: `checkout`, `orders/:order_number`
- [x] Webhooks: `epayco` (requiere credenciales Testing y URL pública HTTPS para recibir confirmaciones)
