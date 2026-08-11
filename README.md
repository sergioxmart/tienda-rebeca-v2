# Rebeca Andrade v2

Tienda boutique **Rebeca Andrade** para Colombia. Catálogo con variantes
reales, checkout con pasarelas de pago (Mercado Pago + ePayco), tienda
pública y panel admin con Web Builder para gestionar la experiencia
editorial de la marca.

## Stack

- **Backend**: Node 22+ ESM, `node:http` nativo + `pg` (Postgres 16).
- **Frontends**: Vite + React 18. Tienda pública en `:5173`, panel
  admin en `:5174`. Ambos servidos por el backend en `:3000` en
  producción.
- **DB**: Postgres 16, migrations SQL forward-only en `web/migrations/`.
- **Auth admin**: JWT 15 min + refresh 7d en cookie httpOnly + CSRF
  double-submit. 2FA TOTP opcional con backup codes.
- **Deploy** (cuando se levante a prod): PM2 + cloudflared + webhook
  de deploy. Por ahora corre local en Mac.

## Estructura

```
.
├─ core/           # lógica genérica multi-cliente (auth, db, csrf,
│                  # totp, cookies, uploads, rate-limit, security
│                  # headers, webhook genérico, migrate runner, tests)
├─ web/            # Aplicación concreta de Rebeca Andrade
│  ├─ server/      # backend node:http + routers (admin/*, public/*, etc.)
│  ├─ web-store/   # SPA Vite + React tienda pública
│  ├─ web-admin/   # SPA Vite + React panel admin
│  ├─ migrations/  # Migraciones forward-only de Rebeca Andrade v2
│  └─ webhook/     # receptor de deploy (placeholder hasta prod)
├─ uploads/        # archivos subidos (gitignored, lo crea el server al boot)
├─ data/           # solo local (gitignored)
├─ Contexto/       # TODA la documentación del proyecto
├─ AGENTS.md       # router universal para IAs
├─ CLAUDE.md       # router específico para Claude Code
└─ README.md       # este archivo
```

## Quick start (local)

```bash
# 1. Instalar deps
npm install
cd core && npm install && cd ..

# 2. Copiar y completar .env
cp web/.env.example web/.env
#   completar PGUSER, PGPASSWORD, JWT_SECRET, REFRESH_SECRET, COOKIE_SECRET
openssl rand -hex 32  # para cada secret

# 3. Crear DB + rol + aplicar migrations
cd web
npm run db:setup     # una vez
npm run migrate      # aplica las migraciones pendientes

# 4. Crear el primer admin
npm run create-admin -- admin@rebecaandrade.local tu-password-admin

# 5. Levantar el server
npm run dev:server    # :3000
npm run dev           # :3000 + :5173 (store) + :5174 (admin)

# 6. Probar
curl http://localhost:3000/healthz
# → respuesta JSON con `ok: true`
```

## Estado

- ✅ Base PostgreSQL independiente: `rebecaandrade_v2`, propiedad de `sergio`.
- ✅ Schema de DB con migraciones forward-only.
- ✅ Backend admin completo: atributos, categorías, productos,
  variantes, media, site config, users.
- ✅ Auth admin con 2FA TOTP.
- ✅ 25 tests verdes (`npm test`).
- ⏳ Catálogo público (sesión 3).
- ⏳ UI admin + UI store (sesión 4 y 5).
- ✅ Checkout ePayco y Mercado Pago Checkout Pro en Testing.

## Documentación

Toda la documentación vive en [`Contexto/`](Contexto/map.md). Para
los detalles del modelo de datos, los endpoints, las convenciones de
código, y el plan de deploy, empezar por ahí.
