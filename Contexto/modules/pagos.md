# Módulo: pagos y checkout

> **Última actualización: 2026-08-11**

Cubre el camino completo desde "el cliente confirma el carrito" hasta
"el pedido queda pagado y el stock consolidado", con dos pasarelas
(ePayco y Mercado Pago Checkout Pro). Endpoints en
[`api.md`](../api.md); tablas en [`db-schema.md`](../db-schema.md).

## Archivos clave

| Archivo | Qué hace |
| --- | --- |
| [`public/orders.js`](../../web/server/routes/public/orders.js) | `POST /api/public/orders`: crea el pedido `pending` y reserva stock. |
| [`public/payment-intent.js`](../../web/server/routes/public/payment-intent.js) | `POST /api/public/checkout/payment-intent`: crea (o reutiliza) la sesión/preferencia de pago. |
| [`lib/epayco.js`](../../web/server/lib/epayco.js) | `createCheckoutSession()` + errores tipados (`EpaycoApiError`, `EpaycoConfigurationError`). |
| [`lib/mercadopago.js`](../../web/server/lib/mercadopago.js) | `createCheckoutPreference()` + errores tipados equivalentes. |
| [`webhooks/epayco.js`](../../web/server/routes/webhooks/epayco.js) | Confirmación firmada de ePayco. |
| [`webhooks/mercadopago.js`](../../web/server/routes/webhooks/mercadopago.js) | Confirmación de Mercado Pago. |
| [`lib/order-stock.js`](../../web/server/lib/order-stock.js) | `reserveOrderStock` / `releaseOrderStock` / `commitOrderStock`. |
| [`lib/order-expiration.js`](../../web/server/lib/order-expiration.js) | Worker que expira pendientes y devuelve el stock. |
| [`pages/Checkout.jsx`](../../web/web-store/src/pages/Checkout.jsx) | UI del checkout. |
| [`pages/PaymentResponse.jsx`](../../web/web-store/src/pages/PaymentResponse.jsx) | Pantalla de retorno tras pagar (`/pago/respuesta`). |

## Flujo

1. **Pedido** — `POST /api/public/orders` inserta el pedido en `pending`
   y llama a `reserveOrderStock()`: descuenta `product_variants.stock`
   con `SELECT … FOR UPDATE`, escribe una fila en
   `order_stock_reservations` y registra el movimiento en
   `inventory_movements`. Si falta stock lanza
   `InsufficientReservationError` con el detalle por variante.
2. **Intención de pago** — `POST /api/public/checkout/payment-intent`
   con `{ order_number, email, provider }`. `provider` es `'epayco'`
   (default) o `'mercadopago'`. Valida que el pedido exista, que el
   email coincida y que siga `pending`.
3. **El cliente paga fuera del sitio** — ePayco es checkout `onpage`
   (script), Mercado Pago es `redirect` a `init_point` (o
   `sandbox_init_point` en Testing).
4. **Confirmación** — solo el webhook firmado cambia el estado del
   pedido. Si aprueba: `commitOrderStock()` + `orders.status = 'paid'`.
5. **Si nadie paga** — el worker de `order-expiration.js` marca el
   pedido como `expired`, libera las reservas (devuelve el stock) y
   anula los pagos `pending`.

## Reglas que no se pueden romper

- **La respuesta del navegador no aprueba nada.** `/pago/respuesta` es
  informativa. Solo la notificación firmada del proveedor cambia
  `orders.status`. Está escrito así a propósito en el header de
  [`webhooks/epayco.js`](../../web/server/routes/webhooks/epayco.js).
- **Idempotencia**: la llave es `x_ref_payco` (ePayco) guardada en
  `payments.provider_transaction_id`. Si el pago ya está en un estado
  final (`approved`, `declined`, `error`, `refunded`, `voided`) el
  webhook responde `{ duplicate: true }` sin re-procesar.
- **Advisory locks** (`pg_advisory_xact_lock(hashtext(...))`) cubren dos
  carreras distintas: doble clic creando dos intenciones para el mismo
  pedido, y dos reintentos del webhook llegando a la vez.
- **Se valida el monto y la moneda** contra `orders.total` antes de
  aprobar (`amountMatches` + `x_currency_code === 'COP'`).
- **Se valida el entorno**: si `x_test_request` no coincide con
  `EPAYCO_TEST`, se rechaza (`epayco_environment_mismatch`). Evita que
  un pago de sandbox apruebe un pedido real.
- **Un fallo transitorio devuelve 500 a propósito**, para que el
  proveedor reintente. No lo "arregles" devolviendo 200.

## Gotchas

- **El número de pedido usa el prefijo `TS-`**: el regex es
  `/^TS-[0-9]{4}-[0-9]+$/`. Es herencia de TechStore y sigue vigente;
  cambiarlo implica tocar el validador, los pedidos existentes y lo que
  se le manda a las pasarelas.
- El `site_name` que se envía a la pasarela tiene `'TechStore'` como
  fallback en el `COALESCE` si `site_config.site_name` no existe.
- `payments.raw_response` guarda el snapshot del proveedor
  (`sessionId` en ePayco, `preferenceId` / `initPoint` /
  `sandboxInitPoint` en Mercado Pago). Las intenciones se **reutilizan**
  leyendo de ahí, no se crean de nuevo.
- Los importes son **COP enteros** (`NUMERIC(10,0)`), sin centavos.
- Para probar los webhooks hace falta una **URL pública HTTPS**; en
  local no llegan. Estado actual: credenciales de **Testing**.
