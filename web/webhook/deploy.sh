#!/usr/bin/env bash
# Deploy script de TechStore.
# Lo dispara el webhook en /deploy-techstore. Idempotente.
#
# Pasos:
#   1. git fetch + reset duro a origin/main
#   2. npm ci (limpia node_modules, instala lo del lock)
#   3. npm run migrate (idempotente)
#   4. npm run build (vite build de store y admin)
#   5. Copia los dist/ a server/public/{store,admin}
#   6. pm2 restart techstore-web + techstore-admin + techstore-webhook

set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$REPO_DIR"

# Safety: el webhook solo debe correr en producción. Si el marker no existe,
# abortamos para no pisar worktrees de desarrollo o copias locales.
PRODUCTION_MARKER="${PRODUCTION_MARKER:-.techstore-production}"
if [ ! -f "$PRODUCTION_MARKER" ]; then
  echo "[deploy] ABORT: marker '$PRODUCTION_MARKER' no existe en $REPO_DIR" >&2
  echo "[deploy] Para habilitar el deploy, crear el marker: touch $PRODUCTION_MARKER" >&2
  exit 2
fi

LOG_PREFIX="[deploy]"
DEPLOY_REASON="${DEPLOY_REASON:-manual}"

log() { echo "$LOG_PREFIX $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

# GitHub puede entregar eventos repetidos mientras un deploy ya está
# ejecutándose. Serializar evita que dos `npm ci` se borren el node_modules
# entre sí y dejen Vite ausente durante el build.
LOCK_FILE="${DEPLOY_LOCK_FILE:-/tmp/techstore-deploy.lock}"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "another deployment is already running; skipping"
  exit 0
fi

log "start (reason=$DEPLOY_REASON) repo=$REPO_DIR"

# 1. Repo
log "git fetch + reset"
git fetch --quiet origin main
git reset --hard origin/main --quiet
NEW_SHA=$(git rev-parse --short HEAD)
log "now at $NEW_SHA"

# 2. Deps
#    NOTA: NO usamos --omit=dev. vite (y otras devDeps de los workspaces
#    web-store y web-admin) son necesarios para el build en el paso 4.
#    Si los omitimos, `npm run build:store` falla con `vite: not found`
#    (bug introducido en commit 68c5bc9, visto en d7b9191 deploy log:
#    `sh: 1: vite: not found`, code 127). El node_modules queda con
#    devDeps instaladas (~200MB), aceptable para nuestro server.
log "npm ci"
# El webhook corre bajo NODE_ENV=production; npm omite devDependencies en
# ese contexto, pero Vite es necesario para compilar las dos SPAs.
npm ci --include=dev --no-audit --no-fund --silent

# 3. Migrations
log "running migrations"
npm run migrate --silent

# 4. Build
log "building web-store"
npm run build:store --silent
log "building web-admin"
npm run build:admin --silent

# 5. Copiar dists a server/public
log "copying builds to server/public"
rm -rf server/public/store server/public/admin
mkdir -p server/public/store server/public/admin
cp -R web-store/dist/. server/public/store/
cp -R web-admin/dist/. server/public/admin/

# 6. Reiniciar PM2
if command -v pm2 >/dev/null 2>&1; then
  log "pm2 restart"
  pm2 restart ecosystem.config.cjs --update-env || pm2 restart all --update-env
else
  log "WARN: pm2 no está en PATH; saltando restart"
fi

log "done ($NEW_SHA)"
