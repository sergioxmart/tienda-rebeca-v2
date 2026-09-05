# Módulo: Web Builder y temas

> **Última actualización: 2026-09-05**

El admin arma la home de la tienda con bloques (`page_modules`) y puede
guardar/exportar el resultado completo como **tema**. Endpoints en
[`api.md`](../api.md) (secciones *Temas* y *Web Builder y borradores*).

## Archivos clave

| Archivo | Qué hace |
| --- | --- |
| [`admin/page-modules.js`](../../web/server/routes/admin/page-modules.js) | CRUD de módulos + `PATCH /reorder`. Define `MODULE_TYPES` (whitelist). |
| [`admin/builder.js`](../../web/server/routes/admin/builder.js) | Borrador aislado del builder. Define `BUILDER_CONFIG_KEYS`. |
| [`admin/themes.js`](../../web/server/routes/admin/themes.js) | Temas: crear, aplicar, exportar e importar `.zip`. |
| [`public/page-modules.js`](../../web/server/routes/public/page-modules.js) | `GET /api/public/page-modules` — lo que consume la tienda. |
| [`PageBuilder.jsx`](../../web/web-admin/src/pages/PageBuilder.jsx) | UI del builder (~46 KB). Define `MODULE_SCHEMAS`. |
| [`Themes.jsx`](../../web/web-admin/src/pages/Themes.jsx) | UI de temas. |
| [`modules/registry.js`](../../web/web-store/src/modules/registry.js) | Mapea `type` → componente React en la tienda. |
| [`modules/*.jsx`](../../web/web-store/src/modules/) | Un renderer por tipo de módulo. |

## Modelo

- **Publicado** = `page_modules` + `site_config`. Es **lo único** que
  lee la tienda pública.
- **Borrador** = snapshot aislado que maneja `builder.js`. Se edita y se
  aplica un tema sin tocar lo publicado; se publica explícitamente.
- **Tema** = snapshot de la lista ordenada de `page_modules` + un subset
  de `site_config` (`BUILDER_CONFIG_KEYS`: nombre del sitio, contacto,
  navbar, colores de tienda, fondo del login admin).
- La configuración del Nav Bar se edita en un modal del Builder. Incluye
  visibilidad, enlaces, código personalizado y una alternativa de logo
  textual con familia tipográfica predefinida; las claves
  `navbar_logo_mode`, `navbar_logo_text` y `navbar_logo_font` viajan en el
  mismo subset de `site_config`.

## Agregar un tipo de módulo nuevo (toca 3 archivos)

El comentario está en el propio
[`registry.js`](../../web/web-store/src/modules/registry.js):

1. `MODULE_TYPES` en
   [`admin/page-modules.js`](../../web/server/routes/admin/page-modules.js)
   — whitelist del backend.
2. `MODULE_SCHEMAS` en
   [`PageBuilder.jsx`](../../web/web-admin/src/pages/PageBuilder.jsx)
   — el formulario de settings en el admin.
3. `MODULE_RENDERERS` en
   [`registry.js`](../../web/web-store/src/modules/registry.js)
   — el componente que lo dibuja, más el `.jsx` del renderer.

Si falta cualquiera de los tres, el módulo se guarda pero no se ve, o
se rechaza en el backend.

Tipos actuales: `hero`, `banner`, `categories`, `categories_grid`,
`carousel`, `collections`, `text`, `contact`, `featured_products`,
`recent_products`, `footer`.

## Gotchas

- **`settings` es JSONB libre**: el backend solo valida que sea un
  objeto. La forma la valida el front al renderizar. Un `settings` mal
  formado no falla en la API, falla (o se ignora) en la tienda.
- **Los zips de tema solo llevan `theme.json`.** No se embeben
  imágenes: son del sitio, no del tema. Si un tema referencia una
  imagen que ya no existe, el módulo simplemente no la muestra.
- El multer del import de temas **acepta cualquier MIME** (el zip llega
  como `application/octet-stream`); el único límite es
  `MAX_UPLOAD_BYTES`.
- Límite de **100 módulos** por borrador (`validateDraft`).
- `PATCH /page-modules/reorder` recibe `{ ids: [...] }` y asigna
  `position = i + 1` según el orden del array.
- La preview del builder se carga en un iframe: los orígenes permitidos
  los limita `CSP_FRAME_ANCESTORS` (ver
  [`conventions.md`](../conventions.md)). Si la preview sale en blanco,
  mira ahí primero.
- El tema de la tienda y el del admin son distintos:
  [`web-store/src/site/storeTheme.js`](../../web/web-store/src/site/storeTheme.js)
  y [`web-admin/src/adminTheme.js`](../../web/web-admin/src/adminTheme.js).
