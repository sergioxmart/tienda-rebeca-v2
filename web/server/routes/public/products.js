// Rutas públicas para products (catálogo).
//
//   GET /api/public/products
//     ?category=<slug>          filtra por categoría
//     ?featured=true            solo destacados
//     ?q=<texto>                busca en name y brand
//     ?attribute=<slug>:<value> filtra por valor de atributo (se puede repetir)
//     ?page=1&limit=12          paginación (default 12, max 50)
//
// Devuelve cada producto con: base_price, compare_at, brand, category,
// stock total (sum de variantes), galería de imágenes, y los atributos
// aplicables con sus values. El cliente usa esto para renderizar la
// grilla del catálogo y los filtros.
//
// Cache-Control: 60s público. Los filtros invalidan el cache del
// cliente, no del server (depende del URL completo).

import { query } from '../../lib/db.js';
import { json } from '../../lib/json.js';
import { parseIntParam, parseBoolParam } from './_helpers.js';

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;

export async function listProducts(req, res) {
  const url = new URL(req.url, 'http://x');

  const categorySlug = url.searchParams.get('category');
  const featured = parseBoolParam(url.searchParams.get('featured'));
  const q = url.searchParams.get('q');
  const page = Math.max(1, parseIntParam(url.searchParams.get('page')) ?? 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseIntParam(url.searchParams.get('limit')) ?? DEFAULT_LIMIT));
  const offset = (page - 1) * limit;

  // Filtros por atributo: `?attribute=color:Rojo&attribute=modelo-telefono:iPhone 15`
  // Cada filtro es (slug del atributo, value del atributo).
  const attributeFilters = [];
  for (const [k, v] of url.searchParams) {
    if (k === 'attribute' && typeof v === 'string') {
      const idx = v.indexOf(':');
      if (idx > 0) {
        attributeFilters.push({ slug: v.slice(0, idx), value: v.slice(idx + 1) });
      }
    }
  }

  // WHERE dinámico para los filtros base (sin attribute).
  const where = ['p.active = TRUE'];
  const baseParams = [];
  if (categorySlug) {
    baseParams.push(categorySlug);
    where.push(`c.slug = $${baseParams.length}`);
  }
  if (featured !== null) {
    baseParams.push(featured);
    where.push(`p.featured = $${baseParams.length}`);
  }
  if (q) {
    baseParams.push(`%${q}%`);
    where.push(`(p.name ILIKE $${baseParams.length} OR p.brand ILIKE $${baseParams.length})`);
  }

  // Si hay attribute filters, primero sacamos los product_ids que los cumplen.
  // Hacemos esto en una subquery separada para no jugar con placeholders.
  let productIdFilter = null;
  if (attributeFilters.length > 0) {
    // Cada filter es: existe variant del product con (attribute.slug, value.value)
    // Hacemos INTERSECT de los product_ids que cumplen cada filter.
    const intersectQueries = attributeFilters.map((f, i) => {
      const slugParam = `$${i * 2 + 1}`;
      const valueParam = `$${i * 2 + 2}`;
      return `
        SELECT DISTINCT pv.product_id
          FROM product_variants pv
          JOIN variant_attribute_values vav ON vav.variant_id = pv.id
          JOIN attributes a ON a.id = vav.attribute_id
          JOIN attribute_values av ON av.id = vav.attribute_value_id
         WHERE pv.active = TRUE
           AND a.slug = ${slugParam}
           AND av.value = ${valueParam}
      `;
    });
    const attrParams = attributeFilters.flatMap(f => [f.slug, f.value]);
    productIdFilter = await query(
      `SELECT product_id FROM (${intersectQueries.join(' INTERSECT ')}) AS all_matches`,
      attrParams,
    );
    const ids = productIdFilter.rows.map(r => r.product_id);
    if (ids.length === 0) {
      // No hay match, devuelvo vacío rápido
      return json(res, 200, {
        ok: true,
        products: [],
        pagination: { page, limit, total: 0, total_pages: 0 },
      });
    }
    baseParams.push(ids);
    where.push(`p.id = ANY($${baseParams.length})`);
  }

  // Total
  const { rows: countRows } = await query(
    `SELECT COUNT(DISTINCT p.id) AS total
       FROM products p
       JOIN categories c ON c.id = p.category_id
      WHERE ${where.join(' AND ')}`,
    baseParams,
  );
  const total = Number(countRows[0].total);

  // Datos paginados
  baseParams.push(limit, offset);
  const { rows: products } = await query(
    `SELECT p.id, p.category_id, p.sku, p.name, p.slug, p.description, p.brand,
            p.base_price, p.compare_at, p.featured, p.display_order,
            c.slug AS category_slug, c.name AS category_name,
            COALESCE(SUM(CASE WHEN v.active THEN v.stock ELSE 0 END), 0) AS total_stock
       FROM products p
       JOIN categories c ON c.id = p.category_id
       LEFT JOIN product_variants v ON v.product_id = p.id
      WHERE ${where.join(' AND ')}
      GROUP BY p.id, c.slug, c.name
      ORDER BY p.featured DESC, p.display_order, p.name
      LIMIT $${baseParams.length - 1} OFFSET $${baseParams.length}`,
    baseParams,
  );

  // Media batch
  if (products.length > 0) {
    const ids = products.map(p => p.id);
    const { rows: media } = await query(
      `SELECT product_id, kind, url, alt_text, display_order
         FROM product_media
        WHERE product_id = ANY($1) AND deleted_at IS NULL
        ORDER BY product_id, display_order, id`,
      [ids],
    );
    const mediaByProduct = new Map();
    for (const m of media) {
      if (!mediaByProduct.has(m.product_id)) mediaByProduct.set(m.product_id, []);
      mediaByProduct.get(m.product_id).push(m);
    }
    for (const p of products) {
      p.media = mediaByProduct.get(p.id) ?? [];
      p.image_url = p.media.find((item) => item.kind === 'image')?.url || null;
      p.thumb_url = p.image_url;
    }
  }

  res.setHeader('Cache-Control', 'public, max-age=60');
  return json(res, 200, {
    ok: true,
    products,
    pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
  });
}
