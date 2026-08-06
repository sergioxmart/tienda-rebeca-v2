# TechStore — Webhook de deploy

> **Última actualización: 2026-08-06**

> Documento placeholder. **TechStore aún no está deployado a un
> server**; corre local en la Mac de Sergio. Cuando se deploye, este
> doc se completa con el dominio dedicado y los pasos de setup.

## Estado actual

- El receptor genérico vive en `core/webhook/server.js`
  (`createWebhookServer({ path, secret, onPush, log })`). Es 100%
  genérico multi-cliente.
- El cableado a TechStore vive en `web/webhook/server.mjs`, que
  importa el genérico y le pasa:
  - `path`: `/` (cualquier path que llegue al subdominio dedicado
    `deploy.<cliente>` dispara el deploy).
  - `secret`: `process.env.WEBHOOK_SECRET`.
  - `onPush`: corre `webhook/deploy.sh` en background.
  - `log`: `createLogger({ tag: 'techstore-webhook' })`.
- `web/webhook/deploy.sh` es el script bash que hace el deploy
  (git fetch + reset + npm ci + migrate + build + pm2 restart).
  Requiere el marker `.techstore-production` en `REPO_DIR` para
  proceder (safety: el webhook NO debe correr en dev).

## Setup cuando se deploye (pendiente)

1. Dominio dedicado: `deploy.<cliente>` (ej: `deploy.techstore.com`).
2. Tunnel cloudflared: `deploy.<cliente>` → `127.0.0.1:9001`.
3. GitHub webhook:
   - **Payload URL**: `https://deploy.<cliente>/`
   - **Content type**: `application/json`
   - **Secret**: el mismo `WEBHOOK_SECRET` del `.env` del server.
   - **Events**: solo `push` a `main`.
4. `WEBHOOK_SECRET` en `web/.env` del server (mismo valor que en
   GitHub).
5. `LOG_DIR` apuntando a `/var/log/pm2-techstore/`.
6. `REPO_DIR` apuntando a la raíz del repo en el server.
7. `touch .techstore-production` en `REPO_DIR` (marker de safety).
8. `pm2 start web/ecosystem.config.cjs` para los 3 procesos
   (`techstore-web`, `techstore-admin`, `techstore-webhook`).

## Flujo end-to-end

```
push a main
  ↓
GitHub manda POST a https://deploy.<cliente>/
  ↓
Cloudflared tunnel → 127.0.0.1:9001
  ↓
web/webhook/server.mjs (createWebhookServer)
  ↓ verifica firma HMAC contra WEBHOOK_SECRET
  ↓ verifica que ref == main
  ↓ responde 202 ya (fire-and-forget)
  ↓
spawn 'bash', [webhook/deploy.sh]
  ↓
deploy.sh:
  1. ABORT si no existe .techstore-production
  2. git fetch + reset --hard origin/main
  3. npm ci
  4. npm run migrate
  5. npm run build (store + admin)
  6. Copia dist/ a web/server/public/{store,admin}
  7. pm2 restart
```

## Por qué subdominio dedicado (no path dentro del dominio público)

- **Aísla tráfico**: el webhook no compite con el tráfico del
  cliente. Un spike de deploys no afecta a la tienda.
- **Secrets separados**: el dominio público puede tener reglas
  diferentes de rate-limit, CSP, etc.
- **Cloudflare config**: reglas de firewall se aplican por
  subdominio, no por path.
- **Debugging**: logs del webhook separados del tráfico público.

Cuando se levante a prod, Sergio debe decidir el dominio
(`deploy.techstore.com` es el candidato más natural; también se puede
usar `hook.techstore.com` o el que esté disponible).
