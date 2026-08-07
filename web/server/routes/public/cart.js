// Validación pública del carrito.
//
// El carrito vive en sessionStorage, pero sus datos son una copia temporal.
// Este endpoint devuelve el estado vigente de cada variante para que el
// navegador pueda descartar eliminadas y refrescar precio, nombre, atributos,
// imagen y stock antes de mostrar o enviar el checkout.
//
//   POST /api/public/cart/validate
//   Body: { items: [{ variant_id, product_id }] }

import { query } from '../../lib/db.js';
import { readJsonBody } from '../../lib/body.js';
import { json } from '../../lib/json.js';

function normalizeId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function currentVariant(row, requestedVariantId) {
  return {
    variant_id: requestedVariantId,
    product_id: row.product_id,
    product_slug: row.product_slug,
    product_name: row.product_name,
    sku: row.sku || null,
    attribute_summary: row.attribute_summary || '',
    unit_price: Number(row.unit_price || 0),
    compare_at: Number(row.compare_at || 0),
    image_url: row.image_url || null,
    stock: Number(row.stock || 0),
  };
}

export async function validateCart(req, res) {
  const body = await readJsonBody(req).catch(() => null);
  if (!body || !Array.isArray(body.items)) {
    return json(res, 400, { ok: false, error: 'items_required' });
  }

  const requested = body.items
    .slice(0, 100)
    .map((item) => ({
      variant_id: normalizeId(item?.variant_id),
      product_id: normalizeId(item?.product_id),
    }))
    .filter((item) => item.variant_id);

  if (requested.length === 0) {
    res.setHeader('Cache-Control', 'no-store');
    return json(res, 200, { ok: true, items: [], missing_variant_ids: [] });
  }

  const variantIds = [...new Set(requested.map((item) => item.variant_id))];
  const { rows: variants } = await query(
    `SELECT v.id AS variant_id, v.product_id, v.sku, v.stock,
            p.slug AS product_slug, p.name AS product_name,
            CASE WHEN COALESCE(v.price, 0) > 0 THEN v.price ELSE p.base_price END AS unit_price,
            CASE WHEN COALESCE(v.compare_at, 0) > 0 THEN v.compare_at ELSE p.compare_at END AS compare_at,
            COALESCE((
              SELECT pm.url
                FROM product_media pm
               WHERE pm.deleted_at IS NULL AND pm.kind = 'image'
                 AND (pm.variant_id = v.id OR EXISTS (
                   SELECT 1 FROM product_media_variants pmv
                    WHERE pmv.media_id = pm.id AND pmv.variant_id = v.id
                 ))
               ORDER BY pm.display_order, pm.id
               LIMIT 1
            ), (
              SELECT pm.url
                FROM product_media pm
               WHERE pm.deleted_at IS NULL AND pm.kind = 'image'
                 AND pm.product_id = p.id AND pm.variant_id IS NULL
               ORDER BY pm.display_order, pm.id
               LIMIT 1
            )) AS image_url,
            COALESCE((
              SELECT string_agg(
                a.name || ': ' || av.value,
                ' · ' ORDER BY pa.display_order, a.name, av.display_order, av.value
              )
                FROM variant_attribute_values vav
                JOIN attributes a ON a.id = vav.attribute_id
                JOIN attribute_values av ON av.id = vav.attribute_value_id
                JOIN product_attributes pa
                  ON pa.product_id = p.id AND pa.attribute_id = vav.attribute_id
               WHERE vav.variant_id = v.id AND av.active = TRUE
            ), '') AS attribute_summary
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
      WHERE v.id = ANY($1) AND v.active = TRUE AND p.active = TRUE`,
    [variantIds],
  );

  const currentById = new Map(variants.map((row) => [Number(row.variant_id), row]));
  const missingVariantIds = [];
  const result = [];

  for (const item of requested) {
    const row = currentById.get(item.variant_id);
    if (row) {
      result.push(currentVariant(row, item.variant_id));
      continue;
    }
    missingVariantIds.push(item.variant_id);
  }

  // ProductPage usa product_id como variant_id en productos sin variantes.
  // Se mantiene compatibilidad con esos ítems sin convertir una variante
  // eliminada en un producto genérico si el producto sí tenía variantes.
  const fallbackProductIds = [...new Set(
    requested
      .filter((item) => missingVariantIds.includes(item.variant_id) && item.product_id)
      .map((item) => item.product_id),
  )];
  if (fallbackProductIds.length > 0) {
    const { rows: products } = await query(
      `SELECT p.id AS product_id, p.slug AS product_slug, p.name AS product_name,
              p.sku, p.base_price AS unit_price, p.compare_at,
              COALESCE((
                SELECT SUM(v.stock)
                  FROM product_variants v
                 WHERE v.product_id = p.id
              ), 0) AS stock,
              (
                SELECT pm.url
                  FROM product_media pm
                 WHERE pm.deleted_at IS NULL AND pm.kind = 'image'
                   AND pm.product_id = p.id AND pm.variant_id IS NULL
                 ORDER BY pm.display_order, pm.id
                 LIMIT 1
              ) AS image_url
         FROM products p
        WHERE p.id = ANY($1)
          AND p.active = TRUE
          AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id)`,
      [fallbackProductIds],
    );
    const productById = new Map(products.map((row) => [Number(row.product_id), row]));
    for (const item of requested) {
      if (!missingVariantIds.includes(item.variant_id) || !item.product_id) continue;
      const row = productById.get(item.product_id);
      if (!row) continue;
      const index = missingVariantIds.indexOf(item.variant_id);
      if (index >= 0) missingVariantIds.splice(index, 1);
      result.push(currentVariant({ ...row, attribute_summary: '' }, item.variant_id));
    }
  }

  res.setHeader('Cache-Control', 'no-store');
  return json(res, 200, {
    ok: true,
    items: result,
    missing_variant_ids: [...new Set(missingVariantIds)],
  });
}
