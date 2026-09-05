# Módulo: portal del cliente final

> **Última actualización: 2026-08-11**

Cuentas de **cliente de la tienda** (no del admin). El acceso es **sin
contraseña**: PIN de un solo uso al correo y después una sesión opaca en
cookie httpOnly. Endpoints en [`api.md`](../api.md) (*Portal del cliente
y OTP*); tablas en [`db-schema.md`](../db-schema.md).

> No confundir con el auth del **admin**
> ([`routes/auth.js`](../../web/server/routes/auth.js)), que sí usa
> password + JWT + 2FA TOTP. Son dos sistemas distintos.

## Archivos clave

| Archivo | Qué hace |
| --- | --- |
| [`public/customer.js`](../../web/server/routes/public/customer.js) | Endpoints `/api/public/customer/*`: pedir OTP, validarlo, perfil, pedidos, direcciones, logout. |
| [`lib/customer-auth.js`](../../web/server/lib/customer-auth.js) | Sesión: generar/validar/revocar token, cookie, `publicCustomer()`. |
| [`lib/customer-retention.js`](../../web/server/lib/customer-retention.js) | Workers de limpieza y purga de datos. |
| [`lib/resend.js`](../../web/server/lib/resend.js) | Envío del correo con el OTP (`sendCustomerOtpEmail`). |
| [`CustomerAccount.jsx`](../../web/web-store/src/pages/CustomerAccount.jsx) | UI del portal (`/cuenta`). |
| [`CustomerContext.jsx`](../../web/web-store/src/customer/CustomerContext.jsx) | Estado de sesión del cliente en la tienda. |

## Sesión

- Token **opaco** de 32 bytes (`base64url`), no un JWT.
- **En la DB solo se guarda el SHA-256** del token
  (`customer_sessions.token_hash`). En claro solo existe en la cookie.
- Cookie `customer_session`: `httpOnly`, `sameSite: 'lax'`,
  `secure` solo en producción, **30 días**.
- `getCustomerSession()` valida no expirado + cuenta no borrada
  (`deleted_at IS NULL`) y actualiza `last_used_at`.

## OTP

- TTL **5 minutos**, máximo **8 intentos** por código.
- El código se guarda **hasheado** (SHA-256) y se compara con
  `timingSafeEqual`.
- Rate limit con `createFailureLimiter`: 8 fallos / 15 min, lockout de
  15 min, con **dos llaves** — por IP y por email. Al bloquear responde
  `429` con `Retry-After: 900`.

## Retención (dos workers separados)

Arrancan desde [`server.js`](../../web/server/server.js) vía
`startCustomerRetentionWorker()`.

1. **Anti-spam (`cleanupGhostAccounts`)** — borra cuentas creadas
   durante un checkout que nunca lograron un pago exitoso y que ya no
   tienen pedidos en curso. Solo mira cuentas con más de **12 horas**.
2. **Purga** — anonimiza pedidos históricos, elimina los fallidos y
   borra cuentas desactivadas cuyo plazo de **30 días** venció.

Estados que cuentan como éxito: `paid`, `processing`, `shipped`,
`delivered`, `refunded`. En curso: `pending`, `paid`, `processing`,
`shipped`.

## Gotchas

- La purga **libera stock** (`releaseOrderStock`) al eliminar pedidos
  fallidos: no es solo un `DELETE`, toca inventario.
- Borrar una cuenta es **soft delete** (`deleted_at`); el borrado real
  lo hace el worker a los 30 días.
- El portal no tiene CSRF double-submit como el admin: la cookie es
  `sameSite: 'lax'` y los endpoints son de lectura del propio cliente.
  Si agregas una mutación sensible, revisa esto antes.
- `sendCustomerOtpEmail` depende de Resend configurado. Sin las
  credenciales, el OTP no llega y el portal queda inusable en local.
