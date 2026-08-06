# Core

> **Última actualización: 2026-07-29**

Lógica de negocio genérica, multi-cliente. Se deploya de **dos formas** (ver
[`Contexto/core-remoto.md`](../Contexto/core-remoto.md) para el detalle del
modo dividido):

## Modo standalone (un solo server)

`web/` y `core/` corren juntos en el mismo proceso Node. `web/server/` importa
directamente desde `core/lib/` y `core/middleware/` por path relativo. El barrel
`core/lib/index.js` re-exporta todo lo público por si después se quiere hacer
`import { ... } from 'rebeca-core'`.

## Modo dividido (Core remoto)

`core/` se deploya en infraestructura de Sergio. `web/` se deploya en la OCI
del cliente. Se comunican por mTLS (cert cliente del cliente identifica al
cliente; cert server autofirmado por la CA; CN whitelist). **Pendiente de
implementar** — el código está listo, falta el split de repos y la
infraestructura.

## Contenido

```
core/
├─ lib/                 # Helpers de negocio (genéricos, sin estado)
│  ├─ auth.js             # bcrypt + JWT + refresh tokens + roles
│  ├─ body.js             # readJsonBody (lee body JSON de un request)
│  ├─ client-ip.js        # clientIp (Cloudflare > X-Forwarded-For > socket)
│  ├─ cookies.js          # setRefreshCookie, setCsrfCookie, etc.
│  ├─ csrf.js             # generateCsrfToken, verifyCsrf
│  ├─ db.js               # pg.Pool + query + tx + getClient
│  ├─ email.js            # isValidEmail (formato, no verifica buzón)
│  ├─ env.js              # carga y valida env vars
│  ├─ file.js             # serveFile (con range, content-type, cache)
│  ├─ json.js             # helper json(res, status, body)
│  ├─ logger.js           # log + createLogger({ tag, level })
│  ├─ static.js           # createStaticHandler({ publicDir, storePath, adminPath }); adminPath='/' para host dedicado
│  ├─ totp.js             # TOTP RFC 6238 + cifrado AES-GCM de secretos 2FA
│  ├─ uploads.js          # multer + writeUploadFile + deleteUploadFile
│  └─ index.js            # barrel: re-exporta todo lo público
├─ middleware/          # Middleware de node:http
│  ├─ auth.js             # requireAuth, optionalAuth, requireRole
│  ├─ csrf.js             # csrf (verifica header vs cookie)
│  ├─ rate-limit.js       # rateLimit con lockout progresivo
│  ├─ security-headers.js # X-Content-Type-Options + Referrer-Policy
│  └─ index.js            # barrel
├─ webhook/             # Receptor de webhooks (genérico, multi-boutique)
│  └─ server.js           # createWebhookServer({ path, secret, onPush, log })
├─ scripts/             # Scripts auxiliares (genéricos, multi-boutique)
│  └─ migrate.js          # runMigrations({ migrationsDir, query, log })
├─ test/                # Tests con node:test (60+ tests)
└─ package.json
```

## Cómo se usa desde `web/`

`web/server/lib/*` y `web/server/middleware/*` son re-exports de `core/lib/`
y `core/middleware/`. El código de `web/server/` no cambia:

```js
// web/server/routes/auth.js
import { hashPassword } from '../lib/auth.js';        // re-exporta core/lib/auth.js
import { json } from '../lib/json.js';                // re-exporta core/lib/json.js
import { clientIp } from '../lib/client-ip.js';       // re-exporta core/lib/client-ip.js
```

El server de Rebeca hoy corre en modo standalone. Si más adelante se
implementa el modo dividido, `web/` se conecta al `core/` por HTTPS con mTLS
en vez de por path relativo.

## Reglas de paths relativos (importante)

Para no repetir el bug de los imports rotos que tuvimos en el refactor de
julio 2026, los paths relativos desde `web/` a `core/` siguen una regla
fija según la profundidad del archivo que importa:

- `web/server/lib/X.js` y `web/server/middleware/X.js`: 3 niveles arriba
  (`'../../../core/lib/X.js'`).
- `web/webhook/server.mjs`: 2 niveles arriba (`'../../core/X/Y.js'`).
- `web/server/scripts/migrate.js`: 3 niveles arriba
  (`'../../../core/scripts/migrate.js'`).

Más detalle en [`Contexto/architecture.md`](../Contexto/architecture.md#cómo-se-importa-core-desde-web).

## Dependencias

Se instalan con `npm install` desde la raíz de `tienda-full/`. En el modo
standalone, las imports son por path relativo (no se publica como paquete
npm todavía). El `package.json#exports` ya está preparado para soportar el
modo dividido:

```json
{
  "name": "rebeca-core",
  "exports": {
    "./lib/*":        "./lib/*",
    "./middleware/*": "./middleware/*",
    "./webhook/*":    "./webhook/*",
    "./scripts/*":    "./scripts/*"
  }
}
```

## Tests

```bash
cd web
npm run test:core    # 60+ unit tests
npm test              # test:core + test:web (73 tests en total)
```

Los tests usan `node:test` (built-in, no necesitan Jest ni nada). Cubren
todos los módulos de `core/lib/` y `core/middleware/`, más el receptor
genérico del webhook y el migrate runner.

## Estado del modo standalone (julio 2026)

El refactor `feature/core-remoto-prep` (julio 2026) dejó el core así:

- ✅ `core/lib/` completo: 14 archivos + barrel `index.js`. 60+ tests.
- ✅ `core/middleware/` completo: 4 archivos + barrel `index.js`.
- ✅ `core/webhook/server.js`: receptor genérico con 7 tests.
- ✅ `core/scripts/migrate.js`: runner genérico con 7 tests.
- ✅ Re-exports en `web/server/lib/*` y `web/server/middleware/*` para no
  cambiar el código de Rebeca.
- ✅ Suite de tests con `npm test` (73 verde).
- ✅ Validado end-to-end con server real (`npm run dev:server` + smoke
  test de los endpoints).

Pendiente para una segunda fase (cuando se implemente el modo dividido
con mTLS):

- Crear la CA privada y los certs cliente.
- Split de repos (`rebeca-core` separado de `App_RebecaAndadre`).
- Canal mTLS saliente + allowlist de IP + rotación + auditoría.
- Mover una vertical completa primero (ej. colecciones/productos) al
  modo dividido y probar fallos de red.
