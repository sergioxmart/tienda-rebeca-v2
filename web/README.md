# Rebeca Andrade — Boutique

Web de Rebeca Andrade: tienda pública de vestidos de novia/quinceaños/trajes/zapatos
+ panel admin estilo CMS para que Rebeca maneje catálogo, contenido y reservas.

Precios en pesos colombianos (COP). Un producto puede ofrecerse en venta,
alquiler y/o "alquiler como nuevo" a la vez, cada tipo con su precio. El
cierre de cada venta/alquiler es por WhatsApp (sin pasarela de pago).

## Stack

- **Backend**: Node.js (>=22) + `node:http` modular (estilo Fioratta) + `pg`
  contra **PostgreSQL 16**.
- **Tienda pública** (`web-store/`): Vite + React + React Router. Build estático
  servido por el backend en `/`.
- **Panel admin** (`web-admin/`): Vite + React + React Router. Build estático
  servido por el backend en `/admin/`. Solo Rebeca (login + JWT + CSRF).
- **Despliegue**: PM2 + cloudflared tunnel + webhook de git en el server de OCI
  (`rebeca@129.80.5.248`).

## Estructura

```
.
├─ server/                 # Backend node:http + pg
│  ├─ server.js            # Entry point
│  ├─ routes/              # Endpoints HTTP (públicos, admin, media)
│  ├─ lib/                 # db, auth, theme, helpers
│  ├─ middleware/          # auth, csrf, rate-limit
│  ├─ scripts/             # migrate, seed, etc.
│  └─ public/              # Builds estáticos de web-store y web-admin
├─ web-store/              # Frontend público (clientes)
├─ web-admin/              # Frontend admin (Rebeca)
├─ migrations/             # SQL idempotente (001_init.sql, 002_*, etc.)
├─ mockup/                 # Export original de Figma (referencia de diseño)
├─ uploads/                # Archivos multimedia subidos
├─ data/                   # Solo local (gitignored)
├─ admin/server.js         # SPA admin + proxy a backend :3000, escucha :3001
├─ ecosystem.config.cjs    # PM2
└─ webhook/                # deploy.sh + receptor HTTP
```

## Desarrollo local

```bash
# 1. Instalar deps
npm install

# 2. Asegurar Postgres 16 corriendo
brew services start postgresql@16
createdb rebeca

# 3. Migrar
npm run migrate

# 4. Levantar los 3 procesos (terminales separadas o usar pm2-dev)
npm run dev:server   # backend en :3000
npm run dev:store    # Vite dev en :5173
npm run dev:admin    # Vite dev en :5174
```

## Despliegue

```bash
# En el server de OCI, primer deploy:
ssh rebeca@129.80.5.248
cd ~/rebeca-store
git clone <repo> .
npm ci --omit=dev
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

Pushes a `main` disparan el webhook → `git pull && npm ci && npm run build && pm2 restart all`.

## Documentación

Toda la documentación se consolidó en `Contexto/` (en la raíz del repo).
Empieza por el mapa e índice:

- [`../Contexto/map.md`](../Contexto/map.md) — mapa maestro del repo (leer primero)
- [`../Contexto/README.md`](../Contexto/README.md) — índice de toda la documentación
- [`../Contexto/conventions.md`](../Contexto/conventions.md) — reglas de código (antes `web/AGENTS.md`)

En la raíz también quedan `CLAUDE.md` y `AGENTS.md` como routers de primera lectura.
