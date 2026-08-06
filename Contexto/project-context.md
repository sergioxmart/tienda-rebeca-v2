# TechStore — Contexto del proyecto

> **Última actualización: 2026-08-06**

> **Lee esto primero** al entrar al proyecto o al volver después de un tiempo.

## ¿Qué es?

Una tienda online de **accesorios de teléfono** para Colombia.
Tienda pública (catálogo, carrito, checkout) + panel admin para
gestionar el catálogo, los atributos, las variantes, los pedidos y
la configuración del sitio.

Pagos: checkout con **pasarela** (Wompi + ePayco). Stock por
**variante** de producto. Catálogo navegable con filtros por
atributos (color, modelo de celular compatible, etc.).

## Cliente

- **TechStore** — tienda de accesorios de teléfono.
- Modelo: variantes reales (cada combinación de color × modelo es un
  SKU distinto con su stock y precio).
- Mercado: Colombia. Moneda: COP.
- Decisión: pasarela con **dos providers** (Wompi + ePayco) para
  cobertura. El cliente puede elegir en el checkout.

## Decisiones de scope (v1)

- ✅ **Rubro**: accesorios de teléfono (categoría seed:
  `accesorios-telefono`). El modelo es extensible: agregar
  `laptops`, `celulares`, etc. es solo un `INSERT` en `categories`.
- ✅ **Variantes reales**: cada producto es un TEMPLATE; las
  combinaciones vendibles son filas en `product_variants` con sus
  valores de atributos. La combinación debe ser única dentro del
  mismo producto (enforced por app, 409 si choca).
- ✅ **Stock por variante**, no por producto.
- ✅ **Moneda**: COP, configurable vía `site_config.currency`.
- ✅ **Cierre**: checkout con pasarela (Wompi + ePayco). Tabla
  `payments` genérica (`provider TEXT`); las columnas específicas
  del provider se agregan en una migration cuando se elija.
- ✅ **Auth**: solo admin. Sin login de clientes (los pedidos se
  hacen con email + checkout anónimo).

## Stack confirmado

- Backend: **Node 22+ ESM** + `node:http` nativo (estilo Fioratta) + `pg`.
- DB: **Postgres 16**.
- Frontends: **Vite + React 18** + **React Router 6** (no Next.js).
  Store público: `web-store/`. Admin: `web-admin/`. Ambos servidos
  por el mismo proceso Node en `:3000`.
- Deploy (futuro): **PM2** + **cloudflared** + **webhook** propio
  (script bash). Por ahora corre local.

## Lo que NO está en v1 (a propósito)

- ❌ Checkout con tarjeta en el sitio (Wompi/ePayco redirigen).
- ❌ Multi-tenant (un solo cliente, TechStore).
- ❌ Multi-sucursal (stock por tienda).
- ❌ Customer accounts (los pedidos se hacen con email, sin login).
- ❌ Reviews / ratings.
- ❌ Wishlist.
- ❌ Cupones / descuentos.
- ❌ Envíos integrados (Coordinadora, Servientrega) — solo dirección
  texto en v1.
- ❌ i18n (todo en español).

## Convenciones de git

- Branch principal: `main` (lo que se deploya).
- Branch de trabajo: `feature/<nombre>` o `fix/<nombre>`.
- **No se commitea a `main` directamente.** Todo va por worktree + MR.
- Commits chicos, mensajes descriptivos en español.
- Antes de mergear: revisar que pasa las migraciones y que el server
  arranca en local.

## Estructura de carpetas

```
.
├─ core/                 # lógica genérica multi-cliente
│  ├─ lib/               # auth, body, client-ip, cookies, csrf, db,
│  │                     # email, env, file, json, logger, static,
│  │                     # totp, uploads
│  ├─ middleware/        # auth, csrf, rate-limit, security-headers
│  ├─ webhook/           # server.js genérico (createWebhookServer)
│  ├─ scripts/           # migrate.js (runMigrations genérico)
│  └─ test/              # tests unitarios (node:test)
├─ web/                  # TechStore concreto
│  ├─ server/            # backend node:http + routers
│  │  ├─ server.js       # entry point
│  │  ├─ routes/
│  │  │  ├─ auth.js      # login, logout, refresh, me, 2FA
│  │  │  ├─ public/      # sesión 3: catálogo
│  │  │  ├─ admin/       # attributes, products, variants, etc.
│  │  │  └─ media.js     # servir /media/*
│  │  ├─ lib/            # re-exports a core/lib/*
│  │  ├─ middleware/     # re-exports a core/middleware/*
│  │  └─ scripts/        # migrate.js, setup-db.js, create-admin.js
│  ├─ web-store/         # SPA Vite + React tienda pública
│  ├─ web-admin/         # SPA Vite + React panel admin
│  ├─ migrations/        # 001-009 schema
│  └─ webhook/           # receptor de deploy (futuro)
├─ uploads/              # archivos subidos (gitignored)
├─ data/                 # solo local (gitignored)
└─ Contexto/             # toda la documentación
```
