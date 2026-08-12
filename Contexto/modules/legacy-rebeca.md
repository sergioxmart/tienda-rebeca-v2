# Módulo: legacy boutique (Rebeca v1)

> **Última actualización: 2026-08-11**

Los dos archivos `legacy.js` son el **modelo de dominio viejo** de la
boutique. Siguen vivos como *fallback* y se migran handler por handler
a los routers por dominio. **No se les agregan features nuevas.**

## Archivos

| Archivo | Tamaño | Qué es |
| --- | --- | --- |
| [`admin/legacy.js`](../../web/server/routes/admin/legacy.js) | ~175 KB | Endpoints admin del modelo boutique. Era un `admin.js` monolítico de 4000+ líneas. |
| [`public/legacy.js`](../../web/server/routes/public/legacy.js) | ~25 KB | Endpoints públicos del modelo boutique. |

## Cómo se activa

En [`admin/index.js`](../../web/server/routes/admin/index.js) hay una
lista de sub-routers nuevos. Cada uno expone
`tryHandle(req, res) → boolean`:

- Devuelve `true` → matcheó (sea 200, 404, 401, 403…) y **el admin no
  sigue**.
- Devuelve `false` → no era para él, se prueba el siguiente.
- Si **ninguno** matchea → cae a `handleAdminLegacy`.

El orden importa: los routers nuevos van primero porque son más
específicos. Esto significa que **migrar un endpoint es simplemente
hacer que un router nuevo lo matchee**: el legacy deja de verlo solo.

## Qué cubre el legacy público

Del header del archivo (dominio viejo, distinto del catálogo actual):

- `GET /site-config` — config del sitio.
- `GET /collections`, `GET /collections/:slug` — **colecciones**
  (no son las `categories` del modelo nuevo).
- `GET /products/:id` — detalle **por id**, con media y *sizes*
  (el modelo nuevo usa `slug` y variantes).
- `GET /modules?slot=home` — módulos del page builder.
- `GET /closures?from=&to=` — **cierres** por rango de fechas.
- `POST /reservations` — **reservas**, devuelve un `whatsapp_url`.
- `POST /cart-whatsapp` — arma un link de WhatsApp para un carrito.

Conceptos que solo existen acá: colecciones, reservas, cierres,
alquiler (`product_promos` con precios de alquiler aparte del de venta)
y el cierre de venta por **WhatsApp** en vez de pasarela.

## Qué compartimos con el legacy

El legacy **no** redefine helpers: los importa. `protect`,
`recordAudit` y `slugify` viven en
[`_helpers.js`](../../web/server/routes/admin/_helpers.js) y
`SECTION_PERMS` en
[`_section_perms.js`](../../web/server/routes/admin/_section_perms.js).
Un cambio de permisos aplica a los dos mundos a la vez.

## Gotchas

- **Los dos archivos están guardados con encoding roto** (mojibake:
  `PÃºblicos`, `quÃ©`). Si abres uno y ves eso, no lo "arregles" con un
  find-and-replace masivo: es un archivo enorme y el ruido de diff
  tapa el cambio real.
- **Promos calculadas en el server**: `public/legacy.js` tiene un
  `PROMO_LATERAL` (un `LEFT JOIN LATERAL` sobre `product_promos`) que
  resuelve el precio final. La tienda **refleja** precios, nunca los
  decide. Si tocas precios, tócalos ahí.
- Las promos aplican **solo sobre el precio de venta**, no sobre los
  precios de alquiler.
- Antes de migrar un handler, revisa si el modelo nuevo ya cubre el
  caso. Muchos endpoints legacy no tienen equivalente porque el
  dominio cambió (una *reserva* no es un *pedido*).
