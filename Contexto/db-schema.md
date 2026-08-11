# TechStore — Modelo de datos

> **Última actualización: 2026-08-09**

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
- **Auth**: admin con JWT/TOTP y clientes con PIN OTP por email. El checkout
  sigue permitiendo compra como invitado.

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

### `categories` (`001_initial_schema.sql`)

Taxonomía del catálogo. v1 tiene 1 fila seed (`accesorios-telefono`).
El admin puede sumar más desde el panel (sin migration).

### `attributes` + `attribute_values` (`001_initial_schema.sql`)

**Atributos configurables** (color, modelo-telefono, tipo-conexion,
largo, capacidad-carga) con sus valores posibles. Los atributos son
globales y los valores los crea el admin.

- `attributes.slug` es **estable**: NO renombrar (se referencia en código
  y migraciones).
- `attribute_values.value` es texto libre: "Rojo", "iPhone 15", "1m", etc.
- `attribute_values.hex` guarda opcionalmente el color visual en formato `#RRGGBB`.
- `attribute_values(attribute_id, value)` es UNIQUE.

### `products` (`001_initial_schema.sql`)

**Template** del producto. "Funda iPhone transparente" — sin color ni
modelo. El precio default es `base_price`; cada variante puede override.

- `sku` es opcional (código interno).
- `slug` se usa en URLs (`/producto/funda-iphone-15`).
- `brand` opcional ("Apple", "Samsung", "Spigen", "Anker").
- `featured` aparece en el carrusel del home.
- Foto: en v1, las fotos son DEL PRODUCTO (template), no por variante.

### `product_attributes` (`001_initial_schema.sql`)

M2M `products ↔ attributes` con `is_required`. Define **qué atributos
aplican a este producto** y si el cliente DEBE elegir un valor.

Ej: "Funda iPhone" tiene `color` (required) + `modelo-telefono` (required).
"Cable USB-C" tiene `tipo-conexion` (required) + `largo` (required).

### `product_media` + `product_media_variants` (`001_initial_schema.sql`)

Galería de fotos y embeds de video. Misma lógica que usamos
para media: `kind ∈ {image, video_embed}`, `variant_id` conserva asociaciones
anteriores y `product_media_variants` permite reutilizar la misma pieza en
varias combinaciones, soft-delete con
`deleted_at` se conserva para compatibilidad con registros heredados; las
eliminaciones actuales desde la biblioteca son definitivas y las huérfanas
antiguas se limpian con un cron (no en SQL).

### `product_variants` (`001_initial_schema.sql`)

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

### `variant_attribute_values` (`001_initial_schema.sql`)

M2M `product_variants ↔ attribute_values`. Una variante tiene **un valor
por atributo aplicable**.

- PK `(variant_id, attribute_id)`: una variante no puede tener 2 valores
  del mismo atributo.
- **Validación de unicidad de combinación**: la app, al crear/editar
  variantes, ordena los `(attribute_id, attribute_value_id)` de cada
  variante y compara. Si dos del mismo `product_id` coinciden → error.
  No se hace en SQL porque la comparación depende del conjunto de
  atributos aplicables (no de los presentes).

### `inventory_movements` (`001_initial_schema.sql`)

Libro mayor hijo de `product_variants`. Cada movimiento es una entrada o
salida positiva y conserva `stock_before` y `stock_after`; el saldo vigente
continúa viviendo en `product_variants.stock` para que catálogo y checkout
puedan consultarlo rápidamente.

### `auth_users` + `auth_refresh_tokens` + `auth_totp_backup_codes` (`001_initial_schema.sql`)

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

### `auth_password_recovery_tokens` (`001_initial_schema.sql`)

Tokens opacos y temporales para el asistente de recuperación: primero se
valida el correo, luego TOTP o un código de respaldo, y finalmente se
permite definir la nueva contraseña. Solo se guarda el hash del token;
cada token expira en 10 minutos y se puede consumir una sola vez.

### `orders` + `order_items` (`001_initial_schema.sql`)

Pedidos. **Snapshot en cada línea**: `product_name`, `variant_sku`,
`unit_price`, `line_total` se guardan al momento de la compra. Si
después se edita o elimina el producto, el pedido NO se altera. Desde
`018_preserve_order_history_on_product_delete.sql`, `variant_id` puede quedar
`NULL` al borrar el catálogo, porque el snapshot histórico no depende de que
la variante siga existiendo.

Status del pedido (kanban admin): `pending` → `paid` → `processing` →
`shipped` → `delivered`. Más `cancelled`, `expired` y `refunded`.

Los pedidos nuevos tienen `expires_at` y permanecen en `pending` durante
15 minutos por defecto (`ORDER_PENDING_TTL_MINUTES`). Un worker del backend
los cambia a `expired`, libera las reservas y anula sus intentos de pago
pendientes. Al crear el pedido, cada variante se descuenta de forma
transaccional y la reserva se marca como `committed` cuando el webhook aprueba
el pago.

`shipping_address` es JSONB en v1. Cuando integremos un proveedor de
envíos (Coordinadora, Servientrega), agregamos `carrier`,
`tracking_number`, `label_url` en una migration.

### `customer_accounts`, OTP, sesiones y `customer_addresses` (`001_initial_schema.sql`)

`customer_accounts` identifica al comprador por email y conserva nombre,
teléfono y último acceso. Se crea al registrar el primer pedido, pero no
obliga al cliente a iniciar sesión: el checkout invitado sigue disponible.

`customer_otp_challenges` guarda únicamente el hash del PIN de 6 dígitos,
con expiración de 5 minutos, límite de intentos y consumo de un solo uso.
`customer_sessions` guarda el hash de un token opaco que se entrega en una
cookie `httpOnly`; la sesión dura 30 días y se puede revocar.

`customer_addresses` es la libreta de direcciones, con departamento, ciudad, notas y
coordenadas opcionales. `orders.client_id` es nullable y usa `ON DELETE SET
NULL` para que eliminar una cuenta nunca borre ni modifique el historial.
El baseline incluye el departamento y los nuevos pedidos guardan también el
departamento dentro de `shipping_address` para que admin muestre la ubicación
normalizada.

La migración `002_customer_retention.sql` agrega `deleted_at` y
`deletion_expires_at`. Una desactivación es reversible durante 30 días. El
worker de retención elimina cuentas fantasma creadas durante checkout después
de 12 horas sin pago exitoso, y el worker diario purga cuentas vencidas:
elimina pedidos expirados/cancelados, conserva los pedidos exitosos y
anonimiza sus datos personales antes de desvincular la cuenta.

### `payments` (`001_initial_schema.sql`)

Una fila por transacción con la pasarela. Un pedido puede tener varios
intentos (ej: primero declined, después approved).

- `provider` ∈ {'mercadopago', 'epayco', 'stripe', 'manual', …}.
- `provider_transaction_id` es el ID del lado de la pasarela.
- `raw_response` guarda el body completo de la respuesta del provider
  (JSONB). Pensado para que un dev pueda pegarlo en un ticket sin
  tener que ir a la consola de la pasarela.

**Esta tabla es genérica** porque la pasarela todavía no está definida.
Cuando se agregue una pasarela que necesite datos propios, se agrega una migration con columnas específicas:
- ePayco: similar.
- MercadoPago: idem, plus `payment_method_id`.
- Stripe: `payment_intent_id`, `charge_id`.

Si después queremos validar firmas de webhook o sincronizar estados,
esa lógica vive en código de la app (`web/server/routes/payments.js`),
NO en SQL.

### `order_stock_reservations` (`001_initial_schema.sql`)

Registra las unidades descontadas temporalmente por cada pedido pendiente.
`reserved` significa que la cantidad está retenida, `committed` que el pago
la consolidó y `released` que el pedido expiró y la cantidad fue devuelta.
Los movimientos `out` e `in` de `inventory_movements` conservan la auditoría
del descuento y de la liberación.

### `site_config` (`001_initial_schema.sql`)

Pares `key → JSONB`. Globals operacionales del sitio (nombre, contacto,
moneda, branding). El admin los edita desde el panel; el público los lee
en cada request. Cuando integremos la pasarela, agregamos acá
`pasarela_public_key`, `pasarela_env` (sandbox/prod), etc.

## Decisiones que se tomaron y por qué

- **`SERIAL PRIMARY KEY`**: no usamos UUID (mantenemos el patrón
  simple del stack).
- **`NUMERIC(10,0)` para plata**: los importes se guardan como pesos COP
  enteros, sin centavos ni decimales.
- **Snapshots en `order_items`**: regla del e-commerce. La historia
  del pedido es inmutable aunque cambien precios/nombres.
- **Media híbrida**: las fotos generales siguen en el template y las
  imágenes/videos específicos se asocian a una variante mediante
  `product_media.variant_id`.
- **El stock se reserva al crear el pedido pendiente**: el carrito es efímero
  (`sessionStorage`), pero las unidades se descuentan dentro de la transacción
  del checkout. Si el pedido expira se restituyen; si se paga, la reserva se
  consolida.
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

1. **Elegir pasarela de pago** (Mercado Pago / ePayco / Stripe)
   para implementar checkout.
2. Implementar las rutas HTTP (`/api/public/products`, `/api/checkout`,
   `/api/admin/products`, etc.) — la lógica de stock, precios, snapshots.
3. UI admin (CRUD de productos, variantes, atributos, pedidos, pagos).
4. UI store (catálogo, ficha, carrito, checkout).
