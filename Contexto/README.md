# Rebeca Andrade v2 — Índice de documentación

> **Última actualización: 2026-08-11**

Esta carpeta es **la única fuente de verdad** de la documentación del
proyecto. `AGENTS.md` y `CLAUDE.md` (en la raíz) solo enrutan hacia acá;
no duplican contenido.

Si entras por primera vez (IA o humano), lee en este orden:

1. **[`map.md`](./map.md)** — el mapa maestro. Te lleva al archivo de
   cualquier funcionalidad **sin explorar el repo**. Empieza aquí.
2. **[`conventions.md`](./conventions.md)** — reglas del proyecto.
   **Léelo antes de programar.**
3. **[`project-context.md`](./project-context.md)** — qué es, quién es
   el cliente, qué está y qué no está en alcance.

## Todos los documentos

| Doc | Para qué sirve |
| --- | --- |
| [`map.md`](./map.md) | Mapa maestro: módulo → qué hace → ruta. El punto de entrada. |
| [`conventions.md`](./conventions.md) | Reglas duras, convenciones de código, roles y permisos, gotchas. |
| [`project-context.md`](./project-context.md) | Contexto de negocio, cliente, decisiones de scope. |
| [`api.md`](./api.md) | Referencia de endpoints: `/api/auth`, `/api/public`, `/api/admin`, `/api/webhooks`. |
| [`db-schema.md`](./db-schema.md) | Modelo de datos: tablas, relaciones, decisiones del schema. |
| [`dev-setup.md`](./dev-setup.md) | Levantar el proyecto en local desde cero + troubleshooting. |
| [`webhook.md`](./webhook.md) | Webhook de deploy (placeholder hasta que se levante a prod). |

## Fichas de módulo

Solo para los módulos grandes o no obvios. El resto se entiende desde
[`map.md`](./map.md).

| Ficha | Cubre |
| --- | --- |
| [`modules/legacy-rebeca.md`](./modules/legacy-rebeca.md) | Los dos routers `legacy.js` (modelo boutique viejo) y cómo convivien con los nuevos. |
| [`modules/pagos.md`](./modules/pagos.md) | Checkout, intención de pago, ePayco + Mercado Pago, webhooks y reserva de stock. |
| [`modules/builder-y-temas.md`](./modules/builder-y-temas.md) | Web Builder, `page_modules`, temas de tienda y de admin. |
| [`modules/portal-cliente.md`](./modules/portal-cliente.md) | Cuentas de cliente final con OTP, sesiones y retención. |

## Planes

- **[`plans/activos/`](./plans/activos/)** — planes en curso. Léelos
  antes de empezar una feature: puede que ya haya un plan escrito.
- **[`plans/archivo/`](./plans/archivo/)** — planes terminados o
  descartados. Contexto histórico, no fuente de verdad.

## Regla de mantenimiento

Al terminar una feature, si cambió algo estructural, actualiza
[`map.md`](./map.md) y la ficha del módulo con un **resumen conciso**,
nunca un volcado de código, y nunca en cada mensaje. Detalle completo en
[`conventions.md`](./conventions.md#regla-de-mantenimiento-de-la-doc).
