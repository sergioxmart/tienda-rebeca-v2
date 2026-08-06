// Rutas públicas para categories.
//
// Solo lectura. Devuelve las categorías activas para el nav de la tienda
// y la página de cada categoría. Cacheable (5 minutos en el cliente).
//
//   GET /api/public/categories          → lista (solo active=true)
//   GET /api/public/categories/:slug    → detalle por slug

import { query } from '../../lib/db.js';
import { json } from '../../lib/json.js';
import { notFound } from './_helpers.js';

export async function listCategories(req, res) {
  const { rows } = await query(
    `SELECT id, slug, name, description, hero_image, display_order
       FROM categories
       WHERE active = TRUE
       ORDER BY display_order, name`,
  );
  res.setHeader('Cache-Control', 'public, max-age=300');  // 5 min
  return json(res, 200, { ok: true, categories: rows });
}

export async function getCategoryBySlug(req, res, slug) {
  const { rows } = await query(
    `SELECT id, slug, name, description, hero_image, display_order
       FROM categories WHERE slug = $1 AND active = TRUE`,
    [slug],
  );
  if (rows.length === 0) return notFound(res);
  res.setHeader('Cache-Control', 'public, max-age=300');
  return json(res, 200, { ok: true, category: rows[0] });
}
