// Rutas públicas para attributes.
//
// Devuelve los atributos configurables con sus valores posibles, para
// alimentar los filtros del catálogo y los selectores de variante en
// la ficha de producto.
//
//   GET /api/public/attributes     → lista atributos con sus values
//
// Cacheable: los atributos cambian poco (los modifica solo el admin).

import { query } from '../../lib/db.js';
import { json } from '../../lib/json.js';

export async function listAttributes(req, res) {
  const { rows: attrs } = await query(
    `SELECT id, slug, name, type, display_order
       FROM attributes
       WHERE active = TRUE
       ORDER BY display_order, name`,
  );
  // Para cada atributo, traer los values activos.
  for (const a of attrs) {
    const { rows: values } = await query(
      `SELECT id, value, hex, display_order
         FROM attribute_values
         WHERE attribute_id = $1 AND active = TRUE
         ORDER BY display_order, value`,
      [a.id],
    );
    a.values = values;
  }
  res.setHeader('Cache-Control', 'public, max-age=300');
  return json(res, 200, { ok: true, attributes: attrs });
}
