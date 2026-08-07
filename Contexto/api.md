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
| POST | `/api/public/checkout` | `{ items: [{ variant_id, quantity }], customer, address, payment_provider }` | Crea `order` + `payment_intent` con el provider elegido. Devuelve `checkout_url` para redirigir. |
| GET  | `/api/public/orders/:order_number` | `?email=` | Lookup de pedido por número + email (sin login). El cliente puede ver el estado de su pedido. |

## `/api/admin/*` (panel)

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
| POST | `/api/admin/attributes` | `{ slug, name, type?, display_order?, active? }` | `attributes` |
| PATCH | `/api/admin/attributes/:id` | (subset) | `attributes` |
| DELETE | `/api/admin/attributes/:id` | — | `attributes` |

### Valores de atributos

| Método | Path | Body | Section |
| ------ | ---- | ---- | ------- |
| GET | `/api/admin/attributes/:attributeId/values` | — | `attribute_values` |
| POST | `/api/admin/attributes/:attributeId/values` | `{ value, display_order?, active? }` | `attribute_values` |
| PATCH | `/api/admin/attribute-values/:id` | (subset) | `attribute_values` |
| DELETE | `/api/admin/attribute-values/:id` | — | `attribute_values` |

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
| POST | `/api/admin/products/:productId/variants` | `{ sku?, price?, compare_at?, stock?, active?, display_order?, attribute_values: [{ attribute_id, value }] }` | `variants` |
| PATCH | `/api/admin/variants/:id` | (subset) | `variants` |
| DELETE | `/api/admin/variants/:id` | — | `variants` |
| PATCH | `/api/admin/variants/:id/stock` | `{ stock, reason? }` | `variants` (ajuste rápido de stock, queda en audit log) |

### Media

| Método | Path | Body | Section |
| ------ | ---- | ---- | ------- |
| GET | `/api/admin/media` | `?product_id=&kind=&page=&limit=` | `media` |
| POST | `/api/admin/media` | `multipart/form-data` con `file`, `product_id?`, `alt_text?`, `display_order?` | `media` |
| PATCH | `/api/admin/media/:id` | `{ alt_text?, display_order? }` | `media` |
| DELETE | `/api/admin/media/:id` | — | `media` (soft-delete) |
| POST | `/api/admin/media/cleanup` | — | `media` (borra huérfanas >30d) |

### Site config

| Método | Path | Body | Section |
| ------ | ---- | ---- | ------- |
| GET | `/api/admin/site-config` | — | `site_config` |
| PATCH | `/api/admin/site-config` | `{ key: value, ... }` (objeto JSON con los keys a actualizar) | `site_config` |
| POST | `/api/admin/site-config/logo` | `multipart/form-data` con `file` | Sube o reemplaza el logo. Devuelve una URL pública `/media/site/...`. |
| DELETE | `/api/admin/site-config/logo` | — | Elimina el logo actual y deja `logo_url` en `null`. |
| POST | `/api/admin/site-config/login-background` | `multipart/form-data` con `file` | Sube o reemplaza la imagen de fondo del login. |
| DELETE | `/api/admin/site-config/login-background` | — | Elimina la imagen de fondo del login. |

### Pedidos (admin)

| Método | Path | Body | Section |
| ------ | ---- | ---- | ------- |
| GET | `/api/admin/orders` | `?status=&q=&from=&to=&page=&limit=` | `orders` |
| GET | `/api/admin/orders/:id` | — | `orders` |
| PATCH | `/api/admin/orders/:id` | `{ status?, notes? }` (cambiar status mueve el pedido en el kanban) | `orders` |
| POST | `/api/admin/orders/:id/refund` | `{ amount?, reason? }` (amount=null = total) | `orders` |

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
| POST | `/api/webhooks/wompi` | Eventos de Wompi (transaction.updated). Valida firma con `wompi.events_secret`. Actualiza el `payment` correspondiente. |
| POST | `/api/webhooks/epayco` | Eventos de ePayco. Valida firma con `epayco.secret`. Idem. |
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
- [ ] Webhooks: `wompi`, `epayco` (cuando Sergio tenga credenciales)
