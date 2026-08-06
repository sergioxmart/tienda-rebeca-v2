// Ruta pública para el detalle de un producto.
//
//   GET /api/public/products/:slug
//
// Devuelve: el producto + sus variantes activas (con sus valores de
// atributos) + media (fotos) + atributos aplicables con sus values.
//
// Es la query más pesada del catálogo: 1 producto + N variantes +
// 2N valores de atributos + M imágenes. Cacheable por 60s.

import { query } from '../../lib/db.js';
import { json } from '../../lib/json.js';
import { notFound } from './_helpers.js';

export async function getProductBySlug(req, res, slug) {
  // 1. Producto
  const { rows: p } = await query(
    `SELECT p.id, p.category_id, p.sku, p.name, p.slug, p.description, p.brand,
            p.base_price, p.compare_at, p.featured, p.display_order,
            c.slug AS category_slug, c.name AS category_name
       FROM products p
       JOIN categories c ON c.id = p.category_id
      WHERE p.slug = $1 AND p.active = TRUE`,
    [slug],
  );
  if (p.length === 0) return notFound(res);
  const product = p[0];

  // 2. Variantes activas con sus valores
  const { rows: variants } = await query(
    `SELECT v.id, v.sku, v.price, v.compare_at, v.stock, v.display_order
       FROM product_variants v
      WHERE v.product_id = $1 AND v.active = TRUE
      ORDER BY v.display_order, v.id`,
    [product.id],
  );

  if (variants.length > 0) {
    const variantIds = variants.map(v => v.id);
    const { rows: vav } = await query(
      `SELECT vav.variant_id, vav.attribute_id, vav.attribute_value_id,
              a.slug AS attribute_slug, a.name AS attribute_name, a.type AS attribute_type,
              av.value AS value
         FROM variant_attribute_values vav
         JOIN attributes a       ON a.id = vav.attribute_id
         JOIN attribute_values av ON av.id = vav.attribute_value_id
        WHERE vav.variant_id = ANY($1)
        ORDER BY a.display_order, a.name, av.display_order, av.value`,
      [variantIds],
    );
    const vavByVariant = new Map();
    for (const row of vav) {
      if (!vavByVariant.has(row.variant_id)) vavByVariant.set(row.variant_id, []);
      vavByVariant.get(row.variant_id).push({
        attribute_id: row.attribute_id,
        attribute_value_id: row.attribute_value_id,
        attribute_slug: row.attribute_slug,
        attribute_name: row.attribute_name,
        attribute_type: row.attribute_type,
        value: row.value,
      });
    }
    for (const v of variants) {
      v.attribute_values = vavByVariant.get(v.id) ?? [];
    }
  }
  product.variants = variants;

  // 3. Atributos aplicables (con sus values activos)
  const { rows: pa } = await query(
    `SELECT pa.attribute_id, pa.is_required, pa.display_order,
            a.slug AS attribute_slug, a.name AS attribute_name, a.type AS attribute_type
       FROM product_attributes pa
       JOIN attributes a ON a.id = pa.attribute_id
      WHERE pa.product_id = $1 AND a.active = TRUE
      ORDER BY pa.display_order, a.name`,
    [product.id],
  );
  for (const attr of pa) {
    const { rows: values } = await query(
      `SELECT id, value, display_order
         FROM attribute_values
        WHERE attribute_id = $1 AND active = TRUE
        ORDER BY display_order, value`,
      [attr.attribute_id],
    );
    attr.values = values;
  }
  product.attributes = pa;

  // 4. Media (fotos)
  const { rows: media } = await query(
    `SELECT id, kind, url, alt_text, display_order
       FROM product_media
      WHERE product_id = $1 AND deleted_at IS NULL
      ORDER BY display_order, id`,
    [product.id],
  );
  product.media = media;

  res.setHeader('Cache-Control', 'public, max-age=60');
  return json(res, 200, { ok: true, product });
}
