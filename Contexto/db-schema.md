# TechStore — Modelo de datos

> **Última actualización: 2026-08-06**

Documento de referencia del schema de TechStore v1. Para los archivos
SQL exactos ver `web/migrations/`. Para el orden de aplicación y el
runner, ver `Contexto/dev-setup.md`.

## Decisiones de scope (v1)

- **Rubro**: accesorios de teléfono. Categoría única seed; el modelo
  es extensible (FK `category_id` permite sumar `laptops`, `celulares`,
  etc. sin migration).
- **Variantes reales**: cada producto es un template; las combinaciones
  vendibles son filas en `product_variants` con sus valores de atributos.
- **Stock por variante** (no por producto).
- **Moneda**: COP. Configurable vía `site_config.currency`.
- **Cierre**: checkout con pasarela (a definir). Tabla `payments`
  genérica.
- **Auth**: solo admin. Sin login de clientes (los pedidos se hacen
  con email, sin cuenta).

## Diagrama de entidades

```
        ┌──────────────┐
        │  categories  │
        └──────┬───────┘
               │ 1
               │
               │ N
        ┌──────▼───────┐         N     N  ┌──────────────┐
        │   products   ├────M2M─────────► │  attributes  │
        │  (template)  │  product_attrs  └──────┬───────┘
        └──────┬───────┘                        │ 1
               │ 1                              │
               │                                │ N
               │ N                       ┌──────▼──────────────┐
        ┌──────▼──────────┐              │  attribute_values   │
        │ product_variants│              └──────┬──────────────┘
        │   (SKU real)    │                     │ 1
        └──────┬──────────┘                     │
               │ 1                              │ N
               │                                │
               │ N  ┌──────────────────────────►│
        ┌──────▼────▼───────┐                    │
        │variant_attr_values│ ◄──────────────────┘
        │  (M2M + value_id) │
        └───────────────────┘


  ┌──────────────┐  1   N  ┌──────────────┐  N   1  ┌──────────────┐
  │  auth_users  ├────────►│ auth_refresh │         │ product_vars │
  │              │         │   _tokens    │         └──────────────┘
  └──────┬───────┘         └──────────────┘
         │ 1
         │ N
  ┌──────▼──────────────┐
  │auth_totp_backup_codes│
  └─────────────────────┘


  ┌──────────────┐  1   N  ┌──────────────┐  N   1  ┌──────────────┐
  │    orders    ├────────►│  order_items ├────────►│product_vars  │
  │              │         │  (snapshot)  │         └──────────────┘
  └──────┬───────┘         └──────────────┘
         │ 1
         │ N
  ┌──────▼───────┐
  │   payments   │
  │  (provider)  │
  └──────────────┘


  ┌──────────────┐
  │ site_config  │  (key/value JSONB, sin FK)
  └──────────────┘
```

## Tablas

### `categories` (`001_categories.sql`)

Taxonomía del catálogo. v1 tiene 1 fila seed (`accesorios-telefono`).
El admin puede sumar más desde el panel (sin migration).

### `attributes` + `attribute_values` (`002_attributes.sql`)

**Atributos configurables** (color, modelo-telefono, tipo-conexion,
largo, capacidad-carga) con sus valores posibles. Los atributos son
globales y los valores los crea el admin.

- `attributes.slug` es **estable**: NO renombrar (se referencia en código
  y migraciones).
- `attribute_values.value` es texto libre: "Rojo", "iPhone 15", "1m", etc.
- `attribute_values.hex` guarda opcionalmente el color visual en formato `#RRGGBB`.
- `attribute_values(attribute_id, value)` es UNIQUE.

### `products` (`003_products.sql`)

**Template** del producto. "Funda iPhone transparente" — sin color ni
modelo. El precio default es `base_price`; cada variante puede override.

- `sku` es opcional (código interno).
- `slug` se usa en URLs (`/producto/funda-iphone-15`).
- `brand` opcional ("Apple", "Samsung", "Spigen", "Anker").
- `featured` aparece en el carrusel del home.
- Foto: en v1, las fotos son DEL PRODUCTO (template), no por variante.

### `product_attributes` (`003_products.sql`)

M2M `products ↔ attributes` con `is_required`. Define **qué atributos
aplican a este producto** y si el cliente DEBE elegir un valor.

Ej: "Funda iPhone" tiene `color` (required) + `modelo-telefono` (required).
"Cable USB-C" tiene `tipo-conexion` (required) + `largo` (required).

### `product_media` (`003_products.sql`)

Galería de fotos y embeds de video. Misma lógica que usamos
para media: `kind ∈ {image, video_embed}`, `variant_id` opcional para asociar
la pieza a una combinación concreta, soft-delete con
`deleted_at`, huérfanas (>30 días sin `product_id`) se limpian con
un cron (no en SQL).

### `product_variants` (`004_variants.sql`, `013_variant_media_colors.sql`)

**Las combinaciones vendibles.** Cada fila es un SKU concreto con su
stock y (opcionalmente) su precio override.

- `price` NULL = usa `products.base_price`.
- `compare_at` es para tachar ("antes X, ahora Y").
- `stock >= 0` (CHECK). El saldo se actualiza desde Inventario y se descuenta
  en checkout de forma transaccional.
- `description` permite una descripción específica para cada variante.
- **Invariante (enforced por app)**: la combinación de valores de
  atributos debe ser única dentro del mismo `product_id`. Ver
  `variant_attribute_values` abajo.

### `variant_attribute_values` (`004_variants.sql`)

M2M `product_variants ↔ attribute_values`. Una variante tiene **un valor
por atributo aplicable**.

- PK `(variant_id, attribute_id)`: una variante no puede tener 2 valores
  del mismo atributo.
- **Validación de unicidad de combinación**: la app, al crear/editar
  variantes, ordena los `(attribute_id, attribute_value_id)` de cada
  variante y compara. Si dos del mismo `product_id` coinciden → error.
  No se hace en SQL porque la comparación depende del conjunto de
  atributos aplicables (no de los presentes).

### `inventory_movements` (`014_inventory_movements.sql`)

Libro mayor hijo de `product_variants`. Cada movimiento es una entrada o
salida positiva y conserva `stock_before` y `stock_after`; el saldo vigente
continúa viviendo en `product_variants.stock` para que catálogo y checkout
puedan consultarlo rápidamente.

### `auth_users` + `auth_refresh_tokens` + `auth_totp_backup_codes` (`005_admin_auth.sql`)

Login admin con bcrypt + JWT + refresh + 2FA TOTP, patrón
compartido con otros proyectos del estilo. Salvo el usuario bootstrap
`id=1`, una cuenta sin 2FA no puede recibir sesión: debe enrolarse en su
primer ingreso. El usuario `id=1` lo activa desde Usuarios.
- bcrypt para passwords.
- JWT 15 min en memoria del cliente.
- Refresh token 7 días en cookie httpOnly (server guarda solo el hash).
- CSRF double-submit.
- 2FA TOTP opcional (AES-GCM del secret en `auth_users.totp_secret_enc`,
  códigos de respaldo hasheados en `auth_totp_backup_codes`).

Roles: `admin` (todo), `operator` (operación diaria), `viewer` (lectura).
Los mismos del proyecto (`admin` / `operator` / `viewer`); la
lógica común de `SECTION_PERMS` vive en
`web/server/routes/admin/_section_perms.js`.

### `auth_password_recovery_tokens` (`012_password_recovery.sql`)

Tokens opacos y temporales para el asistente de recuperación: primero se
valida el correo, luego TOTP o un código de respaldo, y finalmente se
permite definir la nueva contraseña. Solo se guarda el hash del token;
cada token expira en 10 minutos y se puede consumir una sola vez.

### `orders` + `order_items` (`006_orders.sql`)

Pedidos. **Snapshot en cada línea**: `product_name`, `variant_sku`,
`unit_price`, `line_total` se guardan al momento de la compra. Si
después se edita el producto o cambia el precio, el pedido NO se altera.

Status del pedido (kanban admin): `pending` → `paid` → `processing` →
`shipped` → `delivered`. Más `cancelled` y `refunded`.

`shipping_address` es JSONB en v1. Cuando integremos un proveedor de
envíos (Coordinadora, Servientrega), agregamos `carrier`,
`tracking_number`, `label_url` en una migration.

### `payments` (`007_payments.sql`)

Una fila por transacción con la pasarela. Un pedido puede tener varios
intentos (ej: primero declined, después approved).

- `provider` ∈ {'wompi', 'epayco', 'mercadopago', 'stripe', 'manual', …}.
- `provider_transaction_id` es el ID del lado de la pasarela.
- `raw_response` guarda el body completo de la respuesta del provider
  (JSONB). Pensado para que un dev pueda pegarlo en un ticket sin
  tener que ir a la consola de la pasarela.

**Esta tabla es genérica** porque la pasarela todavía no está definida.
Cuando Sergio elija, se agrega una migration con columnas específicas:
- Wompi: nada extra, todo viene en `raw_response`.
- ePayco: similar.
- MercadoPago: idem, plus `payment_method_id`.
- Stripe: `payment_intent_id`, `charge_id`.

Si después queremos validar firmas de webhook o sincronizar estados,
esa lógica vive en código de la app (`web/server/routes/payments.js`),
NO en SQL.

### `site_config` (`008_site_config.sql`)

Pares `key → JSONB`. Globals operacionales del sitio (nombre, contacto,
moneda, branding). El admin los edita desde el panel; el público los lee
en cada request. Cuando integremos la pasarela, agregamos acá
`pasarela_public_key`, `pasarela_env` (sandbox/prod), etc.

## Decisiones que se tomaron y por qué

- **`SERIAL PRIMARY KEY`**: no usamos UUID (mantenemos el patrón
  simple del stack).
- **`NUMERIC(10,2)` para plata**: alcanza hasta 99.999.999,99 COP
  (suficiente para casi cualquier pedido de accesorios).
- **Snapshots en `order_items`**: regla del e-commerce. La historia
  del pedido es inmutable aunque cambien precios/nombres.
- **Media híbrida**: las fotos generales siguen en el template y las
  imágenes/videos específicos se asocian a una variante mediante
  `product_media.variant_id`.
- **`stock` se descuenta en checkout, no al agregar al carrito**: el
  carrito es efímero (sessionStorage). El stock se mueve recién cuando
  el pago se aprueba.
- **Sin tabla `customers`**: los pedidos se hacen con email, sin login.
  Si después el cliente quiere cuenta, agregamos `customers` + FK desde
  `orders`.

## Lo que NO está en v1 (a propósito)

- ❌ Multi-tenant.
- ❌ Multi-sucursal (stock por tienda).
- ❌ Customer accounts (login del cliente final).
- ❌ Reviews / ratings.
- ❌ Wishlist.
- ❌ Cupones / descuentos.
- ❌ Envíos integrados (Coordinadora, etc.) — solo dirección texto.
- ❌ Reportes / analytics.
- ❌ i18n (todo en español).

## Próximos pasos

1. **Elegir pasarela de pago** (Wompi / ePayco / MercadoPago / Stripe)
   para implementar checkout.
2. Implementar las rutas HTTP (`/api/public/products`, `/api/checkout`,
   `/api/admin/products`, etc.) — la lógica de stock, precios, snapshots.
3. UI admin (CRUD de productos, variantes, atributos, pedidos, pagos).
4. UI store (catálogo, ficha, carrito, checkout).
