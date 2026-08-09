# Setup local de desarrollo

> **Última actualización: 2026-08-06**

Pasos para levantar el proyecto en tu máquina desde cero.

## Requisitos

- **Node 22+** (`node --version` para verificar).
- **Postgres 16**. En macOS: `brew install postgresql@16 && brew services start postgresql@16`.
- **npm 10+** (viene con Node 22).
- **Git 2.30+**.

## 1. Clonar el repo

```bash
git clone git@github.com:sergioxmart/TechStore.git
cd TechStore
```

## 2. Instalar dependencias

```bash
npm install
```

Esto instala las deps de los tres workspaces (`server/`, `web-store/`,
`web-admin/`) en un solo `node_modules` en la raíz (npm workspaces).

## 3. Crear la base de datos

El script `setup-db.js` automatiza los 5 comandos de `psql`/`createdb` que
antes había que correr a mano. Lee `web/.env`, se conecta a la DB
`postgres` (default, garantizada a existir) y crea el rol + la DB si no
existen. Es idempotente: correrlo 2 veces no rompe nada.

```bash
npm run db:setup
```

Output esperado en una base limpia:

```
Setup DB: techstore@localhost:5432/techstore
→ conectando a postgres@localhost:5432 como "techstore"...
→ rol "techstore" conectado (super=false, createdb=true)
→ creando rol "techstore"...
✓ rol "techstore" creado
→ creando DB "techstore" con owner "techstore"...
✓ DB "techstore" creada
✓ GRANTs aplicados al rol en la DB nueva

Listo. Próximo paso: npm run migrate
```

> **Si el rol del .env no existe todavía y no podés conectarte con él**:
> definí `PG_SUPERUSER` y `PG_SUPERPASSWORD` en `.env` apuntando a un rol
> con superuser/CREATEDB/CREATEROLE. En Mac con homebrew, tu user del SO
> suele ser el superuser por defecto (autenticación `trust` o `peer`).
>
> Si el script aborta con un mensaje de permisos insuficientes, eso
> explica exactamente qué rol necesita qué grant.

## 4. Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env y completar:
#   PGUSER, PGPASSWORD, PGDATABASE (los del paso 3)
#   JWT_SECRET, REFRESH_SECRET, COOKIE_SECRET (generar con openssl rand -hex 32)
#   WEBHOOK_SECRET (openssl rand -hex 16)
```

Generar los secretos:

```bash
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 32   # REFRESH_SECRET
openssl rand -hex 32   # COOKIE_SECRET
openssl rand -hex 16   # WEBHOOK_SECRET
```

## 5. Correr migraciones

```bash
npm run migrate
```

Aplica los archivos `migrations/*.sql` en orden. Es idempotente: se puede
correr en cada boot sin miedo.

Output esperado (primera vez):

```
[techstore:info] applying migration 001_initial_schema.sql
[techstore:info] migrations done {"applied":1,"total":1}
```

Verificar que las tablas se crearon:

```bash
PGPASSWORD=$PGPASSWORD psql -U techstore -d techstore -c "\dt"
```

Deberías ver `_migrations` y las tablas de catálogo, variantes, multimedia,
autenticación, clientes, pedidos, pagos, inventario, temas y builder.

## 6. Levantar el server

En una terminal:

```bash
npm run dev:server
# → [techstore:info] listening on http://0.0.0.0:3000
```

Prueba:

```bash
curl http://localhost:3000/healthz
# → {"ok":true,"service":"techstore-web"}
```

## 7. (Opcional) Levantar el webhook de deploy

Solo si quieres probar el flujo de deploy automático en local. Normalmente
**no es necesario** en dev — el dev hace git pull + restart manual.

```bash
WEBHOOK_SECRET=test_secret npm run dev:webhook
# → [techstore-webhook] listening on http://0.0.0.0:9001
```

## Workflow diario

```bash
# Después de git pull
npm install        # por si hay deps nuevas
npm run migrate    # por si hay migrations nuevas

# Tres terminales (o usar tmux/PM2-dev)
npm run dev:server  # backend (puerto 3000)
npm run dev:store   # Vite + React tienda (puerto 5173)
npm run dev:admin   # Vite + React admin (puerto 5174)
```

> El `dev:server` usa `node server.js` directo (sin `--watch`). Si
> tocas un archivo del backend, **reinicia manualmente** con Ctrl+C +
> `npm run dev:server`. El `--watch` original causaba un loop de
> reinicios porque un `pool` global quedaba apuntando a un pool
> cerrado tras el reload.
>
> Vite (`dev:store` y `dev:admin`) sí tiene HMR, así que no hace falta
> reiniciar para cambios en React.

## Variables de entorno de dev

| Variable      | Default            | Notas                            |
|---------------|--------------------|----------------------------------|
| `NODE_ENV`    | `development`      |                                  |
| `HOST`        | `0.0.0.0`          |                                  |
| `PORT`        | `3000`             |                                  |
| `PGHOST`      | `localhost`        |                                  |
| `PGPORT`      | `5432`             |                                  |
| `PGUSER`      | `techstore`        | Owner de la DB (creado por `npm run db:setup`) |
| `PGPASSWORD`  | (requerido)        | NO commitear                     |
| `PGDATABASE`  | `techstore`        | Creada por `npm run db:setup`    |
| `PG_SUPERUSER`| (sin default)      | Opcional. Superuser alternativo para `db:setup` |
| `JWT_SECRET`  | (requerido)        | 32 bytes hex                     |
| `LOG_LEVEL`   | `info`             | `debug` para más verbosidad      |

## Troubleshooting

**"ECONNREFUSED 127.0.0.1:5432"**: Postgres no está corriendo. `brew
services start postgresql@16` o `pg_ctl -D /opt/homebrew/var/postgresql@16
start`.

**"role techstore does not exist"**: no corriste `npm run db:setup`, o el
rol de tu .env no es el que se creó. Volvé al paso 3.

**"permission denied for table _migrations"**: la DB no la posees. Re-corré
`npm run db:setup` (reaplica los GRANTs).

**"Cannot find module 'pg'"**: `npm install` quedó mal. Borra
`node_modules` y `package-lock.json`, y vuelve a correr `npm install` desde
la raíz.

**El server arranca pero un endpoint devuelve 501**: ese endpoint todavía
no está implementado. Todos los de v1 ya lo están; 501 solo debería verse
en rutas nuevas a medio hacer.
