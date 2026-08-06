# TechStore

Tienda de **accesorios de teléfono** (fundas, vidrios templados,
cargadores, cables, audífonos) para Colombia. Catálogo con
**variantes reales** (combinaciones color × modelo × capacidad),
checkout con **pasarela de pago** (Wompi + ePayco), y panel admin
para gestionar todo.

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
├─ web/            # TechStore concreto
│  ├─ server/      # backend node:http + routers (admin/*, public/*, etc.)
│  ├─ web-store/   # SPA Vite + React tienda pública
│  ├─ web-admin/   # SPA Vite + React panel admin
│  ├─ migrations/  # 001-009 schema de TechStore
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
npm run migrate      # crea las 16 tablas

# 4. Crear el primer admin
npm run create-admin -- admin@techstore.local tu-password-admin

# 5. Levantar el server
npm run dev:server    # :3000
npm run dev           # :3000 + :5173 (store) + :5174 (admin)

# 6. Probar
curl http://localhost:3000/healthz
# → {"ok":true,"service":"techstore-web"}
```

## Estado

- ✅ Schema de DB (16 tablas, 9 migrations).
- ✅ Backend admin completo: atributos, categorías, productos,
  variantes, media, site config, users.
- ✅ Auth admin con 2FA TOTP.
- ✅ 25 tests verdes (`npm test`).
- ⏳ Catálogo público (sesión 3).
- ⏳ UI admin + UI store (sesión 4 y 5).
- ⏳ Checkout con Wompi/ePayco (sesión 6, esperando credenciales).

## Documentación

Toda la documentación vive en [`Contexto/`](Contexto/README.md). Para
los detalles del modelo de datos, los endpoints, las convenciones de
código, y el plan de deploy, empezar por ahí.
