# TechStore — Convenciones y reglas

> **Última actualización: 2026-08-06**

> Reglas del proyecto para IAs y humanos que trabajen en este repo.
> **Léelo antes de programar.** Si entras por primera vez, lee
> también [`project-context.md`](./project-context.md) para entender
> qué es, quién es el cliente y por qué el stack es así.

## Qué es

Web para **TechStore** (accesorios de teléfono en Colombia).
Tienda pública (catálogo + carrito + checkout con pasarela) + panel
admin (CRUD de productos, variantes, atributos, pedidos, config).
Stack modular Fioratta-style, sin Next.js.

## Stack

- **Backend**: Node 22+ ESM + `node:http` nativo + `pg` (Postgres 16).
- **Tienda pública** (`web-store/`): Vite + React 18 + React Router 6.
  Build estático, servido por el backend en `/`.
- **Admin** (`web-admin/`): SPA Vite + React en `admin.<cliente>`,
  con proxy interno de `/api/*` y `/media/*` al backend.
- **DB**: Postgres 16. Migrations SQL idempotentes en `migrations/`.
- **Deploy** (futuro): PM2 + cloudflared + webhook. Por ahora local.

## Server e infraestructura (futuro, hoy local)

- Por ahora corre local en la Mac de Sergio. No hay deploy a server
  todavía.
- Cuando se deploye: PM2 con 3 procesos (`techstore-web`,
  `techstore-admin`, `techstore-webhook`) + cloudflared para los
  subdominios.
- **SSH**: cuando haya server, key-based (no password).
- **No guardar passwords ni secretos en archivos del repo, ni en
  memoria persistente de la IA.**

## Reglas duras

1. **No commitear a `main` directamente.** Todo va en una rama
   `feature/<nombre>` o `fix/<nombre>` en un worktree bajo
   `.worktrees/`. Merge por MR.
2. **No usar `rm -rf` ni `rm` destructivo.** Para borrar archivos,
   usar `mavis-trash` (en esta máquina) o `git rm` cuando aplique.
3. **Secrets nunca al chat ni a la memoria persistente de la IA.**
   El `.env` es gitignored. Los secretos de JWT y la pasarela se
   generan con `openssl rand -hex 32` y se pegan al `.env` del server
   por DM a Sergio, **nunca** en este chat.
4. **Migraciones son forward-only.** Nunca editar un archivo ya
   aplicado. Cambios → nueva migration (`003_*.sql`).
5. **El frontend público es un cliente del backend, no su dueño.**
   Toda data viene de `/api/*`. Cero datos hardcoded en los bundles
   de prod. El bundle puede tener tokens (acentos, copy), no data.
6. **No pisar worktrees de dev con el webhook.** El `deploy.sh`
   requiere el marker `.techstore-production` en `REPO_DIR` para
   proceder. Si ves un ABORT en el log, es por eso.
7. **No inventar endpoints que no estén en [`api.md`](./api.md).** Si
   necesitás uno nuevo, agrégalo al doc y avísale a Sergio antes de
   codear.
8. **Idioma de la UI: tuteo colombiano.** La tienda está en
   Colombia, no en Argentina. Usar "tú" / "puedes" / "tienes" —
   nunca "vos" / "podés" / "tenés". Esto aplica a TODA la UI
   (botones, mensajes de error, banners, modales, hints) y a la
   documentación en español dirigida al usuario final. Los
   comentarios de código pueden ser en cualquier registro.

## Roles y permisos

El panel tiene 3 roles definidos en `auth_users.role`:

- **`admin`** — todo: CRUD en todas las secciones, gestiona usuarios,
  configuración, catálogo, configuración de la pasarela.
- **`operator`** — operación diaria: CRUD en orders y payments, ajuste
  de stock. Solo lectura en el resto (products, site config, etc).
- **`viewer`** — solo lectura en todo.

**La fuente de verdad es el backend.** La config vive en
`web/server/routes/admin/_section_perms.js` como `SECTION_PERMS` (un
objeto con `write: []` y `read: []` por sección). Cada ruta del
array `routes` declara un `section:` que mapea al permiso.

Cualquier ruta nueva que se agregue debe tener un `section` (defensa
en profundidad: si falta, devuelve 403).

El frontend espeja la config en
`web/web-admin/src/lib/permissions.js` y la usa para:
- Filtrar links del sidebar (operator y viewer no ven secciones que
  no pueden leer).
- Esconder botones de acción con `<RoleGate section="...">` cuando
  el user no puede escribir.
- Mostrar/ocultar el botón "Usuarios" en la topbar.

**Reglas duras del backend:**
1. Si el rol no está en `read` (GET) o `write` (POST/PATCH/DELETE)
   → 403.
2. La cookie CSRF y el JWT válido se chequean DESPUÉS del role check.
3. El role check NO se hace por header ni por body — viene del JWT
   firmado al login. El frontend no puede "escalar" privilegios.

**Cosas de UX que el backend NO enforce** (pero el frontend hace):
- Mostrar/ocultar botones de acción en cada página según rol.
- Filtrar links del sidebar.

Si agregás una nueva sección al array `SECTION_PERMS`:
1. Definila en el backend
   (`web/server/routes/admin/_section_perms.js`).
2. Espejala en el frontend
   (`web/web-admin/src/lib/permissions.js`).
3. Si la sección tiene link en el sidebar, mapeala en
   `SIDEBAR_SECTION_MAP`.

## Convenciones de código

- Backend en ESM. `"type": "module"` en cada `package.json` que
  tenga código JS.
- **Imports con extensión** explícita (`./db.js`, no `./db`).
- **IDs en DB**: `SERIAL PRIMARY KEY`. En el API, `id: number`.
- **Fechas en DB**: `TIMESTAMPTZ` para `created_at`/`updated_at`,
  `DATE` para fechas de reservas y cierres.
- **Money**: `NUMERIC(10,0)` en DB, number en API. Todos los importes son
  pesos COP enteros, sin centavos ni decimales.
- **Errores en API**: `{ ok: false, error: string, ...extras }`.
  HTTP status apropiado.
- **Logs**: usar `log.info/warn/error/debug` de `core/lib/logger.js`.
  Prefijo `[techstore]` automático (configurable con `LOG_TAG`).
- **Sin frameworks** en el backend. No Express, no Fastify, no Koa.
  Es `node:http` con router por prefijo.
- **Estilos frontend**: CSS modules + variables CSS para theming.
  Tailwind solo si se justifica (no se usa todavía).

## Patrón Fioratta (mantener)

Esto es lo que ya hicimos en Fioratta y replicamos acá:

- `pg.Pool` por proceso (sin global preservado — el hot-reload de
  `node --watch` mata y arranca procesos, no hace HMR in-memory).
- Auth: bcryptjs para passwords, JWT 15 min, refresh 7 d en cookie
  httpOnly, CSRF double-submit.
- Rate limit: en memoria con lockout progresivo (5/15min, 10/1h,
  20/24h). Por agregar a TechStore cuando se necesite.
- Uploads: `multer` con `memoryStorage`, validar MIME y tamaño,
  escribir a `uploads/<subdir>/<yyyy>/<mm>/<uuid>.<ext>` y servir siempre
  las URLs públicas mediante `/media` (por ejemplo, el logo en
  `uploads/site/...` se expone como `/media/site/...`).
- Migrations SQL idempotentes aplicadas en boot con tabla
  `_migrations`.
- Webhook: HMAC SHA-256 con `timingSafeEqual` y subdominio dedicado
  (deploy.<cliente>, no path dentro del dominio público).

## Estructura del repo

```
.
├─ core/                   # Lógica de negocio genérica, multi-cliente.
│                          # Usable standalone (re-export desde web/) o
│                          # dividida (Core Remoto, ver core-remoto.md).
│  ├─ lib/                 # auth, body, client-ip, cookies, csrf, db,
│                          # email, env, file, json, logger, static,
│                          # totp, uploads
│  ├─ middleware/          # auth, csrf, rate-limit, security-headers
│  ├─ webhook/             # server.js genérico (createWebhookServer)
│  ├─ scripts/             # migrate.js (runMigrations genérico)
│  └─ test/                # tests unitarios (node:test, correr con npm test)
│
├─ web/                    # TechStore concreto.
│  ├─ server/              # Backend node:http + pg
│  │  ├─ server.js         # Entry point
│  │  ├─ routes/           # auth.js, public/, admin/, media.js
│  │  ├─ lib/              # Re-exports de core/lib/* (path relativo)
│  │  ├─ middleware/       # Re-exports de core/middleware/*
│  │  └─ scripts/           # migrate.js, setup-db.js, create-admin.js
│  ├─ web-store/            # Vite + React tienda pública
│  ├─ web-admin/            # Vite + React admin
│  ├─ migrations/           # 001-017 schema de TechStore
│  └─ webhook/             # server.mjs (cableado a TechStore) + deploy.sh
│
├─ uploads/                # Archivos subidos (gitignored, en la RAÍZ del repo)
├─ data/                   # Solo local (gitignored)
├─ Contexto/               # Toda la documentación del proyecto
├─ AGENTS.md               # Router universal para cualquier IA
├─ CLAUDE.md               # Router para Claude Code
└─ README.md               # Descripción del mono-repo
```

**Regla de paths** (importante para no repetir el bug de los imports
rotos):

- En `web/server/lib/X.js` y `web/server/middleware/X.js`, los
  re-exports a `core/` usan 3 niveles arriba:
  `from '../../../core/...`.
- En `web/webhook/server.mjs`, los imports a `core/` usan 2 niveles
  arriba: `from '../../core/X/Y.js'`.
- En `web/server/scripts/migrate.js`, los imports a `core/` usan 3
  niveles arriba: `from '../../../core/scripts/migrate.js'`.

## Antes de empezar una feature

1. **Worktree**: `git worktree add -b feature/<nombre>
   .worktrees/<nombre> main`.
2. **Migraciones**: ¿necesitas una? Créala con el siguiente número
   (la última es `009_auth_admin_extras.sql`).
3. **Auth**: si el endpoint toca data del cliente o del admin, va
   detrás de auth. Mutaciones requieren CSRF.
4. **Doc**: si agregas un endpoint, agrégalo a [`api.md`](./api.md)
   en el mismo commit. **Y si el cambio toca `core/`, actualizá
   tambien [`map.md`](./map.md), [`architecture.md`](./architecture.md)
   y este `conventions.md`** (la doc se mantiene al día con el código).
5. **Prueba local** con `npm run dev:server`, `npm test` y
   `npm run migrate` antes de commitear.

## Cosas que ya nos pegaron (leer antes de refactorizar)

- **Imports rotos después de mover archivos**: el refactor 6675d0f
  de Fioratta dejó 8+ bugs del estilo "X is not defined". SIEMPRE
  correr grep después de mover código. Ver entrada en agent memory.
- **ESM vs CJS**: los builtins (`crypto`, `path`, `fs`) NO son
  globales en ESM. Usar `import { ... } from 'node:crypto'`, no
  `crypto.foo()`.
- **Postgres partial unique index** no funciona para `ON CONFLICT`.
  Usar constraint directo.
- **Set-Cookie en Node HTTP**: `res.setHeader('Set-Cookie', str)`
  REEMPLAZA, no appenda. Usar array.
- **Bash scripts sin marker**: nunca correr deploy.sh sin
  `.techstore-production` en el path.

## Comandos frecuentes

Todos se corren **desde `web/`**: la raíz del mono-repo no tiene
`package.json`. Las credenciales salen de `web/.env`, que los scripts
cargan con `--env-file` (no hace falta exportar nada a mano).

```bash
# Setup inicial (una sola vez)
npm run db:setup           # crea DB + rol
npm run migrate            # aplica migrations
npm run create-admin -- <email> <pass>  # crea el primer admin

# Dev
npm run dev:server         # backend en :3000
npm run dev:store          # Vite dev tienda :5173
npm run dev:admin          # Vite dev admin :5174
npm run dev:webhook        # webhook de deploy en :9001 (sin DB)
npm run migrate            # después de git pull, si hay migrations nuevas

# Tests
npm test                   # corre test:core + test:web

# Build
npm run build              # store + admin
npm run build:store
npm run build:admin

# Prod (en el server, cuando se deploye)
pm2 start ecosystem.config.cjs
pm2 restart techstore-web
pm2 logs techstore-web
pm2 logs techstore-admin
pm2 logs techstore-webhook
```

## Regla de mantenimiento de la doc

**La documentación se mantiene al día con el código.** Toda IA o
humano que haga un cambio estructural (nuevo archivo, nuevo helper,
nueva convención, cambio de paths, cambio de subdominio, etc.) debe
actualizar la doc en el mismo commit o en un commit inmediato.
Esto incluye:

- Mover/crear/borrar archivos en `core/`: actualizar `map.md` y
  `architecture.md`.
- Cambiar paths o subdominios: actualizar `webhook.md` y `deploy.md`.
- Cambiar reglas o convenciones: actualizar `conventions.md`.
- Cambiar el alcance del proyecto (nuevo cliente, nueva decisión):
  actualizar `project-context.md` y `core-remoto.md`.
- Cambiar el script de deploy: actualizar `deploy.md` y la nota sobre
  el marker en `conventions.md`.

La fecha de "Última actualización" al tope de cada doc debe
bumpearse en el mismo commit que el cambio.

## Estado actual del proyecto (a agosto 2026)

- ✅ Setup local con `npm run db:setup` automatizado.
- ✅ 26 migrations de TechStore (001_categories, 002_attributes,
  003_products, 004_variants, 005_admin_auth, 006_orders,
  007_payments, 008_site_config, 009_auth_admin_extras,
  010_page_modules, 011_themes, 012_password_recovery,
  013_variant_media_colors, 014_inventory_movements,
  015_prices_without_decimals, 016_media_variant_links,
  017_fix_product_attributes_trigger, 018_preserve_order_history,
  019_builder_drafts, 020_media_attribute_categories,
  021_admin_theme_colors, 022_admin_background_images,
  023_login_background_crop, 024_footer_builder_module,
  025_epayco_idempotency, 026_remove_legacy_wompi_config).
- ✅ Backend admin completo: 8 routers con RBAC + CSRF.
- ✅ Auth admin con 2FA TOTP y backup codes.
- ✅ 25 tests verdes.
- ⏳ Rutas públicas del catálogo (sesión 3).
- ⏳ UI admin y UI store (sesión 4 y 5).
- ✅ Checkout ePayco y Mercado Pago Checkout Pro: intenciones/preferencias y
  webhooks idempotentes; requieren credenciales Testing y una URL pública HTTPS.
