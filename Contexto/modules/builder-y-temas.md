# Módulo: Web Builder y temas

> **Última actualización: 2026-10-23**

El admin arma la home de la tienda con bloques (`page_modules`) y puede
guardar/exportar el resultado completo como **tema**. Endpoints en
[`api.md`](../api.md) (secciones *Temas* y *Web Builder y borradores*).

El Builder permite cambiar entre la tienda principal, landings de servicios
y categorías de productos marcadas como páginas personalizadas. Cada módulo
conserva `page_key`: `store` para la tienda, `service:<slug>` para una landing
de servicio y `category:<slug>` para contenido adicional encima del catálogo
habitual de esa categoría. Las páginas conservan el Navbar y Footer globales.

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
  navbar, colores de tienda, ajustes de splash y fondo del login admin).
- La configuración del Nav Bar se edita en un modal del Builder. Incluye
  visibilidad, enlaces, código personalizado y una alternativa de logo
  textual con familia tipográfica predefinida o fuentes cargadas desde
  Configuración del sitio; las claves
  `navbar_logo_mode`, `navbar_logo_text`, `navbar_logo_font` y
  `navbar_show_store` viajan en el mismo subset de `site_config`. También
  permite combinar el logo cargado o personalizado con texto, ajustar la
  altura del Nav Bar (66 px por defecto) y el espacio vertical que determina
  cuánto puede crecer el logo dentro de esa altura.
- La pantalla de bienvenida se configura en Estilos globales: imagen con
  fondo, imagen junto al título, spinner circular o spinner con título. El
  borrador incluye estilo, tamaño, duración, imagen, redondez, color de fondo
  y tipografía del título. Las fuentes personalizadas también se pueden
  seleccionar para los textos del Hero.
- El spinner del splash usa el indicador circular compartido por la aplicación;
  el logo configurado en el navbar también se aplica como favicon en la tienda
  y el panel admin.
- Los selectores de Media del Nav Bar, las galerías y el splash permiten
  subir imágenes directamente a la biblioteca y elegirlas sin cerrar el modal.
- El módulo Hero permite alinear su contenido, activar o quitar el overlay
  de color de la imagen de fondo y mover el bloque de contenido con posiciones
  independientes para escritorio y móvil desde el Editor visual del modal.
- El Hero ofrece `classic-overlay` y `side-panel` mediante el selector
  `hero_style`. `side-panel` separa el texto de la fotografía en escritorio y
  apila ambos bloques en móvil. En esa variante `content_background_color`
  define el panel y se conservan los ajustes de texto y sombreado. Las demás
  propuestas visuales viven en `web/web-admin/public/hero-design-options.html`;
  solo se incorporan al selector después de que se aprueben.
- El modal de estilos globales configura la pantalla de bienvenida de la
  tienda (activar, duración, imagen/GIF, redondez de imagen y color de
  fondo). La configuración
  usa `site_config`, viaja en borradores y temas, y se muestra únicamente
  al abrir la página principal. La redondez al 100% recorta la imagen dentro
  de un marco cuadrado para conservar una forma circular.

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
`carousel`, `image_gallery`, `collections`, `text`, `contact`,
`featured_products`, `recent_products`, `footer`. La galería puede mostrar
un collage o un carrusel de una imagen por vez; su visor de imágenes ajusta
las fotos al viewport y permite configurar el color del fondo y de los
botones de cierre y navegación. El banner permite ajustar la altura de la
imagen para escritorio y móvil.

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
