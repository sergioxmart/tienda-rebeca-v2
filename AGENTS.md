# TechStore — Router universal

> **Última actualización: 2026-08-06**

Mono-repo de la tienda de **TechStore** (accesorios de teléfono,
Colombia, COP, checkout con pasarela). `core/` = lógica genérica
multi-cliente; `web/` = la tienda TechStore concreta. Backend `node:http`
+ Postgres 16; frontends Vite + React. Deploy con PM2 + cloudflared
cuando Sergio lo levante a producción; por ahora corre local.

## Para ubicarte, lee `Contexto/` (en este orden)

1. [`Contexto/map.md`](Contexto/map.md) — mapa maestro: llega al
   archivo de cualquier funcionalidad **sin explorar el repo**.
   Empieza aquí.
2. [`Contexto/conventions.md`](Contexto/conventions.md) — reglas del
   proyecto. **Léelo antes de programar.**
3. [`Contexto/README.md`](Contexto/README.md) — índice de toda la
   documentación.

**Toda la documentación vive en `Contexto/`.** Este archivo solo
enruta; no dupliques contenido aquí. No asumas nada que no esté en
`Contexto/` o en el código.

## Reglas críticas (detalle en `Contexto/conventions.md`)

- **No commitear a `main` directamente.** Rama `feature/*` o `fix/*`
  en worktree + MR.
- **Secrets nunca al chat ni a memoria persistente de la IA.** El
  `.env` es gitignored. Los secretos de JWT y la pasarela se generan
  con `openssl rand -hex 32` y se pegan al `.env` local, **nunca** en
  este chat.
- **Migraciones forward-only.** Nunca editar una ya aplicada; crear
  la siguiente.
- **No borrado destructivo** (`rm -rf`): usar `git rm` o `mavis-trash`.
- **Idioma de la UI**: español colombiano (tuteo, no voseo).

## Comandos (desde `web/`)

```bash
npm install            # instala los 3 workspaces (también core/ como paquete aparte)
npm run dev            # server :3000 + Vite store :5173 + Vite admin :5174
npm run dev:server     # solo backend
npm run dev:webhook    # solo webhook (puerto 9001, no requiere DB)
npm run db:setup       # crea rol + DB la primera vez
npm run migrate        # aplica migrations pendientes
npm run create-admin -- <email> <pass>   # crea el primer admin
npm run build          # build de store + admin
npm test               # 25+ tests con node:test
```

Las credenciales salen de `web/.env` (gitignored). Los scripts lo
cargan con `--env-file`. Si trabajás en un worktree, necesitás
`npm install` también en `core/` y copiar/crear el `.env`.

## Estado del proyecto (a agosto 2026)

- ✅ Setup local con `npm run db:setup` automatizado.
- ✅ 9 migrations idempotentes: categories, attributes, products,
  variants, admin auth, orders, payments, site_config, audit_log.
- ✅ Backend admin completo: 8 routers (attributes, attribute-values,
  categories, site-config, users, products, variants, product-media)
  con RBAC por sección + CSRF en mutaciones.
- ✅ Auth admin con 2FA TOTP y backup codes.
- ✅ 25 tests unitarios verdes.
- ⏳ Rutas públicas del catálogo (sesión 3).
- ⏳ UI admin (CRUDs React) y UI store (sesión 4 y 5).
- ✅ Checkout ePayco y Mercado Pago Checkout Pro en Testing.
