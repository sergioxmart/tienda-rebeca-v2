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
    `SELECT v.id, v.sku, v.price, v.compare_at, v.stock, v.description, v.display_order
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
              av.value AS value, av.hex, av.display_order
         FROM variant_attribute_values vav
         JOIN attributes a       ON a.id = vav.attribute_id
         JOIN attribute_values av ON av.id = vav.attribute_value_id
        WHERE vav.variant_id = ANY($1)
          AND av.active = TRUE
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
        hex: row.hex,
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
  // Construir los valores desde las variantes activas de ESTE producto.
  // Nunca consultar aquí todos los attribute_values globales: un valor solo
  // aparece en la tienda si está asociado a una variante de este producto.
  const valuesByAttribute = new Map();
  for (const variant of variants) {
    for (const item of variant.attribute_values || []) {
      if (!valuesByAttribute.has(item.attribute_id)) valuesByAttribute.set(item.attribute_id, new Map());
      valuesByAttribute.get(item.attribute_id).set(item.attribute_value_id, {
        id: item.attribute_value_id,
        value: item.value,
        hex: item.hex,
        display_order: item.display_order ?? 0,
      });
    }
  }
  product.attributes = pa
    .map((attr) => ({
      ...attr,
      values: [...(valuesByAttribute.get(attr.attribute_id)?.values() || [])]
        .sort((a, b) => a.display_order - b.display_order || a.value.localeCompare(b.value)),
    }))
    .filter((attr) => attr.values.length > 0);

  // 4. Media (fotos)
  const { rows: media } = await query(
    `SELECT pm.id, pm.variant_id, pm.kind, pm.url, pm.alt_text, pm.display_order
       FROM product_media pm
      WHERE pm.deleted_at IS NULL AND pm.product_id = $1
     UNION ALL
     SELECT pm.id, pmv.variant_id, pm.kind, pm.url, pm.alt_text, pm.display_order
       FROM product_media pm
       JOIN product_media_variants pmv ON pmv.media_id = pm.id
       JOIN product_variants linked_variant ON linked_variant.id = pmv.variant_id
      WHERE pm.deleted_at IS NULL AND linked_variant.product_id = $1
      ORDER BY display_order, id`,
    [product.id],
  );
  const uniqueMedia = media.filter((item, index, list) => list.findIndex((candidate) =>
    candidate.variant_id === item.variant_id && candidate.kind === item.kind && candidate.url === item.url) === index);
  product.media = uniqueMedia.filter((item) => item.variant_id === null);
  const mediaByVariant = new Map();
  for (const item of uniqueMedia) {
    if (item.variant_id === null) continue;
    if (!mediaByVariant.has(item.variant_id)) mediaByVariant.set(item.variant_id, []);
    mediaByVariant.get(item.variant_id).push(item);
  }
  for (const variant of variants) variant.media = mediaByVariant.get(variant.id) ?? [];
  product.image_url = product.media.find((item) => item.kind === 'image')?.url || null;
  product.thumb_url = product.image_url;

  res.setHeader('Cache-Control', 'no-store');
  return json(res, 200, { ok: true, product });
}
