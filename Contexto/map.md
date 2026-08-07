# TechStore — Mapa del repositorio

> **Última actualización: 2026-08-06**

> Este es el mapa maestro. Sirve para llegar al archivo de cualquier
> funcionalidad **sin explorar todo el repo**. Si algo no está aquí
> ni en el doc que se enlaza, míralo en el código; no lo asumas.

## Qué es

Mono-repo de tienda. `core/` = lógica de negocio genérica multi-cliente;
`web/` = la tienda TechStore concreta (v1: **accesorios de teléfono
en Colombia**): tienda pública (catálogo + carrito + checkout con
pasarela) + panel admin. Backend `node:http` nativo + Postgres 16;
frontends Vite + React. Deploy con PM2 + cloudflared (futuro); por
ahora local.

## Cómo leer las rutas

- Las rutas de **esta tabla** son **relativas a la raíz del repo**
  (`web/…`, `core/…`).
- Dentro de los docs de tema (`api.md`, `db-schema.md`,
  `architecture.md`, etc.) las rutas de código **sin prefijo**
  (`server/`, `migrations/`, `web-store/`…) son **relativas a
  `web/`**. Lo genérico se prefija con `core/`.

## Alcance

| | En alcance | Fuera de alcance (v1) |
| --- | --- | --- |
| **Se deploya** | `web/` (todo, incluyendo el receptor HTTP del webhook cuando se levante a prod) | `core/` como servicio remoto en infra separada |
| **Estado** | `core/` está completo y se importa por re-exports desde `web/server/lib/*` y `web/server/middleware/*`; el receptor genérico del webhook vive en `core/webhook/server.js` y `web/webhook/server.mjs` solo lo cablea a TechStore | Modo dividido con mTLS (Core Remoto) — listo para implementar, no deployado |

El "Core remoto" (modo dividido con mTLS) es un plan documentado en
[`core-remoto.md`](./core-remoto.md); hoy todo corre standalone:
`web/` importa de `core/` por path relativo en el mismo proceso.

## Módulos (código)

### `core/` — lógica genérica multi-cliente

| Módulo | Qué hace | Ruta | Doc |
| ------ | -------- | ---- | --- |
| Helpers HTTP | `clientIp`, `readJsonBody`, `json`, `isValidEmail` | [`core/lib/{client-ip,body,json,email}.js`](../core/lib/) | [conventions.md](./conventions.md) |
| Auth | bcrypt + JWT + refresh tokens + roles | [`core/lib/auth.js`](../core/lib/auth.js) | [conventions.md](./conventions.md) |
| TOTP | URI `otpauth`, validación RFC 6238, AES-GCM del secret 2FA, backup codes | [`core/lib/totp.js`](../core/lib/totp.js) | [conventions.md](./conventions.md) |
| Cookies | httpOnly refresh + CSRF cookie | [`core/lib/cookies.js`](../core/lib/cookies.js) | [conventions.md](./conventions.md) |
| CSRF | generate + verify (timingSafeEqual) | [`core/lib/csrf.js`](../core/lib/csrf.js) | [conventions.md](./conventions.md) |
| DB | `pg.Pool` + `query` + `tx` + `getClient` | [`core/lib/db.js`](../core/lib/db.js) | [conventions.md](./conventions.md) |
| Env | Carga y valida env vars (falla rápido si falta crítica) | [`core/lib/env.js`](../core/lib/env.js) | [conventions.md](./conventions.md) |
| Logger | `log` (default `[techstore]`) + `createLogger({ tag, level })` | [`core/lib/logger.js`](../core/lib/logger.js) | [conventions.md](./conventions.md) |
| Static | `createStaticHandler({ publicDir, storePath, adminPath })` | [`core/lib/static.js`](../core/lib/static.js) | [conventions.md](./conventions.md) |
| File | `serveFile({...})` — usado por static y media | [`core/lib/file.js`](../core/lib/file.js) | [conventions.md](./conventions.md) |
| Uploads | `multer` + `writeUploadFile` + `deleteUploadFile` | [`core/lib/uploads.js`](../core/lib/uploads.js) | [conventions.md](./conventions.md) |
| Barrel lib | `core/lib/index.js` re-exporta todo lo público | [`core/lib/index.js`](../core/lib/index.js) | — |
| Middleware | `requireAuth`/`optionalAuth`/`requireRole` + `csrf` + `rateLimit` | [`core/middleware/{auth,csrf,rate-limit}.js`](../core/middleware/) | [conventions.md](./conventions.md) |
| Security headers | `securityHeaders` | [`core/middleware/security-headers.js`](../core/middleware/security-headers.js) | [conventions.md](./conventions.md) |
| Barrel middleware | `core/middleware/index.js` re-exporta todo | [`core/middleware/index.js`](../core/middleware/index.js) | — |
| Webhook receptor | `createWebhookServer({ path, secret, onPush, log })` genérico | [`core/webhook/server.js`](../core/webhook/server.js) | [conventions.md](./conventions.md) |
| Migrate runner | `runMigrations({ migrationsDir, query, log, tableName })` genérico | [`core/scripts/migrate.js`](../core/scripts/migrate.js) | [conventions.md](./conventions.md) |
| Tests | `node:test`, 25+ unit tests | [`core/test/`](../core/test/) | — |

### `web/` — TechStore concreto

| Módulo | Qué hace | Ruta | Doc |
| ------ | -------- | ---- | --- |
| Backend / entry | HTTP server con `node:http`, router por prefijo, security headers, static handler | [`web/server/server.js`](../web/server/server.js) | [conventions.md](./conventions.md) |
| Rutas HTTP | `/api/public/*` (catálogo), `/api/admin/*` (panel), `/api/auth/*` (login/2FA), `/media/*` | [`web/server/routes/`](../web/server/routes/) | [api.md](./api.md) |
| Permisos | `SECTION_PERMS` (backend) + espejo frontend | [`web/server/routes/admin/_section_perms.js`](../web/server/routes/admin/_section_perms.js) | [conventions.md](./conventions.md#roles-y-permisos) |
| Re-exports a `core/` | `web/server/lib/*` y `web/server/middleware/*` son 1-liners | [`web/server/lib/`](../web/server/lib/), [`web/server/middleware/`](../web/server/middleware/) | [conventions.md](./conventions.md) |
| Scripts | `setup-db.js`, `migrate.js`, `create-admin.js` | [`web/server/scripts/`](../web/server/scripts/) | [dev-setup.md](./dev-setup.md) |
| Migraciones SQL | 21 migrations de TechStore (forward-only, idempotentes) | [`web/migrations/`](../web/migrations/) | [db-schema.md](./db-schema.md) |
| Tienda pública | SPA Vite + React (catálogo, carrito, checkout) | [`web/web-store/`](../web/web-store/) | [api.md](./api.md) |
| Panel admin | SPA Vite + React. CRUDs + kanban pedidos | [`web/web-admin/`](../web/web-admin/) | [api.md](./api.md) |
| Uploads | Directorio de archivos subidos. Lo resuelve `env.UPLOADS_DIR`; las URLs públicas pasan por `/media` | `uploads/` (gitignored) | [conventions.md](./conventions.md) |
| Webhook de deploy | `web/webhook/server.mjs` cablea el receptor genérico a TechStore | [`web/webhook/`](../web/webhook/) | (placeholder hasta prod) |
| PM2 | Config de procesos (placeholder hasta prod) | [`web/ecosystem.config.cjs`](../web/ecosystem.config.cjs) | (placeholder hasta prod) |

## Dónde está cada tema (docs)

Índice completo en [`README.md`](./README.md). Atajos:
contexto y cliente → [project-context.md](./project-context.md) ·
decisiones técnicas → [conventions.md](./conventions.md) ·
tablas → [db-schema.md](./db-schema.md) ·
endpoints → [api.md](./api.md) ·
setup local → [dev-setup.md](./dev-setup.md) ·
reglas de código → [conventions.md](./conventions.md).

## Flujos clave

1. **Request pública** → `web/server/server.js` aplica
   `securityHeaders`, enruta por prefijo → `web/server/routes/public/`
   (sesión 3) → `pg` (vía `core/lib/db.js` re-exportado) → JSON
   `{ ok, ... }`. La tienda (`web/web-store/`) solo consume
   `/api/*`; cero data hardcodeada en el bundle.
2. **Mutación admin** → login (`/api/auth`) da JWT + cookie
   refresh → cada mutación pasa por middleware `requireAuth` +
   `csrf` (ambos de `core/`) → `web/server/routes/admin/X.js` con
   `protect()` que también valida `SECTION_PERMS`.
3. **Admin** → `admin.<cliente>` (futuro) → cloudflared →
   `127.0.0.1:3001` → `web/admin/server.js` sirve la SPA y proxya
   `/api/*` y `/media/*` a `127.0.0.1:3000`, conservando el mismo
   origen para cookies y CSRF.
4. **Deploy** (futuro) → push a `main` → GitHub manda POST a
   `https://deploy.<cliente>/` (subdominio dedicado) → cloudflared
   tunnel → `127.0.0.1:9001` → `web/webhook/server.mjs` que usa
   `createWebhookServer` de `core/webhook/server.js` → valida firma
   HMAC contra `WEBHOOK_SECRET` → si pasa, dispara
   `webhook/deploy.sh` (con marker `.techstore-production`) en
   background → `git pull && npm ci && build && migrate && pm2
   restart`.
