// Endpoints públicos (sin auth). Leídos por la tienda.
//
// GET  /healthz                 — smoke
// GET  /site-config             — config del sitio (logo, contacto, horarios, etc.)
// GET  /collections             — lista de colecciones activas
// GET  /collections/:slug       — detalle de colección con sus productos
// GET  /products/:id            — detalle de producto (con media + sizes)
// GET  /modules?slot=home       — módulos del page builder
// GET  /closures?from=&to=      — cierres en el rango
// POST /reservations            — crear reserva (devuelve whatsapp_url)
// POST /cart-whatsapp           — generar link de WhatsApp para un carrito

import { query } from '../lib/db.js';
import { log } from '../lib/logger.js';
import { json } from '../lib/json.js';
import { readJsonBody } from '../lib/body.js';

// Promo VIGENTE de un producto `p` (viva y dentro de fechas). El precio final
// se calcula acá, en el server: la tienda refleja precios, nunca los decide.
// Aplica solo sobre el precio de venta (`price`); los precios de alquiler no
// llevan promo.
const PROMO_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT pp.id, pp.kind, pp.value, pp.ends_at
      FROM product_promos pp
     WHERE pp.product_id = p.id AND pp.deleted_at IS NULL
       AND CURRENT_DATE BETWEEN pp.starts_at AND pp.ends_at
     LIMIT 1
  ) promo ON TRUE`;

const PROMO_JSON = `
  CASE WHEN promo.id IS NULL THEN NULL ELSE json_build_object(
    'kind', promo.kind, 'value', promo.value, 'ends_at', promo.ends_at,
    'final_price', GREATEST(p.price - (CASE promo.kind
      WHEN 'percent' THEN ROUND(p.price * promo.value / 100, 2)
      ELSE promo.value END), 0)
  ) END AS promo`;

function notImpl(_req, res) {
  json(res, 501, { ok: false, error: 'not_implemented_yet' });
}

// --- site-config (lo lee el frontend en cada page load) -----------------

async function getSiteConfig(_req, res) {
  const { rows } = await query(`SELECT key, value FROM site_config`);
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  return json(res, 200, { ok: true, data: map });
}

// --- collections --------------------------------------------------------

async function listCollections(_req, res) {
  const { rows } = await query(
    `SELECT id, name, slug, description, hero_image, accent_color, display_order,
            show_in_nav, nav_label
       FROM collections c
      WHERE c.active = TRUE
        AND c.deleted_at IS NULL
        AND c.is_system = FALSE
        AND EXISTS (
          SELECT 1 FROM product_collections pc
            JOIN products p ON p.id = pc.product_id
           WHERE pc.collection_id = c.id AND p.published = TRUE AND p.deleted_at IS NULL
        )
      ORDER BY c.display_order, c.name`,
  );
  return json(res, 200, { ok: true, data: rows });
}

async function getCollection(_req, res, slug) {
  const { rows: cols } = await query(
    `SELECT id, name, slug, description, hero_image, accent_color
       FROM collections
      WHERE slug = $1
        AND (active = TRUE OR is_system = TRUE)
        AND deleted_at IS NULL`,
    [slug],
  );
  if (!cols[0]) return json(res, 404, { ok: false, error: 'not_found' });
  const col = cols[0];

  // `published` es el interruptor manual de vitrina; `agotado` se deriva del
  // stock y NO despublica: el producto se muestra con badge y sin compra.
  const { rows: products } = await query(
    `SELECT p.id, p.name, p.type, p.types, p.price, p.rental_price, p.rental_new_price,
            p.use_colors,
            EXISTS (
              SELECT 1 FROM product_collections pc2
                JOIN collections col2 ON col2.id = pc2.collection_id
               WHERE pc2.product_id = p.id AND col2.slug = 'destacado'
            ) AS featured,
            p.display_order,
            COALESCE(
              (SELECT SUM(s) FROM (
                SELECT ps.stock AS s FROM product_sizes ps WHERE ps.product_id = p.id
                UNION ALL
                SELECT pv.stock AS s FROM product_variants pv WHERE pv.product_id = p.id
              ) t),
              0
            )::int AS stock_total,
            -- Si maneja colores, mini-swatch: el primer color con hex
            (SELECT c.hex FROM product_colors pc3
               JOIN colors c ON c.id = pc3.color_id
              WHERE pc3.product_id = p.id AND pc3.active = TRUE AND c.hex IS NOT NULL
              ORDER BY pc3.display_order LIMIT 1) AS swatch_hex,
            ${PROMO_JSON},
            COALESCE(
              (SELECT json_agg(json_build_object(
                        'size_id', ps.size_id,
                        'label', s.label,
                        'stock', ps.stock)
                      ORDER BY s.display_order)
               FROM product_sizes ps
               JOIN sizes s ON s.id = ps.size_id
               WHERE ps.product_id = p.id),
              '[]'::json
            ) AS sizes,
            (SELECT url FROM product_media
              WHERE product_id = p.id AND kind = 'image' AND deleted_at IS NULL
              ORDER BY display_order LIMIT 1) AS hero_image
       FROM products p
       JOIN product_collections pc ON pc.product_id = p.id
  ${PROMO_LATERAL}
      WHERE pc.collection_id = $1 AND p.published = TRUE AND p.deleted_at IS NULL
      ORDER BY p.display_order, p.name`,
    [col.id],
  );
  return json(res, 200, { ok: true, data: { ...col, products } });
}

// --- product detail -----------------------------------------------------

async function getProduct(_req, res, id) {
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return json(res, 400, { ok: false, error: 'invalid_id' });
  }
  const { rows: prods } = await query(
    `SELECT p.id, c.id AS collection_id, p.name, p.description, p.type, p.types,
            p.price, p.rental_price, p.rental_new_price,
            p.use_colors, p.color_system_id,
            EXISTS (
              SELECT 1 FROM product_collections pc2
                JOIN collections col2 ON col2.id = pc2.collection_id
               WHERE pc2.product_id = p.id AND col2.slug = 'destacado'
            ) AS featured,
            c.name AS collection_name, c.slug AS collection_slug, c.accent_color,
            ${PROMO_JSON},
            -- Stock total: suma de variants (si usa colores) o product_sizes.
            COALESCE(
              (SELECT SUM(s) FROM (
                SELECT ps.stock AS s FROM product_sizes ps WHERE ps.product_id = p.id
                UNION ALL
                SELECT pv.stock AS s FROM product_variants pv WHERE pv.product_id = p.id
              ) t),
              0
            )::int AS stock_total
       FROM products p
       LEFT JOIN LATERAL (
         SELECT col.id, col.name, col.slug, col.accent_color
           FROM collections col
           JOIN product_collections pc ON pc.collection_id = col.id
          WHERE pc.product_id = p.id AND col.active = TRUE AND col.deleted_at IS NULL AND col.is_system = FALSE
          ORDER BY col.display_order, col.name
          LIMIT 1
       ) c ON TRUE
  ${PROMO_LATERAL}
      WHERE p.id = $1 AND p.published = TRUE AND p.deleted_at IS NULL`,
    [numId],
  );
  if (!prods[0]) return json(res, 404, { ok: false, error: 'not_found' });

  // Colores del producto (Fase 5). Solo si use_colors=true. Vienen con label,
  // hex y display_order para que el front arme los chips.
  const colors = prods[0].use_colors
    ? (await query(
        `SELECT c.id, c.label, c.hex, pc.display_order
           FROM product_colors pc
           JOIN colors c ON c.id = pc.color_id
          WHERE pc.product_id = $1 AND pc.active = TRUE
          ORDER BY pc.display_order, c.label`,
        [numId],
      )).rows
    : [];

  // Variantes: una fila por (color, size) con su stock. Si use_colors=false,
  // variants queda vacío (el stock se sigue leyendo de product_sizes abajo).
  const variants = prods[0].use_colors
    ? (await query(
        `SELECT pv.id, pv.color_id, pv.size_id, pv.stock,
                c.label AS color_label, c.hex,
                s.label AS size_label
           FROM product_variants pv
      LEFT JOIN colors c ON c.id = pv.color_id
      LEFT JOIN sizes  s ON s.id = pv.size_id
          JOIN product_colors pc ON pc.product_id = pv.product_id AND pc.color_id = pv.color_id
          WHERE pv.product_id = $1 AND pc.active = TRUE
          ORDER BY c.display_order, s.display_order NULLS FIRST`,
        [numId],
      )).rows
    : [];

  // Tallas: solo si NO usa colores (modelo aditivo, ver plan 2026-07-27).
  const sizes = prods[0].use_colors
    ? []
    : (await query(
        `SELECT ps.size_id, s.label, ps.stock
           FROM product_sizes ps
           JOIN sizes s ON s.id = ps.size_id
          WHERE ps.product_id = $1 AND ps.stock > 0
          ORDER BY s.display_order`,
        [numId],
      )).rows;

  // Media: trae el color_id para que el front agrupe por color.
  const { rows: media } = await query(
    `SELECT id, kind, url, alt_text, display_order, color_id
       FROM product_media
      WHERE product_id = $1 AND deleted_at IS NULL
      ORDER BY color_id NULLS FIRST, display_order, created_at`,
    [numId],
  );

  // `agotado` es derivado (stock total en 0), nunca despublica solo.
  const out_of_stock = Number(prods[0].stock_total) === 0;
  return json(res, 200, {
    ok: true,
    data: { ...prods[0], media, colors, variants, sizes, out_of_stock },
  });
}

// --- modules (page builder) ---------------------------------------------

async function getModules(_req, res) {
  const url = new URL(_req.url, 'http://x');
  const slot = url.searchParams.get('slot') || 'home';
  const { rows } = await query(
    `SELECT id, type, title, config, display_order
       FROM page_modules
      WHERE slot = $1 AND active = TRUE
      ORDER BY display_order`,
    [slot],
  );
  return json(res, 200, { ok: true, data: rows });
}

// --- closures ----------------------------------------------------------

async function getClosures(_req, res) {
  const url = new URL(_req.url, 'http://x');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const where = [];
  const args = [];
  let i = 1;
  if (from) { where.push(`end_date >= $${i++}`); args.push(from); }
  if (to)   { where.push(`start_date <= $${i++}`); args.push(to); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT id, start_date, end_date, reason FROM shop_closures ${whereSql} ORDER BY start_date`,
    args,
  );
  return json(res, 200, { ok: true, data: rows });
}

// --- whatsapp helper ---------------------------------------------------

function getContact() {
  // Best-effort: leer site_config para el teléfono
  return query(`SELECT key, value FROM site_config WHERE key IN ('contact_phone', 'whatsapp_message_template')`)
    .then(({ rows }) => {
      const map = {};
      for (const r of rows) map[r.key] = r.value;
      return map;
    })
    .catch(() => ({}));
}

function buildWaUrl(phone, message) {
  const p = String(phone || '').replace(/[^0-9]/g, '');
  if (!p) return null;
  return `https://wa.me/${p}?text=${encodeURIComponent(message)}`;
}

function formatDate(s) {
  if (!s) return '';
  return new Date(s + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
}

function money(n) {
  const v = Number(n) || 0;
  return 'Q' + v.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// --- reservations (cliente) -------------------------------------------

async function createReservation(req, res) {
  const p = await readJsonBody(req).catch(() => null);
  if (!p) return json(res, 400, { ok: false, error: 'invalid_json' });

  const required = ['product_id', 'client_name', 'client_email', 'client_phone', 'start_date', 'end_date', 'pickup_date'];
  for (const k of required) {
    if (!p[k]) return json(res, 400, { ok: false, error: 'missing_field', field: k });
  }

  const productId = Number(p.product_id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return json(res, 400, { ok: false, error: 'invalid_product_id' });
  }

  // Validar fechas
  const start = new Date(p.start_date);
  const end   = new Date(p.end_date);
  const pickup = new Date(p.pickup_date);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || Number.isNaN(pickup.getTime())) {
    return json(res, 400, { ok: false, error: 'invalid_date' });
  }
  if (end < start) return json(res, 400, { ok: false, error: 'end_before_start' });
  if (pickup < start || pickup > new Date(end.getTime() + 24 * 60 * 60 * 1000)) {
    return json(res, 400, { ok: false, error: 'pickup_out_of_range' });
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (start < today) return json(res, 400, { ok: false, error: 'start_in_past' });

  // Validar email
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.client_email)) {
    return json(res, 400, { ok: false, error: 'invalid_email' });
  }

  // Validar que el producto existe y está publicado
  const { rows: prods } = await query(
    `SELECT p.id, p.name, p.type, p.types, p.rental_price, p.rental_new_price,
            p.use_colors, p.color_system_id,
            c.name AS collection_name
       FROM products p
       LEFT JOIN LATERAL (
         SELECT col.name
           FROM collections col
           JOIN product_collections pc ON pc.collection_id = col.id
          WHERE pc.product_id = p.id AND col.active = TRUE AND col.deleted_at IS NULL AND col.is_system = FALSE
          ORDER BY col.display_order, col.name
          LIMIT 1
       ) c ON TRUE
      WHERE p.id = $1 AND p.published = TRUE AND p.deleted_at IS NULL`,
    [productId],
  );
  if (!prods[0]) return json(res, 404, { ok: false, error: 'product_not_found' });
  const product = prods[0];
  const requestedType = p.requested_type || 'alquiler';
  const availableTypes = Array.isArray(product.types) && product.types.length ? product.types : [product.type];
  if (!['alquiler', 'alquiler_nuevo'].includes(requestedType) || !availableTypes.includes(requestedType)) {
    return json(res, 400, { ok: false, error: 'invalid_requested_type' });
  }

  // Validar size_id si viene
  let sizeId = null;
  if (p.size_id) {
    sizeId = Number(p.size_id);
    if (!Number.isInteger(sizeId) || sizeId <= 0) {
      return json(res, 400, { ok: false, error: 'invalid_size_id' });
    }
  }

  // Validar color_id si viene. Si el producto usa colores, color_id es
  // OBLIGATORIO. Si no, no se acepta.
  let colorId = null;
  let colorLabel = null;
  if (p.color_id != null) {
    colorId = Number(p.color_id);
    if (!Number.isInteger(colorId) || colorId <= 0) {
      return json(res, 400, { ok: false, error: 'invalid_color_id' });
    }
  }
  // Decidir cómo validar stock: si el producto usa colores, las variants
  // mandan. Si no, product_sizes como antes.
  if (product.use_colors) {
    if (!colorId) {
      return json(res, 400, { ok: false, error: 'color_required' });
    }
    // Verificar que el color pertenece al sistema del producto.
    const { rows: cvalid } = await query(
      `SELECT c.id, c.label
         FROM colors c
         JOIN product_colors pc ON pc.color_id = c.id AND pc.product_id = $3 AND pc.active = TRUE
         WHERE c.id = $1 AND c.system_id = $2 AND c.active = TRUE`,
      [colorId, product.color_system_id, productId],
    );
    if (!cvalid[0]) {
      return json(res, 400, { ok: false, error: 'invalid_color_id' });
    }
    colorLabel = cvalid[0].label;
    // Stock de la variante (color + talla, si hay talla)
    if (sizeId) {
      const { rows: v } = await query(
        `SELECT stock FROM product_variants
          WHERE product_id = $1 AND color_id = $2 AND size_id = $3`,
        [productId, colorId, sizeId],
      );
      if (!v[0] || Number(v[0].stock) <= 0) {
        return json(res, 400, { ok: false, error: 'size_out_of_stock' });
      }
    } else {
      // Sin talla pero con color: validar que el color tenga stock total > 0
      const { rows: v } = await query(
        `SELECT COALESCE(SUM(stock), 0)::int AS total FROM product_variants
          WHERE product_id = $1 AND color_id = $2`,
        [productId, colorId],
      );
      if (!v[0] || Number(v[0].total) <= 0) {
        return json(res, 400, { ok: false, error: 'color_out_of_stock' });
      }
    }
  } else {
    // Modelo clásico: validar size_id en product_sizes
    if (sizeId) {
      const { rows: sz } = await query(
        `SELECT stock FROM product_sizes WHERE product_id = $1 AND size_id = $2`,
        [productId, sizeId],
      );
      if (!sz[0] || sz[0].stock <= 0) {
        return json(res, 400, { ok: false, error: 'size_out_of_stock' });
      }
    }
  }

  // Validar que no haya cierres en el rango
  const { rows: closures } = await query(
    `SELECT start_date, end_date, reason FROM shop_closures
      WHERE NOT (end_date < $1 OR start_date > $2)`,
    [p.start_date, p.end_date],
  );
  if (closures.length) {
    return json(res, 409, { ok: false, error: 'dates_cover_closure', closures });
  }

  // Validar conflictos con reservas confirmed del mismo producto+size+color
  const { rows: conflicts } = await query(
    `SELECT id, start_date, end_date FROM reservations
      WHERE product_id = $1
        AND ($2::int IS NULL OR size_id = $2)
        AND ($3::int IS NULL OR color_id = $3)
        AND status = 'confirmed'
        AND NOT (end_date < $4 OR start_date > $5)`,
    [productId, sizeId, colorId, p.start_date, p.end_date],
  );
  if (conflicts.length) {
    return json(res, 409, { ok: false, error: 'dates_conflict', conflicts });
  }

  // Insertar
  const { rows } = await query(
    `INSERT INTO reservations (
       product_id, size_id, color_id, client_name, client_email, client_phone,
       start_date, end_date, pickup_date, requested_type, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
     RETURNING id`,
    [
      productId, sizeId, colorId,
      String(p.client_name).trim(),
      String(p.client_email).trim().toLowerCase(),
      String(p.client_phone).trim(),
      p.start_date, p.end_date, p.pickup_date, requestedType,
    ],
  );
  const reservationId = rows[0].id;

  const sizeLabel = sizeId
    ? (await query(`SELECT label FROM sizes WHERE id = $1`, [sizeId])).rows[0]?.label
    : null;
  const price = requestedType === 'alquiler_nuevo' ? product.rental_new_price : product.rental_price;
  return json(res, 200, { ok: true, data: {
    id: reservationId,
    requested_type: requestedType,
    price: Number(price) || 0,
    size_label: sizeLabel || null,
    color_id: colorId,
    color_label: colorLabel,
  } });
}

// --- cart whatsapp ----------------------------------------------------

async function cartWhatsapp(req, res) {
  const p = await readJsonBody(req).catch(() => null);
  const sales = Array.isArray(p?.items) ? p.items : [];
  const reservationIds = [...new Set((Array.isArray(p?.reservation_ids) ? p.reservation_ids : [])
    .map(Number).filter(Number.isInteger))];
  if (!p || (sales.length === 0 && reservationIds.length === 0)) {
    return json(res, 400, { ok: false, error: 'empty_cart' });
  }

  // Cargar productos
  const productIds = [...new Set(sales.map((i) => Number(i.product_id)).filter(Number.isInteger))];
  if (sales.length && productIds.length === 0) {
    return json(res, 400, { ok: false, error: 'invalid_items' });
  }
  const placeholders = productIds.map((_, i) => `$${i + 1}`).join(',') || 'NULL';
  const { rows: prods } = productIds.length ? await query(
    `SELECT p.id, p.name, p.type, p.price,
            c.name AS collection_name,
            ${PROMO_JSON}
       FROM products p
       LEFT JOIN LATERAL (
         SELECT col.name
           FROM collections col
           JOIN product_collections pc ON pc.collection_id = col.id
          WHERE pc.product_id = p.id AND col.active = TRUE AND col.deleted_at IS NULL AND col.is_system = FALSE
          ORDER BY col.display_order, col.name
          LIMIT 1
       ) c ON TRUE
  ${PROMO_LATERAL}
       WHERE p.id IN (${placeholders}) AND p.published = TRUE AND p.deleted_at IS NULL`,
    productIds,
  ) : { rows: [] };
  const productMap = Object.fromEntries(prods.map((p) => [p.id, p]));

  // Cargar colores pedidos (para mostrar en el mensaje de WhatsApp).
  const colorIds = [...new Set(sales.map((i) => Number(i.color_id)).filter(Number.isInteger))];
  let colorMap = {};
  if (colorIds.length) {
    const colorPlaceholders = colorIds.map((_, i) => `$${i + 1}`).join(',');
    const { rows: cols } = await query(
      `SELECT id, label FROM colors WHERE id IN (${colorPlaceholders})`,
      colorIds,
    );
    colorMap = Object.fromEntries(cols.map((c) => [c.id, c.label]));
  }

  // Armar mensaje
  const lines = ['Hola! Me interesan las siguientes piezas:'];
  if (sales.length) lines.push('\nCompra:');
  for (const item of sales) {
    const product = productMap[Number(item.product_id)];
    if (!product) continue;
    const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
    // Con promo vigente, el precio del mensaje es el promocional (la tienda
    // refleja el precio que decide Gestión General).
    const unit = product.promo ? Number(product.promo.final_price) : Number(product.price);
    const price = money(unit * qty);
    const colorLabel = item.color_id ? colorMap[Number(item.color_id)] : null;
    const colorSuffix = colorLabel ? ` · Color ${colorLabel}` : '';
    lines.push(`• ${product.name} (${product.collection_name})${colorSuffix} × ${qty} — ${price}`);
  }
  if (reservationIds.length) {
    const reservationPlaceholders = reservationIds.map((_, i) => `$${i + 1}`).join(',');
    const { rows: rentals } = await query(
      `SELECT r.id, r.start_date, r.end_date, r.pickup_date, r.requested_type,
              p.name, c.name AS collection_name, s.label AS size_label,
              col.label AS color_label
         FROM reservations r
         JOIN products p ON p.id = r.product_id
         LEFT JOIN LATERAL (
           SELECT col.name
             FROM product_collections pc
             JOIN collections col ON col.id = pc.collection_id
            WHERE pc.product_id = p.id AND col.deleted_at IS NULL AND col.is_system = FALSE
            ORDER BY col.display_order, col.id
            LIMIT 1
         ) c ON TRUE
    LEFT JOIN sizes s ON s.id = r.size_id
    LEFT JOIN colors col ON col.id = r.color_id
        WHERE r.id IN (${reservationPlaceholders}) AND r.status = 'pending'`,
      reservationIds,
    );
    if (rentals.length) lines.push('\nAlquiler:');
    for (const rental of rentals) {
      const mode = rental.requested_type === 'alquiler_nuevo' ? 'Alquiler como nuevo' : 'Alquiler';
      const colorSuffix = rental.color_label ? ` · Color ${rental.color_label}` : '';
      lines.push(`• ${rental.name} (${rental.collection_name})${colorSuffix}${rental.size_label ? ` · Talla ${rental.size_label}` : ''} — ${mode}`);
      lines.push(`  Fechas: ${formatDate(rental.start_date)} → ${formatDate(rental.end_date)} · Recogida: ${formatDate(rental.pickup_date)} · Reserva #${rental.id}`);
    }
    await query(`UPDATE reservations SET whatsapp_sent_at = NOW() WHERE id = ANY($1::int[])`, [rentals.map((r) => r.id)]);
  }
  lines.push('\n¿Me confirmás disponibilidad? ¡Gracias!');

  const contact = await getContact();
  const whatsapp_url = buildWaUrl(contact.contact_phone, lines.join('\n'));
  return json(res, 200, { ok: true, data: { whatsapp_url } });
}

// --- router ------------------------------------------------------------

const routes = [
  { method: 'GET',  pattern: /^\/api\/public\/site-config\/?$/,       handler: getSiteConfig },
  { method: 'GET',  pattern: /^\/api\/public\/collections\/?$/,       handler: listCollections },
  { method: 'GET',  pattern: /^\/api\/public\/collections\/([^/]+)\/?$/, handler: getCollection },
  { method: 'GET',  pattern: /^\/api\/public\/products\/(\d+)\/?$/,   handler: getProduct },
  { method: 'GET',  pattern: /^\/api\/public\/modules\/?$/,           handler: getModules },
  { method: 'GET',  pattern: /^\/api\/public\/closures\/?$/,          handler: getClosures },
  { method: 'POST', pattern: /^\/api\/public\/reservations\/?$/,      handler: createReservation },
  { method: 'POST', pattern: /^\/api\/public\/cart-whatsapp\/?$/,     handler: cartWhatsapp },
];

export async function handlePublic(req, res) {
  const url = req.url || '/';
  const method = req.method || 'GET';
  const pathname = url.split('?')[0];

  if (pathname === '/api/public/health') {
    return json(res, 200, { ok: true, scope: 'public' });
  }

  for (const route of routes) {
    if (route.method !== method) continue;
    const m = route.pattern.exec(pathname);
    if (!m) continue;
    return route.handler(req, res, m[1]);
  }

  return notImpl(req, res);
}
