# Rebeca Andrade v2 — Mapa del repositorio

> **Última actualización: 2026-08-11**

> Este es el mapa maestro. Sirve para llegar al archivo de cualquier
> funcionalidad **sin explorar todo el repo**. Si algo no está aquí
> ni en el doc que se enlaza, míralo en el código; no lo asumas.

## Qué es

Mono-repo de la tienda boutique **Rebeca Andrade** (Colombia, COP):
tienda pública (catálogo con variantes, carrito, checkout con pasarela,
portal de cliente) + panel admin (CRUDs, pedidos, inventario, Web
Builder y temas). `core/` = lógica genérica multi-cliente; `web/` = la
tienda concreta. Backend `node:http` nativo + Postgres 16; frontends
Vite + React 18.

> **Nota de marca**: el proyecto nació como *TechStore* (accesorios de
> teléfono) y se reconvirtió a la boutique Rebeca Andrade. El código
> conserva el nombre `techstore` en varios lugares que **no** son
> erratas: los procesos PM2 (`techstore-web`, `techstore-admin`,
> `techstore-webhook`), el tag por defecto del logger, `service:
> 'techstore-web'` en `/healthz` y el marker de deploy
> `.techstore-production`. Los docs `api.md`, `db-schema.md`,
> `conventions.md` y `webhook.md` todavía se titulan "TechStore":
> su contenido aplica igual, el título es histórico.

## Cómo leer las rutas

- Las rutas de **esta tabla** son **relativas a la raíz del repo**
  (`web/…`, `core/…`).
- Dentro de los docs de tema (`api.md`, `db-schema.md`, etc.) las rutas
  de código **sin prefijo** (`server/`, `migrations/`, `web-store/`…)
  son **relativas a `web/`**. Lo genérico se prefija con `core/`.

## Alcance

Todo el repo está en alcance. La frontera real es **interna**: hay dos
modelos de dominio conviviendo.

| | En alcance (activo) | Frontera |
| --- | --- | --- |
| **Dominio nuevo** | Catálogo con variantes, pedidos, pagos, inventario, portal de cliente, builder y temas. Routers por dominio en [`web/server/routes/admin/*.js`](../web/server/routes/admin/) y [`public/*.js`](../web/server/routes/public/) | Es donde se trabaja. |
| **Legacy boutique** | [`admin/legacy.js`](../web/server/routes/admin/legacy.js) (175 KB) y [`public/legacy.js`](../web/server/routes/public/legacy.js) — modelo viejo (colecciones, reservas, cierres, alquiler, checkout por WhatsApp) | **Fallback**: solo corre si ningún router nuevo matchea. Se migra handler por handler; no se le agregan features. Ver [ficha](./modules/legacy-rebeca.md). |
| **`core/`** | Se importa por re-exports desde `web/server/lib/*` y `web/server/middleware/*`, en el mismo proceso | El modo "Core Remoto" (dividido, con mTLS) es una idea documentada en `core/package.json`, **no implementada ni deployada**. No hay doc de eso en `Contexto/` — TODO si se retoma. |
| **Deploy** | `web/` completo, incluido el receptor del webhook | Hoy corre **solo en local**. PM2 + cloudflared es plan, no realidad — ver [`webhook.md`](./webhook.md). |

## Módulos (código)

### `core/` — lógica genérica multi-cliente

| Módulo | Qué hace | Ruta |
| ------ | -------- | ---- |
| Helpers HTTP | `clientIp`, `readJsonBody`, `json`, `isValidEmail` | [`core/lib/`](../core/lib/) (`client-ip`, `body`, `json`, `email`) |
| Auth | bcrypt + JWT 15 min + refresh 7 d + roles | [`core/lib/auth.js`](../core/lib/auth.js) |
| TOTP | URI `otpauth`, validación RFC 6238, AES-GCM del secret 2FA, backup codes | [`core/lib/totp.js`](../core/lib/totp.js) |
| Cookies / CSRF | refresh httpOnly + CSRF double-submit (`timingSafeEqual`) | [`core/lib/cookies.js`](../core/lib/cookies.js), [`csrf.js`](../core/lib/csrf.js) |
| DB | `pg.Pool` + `query` + `tx` + `getClient` | [`core/lib/db.js`](../core/lib/db.js) |
| Env | Carga y valida env vars (falla rápido si falta una crítica) | [`core/lib/env.js`](../core/lib/env.js) |
| Logger | `log` (tag default `[techstore]`) + `createLogger({ tag, level })` | [`core/lib/logger.js`](../core/lib/logger.js) |
| Static / File | `createStaticHandler({ publicDir })`, `serveFile({...})` | [`core/lib/static.js`](../core/lib/static.js), [`file.js`](../core/lib/file.js) |
| Uploads | `multer` memoryStorage + `writeUploadFile` + `deleteUploadFile` | [`core/lib/uploads.js`](../core/lib/uploads.js) |
| Middleware | `requireAuth`/`optionalAuth`/`requireRole`, `csrf`, `rateLimit`, `createFailureLimiter` | [`core/middleware/`](../core/middleware/) |
| Security headers | CSP, `nosniff`, Referrer/Permissions-Policy, HSTS en prod | [`core/middleware/security-headers.js`](../core/middleware/security-headers.js) |
| Webhook receptor | `createWebhookServer({ path, secret, onPush, log })` genérico | [`core/webhook/server.js`](../core/webhook/server.js) |
| Migrate runner | `runMigrations({ migrationsDir, query, log, tableName })` genérico | [`core/scripts/migrate.js`](../core/scripts/migrate.js) |
| Barrels | `lib/index.js` y `middleware/index.js` re-exportan lo público | [`core/lib/index.js`](../core/lib/index.js), [`core/middleware/index.js`](../core/middleware/index.js) |
| Tests | 13 archivos `node:test` | [`core/test/`](../core/test/) |

### `web/server/` — backend

| Módulo | Qué hace | Ruta | Doc |
| ------ | -------- | ---- | --- |
| Entry point | `node:http`, migraciones al boot, security headers, router por prefijo, workers en background, graceful shutdown | [`web/server/server.js`](../web/server/server.js) | — |
| Router público | `/api/public/*`: catálogo, carrito, pedidos, pagos, geocoding, portal de cliente | [`web/server/routes/public/index.js`](../web/server/routes/public/index.js) | [api.md](./api.md) |
| Router admin | `/api/admin/*`: 14 sub-routers + fallback al legacy | [`web/server/routes/admin/index.js`](../web/server/routes/admin/index.js) | [api.md](./api.md) |
| Auth admin | login, logout, refresh, me, 2FA TOTP, recuperación | [`web/server/routes/auth.js`](../web/server/routes/auth.js) | [api.md](./api.md) |
| Webhooks entrantes | confirmaciones firmadas de ePayco y Mercado Pago | [`web/server/routes/webhooks/`](../web/server/routes/webhooks/) | [pagos](./modules/pagos.md) |
| Media | sirve `/media/*` desde `uploads/` | [`web/server/routes/media.js`](../web/server/routes/media.js) | — |
| Permisos | `SECTION_PERMS` por sección y rol; `protect()` da 403 si falta `section` | [`web/server/routes/admin/_section_perms.js`](../web/server/routes/admin/_section_perms.js) | [conventions.md](./conventions.md#roles-y-permisos) |
| Helpers admin | `protect`, `recordAudit`, `slugify` compartidos por los routers | [`web/server/routes/admin/_helpers.js`](../web/server/routes/admin/_helpers.js) | — |
| Pasarelas | SDKs de ePayco y Mercado Pago | [`web/server/lib/epayco.js`](../web/server/lib/epayco.js), [`mercadopago.js`](../web/server/lib/mercadopago.js) | [pagos](./modules/pagos.md) |
| Stock de pedidos | reserva / libera / consolida stock por variante, con `FOR UPDATE` | [`web/server/lib/order-stock.js`](../web/server/lib/order-stock.js) | [pagos](./modules/pagos.md) |
| Expiración de pedidos | worker que expira pendientes (TTL 15 min) y libera reservas | [`web/server/lib/order-expiration.js`](../web/server/lib/order-expiration.js) | [pagos](./modules/pagos.md) |
| Portal de cliente | sesión opaca httpOnly (SHA-256 en DB) + retención | [`web/server/lib/customer-auth.js`](../web/server/lib/customer-auth.js), [`customer-retention.js`](../web/server/lib/customer-retention.js) | [portal](./modules/portal-cliente.md) |
| Email | envío transaccional vía Resend | [`web/server/lib/resend.js`](../web/server/lib/resend.js) | — |
| Ubicaciones Colombia | catálogo depto/ciudad + geocoding de direcciones | [`web/server/lib/colombia-locations.js`](../web/server/lib/colombia-locations.js), [`geocoding.js`](../web/server/lib/geocoding.js) | — |
| Re-exports a `core/` | `web/server/lib/*` y `middleware/*` son 1-liners hacia `core/` | [`web/server/lib/`](../web/server/lib/), [`middleware/`](../web/server/middleware/) | [conventions.md](./conventions.md) |
| Scripts | `setup-db.js`, `migrate.js`, `create-admin.js` | [`web/server/scripts/`](../web/server/scripts/) | [dev-setup.md](./dev-setup.md) |
| Migraciones SQL | baseline `001` + 4 forward-only | [`web/migrations/`](../web/migrations/) | [db-schema.md](./db-schema.md) |

### `web/web-store/` — tienda pública (SPA)

Rutas: `/`, `/categoria/:category`, `/producto/:slug`, `/carrito`,
`/checkout`, `/pago/respuesta`, `/cuenta`. Definidas en
[`App.jsx`](../web/web-store/src/App.jsx).

| Módulo | Qué hace | Ruta |
| ------ | -------- | ---- |
| Páginas | Home, Catalog, ProductPage, Cart, Checkout, PaymentResponse, CustomerAccount | [`web/web-store/src/pages/`](../web/web-store/src/pages/) |
| Carrito | contexto + persistencia en localStorage | [`web/web-store/src/cart/`](../web/web-store/src/cart/) |
| Módulos del builder | renderers de `page_modules`; el registry mapea `type` → componente | [`web/web-store/src/modules/registry.js`](../web/web-store/src/modules/registry.js) |
| Contextos | sitio, cliente, ubicaciones, preview del builder | [`site/`](../web/web-store/src/site/), [`customer/`](../web/web-store/src/customer/), [`locations/`](../web/web-store/src/locations/), [`preview/`](../web/web-store/src/preview/) |
| Tema de tienda | tokens CSS derivados de `site_config` | [`web/web-store/src/site/storeTheme.js`](../web/web-store/src/site/storeTheme.js) |
| Cliente API | wrapper de `fetch` a `/api/public/*` | [`web/web-store/src/api.js`](../web/web-store/src/api.js) |

### `web/web-admin/` — panel admin (SPA)

Rutas: `/login`, `/`, `/products`, `/inventory`, `/orders`, `/sales`,
`/categories`, `/attributes`, `/media`, `/site-config`, `/users`,
`/builder`, `/themes`. Definidas en
[`App.jsx`](../web/web-admin/src/App.jsx).

| Módulo | Qué hace | Ruta |
| ------ | -------- | ---- |
| Páginas | una por sección; las más grandes son PageBuilder, SiteConfig, Attributes, ProductForm, Themes | [`web/web-admin/src/pages/`](../web/web-admin/src/pages/) |
| Editor de variantes | matriz de combinaciones atributo × valor con stock y precio | [`web/web-admin/src/components/VariantEditor.jsx`](../web/web-admin/src/components/VariantEditor.jsx) |
| Auth | contexto de sesión + refresh; `RequireAuth` en `App.jsx` | [`web/web-admin/src/auth/AuthContext.jsx`](../web/web-admin/src/auth/AuthContext.jsx) |
| Layout / UI | sidebar, topbar, Modal, Confirm, Toast, Empty, MoneyInput | [`web/web-admin/src/components/`](../web/web-admin/src/components/) |

### Operación

| Módulo | Qué hace | Ruta |
| ------ | -------- | ---- |
| Proxy admin | sirve la SPA admin en `:3001` y proxya `/api/*` y `/media/*` a `:3000` (mismo origen para cookies y CSRF) | [`web/admin/server.js`](../web/admin/server.js) |
| Webhook de deploy | cablea el receptor genérico de `core/` a este proyecto | [`web/webhook/server.mjs`](../web/webhook/server.mjs), [`deploy.sh`](../web/webhook/deploy.sh) |
| PM2 | 3 procesos: `techstore-web`, `techstore-admin`, `techstore-webhook` | [`web/ecosystem.config.cjs`](../web/ecosystem.config.cjs) |
| Uploads | archivos subidos; los sirve `/media` (`env.UPLOADS_DIR`) | `uploads/` (gitignored) |
| Tests | 4 archivos web + 13 de core (~104 casos `node:test`) | [`web/test/`](../web/test/), [`core/test/`](../core/test/) |

## Dónde está cada tema (docs)

Índice completo en [`README.md`](./README.md). Atajos:
contexto y cliente → [project-context.md](./project-context.md) ·
reglas de código y permisos → [conventions.md](./conventions.md) ·
tablas → [db-schema.md](./db-schema.md) ·
endpoints → [api.md](./api.md) ·
setup local → [dev-setup.md](./dev-setup.md) ·
deploy → [webhook.md](./webhook.md).

## Flujos clave

1. **Request pública** → [`server.js`](../web/server/server.js) aplica
   `securityHeaders` y enruta por prefijo →
   [`routes/public/index.js`](../web/server/routes/public/index.js) →
   `pg` (vía `core/lib/db.js` re-exportado) → JSON `{ ok, ... }`. La
   tienda solo consume `/api/*`; cero data hardcodeada en el bundle.

2. **Mutación admin** → login en `/api/auth` da JWT + cookie refresh →
   cada mutación pasa por `requireAuth` + `csrf` (ambos de `core/`) →
   el sub-router llama a `protect()`, que valida `SECTION_PERMS` →
   si ningún sub-router matchea, cae a
   [`admin/legacy.js`](../web/server/routes/admin/legacy.js).

3. **Checkout** → `POST /api/public/orders` crea el pedido `pending` y
   **reserva stock** por variante
   ([`order-stock.js`](../web/server/lib/order-stock.js)) →
   `POST /api/public/checkout/payment-intent` crea la
   preferencia/intención en la pasarela → el cliente paga fuera del
   sitio → la pasarela confirma por
   [`/api/webhooks/*`](../web/server/routes/webhooks/) (idempotente) →
   se consolida el stock. Si nadie paga, el worker de
   [`order-expiration.js`](../web/server/lib/order-expiration.js) expira
   el pedido y devuelve el stock. Detalle en
   [`modules/pagos.md`](./modules/pagos.md).

4. **Web Builder** → el admin arma la home en `/builder`
   ([`PageBuilder.jsx`](../web/web-admin/src/pages/PageBuilder.jsx)) →
   se guarda en `page_modules` → la tienda lee
   `GET /api/public/page-modules` y renderiza cada módulo con el
   [`registry`](../web/web-store/src/modules/registry.js). Agregar un
   `type` nuevo toca **tres** archivos: ver
   [`modules/builder-y-temas.md`](./modules/builder-y-temas.md).

## Estado del proyecto (a agosto 2026)

- ✅ Base Postgres independiente (`rebecaandrade_v2`) + 5 migraciones
  forward-only.
- ✅ Backend admin: 14 sub-routers con RBAC por sección + CSRF.
- ✅ Auth admin con 2FA TOTP y backup codes.
- ✅ Catálogo público, carrito y checkout implementados.
- ✅ UI admin y UI store implementadas (incluye Web Builder y temas).
- ✅ Portal de cliente con OTP y retención.
- ✅ Checkout ePayco y Mercado Pago Checkout Pro en **Testing**
  (requiere credenciales de Testing y una URL pública HTTPS para los
  webhooks).
- ⏳ Migración del legacy boutique a los routers nuevos: en curso.
- ⏳ Deploy a producción: PM2 + cloudflared planificados, no ejecutados.
