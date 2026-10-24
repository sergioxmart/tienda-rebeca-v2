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
  const isNewArrivalsRequest = url.searchParams.get('sort') === 'newest';
  let newArrivalsConfig = null;
  if (isNewArrivalsRequest) {
    const { rows } = await query('SELECT config FROM new_arrivals_order WHERE id = 1');
    newArrivalsConfig = rows[0]?.config || null;
  }

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

  const categoryJoin = newArrivalsConfig ? 'LEFT JOIN' : 'JOIN';

  // Total
  const { rows: countRows } = await query(
    `SELECT COUNT(DISTINCT p.id) AS total
       FROM products p
       ${categoryJoin} categories c ON c.id = p.category_id
      WHERE ${where.join(' AND ')}`,
    baseParams,
  );
  const total = Number(countRows[0].total);

  // Datos paginados
  const productParams = [...baseParams];
  if (!newArrivalsConfig) productParams.push(limit, offset);
  const { rows: products } = await query(
    `SELECT p.id, p.category_id, p.sku, p.name, p.slug, p.description, p.brand,
            p.base_price, p.compare_at, p.featured, p.display_order,
            p.catalog_image_position_x, p.catalog_image_position_y, p.catalog_image_zoom,
            p.catalog_image_media_id,
            c.slug AS category_slug, c.name AS category_name, c.display_order AS category_display_order,
            COALESCE(SUM(CASE WHEN v.active THEN v.stock ELSE 0 END), 0) AS total_stock
       FROM products p
       ${categoryJoin} categories c ON c.id = p.category_id
       LEFT JOIN product_variants v ON v.product_id = p.id
      WHERE ${where.join(' AND ')}
      GROUP BY p.id, c.slug, c.name, c.display_order
      ORDER BY p.featured DESC, p.display_order, p.name
      ${newArrivalsConfig ? '' : `LIMIT $${productParams.length - 1} OFFSET $${productParams.length}`}`,
    productParams,
  );

  if (newArrivalsConfig) {
    const compareDefault = (a, b) => (
      Number(b.featured) - Number(a.featured)
      || Number(a.display_order) - Number(b.display_order)
      || String(a.name).localeCompare(String(b.name), 'es')
    );
    const productOrders = newArrivalsConfig.category_product_ids || {};
    if (newArrivalsConfig.group_by_category) {
      const categoryOrder = new Map((newArrivalsConfig.category_ids || []).map((id, index) => [Number(id), index]));
      products.sort((a, b) => {
        const aCategory = a.category_id == null ? Number.MAX_SAFE_INTEGER : (categoryOrder.get(Number(a.category_id)) ?? Number.MAX_SAFE_INTEGER - 1);
        const bCategory = b.category_id == null ? Number.MAX_SAFE_INTEGER : (categoryOrder.get(Number(b.category_id)) ?? Number.MAX_SAFE_INTEGER - 1);
        if (aCategory !== bCategory) return aCategory - bCategory;
        if (a.category_id != null && b.category_id != null && !categoryOrder.has(Number(a.category_id)) && !categoryOrder.has(Number(b.category_id))) {
          const categoryFallback = Number(a.category_display_order) - Number(b.category_display_order)
            || String(a.category_name).localeCompare(String(b.category_name), 'es');
          if (categoryFallback) return categoryFallback;
        }
        const key = a.category_id == null ? 'uncategorized' : String(a.category_id);
        const order = new Map((productOrders[key] || []).map((id, index) => [Number(id), index]));
        const aProduct = order.get(Number(a.id)) ?? Number.MAX_SAFE_INTEGER;
        const bProduct = order.get(Number(b.id)) ?? Number.MAX_SAFE_INTEGER;
        return aProduct - bProduct || compareDefault(a, b);
      });
    } else {
      const flatOrder = new Map((newArrivalsConfig.flat_product_ids || []).map((id, index) => [Number(id), index]));
      products.sort((a, b) => (
        (flatOrder.get(Number(a.id)) ?? Number.MAX_SAFE_INTEGER)
        - (flatOrder.get(Number(b.id)) ?? Number.MAX_SAFE_INTEGER)
        || compareDefault(a, b)
      ));
    }
    products.splice(0, products.length, ...products.slice(offset, offset + limit));
  }
  for (const product of products) delete product.category_display_order;

  // Media batch
  if (products.length > 0) {
    const ids = products.map(p => p.id);
    const { rows: media } = await query(
      `SELECT DISTINCT pm.id, pm.product_id, pm.variant_id, pm.kind, pm.url, pm.alt_text, pm.display_order,
              COALESCE(pm.product_id, direct_variant.product_id, linked_variant.product_id) AS owner_product_id
         FROM product_media pm
         LEFT JOIN product_variants direct_variant ON direct_variant.id = pm.variant_id
         LEFT JOIN product_media_variants pmv ON pmv.media_id = pm.id
         LEFT JOIN product_variants linked_variant ON linked_variant.id = pmv.variant_id
        WHERE pm.deleted_at IS NULL AND (
          pm.product_id = ANY($1)
          OR direct_variant.product_id = ANY($1)
          OR linked_variant.product_id = ANY($1)
        )
        ORDER BY owner_product_id, pm.display_order, pm.id`,
      [ids],
    );
    const mediaByProduct = new Map();
    for (const m of media) {
      if (!mediaByProduct.has(m.owner_product_id)) mediaByProduct.set(m.owner_product_id, []);
      mediaByProduct.get(m.owner_product_id).push(m);
    }
    for (const p of products) {
      p.media = mediaByProduct.get(p.id) ?? [];
      const selected = p.media.find((item) => item.id === p.catalog_image_media_id && item.kind === 'image');
      // Si no hay selección explícita, usamos la primera imagen de producto
      // o variante para que las tarjetas nunca queden vacías.
      p.image_url = selected?.url || p.media.find((item) => item.kind === 'image')?.url || null;
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
