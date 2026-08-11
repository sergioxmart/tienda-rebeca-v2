# Rebeca Andrade v2 — Contexto del proyecto

> **Última actualización: 2026-08-11**

> **Lee esto primero** al entrar al proyecto o al volver después de un tiempo.

## ¿Qué es?

La tienda online de la boutique **Rebeca Andrade**, para Colombia.
Tienda pública (catálogo, carrito, checkout, portal de cliente) + panel
admin para gestionar el catálogo, los atributos, las variantes, los
pedidos, el inventario y la configuración y el diseño del sitio.

Pagos: checkout con **pasarela** (Mercado Pago + ePayco). Stock por
**variante** de producto. Catálogo navegable con filtros por atributos
(talla, color, etc.).

## Cliente

- **Rebeca Andrade** — boutique de moda (vestidos y piezas para
  ocasiones especiales).
- Historia: el proyecto se construyó primero como *TechStore*
  (accesorios de teléfono) y se reconvirtió a esta marca. Por eso el
  modelo de catálogo es genérico y el nombre `techstore` sobrevive en
  procesos, logs y markers. Hay además un modelo boutique **anterior**
  todavía vivo como legacy — ver
  [`modules/legacy-rebeca.md`](./modules/legacy-rebeca.md).
- Modelo: variantes reales (cada combinación de atributos es un SKU
  distinto con su stock y precio).
- Mercado: Colombia. Moneda: COP.
- Decisión: pasarela con **dos providers** (Mercado Pago + ePayco) para
  cobertura. El cliente puede elegir en el checkout.

## Decisiones de scope (v1)

- ✅ **Rubro**: moda/boutique. El modelo de catálogo es genérico:
  agregar una categoría nueva es solo un `INSERT` en `categories`.
  (La migración `004_rebecaandrade_defaults.sql` reemplazó los
  defaults de marca de TechStore.)
- ✅ **Variantes reales**: cada producto es un TEMPLATE; las
  combinaciones vendibles son filas en `product_variants` con sus
  valores de atributos. La combinación debe ser única dentro del
  mismo producto (enforced por app, 409 si choca).
- ✅ **Stock por variante**, no por producto.
- ✅ **Moneda**: COP, configurable vía `site_config.currency`.
- ✅ **Cierre**: checkout con pasarela (Mercado Pago + ePayco). Tabla
  `payments` genérica (`provider TEXT`); las columnas específicas
  del provider se agregan en una migration cuando se elija.
- ✅ **Auth admin**: password + JWT + 2FA TOTP opcional.
- ✅ **Portal de cliente** (agregado después del scope original): el
  checkout sigue siendo anónimo con email, pero el cliente puede
  entrar a `/cuenta` con un **PIN de un solo uso al correo** (sin
  contraseña) y ver sus pedidos y direcciones. Ver
  [`modules/portal-cliente.md`](./modules/portal-cliente.md).

## Stack confirmado

- Backend: **Node 22+ ESM** + `node:http` nativo (estilo Fioratta) + `pg`.
- DB: **Postgres 16**.
- Frontends: **Vite + React 18** + **React Router 6** (no Next.js).
  Store público: `web-store/`. Admin: `web-admin/`. Ambos servidos
  por el mismo proceso Node en `:3000`.
- Deploy (futuro): **PM2** + **cloudflared** + **webhook** propio
  (script bash). Por ahora corre local.

## Lo que NO está en v1 (a propósito)

- ❌ Checkout con tarjeta implementado directamente en el sitio (las pasarelas gestionan el flujo).
- ❌ Multi-tenant (un solo cliente).
- ❌ Multi-sucursal (stock por tienda).
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
├─ web/                  # la tienda concreta (Rebeca Andrade)
│  ├─ server/            # backend node:http + routers
│  │  ├─ server.js       # entry point
│  │  ├─ routes/
│  │  │  ├─ auth.js      # login, logout, refresh, me, 2FA
│  │  │  ├─ public/      # catálogo, carrito, pedidos, pagos, cliente
│  │  │  ├─ admin/       # attributes, products, variants, etc. + legacy
│  │  │  ├─ webhooks/    # confirmaciones de ePayco y Mercado Pago
│  │  │  └─ media.js     # servir /media/*
│  │  ├─ lib/            # re-exports a core/lib/*
│  │  ├─ middleware/     # re-exports a core/middleware/*
│  │  └─ scripts/        # migrate.js, setup-db.js, create-admin.js
│  ├─ web-store/         # SPA Vite + React tienda pública
│  ├─ web-admin/         # SPA Vite + React panel admin
│  ├─ migrations/        # baseline 001_initial_schema + cambios nuevos
│  └─ webhook/           # receptor de deploy (futuro)
├─ uploads/              # archivos subidos (gitignored)
├─ data/                 # solo local (gitignored)
└─ Contexto/             # toda la documentación
```
