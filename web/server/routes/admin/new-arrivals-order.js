// Configuración independiente para el orden de "Lo más nuevo".

import { query } from '../../lib/db.js';
import { json } from '../../lib/json.js';
import { protect, recordAudit } from './_helpers.js';

const EMPTY_CONFIG = {
  group_by_category: false,
  flat_product_ids: [],
  category_ids: [],
  category_product_ids: {},
};

function positiveIds(value) {
  if (!Array.isArray(value)) return false;
  const ids = value.map(Number);
  return ids.every((id) => Number.isSafeInteger(id) && id > 0)
    && new Set(ids).size === value.length;
}

function validConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (typeof value.group_by_category !== 'boolean') return false;
  if (!positiveIds(value.flat_product_ids) || !positiveIds(value.category_ids)) return false;
  if (!value.category_product_ids || typeof value.category_product_ids !== 'object' || Array.isArray(value.category_product_ids)) return false;
  return Object.entries(value.category_product_ids).every(([key, ids]) => (
    (key === 'uncategorized' || /^\d+$/.test(key)) && positiveIds(ids)
  ));
}

function mergeVisibleOrder(currentIds, desiredIds, visibleIds) {
  const visible = new Set(visibleIds.map(Number));
  const desired = desiredIds.map(Number).filter((id) => visible.has(id));
  let index = 0;
  const merged = currentIds.map((id) => {
    if (!visible.has(Number(id))) return Number(id);
    return desired[index++];
  }).filter(Number.isSafeInteger);
  return [...merged, ...desired.slice(index)];
}

function completeVisibleConfig(saved, products, categories) {
  const productIds = products.map((product) => Number(product.id));
  const categoryIds = categories.map((category) => Number(category.id));
  const savedFlat = Array.isArray(saved.flat_product_ids) ? saved.flat_product_ids : [];
  const savedCategories = Array.isArray(saved.category_ids) ? saved.category_ids : [];
  const savedByCategory = saved.category_product_ids && typeof saved.category_product_ids === 'object'
    ? saved.category_product_ids : {};
  const groups = new Map();
  for (const product of products) {
    const key = product.category_id == null ? 'uncategorized' : String(product.category_id);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(Number(product.id));
  }

  const categoryProductIds = {};
  for (const [key, ids] of groups) {
    const savedIds = Array.isArray(savedByCategory[key]) ? savedByCategory[key] : [];
    const known = new Set(ids);
    categoryProductIds[key] = [
      ...savedIds.map(Number).filter((id) => known.has(id)),
      ...ids.filter((id) => !savedIds.some((savedId) => Number(savedId) === id)),
    ];
  }

  return {
    group_by_category: saved.group_by_category === true,
    flat_product_ids: [
      ...savedFlat.map(Number).filter((id) => productIds.includes(id)),
      ...productIds.filter((id) => !savedFlat.some((savedId) => Number(savedId) === id)),
    ],
    category_ids: [
      ...savedCategories.map(Number).filter((id) => categoryIds.includes(id)),
      ...categoryIds.filter((id) => !savedCategories.some((savedId) => Number(savedId) === id)),
    ],
    category_product_ids: categoryProductIds,
  };
}

export async function getNewArrivalsOrder(_req, res) {
  const [{ rows: configRows }, { rows: products }, { rows: categories }] = await Promise.all([
    query('SELECT config FROM new_arrivals_order WHERE id = 1'),
    query(`SELECT p.id, p.category_id, p.name, p.sku, p.base_price, p.active,
                  c.name AS category_name, c.active AS category_active,
                  COALESCE(selected_media.url, first_media.url) AS image_url
             FROM products p
             LEFT JOIN categories c ON c.id = p.category_id
             LEFT JOIN LATERAL (
               SELECT pm.url FROM product_media pm
                WHERE pm.product_id = p.id AND pm.deleted_at IS NULL AND pm.kind = 'image'
                  AND pm.id = p.catalog_image_media_id
                LIMIT 1
             ) selected_media ON TRUE
             LEFT JOIN LATERAL (
               SELECT pm.url FROM product_media pm
                WHERE pm.product_id = p.id AND pm.deleted_at IS NULL AND pm.kind = 'image'
                ORDER BY pm.display_order, pm.id LIMIT 1
             ) first_media ON TRUE
            WHERE p.active = TRUE
            ORDER BY p.featured DESC, p.display_order, p.name`),
    query('SELECT id, name, active FROM categories ORDER BY display_order, name'),
  ]);
  const configured = configRows.length > 0;
  const config = completeVisibleConfig(configured ? configRows[0].config : EMPTY_CONFIG, products, categories);
  return json(res, 200, { ok: true, configured, config, products, categories });
}

export async function saveNewArrivalsOrder(req, res) {
  const config = req.body?.config;
  if (!validConfig(config)) {
    return json(res, 400, { ok: false, error: 'invalid_new_arrivals_order' });
  }

  const { rows: currentRows } = await query('SELECT config FROM new_arrivals_order WHERE id = 1');
  const current = currentRows[0]?.config || EMPTY_CONFIG;
  const [{ rows: products }, { rows: categories }] = await Promise.all([
    query('SELECT id, category_id FROM products WHERE active = TRUE'),
    query('SELECT id FROM categories'),
  ]);

  const visibleProductIds = products.map((row) => Number(row.id));
  const visibleCategoryIds = categories.map((row) => Number(row.id));
  const merged = {
    group_by_category: config.group_by_category,
    flat_product_ids: mergeVisibleOrder(
      Array.isArray(current.flat_product_ids) ? current.flat_product_ids : [],
      config.flat_product_ids,
      visibleProductIds,
    ),
    category_ids: mergeVisibleOrder(
      Array.isArray(current.category_ids) ? current.category_ids : [],
      config.category_ids,
      visibleCategoryIds,
    ),
    category_product_ids: {
      ...(current.category_product_ids && typeof current.category_product_ids === 'object' ? current.category_product_ids : {}),
    },
  };

  for (const [key, desiredIds] of Object.entries(config.category_product_ids)) {
    const visibleIds = products
      .filter((product) => (product.category_id == null ? 'uncategorized' : String(product.category_id)) === key)
      .map((product) => Number(product.id));
    const priorIds = Array.isArray(merged.category_product_ids[key]) ? merged.category_product_ids[key] : [];
    merged.category_product_ids[key] = mergeVisibleOrder(priorIds, desiredIds, visibleIds);
  }

  await query(
    `INSERT INTO new_arrivals_order (id, config, updated_at)
     VALUES (1, $1::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = NOW()`,
    [JSON.stringify(merged)],
  );
  await recordAudit(req.user?.id, 'new_arrivals_order.update', req.ip, { group_by_category: merged.group_by_category });
  return json(res, 200, { ok: true, config: merged });
}

const routes = [
  { method: 'GET', pattern: /^\/api\/admin\/new-arrivals-order\/?$/, handler: getNewArrivalsOrder },
  { method: 'PUT', pattern: /^\/api\/admin\/new-arrivals-order\/?$/, handler: saveNewArrivalsOrder },
];

export async function tryHandleNewArrivalsOrder(req, res) {
  const method = req.method || 'GET';
  const pathname = (req.url || '/').split('?')[0];
  for (const route of routes) {
    if (route.method !== method) continue;
    if (!route.pattern.test(pathname)) continue;
    return protect(route.handler, 'new_arrivals_order')(req, res) || true;
  }
  return false;
}
