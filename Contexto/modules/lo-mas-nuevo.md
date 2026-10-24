# Organizador de “Lo más nuevo”

La tienda conserva el orden existente si `new_arrivals_order` no tiene una
fila. Al guardar desde el panel, usa una lista plana o el orden de categorías
y sus listas de productos. La configuración es independiente de
`products.display_order` y de Destacados. Los IDs que ya no estén activos se
ignoran al mostrar; los productos y categorías nuevos se agregan al final.

La página administrativa vive en `web/web-admin/src/pages/NewArrivalsOrder.jsx`.
El backend administra el estado en `web/server/routes/admin/new-arrivals-order.js`
y lo aplica a `sort=newest` en `web/server/routes/public/products.js`.
