// LEGACY: endpoints admin del modelo Rebeca (boutique). Mantener intacto
// hasta que migrar handler por handler a los routers de admin/* (TechStore).
//
// Por qué existe: el `admin.js` monolítico quedó grande (4000+ líneas) y
// mezcla dominios. Para TechStore estamos partiendo en routers por dominio
// (`admin/attributes.js`, `admin/products.js`, etc.) y reusando los helpers
// comunes de `./_helpers.js`. Este archivo sigue funcionando como fallback
// para todo lo que todavía no se migró.
//
// Las funciones que antes estaban acá (protect, recordAudit, slugify,
// SAFE_METHODS, SECTION_PERMS) ahora viven en `./_helpers.js` y
// `./_section_perms.js`. Este archivo las IMPORTA en vez de redefinirlas.

import { query, tx } from '../../lib/db.js';
import { log } from '../../lib/logger.js';
import { upload, writeUploadFile, deleteUploadFile } from '../../lib/uploads.js';
import { hashPassword, signTwoFactorSetupToken } from '../../../../core/lib/auth.js';
import { encryptTotpSecret, generateTotpSecret, totpUri } from '../../../../core/lib/totp.js';
import { json } from '../../lib/json.js';
import { isValidEmail } from '../../lib/email.js';
import { readJsonBody } from '../../lib/body.js';
import { protect, recordAudit, slugify } from './_helpers.js';

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function validateCollectionPayload(p, { partial = false } = {}) {
  const errors = [];
  if (!partial || p.name    !== undefined) {
    if (typeof p.name !== 'string' || !p.name.trim()) errors.push('name requerido');
  }
  if (!partial || p.slug    !== undefined) {
    if (p.slug !== undefined && p.slug !== null && p.slug !== '') {
      if (!/^[a-z0-9-]+$/.test(p.slug)) errors.push('slug inválido (solo a-z, 0-9, -)');
    }
  }
  if (!partial || p.accent_color !== undefined) {
    if (p.accent_color !== undefined && p.accent_color !== null && p.accent_color !== '') {
      if (!HEX.test(p.accent_color)) errors.push('accent_color debe ser hex (#rgb o #rrggbb)');
    }
  }
  if (!partial || p.display_order !== undefined) {
    if (p.display_order !== undefined && !Number.isFinite(Number(p.display_order))) {
      errors.push('display_order debe ser número');
    }
  }
  if (!partial || p.active !== undefined) {
    if (p.active !== undefined && typeof p.active !== 'boolean') {
      errors.push('active debe ser boolean');
    }
  }
  if (p.show_in_nav !== undefined && typeof p.show_in_nav !== 'boolean') {
    errors.push('show_in_nav debe ser boolean');
  }
  if (p.nav_label !== undefined && p.nav_label !== null && typeof p.nav_label !== 'string') {
    errors.push('nav_label debe ser texto');
  }
  return errors;
}

// --- Collections ----------------------------------------------------------

async function listCollections(_req, res) {
  // preview_urls: las primeras 4 fotos de productos de la colección, para el
  // mosaico de portada del admin cuando no hay hero_image. Va por LATERAL en la
  // misma query: una por tarjeta sería N+1.
  const { rows } = await query(
    `SELECT c.id, c.name, c.slug, c.description, c.hero_image, c.accent_color,
            c.display_order, c.active, c.show_in_nav, c.nav_label,
            c.created_at, c.updated_at,
            COALESCE(pv.urls, ARRAY[]::text[]) AS preview_urls
       FROM collections c
       LEFT JOIN LATERAL (
         SELECT array_agg(m.url ORDER BY m.display_order, m.id) AS urls
           FROM (
             SELECT pm.url, pm.display_order, pm.id
               FROM product_media pm
               JOIN product_collections pc ON pc.product_id = pm.product_id
               JOIN products p ON p.id = pm.product_id
              WHERE pc.collection_id = c.id
                AND p.deleted_at IS NULL
                AND pm.kind = 'image'
                AND pm.deleted_at IS NULL
              ORDER BY pm.display_order, pm.id
              LIMIT 4
           ) m
       ) pv ON TRUE
      WHERE c.deleted_at IS NULL
      ORDER BY c.display_order, c.name`,
  );
  return json(res, 200, { ok: true, data: rows });
}

async function getCollection(_req, res, id) {
  const { rows } = await query(
    `SELECT id, name, slug, description, hero_image, accent_color,
            display_order, active, show_in_nav, nav_label, created_at, updated_at
       FROM collections WHERE id = $1 AND deleted_at IS NULL`,
    [Number(id)],
  );
  if (!rows[0]) return json(res, 404, { ok: false, error: 'not_found' });
  return json(res, 200, { ok: true, data: rows[0] });
}

async function createCollection(req, res) {
  const p = await readJsonBody(req).catch(() => null);
  if (!p) return json(res, 400, { ok: false, error: 'invalid_json' });
  const errs = validateCollectionPayload(p);
  if (errs.length) return json(res, 400, { ok: false, error: 'invalid_input', details: errs });

  const name = String(p.name).trim();
  const slug = (p.slug && String(p.slug).trim()) || slugify(name);
  const accent = p.accent_color || '#1a1d21';
  const display_order = Number.isFinite(Number(p.display_order)) ? Number(p.display_order) : 0;
  const active = p.active !== false;

  // Verificar duplicado de slug
  const dupe = await query(`SELECT id FROM collections WHERE slug = $1`, [slug]);
  if (dupe.rows.length) {
    return json(res, 409, { ok: false, error: 'slug_conflict', message: `El slug "${slug}" ya existe` });
  }

  const { rows } = await query(
    `INSERT INTO collections (name, slug, description, hero_image, accent_color, display_order, active, show_in_nav, nav_label)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, name, slug, description, hero_image, accent_color, display_order, active, show_in_nav, nav_label, created_at, updated_at`,
    [name, slug, String(p.description || ''), p.hero_image || null, accent, display_order, active,
     p.show_in_nav !== false, String(p.nav_label || '').slice(0, 40)],
  );
  return json(res, 201, { ok: true, data: rows[0] });
}

async function updateCollection(req, res, id) {
  const p = await readJsonBody(req).catch(() => null);
  if (!p) return json(res, 400, { ok: false, error: 'invalid_json' });
  const errs = validateCollectionPayload(p, { partial: true });
  if (errs.length) return json(res, 400, { ok: false, error: 'invalid_input', details: errs });

  const numId = Number(id);
  const { rows: existing } = await query(`SELECT id FROM collections WHERE id = $1`, [numId]);
  if (!existing.length) return json(res, 404, { ok: false, error: 'not_found' });

  // Construir SET dinámico
  const fields = [];
  const vals = [];
  let i = 1;
  if (p.name !== undefined)         { fields.push(`name = $${i++}`);          vals.push(String(p.name).trim()); }
  if (p.slug !== undefined && p.slug !== null && p.slug !== '') {
    const newSlug = String(p.slug).trim();
    const clash = await query(`SELECT id FROM collections WHERE slug = $1 AND id <> $2`, [newSlug, numId]);
    if (clash.rows.length) return json(res, 409, { ok: false, error: 'slug_conflict' });
    fields.push(`slug = $${i++}`); vals.push(newSlug);
  }
  if (p.description !== undefined) { fields.push(`description = $${i++}`);  vals.push(String(p.description || '')); }
  if (p.hero_image !== undefined)  { fields.push(`hero_image = $${i++}`);   vals.push(p.hero_image || null); }
  if (p.accent_color !== undefined && p.accent_color !== null && p.accent_color !== '') {
    fields.push(`accent_color = $${i++}`); vals.push(p.accent_color);
  }
  if (p.display_order !== undefined && Number.isFinite(Number(p.display_order))) {
    fields.push(`display_order = $${i++}`); vals.push(Number(p.display_order));
  }
  if (p.active !== undefined)      { fields.push(`active = $${i++}`);        vals.push(Boolean(p.active)); }
  if (p.show_in_nav !== undefined) { fields.push(`show_in_nav = $${i++}`);   vals.push(Boolean(p.show_in_nav)); }
  if (p.nav_label !== undefined)   { fields.push(`nav_label = $${i++}`);     vals.push(String(p.nav_label || '').slice(0, 40)); }

  if (!fields.length) return json(res, 400, { ok: false, error: 'nothing_to_update' });

  vals.push(numId);
  const { rows } = await query(
    `UPDATE collections SET ${fields.join(', ')}
       WHERE id = $${i}
       RETURNING id, name, slug, description, hero_image, accent_color, display_order, active, show_in_nav, nav_label, created_at, updated_at`,
    vals,
  );
  return json(res, 200, { ok: true, data: rows[0] });
}

async function deleteCollection(req, res, id) {
  const numId = Number(id);
  const { rows: col } = await query(
    `SELECT id, name, is_system FROM collections WHERE id = $1 AND deleted_at IS NULL`,
    [numId],
  );
  if (!col[0]) return json(res, 404, { ok: false, error: 'not_found' });
  if (col[0].is_system) {
    return json(res, 409, {
      ok: false, error: 'protected',
      message: `"${col[0].name}" es una colección del sistema y no se puede eliminar.`,
    });
  }

  const url = new URL(req.url, 'http://x');
  const confirm = url.searchParams.get('confirm') === 'true';

  // Calcular cuántos productos quedarían sueltos y cuántos se despublicarían
  const { rows: sueltosRow } = await query(
    `SELECT COUNT(*)::int AS count
       FROM product_collections pc
       JOIN products p ON p.id = pc.product_id
      WHERE pc.collection_id = $1 AND p.deleted_at IS NULL
        AND (
          SELECT COUNT(*) FROM product_collections pc2
            JOIN collections col2 ON col2.id = pc2.collection_id
           WHERE pc2.product_id = p.id AND col2.deleted_at IS NULL AND col2.is_system = FALSE
        ) = 1`,
    [numId],
  );

  const { rows: despubRow } = await query(
    `SELECT COUNT(*)::int AS count
       FROM product_collections pc
       JOIN products p ON p.id = pc.product_id
      WHERE pc.collection_id = $1 AND p.deleted_at IS NULL AND p.published = TRUE
        AND (
          SELECT COUNT(*) FROM product_collections pc2
            JOIN collections col2 ON col2.id = pc2.collection_id
           WHERE pc2.product_id = p.id AND col2.deleted_at IS NULL AND col2.is_system = FALSE
        ) = 1`,
    [numId],
  );

  const sueltos = sueltosRow[0].count;
  const despublicados = despubRow[0].count;

  if (!confirm && (sueltos > 0 || despublicados > 0)) {
    return json(res, 200, {
      ok: true,
      confirm_required: true,
      sueltos,
      despublicados,
      message: `Esta colección contiene productos asociados. Si la eliminas, ${sueltos} producto(s) quedarán sueltos y ${despublicados} se despublicarán automáticamente.`,
    });
  }

  // Ejecutar la eliminación
  await tx(async (client) => {
    // Despublicar productos afectados (sueltos y publicados)
    await client.query(
      `UPDATE products p
          SET published = FALSE
        WHERE p.id IN (
          SELECT pc.product_id FROM product_collections pc
           WHERE pc.collection_id = $1
        ) AND p.published = TRUE AND p.deleted_at IS NULL
          AND (
            SELECT COUNT(*) FROM product_collections pc2
              JOIN collections col2 ON col2.id = pc2.collection_id
             WHERE pc2.product_id = p.id AND col2.deleted_at IS NULL AND col2.is_system = FALSE
          ) = 1`,
      [numId],
    );

    // Eliminar del join
    await client.query(`DELETE FROM product_collections WHERE collection_id = $1`, [numId]);

    // Soft-delete de la colección
    await client.query(
      `UPDATE collections SET deleted_at = NOW(), active = FALSE WHERE id = $1`,
      [numId],
    );
  });

  return json(res, 200, { ok: true });
}

// --- Products --------------------------------------------------------------

const PRODUCT_TYPES = new Set(['venta', 'alquiler', 'alquiler_nuevo']);

// Las tallas asignadas tienen que ser del sistema de tallas del producto. El
// FK a `sizes` no alcanza: dejaría pasar un zapato con talla XS. Un producto
// "sin tallas" (systemId null) solo admite el compartimento nulo. Devuelve el
// mensaje de error, o null si están bien.
async function sizesSystemMismatch(sizes, systemId) {
  const ids = (sizes || [])
    .map((s) => s.size_id)
    .filter((v) => v !== null && v !== undefined)
    .map(Number);
  if (!ids.length) return null;
  if (!systemId) return 'un producto sin sistema de tallas no lleva tallas asignadas';
  const { rows } = await query(
    `SELECT label FROM sizes WHERE id = ANY($1::int[]) AND system_id <> $2`,
    [ids, Number(systemId)],
  );
  if (!rows.length) return null;
  return `estas tallas no son del sistema del producto: ${rows.map((r) => r.label).join(', ')}`;
}

// Normaliza el size_system_id de un payload: número, o null para "sin tallas".
function normSystemId(v) {
  return (v === undefined || v === null || v === '') ? null : Number(v);
}

function validateProductPayload(p, { partial = false } = {}) {
  const errors = [];
  if (!partial || p.collection_id !== undefined || p.collection_ids !== undefined) {
    const cid = p.collection_id;
    const cids = p.collection_ids;
    if (cid !== undefined && cid !== null && cid !== '') {
      if (!Number.isInteger(Number(cid)) || Number(cid) <= 0) {
        errors.push('collection_id debe ser número positivo');
      }
    }
    if (cids !== undefined && cids !== null) {
      if (!Array.isArray(cids)) {
        errors.push('collection_ids debe ser un array');
      } else if (cids.some(id => id !== null && (!Number.isInteger(Number(id)) || Number(id) <= 0))) {
        errors.push('cada ID de colección debe ser un número positivo');
      }
    }
  }
  if (!partial || p.name !== undefined) {
    if (!partial && (typeof p.name !== 'string' || !p.name.trim())) errors.push('name requerido');
  }
  if (p.type !== undefined && !PRODUCT_TYPES.has(p.type)) {
    errors.push(`type debe ser uno de: ${[...PRODUCT_TYPES].join(', ')}`);
  }
  if (p.types !== undefined) {
    if (!Array.isArray(p.types) || p.types.length === 0) {
      errors.push('types debe ser un array con al menos un tipo');
    } else if (p.types.some((t) => !PRODUCT_TYPES.has(t))) {
      errors.push(`cada tipo debe ser uno de: ${[...PRODUCT_TYPES].join(', ')}`);
    }
  }
  if (p.price !== undefined) {
    if (Number(p.price) < 0) errors.push('price debe ser >= 0');
  }
  if (p.rental_price !== undefined) {
    if (Number(p.rental_price) < 0) errors.push('rental_price debe ser >= 0');
  }
  if (p.rental_new_price !== undefined) {
    if (Number(p.rental_new_price) < 0) errors.push('rental_new_price debe ser >= 0');
  }
  if (p.cost_price !== undefined) {
    if (Number(p.cost_price) < 0) errors.push('cost_price debe ser >= 0');
  }
  if (p.published !== undefined && typeof p.published !== 'boolean') {
    errors.push('published debe ser boolean');
  }
  if (p.sku !== undefined && p.sku !== null && p.sku !== '') {
    if (typeof p.sku !== 'string' || !/^[A-Za-z0-9._-]+$/.test(p.sku)) {
      errors.push('sku debe ser alfanumérico (con . _ -)');
    }
  }
  if (p.size_system_id !== undefined && p.size_system_id !== null && p.size_system_id !== '') {
    if (!Number.isInteger(Number(p.size_system_id)) || Number(p.size_system_id) <= 0) {
      errors.push('size_system_id debe ser un id válido (o null para "sin tallas")');
    }
  }
  if (p.sizes !== undefined && p.sizes !== null) {
    if (!Array.isArray(p.sizes)) {
      errors.push('sizes debe ser array');
    } else {
      for (const s of p.sizes) {
        // size_id null = el compartimento único de un producto "sin tallas".
        const validId = s.size_id === null || (Number.isInteger(Number(s.size_id)) && Number(s.size_id) > 0);
        if (!validId) {
          errors.push('cada size debe tener size_id positivo (o null para "sin tallas")'); break;
        }
        if (!Number.isInteger(Number(s.stock)) || Number(s.stock) < 0) {
          errors.push('cada size debe tener stock >= 0'); break;
        }
      }
    }
  }
  return errors;
}

function numOr(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

// Tallas globales, agrupadas por sistema. El admin las necesita para armar la
// grilla de stock. Solo tallas de sistemas vivos: las de uno borrado quedan
// para el histórico, no para asignar.
async function listSizes(_req, res) {
  const { rows } = await query(
    `SELECT s.id, s.label, s.system_id, s.display_order
       FROM sizes s
       JOIN size_systems ss ON ss.id = s.system_id
      WHERE ss.deleted_at IS NULL
      ORDER BY ss.display_order, ss.id, s.display_order, s.label`,
  );
  return json(res, 200, { ok: true, data: rows });
}

async function listProducts(_req, res) {
  // image_url: la primera foto del producto, para la tarjeta de la grilla del
  // admin. Va por LATERAL en la misma query: una por tarjeta sería N+1.
  const { rows } = await query(
    `SELECT p.id,
            (SELECT pc.collection_id FROM product_collections pc
               JOIN collections col ON col.id = pc.collection_id
              WHERE pc.product_id = p.id AND col.deleted_at IS NULL AND col.is_system = FALSE
              ORDER BY col.display_order, col.id
              LIMIT 1) AS collection_id,
            (SELECT col.name FROM product_collections pc
               JOIN collections col ON col.id = pc.collection_id
              WHERE pc.product_id = p.id AND col.deleted_at IS NULL AND col.is_system = FALSE
              ORDER BY col.display_order, col.id
              LIMIT 1) AS collection_name,
            (SELECT col.slug FROM product_collections pc
               JOIN collections col ON col.id = pc.collection_id
              WHERE pc.product_id = p.id AND col.deleted_at IS NULL AND col.is_system = FALSE
              ORDER BY col.display_order, col.id
              LIMIT 1) AS collection_slug,
            (SELECT COALESCE(json_agg(pc.collection_id), '[]'::json) FROM product_collections pc
               JOIN collections col ON col.id = pc.collection_id
              WHERE pc.product_id = p.id AND col.deleted_at IS NULL AND col.is_system = FALSE) AS collection_ids,
            p.sku, p.name, p.description, p.type, p.types, p.size_system_id,
            p.price, p.rental_price, p.rental_new_price, p.cost_price,
            p.published,
            EXISTS (
              SELECT 1 FROM product_collections pc2
                JOIN collections col2 ON col2.id = pc2.collection_id
               WHERE pc2.product_id = p.id AND col2.slug = 'destacado'
            ) AS featured,
            p.display_order,
            p.created_at, p.updated_at,
            img.url AS image_url,
            ${PROMO_JSON},
            CASE WHEN p.use_colors THEN COALESCE(
              (SELECT SUM(pv.stock)::int FROM product_variants pv
                WHERE pv.product_id = p.id), 0
            ) ELSE COALESCE(
              (SELECT SUM(ps.stock)::int FROM product_sizes ps
                WHERE ps.product_id = p.id), 0
            ) END AS stock_total,
            COALESCE(
              (SELECT json_agg(json_build_object(
                        'size_id', ps.size_id,
                        'label', s.label,
                        'stock', ps.stock)
                      ORDER BY s.display_order NULLS FIRST)
               FROM product_sizes ps
          LEFT JOIN sizes s ON s.id = ps.size_id
               WHERE ps.product_id = p.id),
              '[]'::json
            ) AS sizes
       FROM products p
  ${PROMO_LATERAL}
       LEFT JOIN LATERAL (
         SELECT pm.url
           FROM product_media pm
          WHERE pm.product_id = p.id
            AND pm.kind = 'image'
            AND pm.deleted_at IS NULL
          ORDER BY pm.display_order, pm.id
          LIMIT 1
       ) img ON TRUE
      WHERE p.deleted_at IS NULL
      ORDER BY (SELECT pc.collection_id FROM product_collections pc
                  JOIN collections col ON col.id = pc.collection_id
                 WHERE pc.product_id = p.id AND col.deleted_at IS NULL AND col.is_system = FALSE
                 ORDER BY col.display_order, col.id
                 LIMIT 1) NULLS LAST, p.display_order, p.name`,
  );
  return json(res, 200, { ok: true, data: rows });
}

async function getProduct(_req, res, id) {
  const { rows } = await query(
    `SELECT p.*,
            (SELECT pc.collection_id FROM product_collections pc
               JOIN collections col ON col.id = pc.collection_id
              WHERE pc.product_id = p.id AND col.deleted_at IS NULL AND col.is_system = FALSE
              ORDER BY col.display_order, col.id
              LIMIT 1) AS collection_id,
            (SELECT col.name FROM product_collections pc
               JOIN collections col ON col.id = pc.collection_id
              WHERE pc.product_id = p.id AND col.deleted_at IS NULL AND col.is_system = FALSE
              ORDER BY col.display_order, col.id
              LIMIT 1) AS collection_name,
            (SELECT col.slug FROM product_collections pc
               JOIN collections col ON col.id = pc.collection_id
              WHERE pc.product_id = p.id AND col.deleted_at IS NULL AND col.is_system = FALSE
              ORDER BY col.display_order, col.id
              LIMIT 1) AS collection_slug,
            (SELECT COALESCE(json_agg(pc.collection_id), '[]'::json) FROM product_collections pc
               JOIN collections col ON col.id = pc.collection_id
              WHERE pc.product_id = p.id AND col.deleted_at IS NULL AND col.is_system = FALSE) AS collection_ids,
            CASE WHEN p.use_colors THEN COALESCE(
              (SELECT SUM(pv.stock)::int FROM product_variants pv WHERE pv.product_id = p.id), 0
            ) ELSE COALESCE(
              (SELECT SUM(ps.stock)::int FROM product_sizes ps WHERE ps.product_id = p.id), 0
            ) END AS stock_total,
            EXISTS (
              SELECT 1 FROM product_collections pc2
                JOIN collections col2 ON col2.id = pc2.collection_id
               WHERE pc2.product_id = p.id AND col2.slug = 'destacado'
            ) AS featured
       FROM products p
      WHERE p.id = $1 AND p.deleted_at IS NULL`,
    [Number(id)],
  );
  if (!rows[0]) return json(res, 404, { ok: false, error: 'not_found' });
  const [sizes, colors] = await Promise.all([
    query(
      `SELECT ps.size_id, s.label, ps.stock
         FROM product_sizes ps
    LEFT JOIN sizes s ON s.id = ps.size_id
        WHERE ps.product_id = $1
        ORDER BY s.display_order NULLS FIRST`,
      [Number(id)],
    ),
    query(
      `SELECT c.id, c.label, c.hex, c.system_id, pc.display_order, pc.active
         FROM product_colors pc
         JOIN colors c ON c.id = pc.color_id
        WHERE pc.product_id = $1
        ORDER BY pc.display_order, c.label`,
      [Number(id)],
    ),
  ]);
  return json(res, 200, {
    ok: true,
    data: { ...rows[0], sizes: sizes.rows, colors: colors.rows },
  });
}

async function createProduct(req, res) {
  const p = await readJsonBody(req).catch(() => null);
  if (!p) return json(res, 400, { ok: false, error: 'invalid_json' });
  const errs = validateProductPayload(p);
  if (errs.length) return json(res, 400, { ok: false, error: 'invalid_input', details: errs });

  // Resolver collection_ids y verificar existencia
  let collectionIds = [];
  if (p.collection_ids !== undefined && p.collection_ids !== null) {
    collectionIds = p.collection_ids.map(Number);
  } else if (p.collection_id !== undefined && p.collection_id !== null && p.collection_id !== '') {
    collectionIds = [Number(p.collection_id)];
  }

  if (collectionIds.length > 0) {
    const placeholders = collectionIds.map((_, idx) => `$${idx + 1}`).join(',');
    const { rows: cols } = await query(
      `SELECT id FROM collections WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
      collectionIds,
    );
    if (cols.length !== collectionIds.length) {
      return json(res, 400, { ok: false, error: 'collection_not_found', message: 'Una o más colecciones no existen.' });
    }
  }

  const wantsPublished = p.published === true || p.active === true;
  if (wantsPublished && collectionIds.length === 0) {
    return json(res, 409, {
      ok: false, error: 'collection_required',
      message: 'No se puede publicar un producto sin colección. Asigna una primero.',
    });
  }

  // Verificar SKU único si viene
  if (p.sku) {
    // Solo choca con productos vivos: el SKU de uno borrado se puede reusar.
    const dupe = await query(
      `SELECT id FROM products WHERE sku = $1 AND deleted_at IS NULL`,
      [p.sku],
    );
    if (dupe.rows.length) return json(res, 409, { ok: false, error: 'sku_conflict' });
  }

  // types: array de tipos habilitados; `type` queda como tipo principal
  // (types[0]) por compatibilidad con reservas y código viejo.
  const types = Array.isArray(p.types) && p.types.length ? p.types : [p.type || 'alquiler'];

  // Sistema de tallas: FK real, o null para "sin tallas" (un compartimento).
  const sizeSystemId = normSystemId(p.size_system_id);
  if (sizeSystemId) {
    const sys = await query(
      `SELECT id FROM size_systems WHERE id = $1 AND deleted_at IS NULL`,
      [sizeSystemId],
    );
    if (!sys.rows[0]) return json(res, 400, { ok: false, error: 'size_system_not_found' });
  }
  const kindErr = await sizesSystemMismatch(p.sizes, sizeSystemId);
  if (kindErr) return json(res, 400, { ok: false, error: 'invalid_input', details: [kindErr] });

  const uid = userId(req);
  const result = await tx(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO products (
         sku, name, description, type, types, size_system_id,
         price, rental_price, rental_new_price, cost_price,
         published, display_order
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        p.sku || null,
        String(p.name).trim(),
        String(p.description || ''),
        types[0],
        types,
        sizeSystemId,
        numOr(p.price, 0),
        numOr(p.rental_price, 0),
        numOr(p.rental_new_price, 0),
        numOr(p.cost_price, 0),
        wantsPublished,
        numOr(p.display_order, 0),
      ],
    );
    const product = rows[0];

    // Guardar en product_collections
    for (const cid of collectionIds) {
      await client.query(
        `INSERT INTO product_collections (product_id, collection_id) VALUES ($1, $2)`,
        [product.id, cid],
      );
    }

    // Guardar en destacados si featured es true
    if (p.featured === true) {
      const { rows: dest } = await client.query(`SELECT id FROM collections WHERE slug = 'destacado'`);
      if (dest[0]) {
        await client.query(
          `INSERT INTO product_collections (product_id, collection_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [product.id, dest[0].id],
        );
      }
    }

    // El stock inicial entra al libro como 'compra': el ÚNICO stock
    // (product_sizes) tiene que quedar explicado por inv_movements
    // nazca el producto donde nazca. size_id null = compartimento "sin
    // tallas". Una talla tildada con stock 0 crea la fila (existe, agotada)
    // pero no genera movimiento (el libro no admite delta 0).
    for (const s of (p.sizes || [])) {
      const stock = Number(s.stock);
      if (stock < 0) continue;
      const sizeId = s.size_id === null ? null : Number(s.size_id);
      await client.query(
        `INSERT INTO product_sizes (product_id, size_id, stock) VALUES ($1, $2, $3)
         ON CONFLICT (product_id, size_id) DO UPDATE SET stock = EXCLUDED.stock`,
        [product.id, sizeId, stock],
      );
      if (stock > 0) {
        await client.query(
          `INSERT INTO inv_movements (product_id, size_id, delta, reason, note, created_by)
           VALUES ($1, $2, $3, 'compra', 'Stock inicial del producto', $4)`,
          [product.id, sizeId, stock, uid],
        );
      }
    }
    return product;
  });

  // Devolver con sizes poblados
  return getProduct(req, res, result.id);
}

async function updateProduct(req, res, id) {
  const p = await readJsonBody(req).catch(() => null);
  if (!p) return json(res, 400, { ok: false, error: 'invalid_json' });
  if (p.sizes !== undefined) {
    // Regla del libro mayor: el stock es ÚNICO (product_sizes) y solo se
    // mueve por ajuste (con nota) o por una venta, nunca por un PATCH.
    return json(res, 400, {
      ok: false, error: 'invalid_input',
      details: ['el stock no se edita por PATCH: usa el ajuste de stock en Gestión General'],
    });
  }
  if (p.size_system_id !== undefined) {
    // El sistema de tallas es sustancia, no vitrina: se cambia desde Gestión
    // General (PATCH /inventory/items), que exige stock en 0 para el cambio.
    return json(res, 400, {
      ok: false, error: 'invalid_input',
      details: ['el sistema de tallas se cambia desde Gestión General → Inventario'],
    });
  }
  const errs = validateProductPayload(p, { partial: true });
  if (errs.length) return json(res, 400, { ok: false, error: 'invalid_input', details: errs });

  const numId = Number(id);
  const { rows: existing } = await query(
    `SELECT id, size_system_id, published FROM products
      WHERE id = $1 AND deleted_at IS NULL`,
    [numId],
  );
  if (!existing.length) return json(res, 404, { ok: false, error: 'not_found' });

  // Resolver collection_ids y verificar existencia si se cambia
  let targetCollectionIds = undefined;
  if (p.collection_ids !== undefined && p.collection_ids !== null) {
    targetCollectionIds = p.collection_ids.map(Number);
  } else if (p.collection_id !== undefined) {
    targetCollectionIds = (p.collection_id === null || p.collection_id === '') ? [] : [Number(p.collection_id)];
  }

  if (targetCollectionIds !== undefined && targetCollectionIds.length > 0) {
    const placeholders = targetCollectionIds.map((_, idx) => `$${idx + 1}`).join(',');
    const { rows: cols } = await query(
      `SELECT id FROM collections WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
      targetCollectionIds,
    );
    if (cols.length !== targetCollectionIds.length) {
      return json(res, 400, { ok: false, error: 'collection_not_found', message: 'Una o más colecciones no existen.' });
    }
  }

  // Cargar colecciones actuales del producto (excluyendo de sistema)
  const { rows: currentPCs } = await query(
    `SELECT pc.collection_id FROM product_collections pc
       JOIN collections c ON c.id = pc.collection_id
      WHERE pc.product_id = $1 AND c.is_system = FALSE AND c.deleted_at IS NULL`,
    [numId],
  );
  const currentCollectionIds = currentPCs.map(r => r.collection_id);
  const finalCollectionIds = targetCollectionIds !== undefined ? targetCollectionIds : currentCollectionIds;

  // Gate de publicación: no existe producto publicado sin colección.
  // `active` se acepta como alias viejo de `published` (UI anterior).
  const wantsPublished = p.published !== undefined ? !!p.published
    : (p.active !== undefined ? !!p.active : undefined);
  const finalPublished = wantsPublished !== undefined ? wantsPublished : existing[0].published;
  if (finalPublished && finalCollectionIds.length === 0) {
    return json(res, 409, {
      ok: false, error: 'collection_required',
      message: 'No se puede publicar un producto sin colección. Asigna una primero.',
    });
  }

  // Verificar SKU único si cambia
  if (p.sku !== undefined && p.sku !== null && p.sku !== '') {
    const dupe = await query(
      `SELECT id FROM products WHERE sku = $1 AND id <> $2 AND deleted_at IS NULL`,
      [p.sku, numId],
    );
    if (dupe.rows.length) return json(res, 409, { ok: false, error: 'sku_conflict' });
  }

  const fields = [];
  const vals = [];
  let i = 1;
  const set = (col, val) => { fields.push(`${col} = $${i++}`); vals.push(val); };
  if (p.name !== undefined)         set('name', String(p.name).trim());
  if (p.sku !== undefined)         set('sku', p.sku || null);
  if (p.description !== undefined) set('description', String(p.description || ''));
  if (p.types !== undefined && Array.isArray(p.types) && p.types.length) {
    set('types', p.types);
    set('type', p.types[0]); // tipo principal sincronizado
  } else if (p.type !== undefined) {
    set('type', p.type);
    set('types', [p.type]);
  }
  if (p.price !== undefined)        set('price', numOr(p.price, 0));
  if (p.rental_price !== undefined) set('rental_price', numOr(p.rental_price, 0));
  if (p.rental_new_price !== undefined) set('rental_new_price', numOr(p.rental_new_price, 0));
  if (p.cost_price !== undefined)  set('cost_price', numOr(p.cost_price, 0));
  if (wantsPublished !== undefined) {
    // Publicar/Despublicar cambia SOLO published: los datos de vitrina quedan
    // intactos para republicar igual. `agotado` no entra acá: es derivado.
    set('published', wantsPublished);
  }
  if (p.display_order !== undefined && Number.isFinite(Number(p.display_order))) {
    set('display_order', Number(p.display_order));
  }

  const finalFeatured = p.featured !== undefined ? !!p.featured : undefined;

  await tx(async (client) => {
    if (fields.length) {
      vals.push(numId);
      await client.query(`UPDATE products SET ${fields.join(', ')} WHERE id = $${i}`, vals);
    }

    // Sincronizar product_collections (colecciones normales)
    if (targetCollectionIds !== undefined) {
      await client.query(
        `DELETE FROM product_collections pc
          USING collections c
          WHERE pc.collection_id = c.id
            AND pc.product_id = $1
            AND c.is_system = FALSE`,
        [numId],
      );
      for (const cid of targetCollectionIds) {
        await client.query(
          `INSERT INTO product_collections (product_id, collection_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [numId, cid],
        );
      }
    }

    // Sincronizar destacado
    if (finalFeatured !== undefined) {
      const { rows: dest } = await client.query(`SELECT id FROM collections WHERE slug = 'destacado'`);
      if (dest[0]) {
        if (finalFeatured) {
          await client.query(
            `INSERT INTO product_collections (product_id, collection_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [numId, dest[0].id],
          );
        } else {
          await client.query(
            `DELETE FROM product_collections WHERE product_id = $1 AND collection_id = $2`,
            [numId, dest[0].id],
          );
        }
      }
    }
  });

  return getProduct(req, res, numId);
}

async function deleteProduct(_req, res, id) {
  const numId = Number(id);
  // No permitir borrar si tiene reservas pending/confirmed (para no perder historial)
  const { rows: active } = await query(
    `SELECT COUNT(*)::int AS n FROM reservations
      WHERE product_id = $1 AND status IN ('pending', 'confirmed')`,
    [numId],
  );
  if (active[0].n > 0) {
    return json(res, 409, {
      ok: false,
      error: 'has_active_reservations',
      message: `Tiene ${active[0].n} reserva(s) activa(s). Complétalas o cancélalas primero.`,
    });
  }
  // Soft-delete real: setea deleted_at y desaparece de las listas (admin y
  // tienda). Se despublica junto porque hay queries que filtran solo por
  // published (deleteCollection cuenta los publicados de la colección): sin
  // esto, un producto borrado bloquearía el borrado de su colección.
  const { rowCount } = await query(
    `UPDATE products SET deleted_at = NOW(), published = FALSE
      WHERE id = $1 AND deleted_at IS NULL`,
    [numId],
  );
  if (!rowCount) return json(res, 404, { ok: false, error: 'not_found' });
  return json(res, 200, { ok: true });
}

// --- Catálogo (Gestión General) --------------------------------------------
//
// Desde la fusión (migraciones 010–011) Gestión General opera sobre `products`,
// la única entidad Producto: acá vive la sustancia (alta, precios, costo,
// stock, promos). Gestión Tienda maneja la vitrina (publicar, fotos,
// descripción). Las rutas conservan el prefijo /inventory: mismo contrato,
// otra tabla de fondo.
// El stock SOLO se mueve por /adjust o por una venta, nunca por un PATCH:
// si se pudiera editar por dos caminos, el libro (inv_movements) dejaría de
// cuadrar. Los precios (venta, alquiler, costo) se editan SOLO desde acá:
// la tienda refleja, nunca decide precio.

function userId(req) {
  const n = Number(req.user?.id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

// Descuento unitario que produce una promo sobre un precio. Capado al precio:
// una promo jamás deja el final en negativo.
function promoDiscount(price, promo) {
  if (!promo) return 0;
  const p = Number(price) || 0;
  const v = Number(promo.value) || 0;
  const d = promo.kind === 'percent' ? (p * v) / 100 : v;
  return round2(Math.min(d, p));
}

// LATERAL reutilizable: la promo VIGENTE de un producto (viva y dentro de
// fechas). Devuelve NULL si no hay.
const PROMO_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT pp.id, pp.kind, pp.value, pp.starts_at, pp.ends_at, pp.note
      FROM product_promos pp
     WHERE pp.product_id = p.id AND pp.deleted_at IS NULL
       AND CURRENT_DATE BETWEEN pp.starts_at AND pp.ends_at
     LIMIT 1
  ) promo ON TRUE`;

const PROMO_JSON = `
  CASE WHEN promo.id IS NULL THEN NULL ELSE json_build_object(
    'id', promo.id, 'kind', promo.kind, 'value', promo.value,
    'starts_at', promo.starts_at, 'ends_at', promo.ends_at, 'note', promo.note
  ) END AS promo`;

function validateInvItemPayload(p, { partial = false } = {}) {
  const errors = [];
  if (!partial || p.name !== undefined) {
    if (typeof p.name !== 'string' || !p.name.trim()) errors.push('name requerido');
  }
  if (p.sku !== undefined && p.sku !== null && p.sku !== '') {
    if (typeof p.sku !== 'string' || !/^[A-Za-z0-9._-]+$/.test(p.sku)) {
      errors.push('sku debe ser alfanumérico (con . _ -)');
    }
  }
  if (p.size_system_id !== undefined && p.size_system_id !== null && p.size_system_id !== '') {
    if (!Number.isInteger(Number(p.size_system_id)) || Number(p.size_system_id) <= 0) {
      errors.push('size_system_id debe ser un id válido (o null para "sin tallas")');
    }
  }
  for (const k of ['cost_price', 'price', 'rental_price', 'rental_new_price']) {
    if (p[k] !== undefined && (!Number.isFinite(Number(p[k])) || Number(p[k]) < 0)) {
      errors.push(`${k} debe ser >= 0`);
    }
  }
  if (p.types !== undefined) {
    if (!Array.isArray(p.types) || p.types.length === 0) {
      errors.push('types debe ser un array con al menos un tipo');
    } else if (p.types.some((t) => !PRODUCT_TYPES.has(t))) {
      errors.push(`cada tipo debe ser uno de: ${[...PRODUCT_TYPES].join(', ')}`);
    }
  }
  if (p.sizes !== undefined && p.sizes !== null) {
    if (!Array.isArray(p.sizes)) {
      errors.push('sizes debe ser array');
    } else {
      for (const s of p.sizes) {
        // size_id null = el compartimento único de un producto "sin tallas".
        const validId = s.size_id === null || (Number.isInteger(Number(s.size_id)) && Number(s.size_id) > 0);
        if (!validId) {
          errors.push('cada size debe tener size_id positivo (o null para "sin tallas")'); break;
        }
        if (!Number.isInteger(Number(s.stock)) || Number(s.stock) < 0) {
          errors.push('cada size debe tener stock >= 0'); break;
        }
      }
    }
  }
  return errors;
}

async function listInvItems(req, res) {
  // Filtros server-side (a diferencia de listProducts): es el patrón para
  // catálogos que crecen, y el buscador de Ventas reusa este endpoint.
  const url = new URL(req.url, 'http://x');
  const q = (url.searchParams.get('q') || '').trim();
  const published = url.searchParams.get('published');

  const where = ['p.deleted_at IS NULL'];
  const args = [];
  let n = 1;
  if (q) { where.push(`(p.name ILIKE $${n} OR p.sku ILIKE $${n})`); args.push(`%${q}%`); n++; }
  if (published === 'true')  where.push('p.published = TRUE');
  if (published === 'false') where.push('p.published = FALSE');

  const { rows } = await query(
    `SELECT p.id, p.sku, p.name, p.description,
            (SELECT pc.collection_id FROM product_collections pc
               JOIN collections col ON col.id = pc.collection_id
              WHERE pc.product_id = p.id AND col.deleted_at IS NULL AND col.is_system = FALSE
              ORDER BY col.display_order, col.id
              LIMIT 1) AS collection_id,
            p.size_system_id, p.cost_price, p.price, p.rental_price, p.rental_new_price,
            p.type, p.types, p.published, p.created_at, p.updated_at,
            CASE WHEN p.use_colors THEN COALESCE((
              SELECT SUM(pv.stock)::int FROM product_variants pv WHERE pv.product_id = p.id
            ), 0) ELSE COALESCE(st.total, 0)::int END AS stock_total,
            COALESCE(st.sizes, '[]'::json) AS sizes,
            ${PROMO_JSON}
       FROM products p
  LEFT JOIN LATERAL (
         SELECT SUM(ps.stock) AS total,
                json_agg(json_build_object(
                  'size_id', ps.size_id,
                  'label', s.label,
                  'stock', ps.stock)
                ORDER BY s.display_order NULLS FIRST) AS sizes
           FROM product_sizes ps
      LEFT JOIN sizes s ON s.id = ps.size_id
          WHERE ps.product_id = p.id
       ) st ON TRUE
  ${PROMO_LATERAL}
      WHERE ${where.join(' AND ')}
      ORDER BY p.name, p.id
      LIMIT 500`,
    args,
  );
  return json(res, 200, { ok: true, data: rows });
}

async function getInvItem(_req, res, id) {
  const numId = Number(id);
  const { rows } = await query(
    `SELECT p.*, ${PROMO_JSON}
       FROM products p
  ${PROMO_LATERAL}
      WHERE p.id = $1 AND p.deleted_at IS NULL`,
    [numId],
  );
  if (!rows[0]) return json(res, 404, { ok: false, error: 'not_found' });
  // La promo viva aunque todavía no esté vigente (programada a futuro):
  // Gestión General tiene que poder verla y editarla.
  const { rows: livePromo } = await query(
    `SELECT id, kind, value, starts_at, ends_at, note,
            (CURRENT_DATE BETWEEN starts_at AND ends_at) AS vigente
       FROM product_promos
      WHERE product_id = $1 AND deleted_at IS NULL`,
    [numId],
  );
  const sizes = await query(
    `SELECT ps.size_id, s.label, ps.stock
       FROM product_sizes ps
  LEFT JOIN sizes s ON s.id = ps.size_id
      WHERE ps.product_id = $1
      ORDER BY s.display_order NULLS FIRST`,
    [numId],
  );
  // Colores del producto (Fase 2 de colores). Si use_colors=false, queda
  // vacío. Traemos también el system_id para que el form pueda mostrar el
  // selector del sistema sin un round-trip extra.
  const colors = await query(
    `SELECT c.id, c.label, c.hex, c.system_id, pc.display_order, pc.active
       FROM product_colors pc
       JOIN colors c ON c.id = pc.color_id
      WHERE pc.product_id = $1
      ORDER BY pc.display_order, c.label`,
    [numId],
  );
  // Variantes (Fase 3). Solo si use_colors=true; si no, queda vacío.
  const variants = rows[0].use_colors
    ? (await query(
        `SELECT pv.id, pv.color_id, pv.size_id, pv.stock,
                c.label AS color_label, c.hex,
                s.label AS size_label
           FROM product_variants pv
      LEFT JOIN colors c ON c.id = pv.color_id
      LEFT JOIN sizes  s ON s.id = pv.size_id
          WHERE pv.product_id = $1
          ORDER BY c.display_order NULLS FIRST, s.display_order NULLS FIRST`,
        [numId],
      )).rows
    : [];
  const movements = await query(
    `SELECT m.id, m.size_id, m.color_id, s.label AS size_label,
            c.label AS color_label, m.delta, m.reason,
            m.ref_type, m.ref_id, m.note, m.created_at, u.email AS created_by_email
       FROM inv_movements m
  LEFT JOIN sizes s ON s.id = m.size_id
  LEFT JOIN colors c ON c.id = m.color_id
  LEFT JOIN auth_users u ON u.id = m.created_by
      WHERE m.product_id = $1
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT 20`,
    [numId],
  );
  return json(res, 200, {
    ok: true,
    data: {
      ...rows[0],
      promo: livePromo[0] || null,
      sizes: sizes.rows,
      colors: colors.rows,
      variants,
      movements: movements.rows,
    },
  });
}

async function createInvItem(req, res) {
  const p = await readJsonBody(req).catch(() => null);
  if (!p) return json(res, 400, { ok: false, error: 'invalid_json' });
  const errs = validateInvItemPayload(p);
  if (errs.length) return json(res, 400, { ok: false, error: 'invalid_input', details: errs });

  if (p.sku) {
    const dupe = await query(
      `SELECT id FROM products WHERE sku = $1 AND deleted_at IS NULL`,
      [p.sku],
    );
    if (dupe.rows.length) return json(res, 409, { ok: false, error: 'sku_conflict' });
  }

  // Sistema de tallas: FK real, o null para "sin tallas" (un compartimento).
  const sizeSystemId = normSystemId(p.size_system_id);
  if (sizeSystemId) {
    const sys = await query(
      `SELECT id FROM size_systems WHERE id = $1 AND deleted_at IS NULL`,
      [sizeSystemId],
    );
    if (!sys.rows[0]) return json(res, 400, { ok: false, error: 'size_system_not_found' });
  }
  const kindErr = await sizesSystemMismatch(p.sizes, sizeSystemId);
  if (kindErr) return json(res, 400, { ok: false, error: 'invalid_input', details: [kindErr] });

  // Colores (Fase 2): si use_colors=true, exigimos system_id y color_ids no
  // vacío, todos del sistema. El catálogo activo lo trae el GET de
  // /api/admin/color-systems.
  const useColors = p.use_colors === true;
  let colorSystemId = null;
  let colorIds = [];
  if (useColors) {
    colorSystemId = Number(p.color_system_id);
    if (!Number.isInteger(colorSystemId) || colorSystemId <= 0) {
      return json(res, 400, { ok: false, error: 'invalid_input', details: ['use_colors=true requiere color_system_id'] });
    }
    if (!Array.isArray(p.color_ids) || p.color_ids.length === 0) {
      return json(res, 400, { ok: false, error: 'invalid_input', details: ['use_colors=true requiere color_ids no vacío'] });
    }
    const ids = p.color_ids.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length !== p.color_ids.length) {
      return json(res, 400, { ok: false, error: 'invalid_input', details: ['color_ids contiene valores inválidos'] });
    }
    const dedup = Array.from(new Set(ids));
    const { rows: valid } = await query(
      `SELECT id FROM colors WHERE system_id = $1 AND id = ANY($2::int[])`,
      [colorSystemId, dedup],
    );
    if (valid.length !== dedup.length) {
      return json(res, 400, { ok: false, error: 'invalid_input', details: ['alguno de los color_ids no pertenece a color_system_id'] });
    }
    colorIds = dedup;
  }

  // En alta, la matriz manda un valor por celda color × talla. `sizes`
  // define cuáles tallas aplican; `initial_variants` define cómo se reparte
  // el stock entre sus colores. No aceptamos celdas ajenas al producto.
  const initialVariantStock = new Map();
  if (useColors && p.initial_variants !== undefined) {
    if (!Array.isArray(p.initial_variants)) {
      return json(res, 400, { ok: false, error: 'invalid_input', details: ['initial_variants debe ser un array'] });
    }
    const allowedSizes = new Set((p.sizes || []).map((s) => s.size_id === null ? 'null' : String(Number(s.size_id))));
    for (const cell of p.initial_variants) {
      const colorId = Number(cell?.color_id);
      const sizeId = cell?.size_id === null ? null : Number(cell?.size_id);
      const stock = Number(cell?.stock);
      const sizeKey = sizeId === null ? 'null' : String(sizeId);
      if (!colorIds.includes(colorId) || !allowedSizes.has(sizeKey) || !Number.isInteger(stock) || stock < 0) {
        return json(res, 400, { ok: false, error: 'invalid_input', details: ['initial_variants contiene una celda inválida'] });
      }
      const key = `${colorId}|${sizeKey}`;
      if (initialVariantStock.has(key)) {
        return json(res, 400, { ok: false, error: 'invalid_input', details: ['initial_variants no puede repetir una celda'] });
      }
      initialVariantStock.set(key, stock);
    }
  }

  const types = Array.isArray(p.types) && p.types.length ? p.types : ['venta'];

  const uid = userId(req);
  const result = await tx(async (client) => {
    // Nace como borrador: published=false. Publicarlo es decisión manual de
    // Rebeca desde Gestión Tienda (y exige colección).
    const { rows } = await client.query(
      `INSERT INTO products (sku, name, description, type, types, size_system_id,
                             use_colors, color_system_id,
                             price, rental_price, rental_new_price, cost_price,
                             published, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, FALSE, 0)
       RETURNING *`,
      [
        p.sku || null,
        String(p.name).trim(),
        String(p.description || ''),
        types[0],
        types,
        sizeSystemId,
        useColors,
        useColors ? colorSystemId : null,
        numOr(p.price, 0),
        numOr(p.rental_price, 0),
        numOr(p.rental_new_price, 0),
        numOr(p.cost_price, 0),
      ],
    );
    const item = rows[0];

    // Colores del producto (Fase 2). Mismo orden que el front los mandó.
    for (let i = 0; i < colorIds.length; i++) {
      await client.query(
        `INSERT INTO product_colors (product_id, color_id, display_order) VALUES ($1, $2, $3)`,
        [item.id, colorIds[i], i],
      );
    }

    // Stock inicial. El stock de un producto vive en UNA sola tabla,
    // decidida por use_colors (Fase 3):
    //   - use_colors=false -> product_sizes (size_id puede ser NULL).
    //   - use_colors=true  -> product_variants (color_id NOT NULL).
    // El stock inicial entra al libro como 'compra' (explica el saldo desde
    // la primera fila). Una entrada con stock 0 crea la fila (existe,
    // agotada) sin movimiento (delta 0 no entra al libro).
    if (useColors) {
      for (const s of (p.sizes || [])) {
        const sizeId = s.size_id === null ? null : Number(s.size_id);
        for (const colorId of colorIds) {
          const stock = initialVariantStock.get(`${colorId}|${sizeId ?? 'null'}`) ?? 0;
          await client.query(
            `INSERT INTO product_variants (product_id, color_id, size_id, stock)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (product_id, color_id, size_id) DO UPDATE SET stock = EXCLUDED.stock`,
            [item.id, colorId, sizeId, stock],
          );
          if (stock > 0) {
            await client.query(
              `INSERT INTO inv_movements (product_id, size_id, color_id, delta, reason, note, created_by)
               VALUES ($1, $2, $3, $4, 'compra', 'Stock inicial del producto', $5)`,
              [item.id, sizeId, colorId, stock, uid],
            );
          }
        }
      }
    } else {
      for (const s of (p.sizes || [])) {
        const stock = Number(s.stock);
        if (stock < 0) continue;
        const sizeId = s.size_id === null ? null : Number(s.size_id);
        await client.query(
          `INSERT INTO product_sizes (product_id, size_id, stock) VALUES ($1, $2, $3)
           ON CONFLICT (product_id, size_id) DO UPDATE SET stock = EXCLUDED.stock`,
          [item.id, sizeId, stock],
        );
        if (stock > 0) {
          await client.query(
            `INSERT INTO inv_movements (product_id, size_id, delta, reason, note, created_by)
             VALUES ($1, $2, $3, 'compra', 'Stock inicial del producto', $4)`,
            [item.id, sizeId, stock, uid],
          );
        }
      }
    }
    return item;
  });

  return getInvItem(req, res, result.id);
}

async function updateInvItem(req, res, id) {
  const p = await readJsonBody(req).catch(() => null);
  if (!p) return json(res, 400, { ok: false, error: 'invalid_json' });
  if (p.sizes !== undefined) {
    // Regla del libro mayor: el stock no entra por PATCH.
    return json(res, 400, {
      ok: false, error: 'invalid_input',
      details: ['el stock no se edita por PATCH: usa POST /adjust'],
    });
  }
  const errs = validateInvItemPayload(p, { partial: true });
  if (errs.length) return json(res, 400, { ok: false, error: 'invalid_input', details: errs });

  const numId = Number(id);
  const { rows: existing } = await query(
    `SELECT id, size_system_id, use_colors, color_system_id
       FROM products WHERE id = $1 AND deleted_at IS NULL`,
    [numId],
  );
  if (!existing.length) return json(res, 404, { ok: false, error: 'not_found' });

  if (p.sku !== undefined && p.sku !== null && p.sku !== '') {
    const dupe = await query(
      `SELECT id FROM products WHERE sku = $1 AND id <> $2 AND deleted_at IS NULL`,
      [p.sku, numId],
    );
    if (dupe.rows.length) return json(res, 409, { ok: false, error: 'sku_conflict' });
  }

  // Cambiar el sistema de tallas con stock cargado dejaría unidades en tallas
  // de otra escala, sin movimiento que lo explique. Se exige ajustar a 0
  // primero. Vale también para pasar a/desde "sin tallas" (null).
  const newSystemId = p.size_system_id !== undefined ? normSystemId(p.size_system_id) : undefined;
  const changesSystem = newSystemId !== undefined && newSystemId !== existing[0].size_system_id;
  if (changesSystem) {
    if (newSystemId) {
      const sys = await query(
        `SELECT id FROM size_systems WHERE id = $1 AND deleted_at IS NULL`,
        [newSystemId],
      );
      if (!sys.rows[0]) return json(res, 400, { ok: false, error: 'size_system_not_found' });
    }
    const { rows: withStock } = await query(
      `SELECT COUNT(*)::int AS n FROM product_sizes WHERE product_id = $1 AND stock > 0`,
      [numId],
    );
    if (withStock[0].n > 0) {
      return json(res, 409, {
        ok: false,
        error: 'has_stock',
        message: `Tiene stock en ${withStock[0].n} talla(s). Ajústalo a 0 antes de cambiar el sistema de tallas.`,
      });
    }
  }

  // Colores (Fase 2 → Fase 3). El PATCH normal solo cambia `color_ids`
  // cuando use_colors=true. El toggle de use_colors (con o sin stock) ahora
  // va por los endpoints `colors/activate` y `colors/deactivate`, que son
  // los únicos que migran el stock entre product_sizes y product_variants.
  if (p.use_colors !== undefined || p.color_system_id !== undefined) {
    return json(res, 400, {
      ok: false, error: 'invalid_input',
      details: ['use_colors y color_system_id se cambian por POST /colors/activate y /colors/deactivate, no por PATCH'],
    });
  }
  let colorSystemId = existing[0].color_system_id;
  let colorIds = null; // null = sin cambios
  if (Array.isArray(p.color_ids)) {
    if (!existing[0].use_colors) {
      return json(res, 400, { ok: false, error: 'invalid_input', details: ['no se puede cambiar color_ids si use_colors=false'] });
    }
    if (p.color_ids.length === 0) {
      return json(res, 400, { ok: false, error: 'invalid_input', details: ['color_ids no puede ser vacío mientras use_colors=true: usa /colors/deactivate para desactivar'] });
    }
    const ids = p.color_ids.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length !== p.color_ids.length) {
      return json(res, 400, { ok: false, error: 'invalid_input', details: ['color_ids contiene valores inválidos'] });
    }
    const dedup = Array.from(new Set(ids));
    const { rows: valid } = await query(
      `SELECT id FROM colors WHERE system_id = $1 AND id = ANY($2::int[])`,
      [colorSystemId, dedup],
    );
    if (valid.length !== dedup.length) {
      return json(res, 400, { ok: false, error: 'invalid_input', details: ['alguno de los color_ids no pertenece al color_system_id del producto'] });
    }
    colorIds = dedup;
  }

  const fields = [];
  const vals = [];
  let i = 1;
  const set = (col, val) => { fields.push(`${col} = $${i++}`); vals.push(val); };
  if (p.sku !== undefined)         set('sku', p.sku || null);
  if (p.name !== undefined)        set('name', String(p.name).trim());
  if (p.description !== undefined) set('description', String(p.description || ''));
  if (newSystemId !== undefined)   set('size_system_id', newSystemId);
  if (p.cost_price !== undefined)  set('cost_price', numOr(p.cost_price, 0));
  if (p.price !== undefined)       set('price', numOr(p.price, 0));
  if (p.rental_price !== undefined)     set('rental_price', numOr(p.rental_price, 0));
  if (p.rental_new_price !== undefined) set('rental_new_price', numOr(p.rental_new_price, 0));
  if (p.types !== undefined && Array.isArray(p.types) && p.types.length) {
    set('types', p.types);
    set('type', p.types[0]);
  }
  if (!fields.length && colorIds === null) return json(res, 400, { ok: false, error: 'nothing_to_update' });

  if (colorIds !== null) vals.push(numId); else vals.push(numId);
  await tx(async (client) => {
    if (changesSystem) {
      // Solo quedan filas en 0; se limpian para que la grilla del otro sistema
      // arranque vacía.
      await client.query(`DELETE FROM product_sizes WHERE product_id = $1`, [numId]);
    }
    if (colorIds !== null) {
      // Reemplazo completo: borro las anteriores y reinserto en el orden del body.
      await client.query(`DELETE FROM product_colors WHERE product_id = $1`, [numId]);
      for (let k = 0; k < colorIds.length; k++) {
        await client.query(
          `INSERT INTO product_colors (product_id, color_id, display_order) VALUES ($1, $2, $3)`,
          [numId, colorIds[k], k],
        );
      }
    }
    if (fields.length) {
      await client.query(`UPDATE products SET ${fields.join(', ')} WHERE id = $${i}`, vals);
    }
  });

  return getInvItem(req, res, numId);
}

async function deleteInvItem(_req, res, id) {
  // Es la MISMA entidad que borra Gestión Tienda: mismo guard de reservas y
  // mismo soft-delete. Al borrarse también se despublica.
  return deleteProduct(_req, res, id);
}

// --- Colores: reparto y desactivación (Fase 3) ----------------------------
//
// activateColors: el producto pasa de use_colors=false a true. Si tiene
// stock preexistente en product_sizes, Rebeca ya repartió en la UI y nos
// mandó la distribución por variante. El server valida que la suma por
// talla cuadre con el stock actual, hace la migración de tablas y escribe
// el libro mayor con la nota del reparto.
//
// deactivateColors: el producto pasa a use_colors=true a false. Las
// variantes se mergean a product_sizes (default: suma) y se borran. Las
// fotos marcadas con color_id se migran a NULL en el mismo paso (general).

async function activateColors(req, res, id) {
  const p = await readJsonBody(req).catch(() => null);
  if (!p) return json(res, 400, { ok: false, error: 'invalid_json' });
  const numId = Number(id);

  const { rows: item } = await query(
    `SELECT id, use_colors, color_system_id FROM products WHERE id = $1 AND deleted_at IS NULL`,
    [numId],
  );
  if (!item[0]) return json(res, 404, { ok: false, error: 'not_found' });
  if (item[0].use_colors) {
    return json(res, 409, { ok: false, error: 'already_colors', message: 'Este producto ya maneja colores.' });
  }
  // Aceptamos color_system_id del body (si el producto aún no lo tiene) o
  // usamos el actual. Así el endpoint cubre tanto la activación desde cero
  // como la reactivación.
  const colorSystemId = Number(p.color_system_id || item[0].color_system_id);
  if (!Number.isInteger(colorSystemId) || colorSystemId <= 0) {
    return json(res, 400, { ok: false, error: 'invalid_input', details: ['color_system_id requerido: elegí un sistema en el form antes de activar'] });
  }
  if (!Array.isArray(p.color_ids) || p.color_ids.length === 0) {
    return json(res, 400, { ok: false, error: 'invalid_input', details: ['color_ids requerido no vacío'] });
  }
  // Validar que los color_ids existen y son del sistema.
  const colorIds = Array.from(new Set(p.color_ids.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0)));
  if (colorIds.length !== p.color_ids.length) {
    return json(res, 400, { ok: false, error: 'invalid_input', details: ['color_ids contiene valores inválidos'] });
  }
  const { rows: valid } = await query(
    `SELECT id FROM colors WHERE system_id = $1 AND id = ANY($2::int[])`,
    [colorSystemId, colorIds],
  );
  if (valid.length !== colorIds.length) {
    return json(res, 400, { ok: false, error: 'invalid_input', details: ['alguno de los color_ids no pertenece al sistema elegido'] });
  }
  // distribution: { color_id, size_id|null, stock }.
  if (!Array.isArray(p.distribution)) {
    return json(res, 400, { ok: false, error: 'invalid_input', details: ['distribution requerido (array de {color_id, size_id?, stock})'] });
  }
  const dist = p.distribution.map((d) => ({
    color_id: Number(d.color_id),
    size_id: d.size_id == null ? null : Number(d.size_id),
    stock: Number(d.stock || 0),
  }));
  for (const d of dist) {
    if (!colorIds.includes(d.color_id)) {
      return json(res, 400, { ok: false, error: 'invalid_input', details: [`color_id ${d.color_id} en distribution no está en color_ids`] });
    }
    if (Number.isNaN(d.stock) || d.stock < 0) {
      return json(res, 400, { ok: false, error: 'invalid_input', details: ['stock debe ser entero >= 0'] });
    }
  }
  // Validar suma por (size_id) = stock actual en product_sizes.
  const { rows: currentSizes } = await query(
    `SELECT size_id, stock FROM product_sizes WHERE product_id = $1`,
    [numId],
  );
  // Si no hay stock, no hace falta distribución: solo se prende el switch.
  const totalActual = currentSizes.reduce((a, s) => a + Number(s.stock || 0), 0);
  if (totalActual > 0) {
    // Suma esperada por size_id.
    const expectedBySize = new Map();
    for (const s of currentSizes) {
      expectedBySize.set(s.size_id, Number(s.stock || 0));
    }
    const actualBySize = new Map();
    for (const d of dist) {
      actualBySize.set(d.size_id, (actualBySize.get(d.size_id) || 0) + d.stock);
    }
    if (expectedBySize.size !== actualBySize.size) {
      return json(res, 400, {
        ok: false, error: 'reparto_no_cuadra',
        details: ['la cantidad de tallas en la distribución no coincide con el stock actual'],
      });
    }
    for (const [sizeId, expected] of expectedBySize.entries()) {
      if ((actualBySize.get(sizeId) || 0) !== expected) {
        return json(res, 400, {
          ok: false, error: 'reparto_no_cuadra',
          details: [`la suma de stock en talla ${sizeId == null ? 'única' : sizeId} es ${actualBySize.get(sizeId) || 0}, debería ser ${expected}`],
        });
      }
    }
  } else {
    // Sin stock preexistente: distribution tiene que ser todas con stock 0
    // (o estar ausente, que es lo mismo).
    if (dist.some((d) => d.stock > 0)) {
      return json(res, 400, { ok: false, error: 'invalid_input', details: ['el producto no tiene stock: la distribución debe ser todas 0'] });
    }
  }

  const uid = userId(req);
  await tx(async (client) => {
    // 1. Setear use_colors=true y color_system_id.
    await client.query(
      `UPDATE products SET use_colors = TRUE, color_system_id = $1 WHERE id = $2`,
      [colorSystemId, numId],
    );
    // 2. Reemplazar product_colors por la nueva lista.
    await client.query(`DELETE FROM product_colors WHERE product_id = $1`, [numId]);
    for (let i = 0; i < colorIds.length; i++) {
      await client.query(
        `INSERT INTO product_colors (product_id, color_id, display_order) VALUES ($1, $2, $3)`,
        [numId, colorIds[i], i],
      );
    }
    // 3. Reemplazar product_sizes por product_variants.
    await client.query(`DELETE FROM product_sizes WHERE product_id = $1`, [numId]);
    for (const d of dist) {
      await client.query(
        `INSERT INTO product_variants (product_id, color_id, size_id, stock) VALUES ($1, $2, $3, $4)`,
        [numId, d.color_id, d.size_id, d.stock],
      );
    }
    // 4. Libro mayor: una fila 'ajuste' por variante con stock > 0.
    for (const d of dist) {
      if (d.stock <= 0) continue;
      await client.query(
        `INSERT INTO inv_movements (product_id, size_id, color_id, delta, reason, note, created_by)
         VALUES ($1, $2, $3, $4, 'ajuste', $5, $6)`,
        [numId, d.size_id, d.color_id, d.stock, 'Reparto al activar colores', uid],
      );
    }
  });
  return getInvItem(req, res, numId);
}

async function deactivateColors(req, res, id) {
  const raw = await readJsonBody(req).catch(() => null);
  const p = raw && typeof raw === 'object' ? raw : {};
  const numId = Number(id);
  // Al volver a solo tallas nunca se descartan unidades: todas las variantes
  // de color se agrupan por talla.
  const mode = 'sum';

  const { rows: item } = await query(
    `SELECT id, use_colors, color_system_id FROM products WHERE id = $1 AND deleted_at IS NULL`,
    [numId],
  );
  if (!item[0]) return json(res, 404, { ok: false, error: 'not_found' });
  if (!item[0].use_colors) {
    return json(res, 409, { ok: false, error: 'no_colors', message: 'Este producto no maneja colores.' });
  }
  if (item[0].color_system_id == null) {
    return json(res, 400, { ok: false, error: 'invalid_state', message: 'use_colors=true pero color_system_id es NULL: estado inconsistente' });
  }

  // Sumar (o primer color) las variantes -> product_sizes.
  const { rows: variants } = await query(
    `SELECT color_id, size_id, stock FROM product_variants WHERE product_id = $1 ORDER BY color_id, size_id`,
    [numId],
  );
  const merged = new Map(); // size_id -> stock
  if (mode === 'first') {
    let firstColorId = null;
    for (const v of variants) {
      if (firstColorId == null) firstColorId = v.color_id;
      if (v.color_id !== firstColorId) continue;
      merged.set(v.size_id, (merged.get(v.size_id) || 0) + Number(v.stock || 0));
    }
  } else {
    // sum
    for (const v of variants) {
      merged.set(v.size_id, (merged.get(v.size_id) || 0) + Number(v.stock || 0));
    }
  }

  const uid = userId(req);
  await tx(async (client) => {
    // Borrar variantes y crear product_sizes con la suma.
    await client.query(`DELETE FROM product_variants WHERE product_id = $1`, [numId]);
    for (const [sizeId, stock] of merged.entries()) {
      if (stock <= 0) continue;
      await client.query(
        `INSERT INTO product_sizes (product_id, size_id, stock) VALUES ($1, $2, $3)`,
        [numId, sizeId, stock],
      );
    }
    // Libro mayor: un movimiento 'ajuste' por cada size_id mergeado.
    for (const [sizeId, stock] of merged.entries()) {
      if (stock <= 0) continue;
      await client.query(
        `INSERT INTO inv_movements (product_id, size_id, delta, reason, note, created_by)
         VALUES ($1, $2, $3, 'ajuste', $4, $5)`,
        [numId, sizeId, stock, 'Merge al desactivar colores', uid],
      );
    }
    // Apagar use_colors.
    await client.query(`UPDATE products SET use_colors = FALSE, color_system_id = NULL WHERE id = $1`, [numId]);
    // Limpiar product_colors (los colores elegidos ya no aplican).
    await client.query(`DELETE FROM product_colors WHERE product_id = $1`, [numId]);
    // Las fotos con color_id pasan a NULL (generales). Así no quedan
    // huérfanas apuntando a un color que ya no está activo.
    await client.query(`UPDATE product_media SET color_id = NULL WHERE product_id = $1 AND color_id IS NOT NULL`, [numId]);
  });
  return getInvItem(req, res, numId);
}

// Pausar no toca stock: mantiene las variantes y el historial, pero el color
// deja de aparecer en la tienda y no acepta reservas nuevas.
async function setProductColorActive(req, res, id, colorId) {
  const p = await readJsonBody(req).catch(() => null);
  if (!p || typeof p.active !== 'boolean') {
    return json(res, 400, { ok: false, error: 'invalid_input', details: ['active debe ser boolean'] });
  }
  const productId = Number(id);
  const cid = Number(colorId);
  const { rowCount } = await query(
    `UPDATE product_colors pc SET active = $1
       FROM products p
      WHERE pc.product_id = p.id AND pc.product_id = $2 AND pc.color_id = $3
        AND p.use_colors = TRUE AND p.deleted_at IS NULL`,
    [p.active, productId, cid],
  );
  if (!rowCount) return json(res, 404, { ok: false, error: 'not_found' });
  return getInvItem(req, res, productId);
}

async function adjustInvStock(req, res, id) {
  const p = await readJsonBody(req).catch(() => null);
  if (!p) return json(res, 400, { ok: false, error: 'invalid_json' });

  const numId = Number(id);
  const variantId = (p.variant_id === undefined || p.variant_id === null || p.variant_id === '')
    ? null : Number(p.variant_id);
  const colorId = (p.color_id === undefined || p.color_id === null || p.color_id === '')
    ? null : Number(p.color_id);
  // size_id null = el compartimento único de un producto "sin tallas".
  const sizeId = (p.size_id === undefined || p.size_id === null || p.size_id === '')
    ? null : Number(p.size_id);
  const delta = Number(p.delta);
  const note = String(p.note || '').trim();
  const errors = [];
  if (variantId !== null && (!Number.isInteger(variantId) || variantId <= 0)) errors.push('variant_id inválido');
  if (colorId !== null && (!Number.isInteger(colorId) || colorId <= 0)) errors.push('color_id inválido');
  if (sizeId !== null && (!Number.isInteger(sizeId) || sizeId <= 0)) errors.push('size_id inválido');
  if (!Number.isInteger(delta) || delta === 0)  errors.push('delta debe ser entero distinto de 0');
  if (!note)                                    errors.push('note es obligatoria: el libro tiene que explicar cada ajuste');
  if (errors.length) return json(res, 400, { ok: false, error: 'invalid_input', details: errors });

  const { rows: item } = await query(
    `SELECT id, use_colors, size_system_id FROM products WHERE id = $1 AND deleted_at IS NULL`,
    [numId],
  );
  if (!item[0]) return json(res, 404, { ok: false, error: 'not_found' });
  const useColors = !!item[0].use_colors;

  // Reglas: si el producto usa colores, exigimos variant_id o (color_id, size_id).
  // Si no usa colores, exigimos size_id (compatibilidad hacia atrás).
  let resolvedColor = null;
  let resolvedSize = null;
  if (useColors) {
    if (variantId) {
      const { rows: v } = await query(
        `SELECT color_id, size_id FROM product_variants WHERE id = $1 AND product_id = $2`,
        [variantId, numId],
      );
      if (!v[0]) return json(res, 400, { ok: false, error: 'invalid_input', details: ['variant_id no pertenece al producto'] });
      resolvedColor = v[0].color_id;
      resolvedSize = v[0].size_id;
    } else if (colorId) {
      resolvedColor = colorId;
      resolvedSize = sizeId;
    } else {
      return json(res, 400, { ok: false, error: 'invalid_input', details: ['use_colors=true: envía variant_id o (color_id, size_id)'] });
    }
  } else {
    if (sizeId === null && item[0].size_system_id !== null) {
      return json(res, 400, { ok: false, error: 'invalid_input', details: ['este producto usa tallas: elige la talla a ajustar'] });
    }
    const kindErr = await sizesSystemMismatch([{ size_id: sizeId }], item[0].size_system_id);
    if (kindErr) return json(res, 400, { ok: false, error: 'invalid_input', details: [kindErr] });
    resolvedColor = null;
    resolvedSize = sizeId;
  }

  const uid = userId(req);
  try {
    await tx(async (client) => {
      // FOR UPDATE toma lock de fila: dos ajustes concurrentes no leen el
      // mismo stock. El CHECK (stock >= 0) es la garantía última.
      if (useColors) {
        await client.query(
          `SELECT 1 FROM product_variants
            WHERE product_id = $1 AND color_id IS NOT DISTINCT FROM $2 AND size_id IS NOT DISTINCT FROM $3
            FOR UPDATE`,
          [numId, resolvedColor, resolvedSize],
        );
        await client.query(
          `INSERT INTO product_variants (product_id, color_id, size_id, stock)
           VALUES ($1, $2, $3, GREATEST(0, $4))
           ON CONFLICT (product_id, color_id, size_id) DO UPDATE
             SET stock = product_variants.stock + $4
           RETURNING stock`,
          [numId, resolvedColor, resolvedSize, delta],
        );
      } else {
        await client.query(
          `SELECT 1 FROM product_sizes
            WHERE product_id = $1 AND size_id IS NOT DISTINCT FROM $2
            FOR UPDATE`,
          [numId, resolvedSize],
        );
        await client.query(
          `INSERT INTO product_sizes (product_id, size_id, stock)
           VALUES ($1, $2, GREATEST(0, $3))
           ON CONFLICT (product_id, size_id) DO UPDATE
             SET stock = product_sizes.stock + $3
           RETURNING stock`,
          [numId, resolvedSize, delta],
        );
      }
      await client.query(
        `INSERT INTO inv_movements (product_id, size_id, color_id, delta, reason, note, created_by)
         VALUES ($1, $2, $3, $4, 'ajuste', $5, $6)`,
        [numId, resolvedSize, resolvedColor, delta, note.slice(0, 300), uid],
      );
    });
  } catch (err) {
    if (err.code === '23514') {
      return json(res, 409, {
        ok: false,
        error: 'stock_insuficiente',
        message: 'El ajuste dejaría el stock en negativo.',
      });
    }
    throw err;
  }
  return getInvItem(req, res, numId);
}

// --- Promos (Gestión General) ----------------------------------------------
//
// Una promo viva por producto. Reemplazar = soft-delete de la anterior +
// insert: el histórico queda. La tienda y el POS derivan el precio final de
// la promo VIGENTE (viva + dentro de fechas); nunca se toca products.price.

async function setItemPromo(req, res, id) {
  const p = await readJsonBody(req).catch(() => null);
  if (!p) return json(res, 400, { ok: false, error: 'invalid_json' });

  const numId = Number(id);
  const errors = [];
  if (!['percent', 'amount'].includes(p.kind)) errors.push("kind debe ser 'percent' o 'amount'");
  const value = Number(p.value);
  if (!Number.isFinite(value) || value <= 0) errors.push('value debe ser > 0');
  if (p.kind === 'percent' && value > 100) errors.push('un porcentaje no puede superar 100');
  // El "hoy" default sale de Postgres, no de JS: la vigencia se evalúa con
  // CURRENT_DATE (hora local de la BD) y el toISOString() de JS es UTC — de
  // noche difieren y la promo quedaría arrancando "mañana".
  const startsAt = p.starts_at
    || (await query(`SELECT CURRENT_DATE::text AS today`)).rows[0].today;
  if (!p.ends_at) errors.push('ends_at requerido: una promo siempre tiene vencimiento');
  else if (String(p.ends_at) < String(startsAt)) errors.push('ends_at debe ser >= starts_at');
  if (errors.length) return json(res, 400, { ok: false, error: 'invalid_input', details: errors });

  const { rows: prod } = await query(
    `SELECT id FROM products WHERE id = $1 AND deleted_at IS NULL`,
    [numId],
  );
  if (!prod[0]) return json(res, 404, { ok: false, error: 'not_found' });

  const uid = userId(req);
  await tx(async (client) => {
    await client.query(
      `UPDATE product_promos SET deleted_at = NOW()
        WHERE product_id = $1 AND deleted_at IS NULL`,
      [numId],
    );
    await client.query(
      `INSERT INTO product_promos (product_id, kind, value, starts_at, ends_at, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [numId, p.kind, value, startsAt, p.ends_at, String(p.note || '').slice(0, 200), uid],
    );
  });
  return getInvItem(req, res, numId);
}

async function deleteItemPromo(req, res, id) {
  const numId = Number(id);
  const { rowCount } = await query(
    `UPDATE product_promos SET deleted_at = NOW()
      WHERE product_id = $1 AND deleted_at IS NULL`,
    [numId],
  );
  if (!rowCount) return json(res, 404, { ok: false, error: 'not_found' });
  return getInvItem(req, res, numId);
}

// --- Categorías de inventario ---

// En transición: desde la fusión los productos ya no llevan category_id (la
// Fase 3 fusiona este concepto dentro de Colecciones y elimina la tabla).
// Los endpoints siguen vivos para no romper el contrato del admin.
async function listInvCategories(_req, res) {
  const { rows } = await query(
    `SELECT c.id, c.name, c.slug, c.display_order, c.active, c.created_at,
            0 AS items_count
       FROM inv_categories c
      ORDER BY c.display_order, c.name`,
  );
  return json(res, 200, { ok: true, data: rows });
}

async function createInvCategory(req, res) {
  const p = await readJsonBody(req).catch(() => null);
  if (!p) return json(res, 400, { ok: false, error: 'invalid_json' });
  if (typeof p.name !== 'string' || !p.name.trim()) {
    return json(res, 400, { ok: false, error: 'invalid_input', details: ['name requerido'] });
  }
  const name = p.name.trim();
  const slug = slugify(name);
  const dupe = await query(`SELECT id FROM inv_categories WHERE slug = $1`, [slug]);
  if (dupe.rows.length) return json(res, 409, { ok: false, error: 'slug_conflict' });
  const { rows } = await query(
    `INSERT INTO inv_categories (name, slug, display_order)
     VALUES ($1, $2, $3) RETURNING *`,
    [name, slug, numOr(p.display_order, 0)],
  );
  return json(res, 201, { ok: true, data: rows[0] });
}

async function updateInvCategory(req, res, id) {
  const p = await readJsonBody(req).catch(() => null);
  if (!p) return json(res, 400, { ok: false, error: 'invalid_json' });
  const numId = Number(id);
  const { rows: existing } = await query(`SELECT id FROM inv_categories WHERE id = $1`, [numId]);
  if (!existing.length) return json(res, 404, { ok: false, error: 'not_found' });

  const fields = [];
  const vals = [];
  let i = 1;
  if (p.name !== undefined) {
    if (typeof p.name !== 'string' || !p.name.trim()) {
      return json(res, 400, { ok: false, error: 'invalid_input', details: ['name requerido'] });
    }
    // El slug no se toca al renombrar: es un identificador interno estable.
    fields.push(`name = $${i++}`); vals.push(p.name.trim());
  }
  if (p.display_order !== undefined && Number.isFinite(Number(p.display_order))) {
    fields.push(`display_order = $${i++}`); vals.push(Number(p.display_order));
  }
  if (p.active !== undefined) { fields.push(`active = $${i++}`); vals.push(!!p.active); }
  if (!fields.length) return json(res, 400, { ok: false, error: 'nothing_to_update' });

  vals.push(numId);
  const { rows } = await query(
    `UPDATE inv_categories SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    vals,
  );
  return json(res, 200, { ok: true, data: rows[0] });
}

async function deleteInvCategory(_req, res, id) {
  const numId = Number(id);
  const { rowCount } = await query(`DELETE FROM inv_categories WHERE id = $1`, [numId]);
  if (!rowCount) return json(res, 404, { ok: false, error: 'not_found' });
  return json(res, 200, { ok: true });
}

// --- Sistemas de tallas (Configuración /admin/ajustes) -----------------------
//
// Un sistema = nombre + lista ordenada de tallas. Ropa y Calzado son DE
// SISTEMA (is_system): no se borran ni renombran ni se editan sus tallas,
// pero se pueden duplicar como punto de partida. Reglas de integridad:
// - renombrar una talla con ventas está BLOQUEADO (el histórico congela
//   size_label, pero la talla viva debe seguir contando la misma historia);
// - eliminar una talla exige que no tenga stock, ventas ni reservas;
// - eliminar un sistema exige que ningún producto vivo lo use (soft-delete).

function validSizeLabels(sizes) {
  if (!Array.isArray(sizes)) return 'sizes debe ser un array';
  const seen = new Set();
  for (const s of sizes) {
    const label = typeof s === 'string' ? s : s?.label;
    if (typeof label !== 'string' || !label.trim()) return 'cada talla necesita una etiqueta';
    if (label.trim().length > 20) return `etiqueta demasiado larga: "${label.trim()}"`;
    const k = label.trim().toLowerCase();
    if (seen.has(k)) return `etiqueta repetida: "${label.trim()}"`;
    seen.add(k);
  }
  return null;
}

async function systemNameTaken(name, excludeId = 0) {
  const { rows } = await query(
    `SELECT id FROM size_systems
      WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL AND id <> $2`,
    [name, excludeId],
  );
  return rows.length > 0;
}

// Validación de la lista de colores: array, cada item con label no vacío
// (max 40 chars) y sin repetir case-insensitive. hex, si viene, en formato
// #RRGGBB. Réplica estructural de validSizeLabels para tallas.
function validColorLabels(colors) {
  if (!Array.isArray(colors)) return 'colors debe ser un array';
  const seen = new Set();
  for (const c of colors) {
    const label = typeof c === 'string' ? c : c?.label;
    if (typeof label !== 'string' || !label.trim()) return 'cada color necesita una etiqueta';
    if (label.trim().length > 40) return `etiqueta demasiado larga: "${label.trim()}"`;
    const k = label.trim().toLowerCase();
    if (seen.has(k)) return `etiqueta repetida: "${label.trim()}"`;
    if (c && typeof c === 'object' && c.hex != null && c.hex !== '') {
      if (typeof c.hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(c.hex)) {
        return `hex inválido: "${c.hex}" (formato esperado #RRGGBB)`;
      }
    }
    seen.add(k);
  }
  return null;
}

async function colorSystemNameTaken(name, excludeId = 0) {
  const { rows } = await query(
    `SELECT id FROM color_systems
      WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL AND id <> $2`,
    [name, excludeId],
  );
  return rows.length > 0;
}

// --- Stock centralizado (Fase 3 de colores) --------------------------------
//
// Regla de oro: el stock de un producto vive en UNA sola tabla, decidida por
// `products.use_colors`.
//   - use_colors=false: `product_sizes` (size_id puede ser NULL).
//   - use_colors=true:  `product_variants` (color_id NOT NULL, size_id puede
//     ser NULL para "sin tallas").
//
// NUNCA mezclar las dos tablas para el mismo producto. Estos helpers son el
// único punto de entrada. La UI los consume vía los endpoints y el helper
// `readProductStock` arma el JSON que el front muestra.

// Lee el stock y los desgloses del producto, en la tabla que corresponda.
// `withIds` agrega color_id/size_id/variant_id para los forms de la UI.
async function readProductStock(client, productId, useColors) {
  if (useColors) {
    const { rows: variants } = await client.query(
      `SELECT pv.id, pv.color_id, pv.size_id, pv.stock,
              c.label AS color_label, c.hex,
              s.label AS size_label
         FROM product_variants pv
    LEFT JOIN colors c ON c.id = pv.color_id
    LEFT JOIN sizes  s ON s.id = pv.size_id
        WHERE pv.product_id = $1
        ORDER BY c.display_order NULLS FIRST, s.display_order NULLS FIRST, c.label, s.label`,
      [productId],
    );
    return {
      variants,
      total: variants.reduce((a, v) => a + Number(v.stock || 0), 0),
    };
  }
  const { rows: sizes } = await client.query(
    `SELECT ps.size_id, ps.stock, s.label, s.display_order
       FROM product_sizes ps
  LEFT JOIN sizes s ON s.id = ps.size_id
      WHERE ps.product_id = $1
      ORDER BY s.display_order NULLS FIRST, s.label`,
    [productId],
  );
  return {
    sizes,
    total: sizes.reduce((a, s) => a + Number(s.stock || 0), 0),
  };
}

// UPSERT de una fila de stock con delta. El CHECK (stock >= 0) es quien
// impide quedar en negativo: capturar 23514 -> 409 stock_insuficiente.
async function upsertVariantStock(client, productId, colorId, sizeId, delta) {
  if (colorId == null) {
    const { rows } = await client.query(
      `INSERT INTO product_sizes (product_id, size_id, stock)
       VALUES ($1, $2, $3)
       ON CONFLICT (product_id, size_id) DO UPDATE
         SET stock = product_sizes.stock + $3
       RETURNING stock`,
      [productId, sizeId, delta],
    );
    return rows[0]?.stock ?? 0;
  }
  const { rows } = await client.query(
    `INSERT INTO product_variants (product_id, color_id, size_id, stock)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (product_id, color_id, size_id) DO UPDATE
       SET stock = product_variants.stock + $4
     RETURNING stock`,
    [productId, colorId, sizeId, delta],
  );
  return rows[0]?.stock ?? 0;
}

// Reemplaza TODO el stock de un producto (usado por el reparto al activar
// colores y por la desactivación al mergear). Borra las filas existentes
// de la tabla correspondiente y crea las nuevas con stock exacto.
async function replaceVariantStock(client, productId, useColors, entries) {
  if (useColors) {
    await client.query(`DELETE FROM product_variants WHERE product_id = $1`, [productId]);
    for (const e of entries) {
      if (Number(e.stock) <= 0) continue;
      await client.query(
        `INSERT INTO product_variants (product_id, color_id, size_id, stock) VALUES ($1, $2, $3, $4)`,
        [productId, e.color_id ?? null, e.size_id ?? null, Number(e.stock)],
      );
    }
  } else {
    await client.query(`DELETE FROM product_sizes WHERE product_id = $1`, [productId]);
    for (const e of entries) {
      if (Number(e.stock) <= 0) continue;
      await client.query(
        `INSERT INTO product_sizes (product_id, size_id, stock) VALUES ($1, $2, $3)`,
        [productId, e.size_id ?? null, Number(e.stock)],
      );
    }
  }
}

async function listSizeSystems(_req, res) {
  const { rows } = await query(
    `SELECT ss.id, ss.name, ss.is_system, ss.display_order,
            COALESCE(sz.sizes, '[]'::json) AS sizes,
            (SELECT COUNT(*)::int FROM products p
              WHERE p.size_system_id = ss.id AND p.deleted_at IS NULL) AS products_count
       FROM size_systems ss
  LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object(
                  'id', s.id, 'label', s.label, 'display_order', s.display_order)
                ORDER BY s.display_order, s.label) AS sizes
           FROM sizes s
          WHERE s.system_id = ss.id
       ) sz ON TRUE
      WHERE ss.deleted_at IS NULL
      ORDER BY ss.display_order, ss.id`,
  );
  return json(res, 200, { ok: true, data: rows });
}

async function createSizeSystem(req, res) {
  const p = await readJsonBody(req).catch(() => null);
  if (!p) return json(res, 400, { ok: false, error: 'invalid_json' });
  const name = String(p.name || '').trim();
  if (!name) return json(res, 400, { ok: false, error: 'invalid_input', details: ['name requerido'] });
  const sizeErr = validSizeLabels(p.sizes || []);
  if (sizeErr) return json(res, 400, { ok: false, error: 'invalid_input', details: [sizeErr] });
  if (await systemNameTaken(name)) {
    return json(res, 409, { ok: false, error: 'name_conflict', message: `Ya existe un sistema llamado "${name}".` });
  }

  const system = await tx(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO size_systems (name, is_system, display_order)
       VALUES ($1, FALSE, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM size_systems))
       RETURNING *`,
      [name],
    );
    let order = 1;
    for (const s of (p.sizes || [])) {
      const label = (typeof s === 'string' ? s : s.label).trim();
      await client.query(
        `INSERT INTO sizes (label, system_id, display_order) VALUES ($1, $2, $3)`,
        [label, rows[0].id, order++],
      );
    }
    return rows[0];
  });
  return json(res, 200, { ok: true, data: system });
}

async function updateSizeSystem(req, res, id) {
  const p = await readJsonBody(req).catch(() => null);
  if (!p) return json(res, 400, { ok: false, error: 'invalid_json' });
  const numId = Number(id);
  const { rows: existing } = await query(
    `SELECT id, name, is_system FROM size_systems WHERE id = $1 AND deleted_at IS NULL`,
    [numId],
  );
  if (!existing[0]) return json(res, 404, { ok: false, error: 'not_found' });

  // Los sistemas de sistema son de solo lectura (salvo el orden): se duplican
  // para personalizarlos.
  if (existing[0].is_system && (p.name !== undefined || p.sizes !== undefined)) {
    return json(res, 409, {
      ok: false, error: 'protected',
      message: `"${existing[0].name}" viene con la plataforma: no se renombra ni se editan sus tallas. Duplícalo para hacer tu propia versión.`,
    });
  }

  if (p.name !== undefined) {
    const name = String(p.name || '').trim();
    if (!name) return json(res, 400, { ok: false, error: 'invalid_input', details: ['name no puede quedar vacío'] });
    if (await systemNameTaken(name, numId)) {
      return json(res, 409, { ok: false, error: 'name_conflict', message: `Ya existe un sistema llamado "${name}".` });
    }
  }
  if (p.sizes !== undefined) {
    const sizeErr = validSizeLabels(p.sizes);
    if (sizeErr) return json(res, 400, { ok: false, error: 'invalid_input', details: [sizeErr] });
  }

  try {
    await tx(async (client) => {
      if (p.name !== undefined) {
        await client.query(`UPDATE size_systems SET name = $1 WHERE id = $2`, [String(p.name).trim(), numId]);
      }
      if (p.display_order !== undefined && Number.isFinite(Number(p.display_order))) {
        await client.query(`UPDATE size_systems SET display_order = $1 WHERE id = $2`, [Number(p.display_order), numId]);
      }
      if (p.sizes !== undefined) {
        // Reconciliar la lista ordenada: renombrar/reordenar las que traen id,
        // crear las nuevas, eliminar las que ya no están.
        const { rows: current } = await client.query(
          `SELECT id, label FROM sizes WHERE system_id = $1`, [numId],
        );
        const currentById = new Map(current.map((s) => [s.id, s]));
        const keptIds = new Set();
        let order = 1;
        for (const s of p.sizes) {
          const label = (typeof s === 'string' ? s : s.label).trim();
          const sid = (typeof s === 'object' && s?.id) ? Number(s.id) : null;
          if (sid && currentById.has(sid)) {
            keptIds.add(sid);
            const cur = currentById.get(sid);
            if (cur.label !== label) {
              // INVARIANTE (C2.3): una talla con ventas no se renombra. El
              // snapshot protege el histórico, pero la talla viva seguiría
              // contando otra historia en reservas y stock.
              const { rows: sold } = await client.query(
                `SELECT 1 FROM sale_items WHERE size_id = $1 LIMIT 1`, [sid],
              );
              if (sold.length) {
                throw httpError(409, {
                  ok: false, error: 'size_has_sales',
                  message: `La talla "${cur.label}" ya tiene ventas: no se puede renombrar. Duplica el sistema si necesitas otra escala.`,
                });
              }
            }
            await client.query(
              `UPDATE sizes SET label = $1, display_order = $2 WHERE id = $3`,
              [label, order++, sid],
            );
          } else {
            await client.query(
              `INSERT INTO sizes (label, system_id, display_order) VALUES ($1, $2, $3)`,
              [label, numId, order++],
            );
          }
        }
        for (const cur of current) {
          if (keptIds.has(cur.id)) continue;
          const { rows: used } = await client.query(
            `SELECT
               EXISTS (SELECT 1 FROM product_sizes WHERE size_id = $1) AS has_stock,
               EXISTS (SELECT 1 FROM sale_items    WHERE size_id = $1) AS has_sales,
               EXISTS (SELECT 1 FROM reservations  WHERE size_id = $1) AS has_reservations`,
            [cur.id],
          );
          const u = used[0];
          if (u.has_stock || u.has_sales || u.has_reservations) {
            throw httpError(409, {
              ok: false, error: 'size_in_use',
              message: `La talla "${cur.label}" tiene ${u.has_sales ? 'ventas' : u.has_stock ? 'stock asignado' : 'reservas'}: no se puede eliminar.`,
            });
          }
          await client.query(`DELETE FROM sizes WHERE id = $1`, [cur.id]);
        }
      }
    });
  } catch (err) {
    if (err.http) return json(res, err.http, err.payload);
    if (err.code === '23505') {
      return json(res, 409, { ok: false, error: 'duplicate_label', message: 'Hay etiquetas repetidas en el sistema.' });
    }
    throw err;
  }
  return listSizeSystems(req, res);
}

async function duplicateSizeSystem(req, res, id) {
  const p = await readJsonBody(req).catch(() => ({}));
  const numId = Number(id);
  const { rows: src } = await query(
    `SELECT id, name FROM size_systems WHERE id = $1 AND deleted_at IS NULL`,
    [numId],
  );
  if (!src[0]) return json(res, 404, { ok: false, error: 'not_found' });

  const name = String(p?.name || `${src[0].name} (copia)`).trim();
  if (await systemNameTaken(name)) {
    return json(res, 409, { ok: false, error: 'name_conflict', message: `Ya existe un sistema llamado "${name}".` });
  }

  const system = await tx(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO size_systems (name, is_system, display_order)
       VALUES ($1, FALSE, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM size_systems))
       RETURNING *`,
      [name],
    );
    await client.query(
      `INSERT INTO sizes (label, system_id, display_order)
       SELECT s.label, $1, s.display_order FROM sizes s WHERE s.system_id = $2`,
      [rows[0].id, numId],
    );
    return rows[0];
  });
  return json(res, 200, { ok: true, data: system });
}

async function deleteSizeSystem(_req, res, id) {
  const numId = Number(id);
  const { rows: existing } = await query(
    `SELECT id, name, is_system FROM size_systems WHERE id = $1 AND deleted_at IS NULL`,
    [numId],
  );
  if (!existing[0]) return json(res, 404, { ok: false, error: 'not_found' });
  if (existing[0].is_system) {
    return json(res, 409, {
      ok: false, error: 'protected',
      message: `"${existing[0].name}" viene con la plataforma y no se puede eliminar.`,
    });
  }
  const { rows: inUse } = await query(
    `SELECT COUNT(*)::int AS n FROM products
      WHERE size_system_id = $1 AND deleted_at IS NULL`,
    [numId],
  );
  if (inUse[0].n > 0) {
    return json(res, 409, {
      ok: false, error: 'in_use',
      message: `${inUse[0].n} producto(s) usan este sistema. Cámbialos de sistema antes de eliminarlo.`,
    });
  }
  // Soft-delete: sus tallas quedan para el histórico (ventas viejas las
  // referencian), pero dejan de ofrecerse para productos nuevos.
  await query(`UPDATE size_systems SET deleted_at = NOW() WHERE id = $1`, [numId]);
  return json(res, 200, { ok: true });
}

// --- Sistemas de colores (/admin/ajustes) ----------------------------------
//
// Réplica estructural de size_systems. Color es opcional (Fase 2: el producto
// lo activa con use_colors=true). El sistema "Rebeca" viene de la plataforma
// (protegido: no se renombra ni se editan sus colores, se duplica). Reglas:
// - nombre único case-insensitive entre vivos (índice + SELECT propio);
// - hex formato #RRGGBB si viene (CHECK en SQL + validación acá);
// - soft-delete del sistema bloqueado si es de plataforma;
// - soft-delete de un color: en Fase 1 no hay referencias externas; en
//   Fase 2+ (cuando exista product_colors) se valida que no esté en uso.

async function listColorSystems(_req, res) {
  const { rows } = await query(
    `SELECT cs.id, cs.name, cs.is_system, cs.display_order,
            COALESCE(c.colors, '[]'::json) AS colors,
            (SELECT COUNT(*)::int FROM colors c2
              WHERE c2.system_id = cs.id AND c2.active) AS colors_count
       FROM color_systems cs
       LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object(
                  'id', c.id, 'label', c.label, 'hex', c.hex,
                  'display_order', c.display_order, 'active', c.active)
                ORDER BY c.display_order, c.label) AS colors
           FROM colors c
          WHERE c.system_id = cs.id AND c.active
       ) c ON TRUE
      WHERE cs.deleted_at IS NULL
      ORDER BY cs.display_order, cs.id`,
  );
  return json(res, 200, { ok: true, data: rows });
}

async function createColorSystem(req, res) {
  const p = await readJsonBody(req).catch(() => null);
  if (!p) return json(res, 400, { ok: false, error: 'invalid_json' });
  const name = String(p.name || '').trim();
  if (!name) return json(res, 400, { ok: false, error: 'invalid_input', details: ['name requerido'] });
  const colorErr = validColorLabels(p.colors || []);
  if (colorErr) return json(res, 400, { ok: false, error: 'invalid_input', details: [colorErr] });
  if (await colorSystemNameTaken(name)) {
    return json(res, 409, { ok: false, error: 'name_conflict', message: `Ya existe un sistema de colores llamado "${name}".` });
  }

  const system = await tx(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO color_systems (name, is_system, display_order)
       VALUES ($1, FALSE, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM color_systems))
       RETURNING *`,
      [name],
    );
    let order = 1;
    for (const c of (p.colors || [])) {
      const label = (typeof c === 'string' ? c : c.label).trim();
      const hex = (typeof c === 'object' && c?.hex) ? c.hex : null;
      await client.query(
        `INSERT INTO colors (label, system_id, display_order, hex) VALUES ($1, $2, $3, $4)`,
        [label, rows[0].id, order++, hex],
      );
    }
    return rows[0];
  });
  return json(res, 200, { ok: true, data: system });
}

async function updateColorSystem(req, res, id) {
  const p = await readJsonBody(req).catch(() => null);
  if (!p) return json(res, 400, { ok: false, error: 'invalid_json' });
  const numId = Number(id);
  const { rows: existing } = await query(
    `SELECT id, name, is_system FROM color_systems WHERE id = $1 AND deleted_at IS NULL`,
    [numId],
  );
  if (!existing[0]) return json(res, 404, { ok: false, error: 'not_found' });

  // Sistema de plataforma (is_system=true): el `name` está congelado para
  // que el seed siga contando la misma historia. Los `colors` sí se pueden
  // editar: "Rebeca" es un placeholder vacío que Rebeca personaliza con sus
  // propios colores (a diferencia de Ropa/Calzado en tallas, que vienen con
  // contenido y por eso SÍ bloquean sizes). Esta asimetría es a propósito.
  if (existing[0].is_system && p.name !== undefined) {
    return json(res, 409, {
      ok: false, error: 'protected',
      message: `"${existing[0].name}" viene con la plataforma: no se renombra. Duplícalo para hacer tu propia versión.`,
    });
  }

  if (p.name !== undefined) {
    const name = String(p.name || '').trim();
    if (!name) return json(res, 400, { ok: false, error: 'invalid_input', details: ['name no puede quedar vacío'] });
    if (await colorSystemNameTaken(name, numId)) {
      return json(res, 409, { ok: false, error: 'name_conflict', message: `Ya existe un sistema de colores llamado "${name}".` });
    }
  }
  if (p.colors !== undefined) {
    const colorErr = validColorLabels(p.colors);
    if (colorErr) return json(res, 400, { ok: false, error: 'invalid_input', details: [colorErr] });
  }

  try {
    await tx(async (client) => {
      if (p.name !== undefined) {
        await client.query(`UPDATE color_systems SET name = $1 WHERE id = $2`, [String(p.name).trim(), numId]);
      }
      if (p.display_order !== undefined && Number.isFinite(Number(p.display_order))) {
        await client.query(`UPDATE color_systems SET display_order = $1 WHERE id = $2`, [Number(p.display_order), numId]);
      }
      if (p.colors !== undefined) {
        // Mismo patrón que tallas: reconciliar la lista ordenada. La
        // identidad de cada color es: si trae id, ese id; si no, el label
        // case-insensitive matchea contra los actuales. Sin id y label nuevo,
        // INSERT. En Fase 2+ el DELETE de un color en uso va a fallar con
        // 23503 (FK desde product_colors); acá todavía no hay referencias.
        const { rows: current } = await client.query(
          `SELECT id, label, hex FROM colors WHERE system_id = $1`, [numId],
        );
        const currentById = new Map(current.map((c) => [c.id, c]));
        const currentByLabel = new Map(current.map((c) => [c.label.toLowerCase(), c]));
        const keptIds = new Set();
        let order = 1;
        for (const c of p.colors) {
          const label = (typeof c === 'string' ? c : c.label).trim();
          const hex = (typeof c === 'object' && c?.hex) ? c.hex : null;
          const cid = (typeof c === 'object' && c?.id) ? Number(c.id) : null;
          let target = null;
          if (cid && currentById.has(cid)) {
            target = currentById.get(cid);
          } else {
            // Buscar por label case-insensitive: si el front no manda id,
            // matcheamos por etiqueta (UX más simple).
            const byLabel = currentByLabel.get(label.toLowerCase());
            if (byLabel) target = byLabel;
          }
          if (target) {
            keptIds.add(target.id);
            await client.query(
              `UPDATE colors SET label = $1, hex = $2, display_order = $3 WHERE id = $4`,
              [label, hex, order++, target.id],
            );
          } else {
            await client.query(
              `INSERT INTO colors (label, system_id, display_order, hex) VALUES ($1, $2, $3, $4)`,
              [label, numId, order++, hex],
            );
          }
        }
        for (const cur of current) {
          if (keptIds.has(cur.id)) continue;
          // Si el color está en uso (product_colors u otra FK), no se puede
          // borrar. Capturamos 23001 (RESTRICT) y 23503 (FK genérico) para
          // devolver un 409 legible.
          try {
            await client.query(`DELETE FROM colors WHERE id = $1`, [cur.id]);
          } catch (err) {
            if (err.code === '23001' || err.code === '23503') {
              throw httpError(409, {
                ok: false, error: 'color_in_use',
                message: `El color "${cur.label}" está en uso: quítalo de los productos antes de borrarlo del sistema.`,
              });
            }
            throw err;
          }
        }
      }
    });
  } catch (err) {
    if (err.http) return json(res, err.http, err.payload);
    if (err.code === '23505') {
      return json(res, 409, { ok: false, error: 'duplicate_label', message: 'Hay etiquetas repetidas en el sistema.' });
    }
    throw err;
  }
  return listColorSystems(req, res);
}

async function duplicateColorSystem(req, res, id) {
  const p = await readJsonBody(req).catch(() => ({}));
  const numId = Number(id);
  const { rows: src } = await query(
    `SELECT id, name FROM color_systems WHERE id = $1 AND deleted_at IS NULL`,
    [numId],
  );
  if (!src[0]) return json(res, 404, { ok: false, error: 'not_found' });

  const name = String(p?.name || `${src[0].name} (copia)`).trim();
  if (await colorSystemNameTaken(name)) {
    return json(res, 409, { ok: false, error: 'name_conflict', message: `Ya existe un sistema de colores llamado "${name}".` });
  }

  const system = await tx(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO color_systems (name, is_system, display_order)
       VALUES ($1, FALSE, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM color_systems))
       RETURNING *`,
      [name],
    );
    await client.query(
      `INSERT INTO colors (label, system_id, display_order, hex)
       SELECT c.label, $1, c.display_order, c.hex FROM colors c WHERE c.system_id = $2`,
      [rows[0].id, numId],
    );
    return rows[0];
  });
  return json(res, 200, { ok: true, data: system });
}

async function deleteColorSystem(_req, res, id) {
  const numId = Number(id);
  const { rows: existing } = await query(
    `SELECT id, name, is_system FROM color_systems WHERE id = $1 AND deleted_at IS NULL`,
    [numId],
  );
  if (!existing[0]) return json(res, 404, { ok: false, error: 'not_found' });
  if (existing[0].is_system) {
    return json(res, 409, {
      ok: false, error: 'protected',
      message: `"${existing[0].name}" viene con la plataforma y no se puede eliminar.`,
    });
  }
  // Soft-delete del sistema. En Fase 2+ se agrega check de uso (productos
  // con colores de este sistema). Por ahora, nadie los puede estar usando.
  await query(`UPDATE color_systems SET deleted_at = NOW() WHERE id = $1`, [numId]);
  return json(res, 200, { ok: true });
}

// PATCH/DELETE de un color puntual. El CREATE se hace dentro del PATCH al
// sistema (lista completa de colores): más simple para la UI y la
// reconciliación ya está validada arriba.
async function updateColor(req, res, id) {
  const p = await readJsonBody(req).catch(() => null);
  if (!p) return json(res, 400, { ok: false, error: 'invalid_json' });
  const numId = Number(id);
  const { rows: existing } = await query(
    `SELECT c.id, c.system_id, cs.is_system
       FROM colors c JOIN color_systems cs ON cs.id = c.system_id
      WHERE c.id = $1 AND cs.deleted_at IS NULL`,
    [numId],
  );
  if (!existing[0]) return json(res, 404, { ok: false, error: 'not_found' });
  // "Rebeca" (sistema de plataforma vacío) SÍ permite editar sus colores:
  // es un placeholder que Rebeca personaliza. La protección de is_system
  // aplica solo al rename y delete del sistema, no a los colores adentro.
  const updates = [];
  const values = [];
  if (p.label !== undefined) {
    const label = String(p.label || '').trim();
    if (!label) return json(res, 400, { ok: false, error: 'invalid_input', details: ['label no puede quedar vacío'] });
    updates.push(`label = $${values.length + 1}`);
    values.push(label);
  }
  if (p.hex !== undefined) {
    const hex = p.hex == null || p.hex === '' ? null : String(p.hex);
    if (hex !== null && !/^#[0-9a-f]{6}$/i.test(hex)) {
      return json(res, 400, { ok: false, error: 'invalid_input', details: [`hex inválido: "${hex}"`] });
    }
    updates.push(`hex = $${values.length + 1}`);
    values.push(hex);
  }
  if (p.display_order !== undefined && Number.isFinite(Number(p.display_order))) {
    updates.push(`display_order = $${values.length + 1}`);
    values.push(Number(p.display_order));
  }
  if (p.active !== undefined) {
    updates.push(`active = $${values.length + 1}`);
    values.push(!!p.active);
  }
  if (updates.length === 0) {
    return json(res, 400, { ok: false, error: 'invalid_input', details: ['nada que actualizar'] });
  }
  values.push(numId);
  try {
    await query(`UPDATE colors SET ${updates.join(', ')} WHERE id = $${values.length}`, values);
  } catch (err) {
    if (err.code === '23505') {
      return json(res, 409, { ok: false, error: 'duplicate_label', message: 'Ya hay otro color con esa etiqueta en el sistema.' });
    }
    throw err;
  }
  return listColorSystems(req, res);
}

async function deleteColor(_req, res, id) {
  const numId = Number(id);
  const { rows: existing } = await query(
    `SELECT c.id, cs.is_system
       FROM colors c JOIN color_systems cs ON cs.id = c.system_id
      WHERE c.id = $1 AND cs.deleted_at IS NULL`,
    [numId],
  );
  if (!existing[0]) return json(res, 404, { ok: false, error: 'not_found' });
  // "Rebeca" (sistema de plataforma vacío) SÍ permite borrar colores:
  // son colores que Rebeca misma agregó. En Fase 2+ este check se vuelve
  // real (FK desde product_colors / product_variants).
  await query(`DELETE FROM colors WHERE id = $1`, [numId]);
  return json(res, 200, { ok: true });
}

// --- Ventas (Gestión General) ----------------------------------------------
//
// Venden `products` (la entidad unificada) y descuentan el ÚNICO stock:
// product_sizes. Cada línea congela nombre, precio original, descuento
// aplicado (tipo + monto) y precio final: el histórico tiene que leerse igual
// aunque el producto cambie, la promo venza o el producto se borre después.
// Descuentos: la promo vigente se aplica por default pero se puede quitar; el
// descuento manual del cajero REEMPLAZA a la promo (nunca se apilan).
// Los medios de pago los valida el CHECK de la DB (la lista vive una sola vez
// en SQL y otra en web-admin/src/lib/constants.js para la UI).

// Error con status HTTP para cortar una transacción con respuesta limpia.
function httpError(status, payload) {
  const e = new Error(payload.error || 'http_error');
  e.http = status;
  e.payload = payload;
  return e;
}

async function listSales(req, res) {
  const url = new URL(req.url, 'http://x');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const method = url.searchParams.get('payment_method');
  const status = url.searchParams.get('status');

  const where = [];
  const args = [];
  let n = 1;
  if (from)   { where.push(`s.sold_at >= $${n++}::date`); args.push(from); }
  // `to` es inclusivo por día: hasta el final de esa fecha.
  if (to)     { where.push(`s.sold_at < ($${n++}::date + INTERVAL '1 day')`); args.push(to); }
  if (method) { where.push(`s.payment_method = $${n++}`); args.push(method); }
  if (status) { where.push(`s.status = $${n++}`); args.push(status); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await query(
    `SELECT s.id, s.sold_at, s.total, s.payment_method, s.status, s.note,
            s.created_at, u.email AS created_by_email,
            COALESCE(it.items, '[]'::json) AS items
       FROM sales s
  LEFT JOIN auth_users u ON u.id = s.created_by
  LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object(
                  'id', si.id, 'product_id', si.product_id, 'size_id', si.size_id,
                  'size_label', COALESCE(si.size_label, sz.label), 'item_name', si.item_name,
                  'qty', si.qty, 'unit_price', si.unit_price,
                  'discount_type', si.discount_type,
                  'discount_amount', si.discount_amount,
                  'final_unit_price', si.final_unit_price,
                  'subtotal', si.subtotal)
                ORDER BY si.id) AS items
           FROM sale_items si
      LEFT JOIN sizes sz ON sz.id = si.size_id
          WHERE si.sale_id = s.id
       ) it ON TRUE
       ${whereSql}
      ORDER BY s.sold_at DESC, s.id DESC
      LIMIT 200`,
    args,
  );
  return json(res, 200, { ok: true, data: rows });
}

async function getSale(_req, res, id) {
  const numId = Number(id);
  const { rows } = await query(
    `SELECT s.*, u.email AS created_by_email
       FROM sales s
  LEFT JOIN auth_users u ON u.id = s.created_by
      WHERE s.id = $1`,
    [numId],
  );
  if (!rows[0]) return json(res, 404, { ok: false, error: 'not_found' });
  const items = await query(
    `SELECT si.id, si.product_id, si.size_id,
            COALESCE(si.size_label, sz.label) AS size_label,
            si.item_name, si.qty, si.unit_price,
            si.discount_type, si.discount_amount, si.final_unit_price,
            si.subtotal
       FROM sale_items si
  LEFT JOIN sizes sz ON sz.id = si.size_id
      WHERE si.sale_id = $1
      ORDER BY si.id`,
    [numId],
  );
  return json(res, 200, { ok: true, data: { ...rows[0], items: items.rows } });
}

async function createSale(req, res) {
  const p = await readJsonBody(req).catch(() => null);
  if (!p) return json(res, 400, { ok: false, error: 'invalid_json' });

  const errors = [];
  if (!Array.isArray(p.items) || p.items.length === 0) {
    errors.push('items debe ser un array con al menos una línea');
  } else {
    for (const it of p.items) {
      // `item_id` se acepta como alias de `product_id` por compatibilidad.
      const pid = it.product_id ?? it.item_id;
      if (!Number.isInteger(Number(pid)) || Number(pid) <= 0)               { errors.push('cada línea necesita product_id'); break; }
      // size_id null = producto "sin tallas" (un solo compartimento de stock).
      if (it.size_id != null && (!Number.isInteger(Number(it.size_id)) || Number(it.size_id) <= 0)) { errors.push('size_id inválido'); break; }
      if (!Number.isInteger(Number(it.qty)) || Number(it.qty) <= 0)         { errors.push('cada línea necesita qty > 0'); break; }
      const d = it.discount;
      if (d !== undefined && d !== null) {
        if (!['manual', 'ninguno'].includes(d.type)) { errors.push("discount.type debe ser 'manual' o 'ninguno'"); break; }
        if (d.type === 'manual') {
          if (!['percent', 'amount'].includes(d.kind)) { errors.push("discount.kind debe ser 'percent' o 'amount'"); break; }
          const v = Number(d.value);
          if (!Number.isFinite(v) || v <= 0) { errors.push('discount.value debe ser > 0'); break; }
          if (d.kind === 'percent' && v > 100) { errors.push('un porcentaje no puede superar 100'); break; }
        }
      }
    }
  }
  if (typeof p.payment_method !== 'string' || !p.payment_method) {
    errors.push('payment_method requerido');
  }
  if (errors.length) return json(res, 400, { ok: false, error: 'invalid_input', details: errors });

  const uid = userId(req);
  let sale;
  try {
    sale = await tx(async (client) => {
      // 1) Validar y descontar línea por línea, con lock de fila (FOR UPDATE):
      //    dos ventas concurrentes de la misma pieza no pueden pasar las dos.
      //    El descuento de stock va acá mismo para que dos líneas de la misma
      //    talla en una venta no se validen contra el mismo stock.
      const lines = [];
      let total = 0;
      for (const it of p.items) {
        const productId = Number(it.product_id ?? it.item_id);
        const sizeId = it.size_id == null ? null : Number(it.size_id);
        const qty = Number(it.qty);

        const { rows: item } = await client.query(
          `SELECT id, name, price FROM products
            WHERE id = $1 AND deleted_at IS NULL`,
          [productId],
        );
        if (!item[0]) {
          throw httpError(400, { ok: false, error: 'item_not_found', message: `El producto ${productId} no existe.` });
        }
        // IS NOT DISTINCT FROM: la fila "sin talla" tiene size_id NULL.
        const { rows: st } = await client.query(
          `SELECT stock FROM product_sizes
            WHERE product_id = $1 AND size_id IS NOT DISTINCT FROM $2
            FOR UPDATE`,
          [productId, sizeId],
        );
        if (!st[0] || st[0].stock < qty) {
          throw httpError(409, {
            ok: false,
            error: 'stock_insuficiente',
            message: `Stock insuficiente de "${item[0].name}" (hay ${st[0]?.stock ?? 0}, se piden ${qty}).`,
          });
        }
        await client.query(
          `UPDATE product_sizes SET stock = stock - $1
            WHERE product_id = $2 AND size_id IS NOT DISTINCT FROM $3`,
          [qty, productId, sizeId],
        );

        // Snapshot de la etiqueta de talla: el histórico se lee igual aunque
        // la talla se renombre o desaparezca (Idea 3 del plan).
        let sizeLabel = null;
        if (sizeId !== null) {
          const { rows: sz } = await client.query(`SELECT label FROM sizes WHERE id = $1`, [sizeId]);
          sizeLabel = sz[0]?.label ?? null;
        }

        // Descuento de la línea. Default: la promo vigente del producto.
        // El cajero puede quitarla ({type:'ninguno'}) o reemplazarla por un
        // descuento manual — que SIEMPRE reemplaza, nunca se apila.
        const unit = round2(item[0].price);
        const { rows: promoRows } = await client.query(
          `SELECT kind, value FROM product_promos
            WHERE product_id = $1 AND deleted_at IS NULL
              AND CURRENT_DATE BETWEEN starts_at AND ends_at`,
          [productId],
        );
        const d = it.discount;
        let discountType = 'ninguno';
        let discountAmount = 0;
        if (d && d.type === 'manual') {
          discountType = 'manual';
          const v = Number(d.value);
          discountAmount = round2(Math.min(d.kind === 'percent' ? (unit * v) / 100 : v, unit));
        } else if ((d === undefined || d === null) && promoRows[0]) {
          discountType = 'promo';
          discountAmount = promoDiscount(unit, promoRows[0]);
        }
        const finalUnit = round2(unit - discountAmount);

        lines.push({
          product_id: productId, size_id: sizeId, size_label: sizeLabel,
          name: item[0].name, qty,
          unit, discount_type: discountType, discount_amount: discountAmount,
          final_unit: finalUnit, subtotal: round2(finalUnit * qty),
        });
        total = round2(total + finalUnit * qty);
      }

      // 2) La venta + sus líneas con snapshots (precio original, descuento y
      //    precio final congelados: el histórico no se recalcula jamás).
      const { rows: srow } = await client.query(
        `INSERT INTO sales (total, payment_method, note, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [total, p.payment_method, String(p.note || ''), uid],
      );
      const s = srow[0];
      for (const l of lines) {
        await client.query(
          `INSERT INTO sale_items (sale_id, product_id, size_id, size_label, item_name, qty,
                                   unit_price, discount_type, discount_amount,
                                   final_unit_price, subtotal)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [s.id, l.product_id, l.size_id, l.size_label, l.name, l.qty,
           l.unit, l.discount_type, l.discount_amount, l.final_unit, l.subtotal],
        );
        // 3) El rastro en el libro mayor, una fila por línea.
        await client.query(
          `INSERT INTO inv_movements (product_id, size_id, delta, reason, ref_type, ref_id, created_by)
           VALUES ($1, $2, $3, 'venta', 'sale', $4, $5)`,
          [l.product_id, l.size_id, -l.qty, s.id, uid],
        );
      }
      return s;
    });
  } catch (err) {
    if (err.http) return json(res, err.http, err.payload);
    if (err.code === '23514' && String(err.constraint || '').includes('payment_method')) {
      return json(res, 400, { ok: false, error: 'invalid_input', details: ['payment_method inválido'] });
    }
    throw err;
  }
  return getSale(req, res, sale.id);
}

async function voidSale(req, res, id) {
  // Anular NO borra: marca la venta y devuelve el stock con movimientos
  // 'devolucion'. El histórico queda entero.
  const numId = Number(id);
  const uid = userId(req);
  try {
    await tx(async (client) => {
      const { rows } = await client.query(
        `SELECT id, status FROM sales WHERE id = $1 FOR UPDATE`,
        [numId],
      );
      if (!rows[0]) throw httpError(404, { ok: false, error: 'not_found' });
      if (rows[0].status === 'anulada') {
        throw httpError(409, { ok: false, error: 'already_void', message: 'La venta ya está anulada.' });
      }
      await client.query(`UPDATE sales SET status = 'anulada' WHERE id = $1`, [numId]);

      const { rows: items } = await client.query(
        `SELECT product_id, size_id, qty FROM sale_items WHERE sale_id = $1`,
        [numId],
      );
      for (const it of items) {
        // Upsert por si la fila de talla se limpió después de la venta. La
        // fila "sin talla" (size_id NULL) también recupera su stock: el
        // UNIQUE NULLS NOT DISTINCT hace de árbitro del ON CONFLICT.
        await client.query(
          `INSERT INTO product_sizes (product_id, size_id, stock)
           VALUES ($1, $2, $3)
           ON CONFLICT (product_id, size_id) DO UPDATE
             SET stock = product_sizes.stock + $3`,
          [it.product_id, it.size_id, it.qty],
        );
        await client.query(
          `INSERT INTO inv_movements (product_id, size_id, delta, reason, ref_type, ref_id, note, created_by)
           VALUES ($1, $2, $3, 'devolucion', 'sale', $4, 'Anulación de venta', $5)`,
          [it.product_id, it.size_id, it.qty, numId, uid],
        );
      }
    });
  } catch (err) {
    if (err.http) return json(res, err.http, err.payload);
    throw err;
  }
  return getSale(req, res, numId);
}

// --- Caja (Gestión General) ------------------------------------------------
//
// Saldo por medio de pago = ventas completadas + movimientos manuales. Las
// reservas y los cierres por WhatsApp NO tocan Caja jamás (regla dura del
// usuario). El saldo se calcula siempre; no hay columna materializada.

// Para dar forma a la respuesta del balance (los 4 medios siempre presentes,
// aunque estén en 0). La validación de valores la hace el CHECK de SQL.
const CASH_METHODS = ['efectivo', 'nequi', 'daviplata', 'bancolombia'];

async function cashBalance(_req, res) {
  // saldo(medio) = Σ ventas completadas + Σ ingresos − Σ retiros
  //              − Σ traslados salientes + Σ traslados entrantes
  const { rows: salesRows } = await query(
    `SELECT payment_method AS method, COALESCE(SUM(total), 0) AS s
       FROM sales WHERE status = 'completada'
      GROUP BY payment_method`,
  );
  const { rows: movRows } = await query(
    `SELECT kind, method, method_to, COALESCE(SUM(amount), 0) AS s
       FROM cash_movements
      GROUP BY kind, method, method_to`,
  );

  const bal = Object.fromEntries(CASH_METHODS.map((m) => [m, 0]));
  for (const r of salesRows) {
    if (bal[r.method] !== undefined) bal[r.method] += Number(r.s);
  }
  for (const r of movRows) {
    const amount = Number(r.s);
    if (r.kind === 'ingreso') bal[r.method] += amount;
    else if (r.kind === 'retiro') bal[r.method] -= amount;
    else if (r.kind === 'traslado') {
      bal[r.method] -= amount;
      if (bal[r.method_to] !== undefined) bal[r.method_to] += amount;
    }
  }
  const total = CASH_METHODS.reduce((acc, m) => acc + bal[m], 0);
  return json(res, 200, { ok: true, data: { ...bal, total } });
}

async function listCashMovements(req, res) {
  // Feed unificado: ventas + movimientos manuales, ordenado por fecha. Las
  // ventas anuladas vienen con su status para que la UI las muestre tachadas
  // (del saldo ya quedan fuera por el filtro de cashBalance).
  const url = new URL(req.url, 'http://x');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const method = url.searchParams.get('method');

  const args = [];
  const wSales = [];
  const wMovs = [];
  let n = 1;
  if (from) {
    args.push(from);
    wSales.push(`s.sold_at >= $${n}::date`);
    wMovs.push(`m.created_at >= $${n}::date`);
    n++;
  }
  if (to) {
    args.push(to);
    wSales.push(`s.sold_at < ($${n}::date + INTERVAL '1 day')`);
    wMovs.push(`m.created_at < ($${n}::date + INTERVAL '1 day')`);
    n++;
  }
  if (method) {
    args.push(method);
    wSales.push(`s.payment_method = $${n}`);
    // Un traslado toca dos medios: entra al feed si cualquiera coincide.
    wMovs.push(`(m.method = $${n} OR m.method_to = $${n})`);
    n++;
  }
  const salesWhere = wSales.length ? `AND ${wSales.join(' AND ')}` : '';
  const movsWhere = wMovs.length ? `WHERE ${wMovs.join(' AND ')}` : '';

  const { rows } = await query(
    `SELECT * FROM (
       SELECT 'venta'::text AS kind, s.id, s.sold_at AS created_at,
              s.payment_method AS method, NULL::text AS method_to,
              s.total AS amount, s.note, s.status,
              u.email AS created_by_email
         FROM sales s
    LEFT JOIN auth_users u ON u.id = s.created_by
        WHERE TRUE ${salesWhere}
       UNION ALL
       SELECT m.kind, m.id, m.created_at, m.method, m.method_to,
              m.amount, m.note, NULL::text AS status,
              u.email AS created_by_email
         FROM cash_movements m
    LEFT JOIN auth_users u ON u.id = m.created_by
        ${movsWhere}
     ) feed
     ORDER BY created_at DESC
     LIMIT 200`,
    args,
  );
  return json(res, 200, { ok: true, data: rows });
}

async function createCashMovement(req, res) {
  const p = await readJsonBody(req).catch(() => null);
  if (!p) return json(res, 400, { ok: false, error: 'invalid_json' });

  const errors = [];
  if (!['ingreso', 'retiro', 'traslado'].includes(p.kind)) {
    errors.push('kind debe ser ingreso, retiro o traslado');
  }
  const amount = Number(p.amount);
  if (!Number.isFinite(amount) || amount <= 0) errors.push('amount debe ser > 0');
  if (typeof p.method !== 'string' || !p.method) errors.push('method requerido');
  if (p.kind === 'traslado') {
    if (typeof p.method_to !== 'string' || !p.method_to) {
      errors.push('method_to requerido en un traslado');
    } else if (p.method_to === p.method) {
      errors.push('method_to debe ser distinto del origen');
    }
  }
  if (errors.length) return json(res, 400, { ok: false, error: 'invalid_input', details: errors });

  try {
    const { rows } = await query(
      `INSERT INTO cash_movements (kind, method, method_to, amount, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        p.kind,
        p.method,
        p.kind === 'traslado' ? p.method_to : null,
        amount,
        String(p.note || '').slice(0, 300),
        userId(req),
      ],
    );
    return json(res, 201, { ok: true, data: rows[0] });
  } catch (err) {
    if (err.code === '23514') {
      return json(res, 400, { ok: false, error: 'invalid_input', details: ['medio de pago inválido'] });
    }
    throw err;
  }
}

// --- Media ----------------------------------------------------------------

async function listMedia(req, res) {
  const url = new URL(req.url, 'http://x');
  const productId = url.searchParams.get('product_id');
  const kind = url.searchParams.get('kind');
  const orphan = url.searchParams.get('orphan');
  // color_id: 'null' o '' = fotos generales; número = ese color. Sin el
  // param = sin filtro. Aplica solo si product_id está seteado.
  const colorIdParam = url.searchParams.get('color_id');

  const where = ['m.deleted_at IS NULL'];
  const args = [];
  let i = 1;
  if (productId) { where.push(`m.product_id = $${i++}`); args.push(Number(productId)); }
  if (kind)      { where.push(`m.kind = $${i++}`);      args.push(kind); }
  if (orphan === 'true') where.push('m.product_id IS NULL');
  if (colorIdParam !== null && productId) {
    if (colorIdParam === '' || colorIdParam === 'null') {
      where.push('m.color_id IS NULL');
    } else {
      where.push(`m.color_id = $${i++}`); args.push(Number(colorIdParam));
    }
  }

  const { rows } = await query(
    `SELECT m.id, m.product_id, m.color_id, m.kind, m.url, m.mime, m.size_bytes,
            m.width, m.height, m.alt_text, m.display_order,
            m.created_at, p.name AS product_name,
            c.label AS color_label, c.hex AS color_hex
       FROM product_media m
  LEFT JOIN products p ON p.id = m.product_id
  LEFT JOIN colors   c ON c.id = m.color_id
      WHERE ${where.join(' AND ')}
      ORDER BY m.color_id NULLS FIRST, m.display_order, m.created_at DESC
      LIMIT 500`,
    args,
  );
  return json(res, 200, { ok: true, data: rows });
}

async function uploadMedia(req, res) {
  // multer procesa multipart/form-data y deja el file en req.file
  return new Promise((resolve) => {
    upload.single('file')(req, res, async (err) => {
      if (err) {
        const msg = err.message || 'upload_failed';
        const code = msg.startsWith('unsupported_mime') ? 400 : 413;
        json(res, code, { ok: false, error: msg });
        return resolve();
      }
      if (!req.file) {
        json(res, 400, { ok: false, error: 'no_file' });
        return resolve();
      }

      try {
        const { url, size_bytes } = await writeUploadFile(req.file.buffer, req.file.mimetype);
        const alt = (req.body && req.body.alt_text) ? String(req.body.alt_text).slice(0, 200) : '';
        const productId = (req.body && req.body.product_id) ? Number(req.body.product_id) : null;
        const displayOrder = (req.body && req.body.display_order) ? Number(req.body.display_order) : 0;
        // color_id opcional (Fase 4): '' o null = foto general. Si viene, tiene
        // que pertenecer a un color válido del sistema del producto.
        const rawColor = req.body && req.body.color_id;
        let colorId = null;
        if (rawColor !== undefined && rawColor !== null && rawColor !== '') {
          colorId = Number(rawColor);
          if (!Number.isInteger(colorId) || colorId <= 0) {
            await deleteUploadFile(url);
            json(res, 400, { ok: false, error: 'invalid_input', details: ['color_id inválido'] });
            return resolve();
          }
        }

        // Si se asigna a un producto, verificar que existe y que el color
        // pertenece al sistema del producto.
        if (productId) {
          const p = await query(
            `SELECT id, use_colors, color_system_id FROM products WHERE id = $1 AND deleted_at IS NULL`,
            [productId],
          );
          if (!p.rows[0]) {
            await deleteUploadFile(url);
            json(res, 400, { ok: false, error: 'product_not_found' });
            return resolve();
          }
          if (colorId !== null) {
            // Si el producto no maneja colores, no se puede asignar foto a color.
            if (!p.rows[0].use_colors || !p.rows[0].color_system_id) {
              await deleteUploadFile(url);
              json(res, 400, { ok: false, error: 'invalid_input', details: ['este producto no maneja colores: no se puede asignar color_id'] });
              return resolve();
            }
            const c = await query(
              `SELECT id FROM colors WHERE id = $1 AND system_id = $2`,
              [colorId, p.rows[0].color_system_id],
            );
            if (!c.rows[0]) {
              await deleteUploadFile(url);
              json(res, 400, { ok: false, error: 'invalid_input', details: ['el color no pertenece al sistema del producto'] });
              return resolve();
            }
          }
        } else if (colorId !== null) {
          // color_id sin product_id no tiene sentido (el color es por producto).
          await deleteUploadFile(url);
          json(res, 400, { ok: false, error: 'invalid_input', details: ['color_id requiere product_id'] });
          return resolve();
        }

        const { rows } = await query(
          `INSERT INTO product_media (product_id, color_id, kind, url, mime, size_bytes, alt_text, display_order)
           VALUES ($1, $2, 'image', $3, $4, $5, $6, $7)
           RETURNING *`,
          [productId, colorId, url, req.file.mimetype, size_bytes, alt, displayOrder],
        );
        json(res, 201, { ok: true, data: rows[0] });
      } catch (e) {
        log.error('uploadMedia failed', e.message);
        json(res, 500, { ok: false, error: 'internal_error' });
      }
      resolve();
    });
  });
}

async function updateMedia(req, res, id) {
  const p = await readJsonBody(req).catch(() => null);
  if (!p) return json(res, 400, { ok: false, error: 'invalid_json' });
  const numId = Number(id);
  const { rows: existing } = await query(`SELECT id FROM product_media WHERE id = $1 AND deleted_at IS NULL`, [numId]);
  if (!existing.length) return json(res, 404, { ok: false, error: 'not_found' });

  const fields = [];
  const vals = [];
  let i = 1;
  if (p.product_id !== undefined) {
    if (p.product_id === null) {
      fields.push(`product_id = $${i++}`); vals.push(null);
    } else {
      const prod = await query(
        `SELECT id FROM products WHERE id = $1 AND deleted_at IS NULL`,
        [Number(p.product_id)],
      );
      if (!prod.rows[0]) return json(res, 400, { ok: false, error: 'product_not_found' });
      fields.push(`product_id = $${i++}`); vals.push(Number(p.product_id));
    }
  }
  if (p.alt_text !== undefined) {
    fields.push(`alt_text = $${i++}`); vals.push(String(p.alt_text).slice(0, 200));
  }
  if (p.display_order !== undefined && Number.isFinite(Number(p.display_order))) {
    fields.push(`display_order = $${i++}`); vals.push(Number(p.display_order));
  }
  // color_id (Fase 4): null = "general". Si viene un id, validar que el
  // color pertenece al sistema del producto actual.
  if (p.color_id !== undefined) {
    if (p.color_id === null || p.color_id === '') {
      fields.push(`color_id = $${i++}`); vals.push(null);
    } else {
      const cid = Number(p.color_id);
      if (!Number.isInteger(cid) || cid <= 0) {
        return json(res, 400, { ok: false, error: 'invalid_input', details: ['color_id inválido'] });
      }
      // Necesitamos el product_id actual de la foto.
      const { rows: ph } = await query(
        `SELECT product_id FROM product_media WHERE id = $1`,
        [numId],
      );
      if (ph[0]?.product_id) {
        const { rows: pr } = await query(
          `SELECT use_colors, color_system_id FROM products WHERE id = $1 AND deleted_at IS NULL`,
          [ph[0].product_id],
        );
        if (pr[0] && (!pr[0].use_colors || !pr[0].color_system_id)) {
          return json(res, 400, { ok: false, error: 'invalid_input', details: ['este producto no maneja colores'] });
        }
        const { rows: validColor } = await query(
          `SELECT id FROM colors WHERE id = $1 AND system_id = $2`,
          [cid, pr[0]?.color_system_id],
        );
        if (!validColor[0]) {
          return json(res, 400, { ok: false, error: 'invalid_input', details: ['el color no pertenece al sistema del producto'] });
        }
      }
      fields.push(`color_id = $${i++}`); vals.push(cid);
    }
  }
  if (!fields.length) return json(res, 400, { ok: false, error: 'nothing_to_update' });

  vals.push(numId);
  const { rows } = await query(
    `UPDATE product_media SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    vals,
  );
  return json(res, 200, { ok: true, data: rows[0] });
}

async function deleteMedia(_req, res, id) {
  // Soft-delete
  const numId = Number(id);
  const { rowCount } = await query(
    `UPDATE product_media SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
    [numId],
  );
  if (!rowCount) return json(res, 404, { ok: false, error: 'not_found' });
  return json(res, 200, { ok: true });
}

async function cleanupOrphans(_req, res) {
  // Purga huérfanas (product_id IS NULL) con deleted_at > 30 días
  // 1) Soft-delete huérfanas > 30 días (si no estaban ya)
  const { rows: stale } = await query(
    `SELECT id, url FROM product_media
      WHERE product_id IS NULL
        AND deleted_at IS NOT NULL
        AND deleted_at < NOW() - INTERVAL '30 days'`,
  );
  if (!stale.length) {
    return json(res, 200, { ok: true, data: { purged: 0, freed_bytes: 0 } });
  }

  let freed = 0;
  for (const m of stale) {
    try {
      const stat = await (await import('node:fs/promises')).stat(m.url.replace(/^\/media\//, ''));
      // En realidad, el path local no es el URL. Mejor no loggear tamaño.
    } catch {}
    await deleteUploadFile(m.url);
    freed += Number(m.size_bytes) || 0;
  }
  // Borrar de DB (ahora sí, hard)
  const { rowCount } = await query(
    `DELETE FROM product_media
      WHERE product_id IS NULL
        AND deleted_at IS NOT NULL
        AND deleted_at < NOW() - INTERVAL '30 days'`,
  );
  return json(res, 200, { ok: true, data: { purged: rowCount, freed_bytes: freed } });
}

// --- Page modules (page builder) -----------------------------------------

const MODULE_TYPES = new Set(['header', 'hero', 'carousel', 'collections', 'text', 'contact', 'footer']);
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function validateModuleConfig(cfg) {
  if (cfg === null || typeof cfg !== 'object' || Array.isArray(cfg)) {
    return ['config debe ser un objeto'];
  }
  const errors = [];
  for (const k of ['text_color', 'bg_color']) {
    if (cfg[k] !== undefined && cfg[k] !== null && cfg[k] !== '' && !HEX_RE.test(cfg[k])) {
      errors.push(`${k} debe ser hex (#rgb o #rrggbb)`);
    }
  }
  if (cfg.max_items !== undefined && (!Number.isInteger(Number(cfg.max_items)) || Number(cfg.max_items) < 1)) {
    errors.push('max_items debe ser entero positivo');
  }
  if (cfg.source !== undefined && typeof cfg.source !== 'string') {
    errors.push('source debe ser string');
  }
  if (cfg.body !== undefined && typeof cfg.body !== 'string') {
    errors.push('body debe ser string');
  }
  if (cfg.align !== undefined && !['left', 'center', 'right'].includes(cfg.align)) {
    errors.push('align debe ser left, center o right');
  }
  if (cfg.show_wa_button !== undefined && typeof cfg.show_wa_button !== 'boolean') {
    errors.push('show_wa_button debe ser boolean');
  }
  return errors;
}

async function listModules(_req, res) {
  const url = new URL(_req.url, 'http://x');
  const slot = url.searchParams.get('slot') || 'home';
  const { rows } = await query(
    `SELECT id, slot, type, title, config, display_order, active, created_at, updated_at
       FROM page_modules
      WHERE slot = $1
      ORDER BY display_order, id`,
    [slot],
  );
  return json(res, 200, { ok: true, data: rows });
}

async function createModule(req, res) {
  const p = await readJsonBody(req).catch(() => null);
  if (!p) return json(res, 400, { ok: false, error: 'invalid_json' });
  if (!MODULE_TYPES.has(p.type)) {
    return json(res, 400, { ok: false, error: 'invalid_type', message: `type debe ser uno de: ${[...MODULE_TYPES].join(', ')}` });
  }
  const config = p.config || {};
  const errs = validateModuleConfig(config);
  if (errs.length) return json(res, 400, { ok: false, error: 'invalid_config', details: errs });

  // Determinar el próximo display_order
  const { rows: maxRow } = await query(
    `SELECT COALESCE(MAX(display_order), -1) AS m FROM page_modules WHERE slot = $1`,
    [p.slot || 'home'],
  );
  const displayOrder = Number.isFinite(Number(p.display_order)) ? Number(p.display_order) : maxRow[0].m + 1;

  const { rows } = await query(
    `INSERT INTO page_modules (slot, type, title, config, display_order, active)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     RETURNING *`,
    [p.slot || 'home', p.type, String(p.title || ''), JSON.stringify(config), displayOrder, p.active !== false],
  );
  return json(res, 201, { ok: true, data: rows[0] });
}

async function updateModule(req, res, id) {
  const p = await readJsonBody(req).catch(() => null);
  if (!p) return json(res, 400, { ok: false, error: 'invalid_json' });
  const numId = Number(id);
  const { rows: existing } = await query(`SELECT id FROM page_modules WHERE id = $1`, [numId]);
  if (!existing.length) return json(res, 404, { ok: false, error: 'not_found' });

  if (p.type !== undefined && !MODULE_TYPES.has(p.type)) {
    return json(res, 400, { ok: false, error: 'invalid_type' });
  }
  if (p.config !== undefined) {
    const errs = validateModuleConfig(p.config);
    if (errs.length) return json(res, 400, { ok: false, error: 'invalid_config', details: errs });
  }

  const fields = [];
  const vals = [];
  let i = 1;
  if (p.type !== undefined)         { fields.push(`type = $${i++}`);          vals.push(p.type); }
  if (p.title !== undefined)        { fields.push(`title = $${i++}`);         vals.push(String(p.title)); }
  if (p.config !== undefined)      { fields.push(`config = $${i++}::jsonb`); vals.push(JSON.stringify(p.config)); }
  if (p.active !== undefined)      { fields.push(`active = $${i++}`);        vals.push(!!p.active); }
  if (p.display_order !== undefined && Number.isFinite(Number(p.display_order))) {
    fields.push(`display_order = $${i++}`); vals.push(Number(p.display_order));
  }
  if (!fields.length) return json(res, 400, { ok: false, error: 'nothing_to_update' });

  vals.push(numId);
  const { rows } = await query(
    `UPDATE page_modules SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    vals,
  );
  return json(res, 200, { ok: true, data: rows[0] });
}

async function deleteModule(_req, res, id) {
  const numId = Number(id);
  const { rowCount } = await query(`DELETE FROM page_modules WHERE id = $1`, [numId]);
  if (!rowCount) return json(res, 404, { ok: false, error: 'not_found' });
  return json(res, 200, { ok: true });
}

async function moveModule(req, res, id, direction) {
  // direction = 'up' (display_order -= 1) o 'down' (display_order += 1)
  const numId = Number(id);
  const { rows: cur } = await query(`SELECT id, display_order, slot FROM page_modules WHERE id = $1`, [numId]);
  if (!cur.length) return json(res, 404, { ok: false, error: 'not_found' });
  const curOrder = cur[0].display_order;
  const newOrder = direction === 'up' ? curOrder - 1 : curOrder + 1;

  // Buscar el vecino (otro módulo con ese order)
  const { rows: neighbor } = await query(
    `SELECT id, display_order FROM page_modules
      WHERE slot = $1 AND display_order = $2 AND id <> $3`,
    [cur[0].slot, newOrder, numId],
  );

  await tx(async (client) => {
    if (neighbor.length) {
      // Swap: poner el vecino en el lugar actual
      await client.query(`UPDATE page_modules SET display_order = $1 WHERE id = $2`, [curOrder, neighbor[0].id]);
    }
    await client.query(`UPDATE page_modules SET display_order = $1 WHERE id = $2`, [newOrder, numId]);
  });

  return json(res, 200, { ok: true });
}

// --- Site config ----------------------------------------------------------

async function getSiteConfig(_req, res) {
  const { rows } = await query(`SELECT key, value, updated_at FROM site_config ORDER BY key`);
  return json(res, 200, { ok: true, data: rows });
}

async function updateSiteConfig(req, res) {
  const p = await readJsonBody(req).catch(() => null);
  if (!p) return json(res, 400, { ok: false, error: 'invalid_json' });
  const updates = Array.isArray(p.updates) ? p.updates : null;
  if (!updates) {
    if (typeof p.key !== 'string') return json(res, 400, { ok: false, error: 'key_required' });
    return applyUpdate(res, [{ key: p.key, value: p.value }]);
  }
  if (!Array.isArray(updates) || updates.length === 0) {
    return json(res, 400, { ok: false, error: 'updates_required' });
  }
  for (const u of updates) {
    if (typeof u.key !== 'string') {
      return json(res, 400, { ok: false, error: 'invalid_key' });
    }
  }
  return applyUpdate(res, updates);
}

async function applyUpdate(res, updates) {
  await tx(async (client) => {
    for (const u of updates) {
      await client.query(
        `INSERT INTO site_config (key, value, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [u.key, JSON.stringify(u.value ?? null)],
      );
    }
  });
  const { rows } = await query(`SELECT key, value, updated_at FROM site_config ORDER BY key`);
  return json(res, 200, { ok: true, data: rows });
}

// --- Reservations (kanban) ------------------------------------------------
//
// Los JOIN a `products` de acá NO filtran `deleted_at`: una reserva completada
// o cancelada tiene que seguir viéndose aunque después se borre el producto.
// (Borrar uno con reservas pending/confirmed ya lo bloquea `deleteProduct`.)

const RESERVATION_STATUSES = new Set(['pending', 'confirmed', 'completed', 'cancelled']);

async function listReservations(req, res) {
  const url = new URL(req.url, 'http://x');
  const status = url.searchParams.get('status');
  const where = [];
  const args = [];
  let i = 1;
  if (status) { where.push(`r.status = $${i++}`); args.push(status); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await query(
    `SELECT r.id, r.product_id, r.size_id, r.requested_type,
            p.name AS product_name, p.type AS product_type,
            c.name AS collection_name, c.accent_color,
            s.label AS size_label,
            r.client_name, r.client_email, r.client_phone,
            r.start_date, r.end_date, r.pickup_date,
            r.status, r.notes, r.whatsapp_sent_at,
            col.id AS color_id, col.label AS color_label, col.hex AS color_hex,
            r.created_at, r.updated_at
       FROM reservations r
       JOIN products p ON p.id = r.product_id
       LEFT JOIN LATERAL (
         SELECT col.name, col.accent_color
           FROM product_collections pc
           JOIN collections col ON col.id = pc.collection_id
          WHERE pc.product_id = p.id AND col.deleted_at IS NULL AND col.is_system = FALSE
          ORDER BY col.display_order, col.id
          LIMIT 1
       ) c ON TRUE
  LEFT JOIN sizes s ON s.id = r.size_id
  LEFT JOIN colors col ON col.id = r.color_id
       ${whereSql}
      ORDER BY r.created_at DESC
      LIMIT 500`,
    args,
  );
  return json(res, 200, { ok: true, data: rows });
}

async function getReservation(_req, res, id) {
  const numId = Number(id);
  const { rows } = await query(
    `SELECT r.*, p.name AS product_name, p.type AS product_type,
            c.name AS collection_name,
            s.label AS size_label,
            col.id AS color_id, col.label AS color_label, col.hex AS color_hex
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
      WHERE r.id = $1`,
    [numId],
  );
  if (!rows[0]) return json(res, 404, { ok: false, error: 'not_found' });
  return json(res, 200, { ok: true, data: rows[0] });
}

async function updateReservation(req, res, id) {
  const p = await readJsonBody(req).catch(() => null);
  if (!p) return json(res, 400, { ok: false, error: 'invalid_json' });
  const numId = Number(id);
  const { rows: existing } = await query(`SELECT id FROM reservations WHERE id = $1`, [numId]);
  if (!existing.length) return json(res, 404, { ok: false, error: 'not_found' });

  if (p.status !== undefined && !RESERVATION_STATUSES.has(p.status)) {
    return json(res, 400, { ok: false, error: 'invalid_status' });
  }

  const fields = [];
  const vals = [];
  let i = 1;
  if (p.status !== undefined) { fields.push(`status = $${i++}`); vals.push(p.status); }
  if (p.notes !== undefined)  { fields.push(`notes = $${i++}`);  vals.push(String(p.notes || '')); }
  if (!fields.length) return json(res, 400, { ok: false, error: 'nothing_to_update' });

  vals.push(numId);
  const { rows } = await query(
    `UPDATE reservations SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    vals,
  );
  return json(res, 200, { ok: true, data: rows[0] });
}

async function changeReservationStatus(req, res, id, newStatus) {
  const numId = Number(id);
  const { rowCount } = await query(
    `UPDATE reservations SET status = $1, updated_at = NOW() WHERE id = $2`,
    [newStatus, numId],
  );
  if (!rowCount) return json(res, 404, { ok: false, error: 'not_found' });
  return json(res, 200, { ok: true });
}

// --- Shop closures -------------------------------------------------------

async function listClosures(_req, res) {
  const { rows } = await query(
    `SELECT id, start_date, end_date, reason, created_at
       FROM shop_closures
      ORDER BY start_date DESC`,
  );
  return json(res, 200, { ok: true, data: rows });
}

async function createClosure(req, res) {
  const p = await readJsonBody(req).catch(() => null);
  if (!p) return json(res, 400, { ok: false, error: 'invalid_json' });
  if (!p.start_date || !p.end_date) {
    return json(res, 400, { ok: false, error: 'start_date_and_end_date_required' });
  }
  if (new Date(p.end_date) < new Date(p.start_date)) {
    return json(res, 400, { ok: false, error: 'end_before_start' });
  }
  const { rows } = await query(
    `INSERT INTO shop_closures (start_date, end_date, reason)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [p.start_date, p.end_date, String(p.reason || '')],
  );
  return json(res, 201, { ok: true, data: rows[0] });
}

async function deleteClosure(_req, res, id) {
  const numId = Number(id);
  const { rowCount } = await query(`DELETE FROM shop_closures WHERE id = $1`, [numId]);
  if (!rowCount) return json(res, 404, { ok: false, error: 'not_found' });
  return json(res, 200, { ok: true });
}

// --- Colección-Productos (Asignación M:N en Gestión General) ---------------
//
// Permiten asociar y remover productos directamente desde la vista de colecciones.
// Si un producto publicado se remueve de su única colección, se despublica
// automáticamente para respetar el gate.

async function listCollectionProducts(_req, res, id) {
  const numId = Number(id);
  const { rows: col } = await query(
    `SELECT id FROM collections WHERE id = $1 AND deleted_at IS NULL`,
    [numId],
  );
  if (!col[0]) return json(res, 404, { ok: false, error: 'not_found' });

  // Productos en la colección
  const { rows: associated } = await query(
    `SELECT p.id, p.sku, p.name, p.published
       FROM products p
       JOIN product_collections pc ON pc.product_id = p.id
      WHERE pc.collection_id = $1 AND p.deleted_at IS NULL
      ORDER BY p.name`,
    [numId],
  );

  // Candidatos (productos que no están en la colección)
  const { rows: candidates } = await query(
    `SELECT p.id, p.sku, p.name, p.published
       FROM products p
      WHERE p.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM product_collections pc
           WHERE pc.product_id = p.id AND pc.collection_id = $1
        )
      ORDER BY p.name`,
    [numId],
  );

  return json(res, 200, { ok: true, data: { associated, candidates } });
}

async function addCollectionProduct(req, res, id) {
  const numId = Number(id);
  const p = await readJsonBody(req).catch(() => null);
  if (!p || !p.product_id) return json(res, 400, { ok: false, error: 'invalid_input' });
  const pid = Number(p.product_id);

  const { rows: col } = await query(`SELECT id FROM collections WHERE id = $1 AND deleted_at IS NULL`, [numId]);
  const { rows: prod } = await query(`SELECT id FROM products WHERE id = $1 AND deleted_at IS NULL`, [pid]);
  if (!col[0] || !prod[0]) return json(res, 404, { ok: false, error: 'not_found' });

  await query(
    `INSERT INTO product_collections (product_id, collection_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [pid, numId],
  );

  return json(res, 200, { ok: true });
}

async function removeCollectionProduct(_req, res, id, productId) {
  const numId = Number(id);
  const pid = Number(productId);

  // Si el producto está publicado y esta es su única colección (excluyendo de
  // sistema), despublicarlo antes de remover.
  await tx(async (client) => {
    await client.query(
      `UPDATE products
          SET published = FALSE
        WHERE id = $1 AND published = TRUE AND deleted_at IS NULL
          AND (
            SELECT COUNT(*) FROM product_collections pc2
              JOIN collections col2 ON col2.id = pc2.collection_id
             WHERE pc2.product_id = $1 AND col2.deleted_at IS NULL AND col2.is_system = FALSE
          ) = 1`,
      [pid],
    );

    await client.query(
      `DELETE FROM product_collections WHERE collection_id = $1 AND product_id = $2`,
      [numId, pid],
    );
  });

  return json(res, 200, { ok: true });
}

// --- Users (gestión de usuarios del panel, solo admin) -------------------
//
// Tabla: `auth_users` (id, email, password_hash, name, role, active,
// last_login_at, created_at, updated_at). Roles: admin, operator, viewer.
// Reglas: no te podés desactivar a vos mismo, no podés cambiarte el rol a
// vos mismo, y siempre tiene que quedar al menos un admin activo.

const USER_ROLES = new Set(['admin', 'operator', 'viewer']);

async function listUsers(_req, res) {
  const { rows } = await query(
    `SELECT id, email, name, role, active, last_login_at, created_at, updated_at,
            two_factor_required, two_factor_enabled_at
       FROM auth_users
      ORDER BY created_at ASC, id ASC`,
  );
  return json(res, 200, { ok: true, data: rows });
}

async function getUser(_req, res, id) {
  const numId = Number(id);
  const { rows } = await query(
    `SELECT id, email, name, role, active, last_login_at, created_at, updated_at,
            two_factor_required, two_factor_enabled_at
       FROM auth_users WHERE id = $1`,
    [numId],
  );
  if (!rows[0]) return json(res, 404, { ok: false, error: 'not_found' });
  return json(res, 200, { ok: true, data: rows[0] });
}

async function createUser(req, res) {
  const p = await readJsonBody(req).catch(() => null);
  if (!p) return json(res, 400, { ok: false, error: 'invalid_json' });

  const email = String(p.email || '').trim().toLowerCase();
  const name = String(p.name || '').trim();
  const role = String(p.role || '').trim();
  const password = String(p.password || '');
  const active = p.active === undefined ? true : !!p.active;

  if (!isValidEmail(email)) return json(res, 400, { ok: false, error: 'invalid_email' });
  if (!name)               return json(res, 400, { ok: false, error: 'name_required' });
  if (!USER_ROLES.has(role)) return json(res, 400, { ok: false, error: 'invalid_role' });
  if (password.length < 8) return json(res, 400, { ok: false, error: 'password_too_short' });

  // Chequear unicidad antes de hashear para no gastar bcrypt en algo que va a fallar.
  const { rows: dup } = await query(`SELECT id FROM auth_users WHERE email = $1`, [email]);
  if (dup.length) return json(res, 409, { ok: false, error: 'email_in_use' });

  const hash = await hashPassword(password);
  const { rows } = await query(
    `INSERT INTO auth_users (email, password_hash, name, role, active, two_factor_required)
     VALUES ($1, $2, $3, $4, $5, TRUE)
     RETURNING id, email, name, role, active, last_login_at, created_at, updated_at,
               two_factor_required, two_factor_enabled_at`,
    [email, hash, name, role, active],
  );

  await recordAudit(req.user.id, 'user_create', '', { new_user_id: rows[0].id, email, role });
  return json(res, 201, { ok: true, data: rows[0] });
}

async function updateUser(req, res, id) {
  const p = await readJsonBody(req).catch(() => null);
  if (!p) return json(res, 400, { ok: false, error: 'invalid_json' });

  const numId = Number(id);
  const { rows: existing } = await query(`SELECT id, email FROM auth_users WHERE id = $1`, [numId]);
  if (!existing.length) return json(res, 404, { ok: false, error: 'not_found' });

  const fields = [];
  const vals = [];
  let i = 1;

  if (p.name !== undefined) {
    const name = String(p.name).trim();
    if (!name) return json(res, 400, { ok: false, error: 'name_required' });
    fields.push(`name = $${i++}`); vals.push(name);
  }

  if (p.role !== undefined) {
    const role = String(p.role).trim();
    if (!USER_ROLES.has(role)) return json(res, 400, { ok: false, error: 'invalid_role' });
    if (numId === req.user.id && role !== 'admin') {
      return json(res, 400, { ok: false, error: 'cannot_change_own_role' });
    }
    fields.push(`role = $${i++}`); vals.push(role);
  }

  if (p.active !== undefined) {
    const active = !!p.active;
    if (numId === req.user.id && !active) {
      return json(res, 400, { ok: false, error: 'cannot_deactivate_self' });
    }
    // Si estamos desactivando a un admin, verificar que no quede ninguno.
    if (!active) {
      const { rows: r } = await query(
        `SELECT role FROM auth_users WHERE id = $1 AND active = TRUE`,
        [numId],
      );
      if (r[0]?.role === 'admin') {
        const { rows: cnt } = await query(
          `SELECT COUNT(*)::int AS n FROM auth_users WHERE role = 'admin' AND active = TRUE AND id <> $1`,
          [numId],
        );
        if (cnt[0].n === 0) {
          return json(res, 409, { ok: false, error: 'last_admin' });
        }
      }
    }
    fields.push(`active = $${i++}`); vals.push(active);
  }

  if (!fields.length) return json(res, 400, { ok: false, error: 'nothing_to_update' });

  vals.push(numId);
  const { rows } = await query(
    `UPDATE auth_users SET ${fields.join(', ')} WHERE id = $${i}
       RETURNING id, email, name, role, active, last_login_at, created_at, updated_at,
                 two_factor_required, two_factor_enabled_at`,
    vals,
  );

  await recordAudit(req.user.id, 'user_update', '', { user_id: numId, changes: Object.keys(p).filter((k) => k !== 'password') });
  return json(res, 200, { ok: true, data: rows[0] });
}

async function resetUserPassword(req, res, id) {
  const p = await readJsonBody(req).catch(() => null);
  if (!p) return json(res, 400, { ok: false, error: 'invalid_json' });

  const numId = Number(id);
  const newPassword = String(p.new_password || p.password || '');
  if (newPassword.length < 8) return json(res, 400, { ok: false, error: 'password_too_short' });

  const { rows: existing } = await query(`SELECT id FROM auth_users WHERE id = $1`, [numId]);
  if (!existing.length) return json(res, 404, { ok: false, error: 'not_found' });

  const hash = await hashPassword(newPassword);
  await query(`UPDATE auth_users SET password_hash = $1 WHERE id = $2`, [hash, numId]);

  // Invalida refresh tokens existentes para que tenga que re-loguear.
  await query(`UPDATE auth_refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, [numId]);

  await recordAudit(req.user.id, 'user_reset_password', '', { user_id: numId });
  return json(res, 200, { ok: true });
}

async function beginFirstAdminTwoFactor(req, res, id) {
  const numId = Number(id);
  if (numId !== req.user.id) return json(res, 403, { ok: false, error: 'forbidden' });
  const { rows } = await query(
    `SELECT id, email, role, two_factor_secret
       FROM auth_users
      WHERE id = $1`, [numId],
  );
  const user = rows[0];
  if (!user) return json(res, 404, { ok: false, error: 'not_found' });
  const { rows: firstRows } = await query(
    `SELECT id FROM auth_users WHERE role = 'admin' ORDER BY created_at ASC, id ASC LIMIT 1`,
  );
  if (user.role !== 'admin' || firstRows[0]?.id !== user.id) {
    return json(res, 403, { ok: false, error: 'two_factor_setup_not_available' });
  }
  if (user.two_factor_secret) return json(res, 409, { ok: false, error: 'two_factor_already_enabled' });

  const secret = generateTotpSecret();
  await query(
    `UPDATE auth_users
        SET two_factor_required = TRUE, two_factor_pending_secret = $1
      WHERE id = $2`,
    [encryptTotpSecret(secret), user.id],
  );
  await recordAudit(req.user.id, 'two_factor_setup_begin', '', {});
  return json(res, 200, {
    ok: true,
    data: {
      otpauth_uri: totpUri({ email: user.email, issuer: 'Rebeca Admin', secret }),
      setup_token: signTwoFactorSetupToken({ userId: user.id, email: user.email }),
    },
  });
}

async function deleteUser(req, res, id) {
  // Soft delete: active = false. Preserva FKs de ventas/inventario históricos.
  const numId = Number(id);
  const { rows: existing } = await query(
    `SELECT id, role, active FROM auth_users WHERE id = $1`, [numId],
  );
  if (!existing.length) return json(res, 404, { ok: false, error: 'not_found' });
  const u = existing[0];
  if (numId === req.user.id) return json(res, 400, { ok: false, error: 'cannot_delete_self' });
  if (u.role === 'admin' && u.active) {
    const { rows: cnt } = await query(
      `SELECT COUNT(*)::int AS n FROM auth_users WHERE role = 'admin' AND active = TRUE AND id <> $1`,
      [numId],
    );
    if (cnt[0].n === 0) return json(res, 409, { ok: false, error: 'last_admin' });
  }

  await query(`UPDATE auth_users SET active = FALSE WHERE id = $1`, [numId]);
  // Revocar refresh tokens para forzar re-login.
  await query(`UPDATE auth_refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, [numId]);

  await recordAudit(req.user.id, 'user_delete', '', { user_id: numId });
  return json(res, 200, { ok: true });
}

// --- Permisos por sección -----------------------------------------------
//
// Roles: definidos en `./_section_perms.js` (TechStore). Las secciones
// de Rebeca que aún no se migraron (`collections`, `sizes`, etc.) NO
// están en el SECTION_PERMS de TechStore — cualquier ruta legacy que
// intente usarlas va a fallar con 403. Esto es intencional: cuando
// migremos una sección, la agregamos al `_section_perms.js`.

// --- Router ---------------------------------------------------------------

const routes = [
  // Collections (admin)
  { method: 'GET',    pattern: /^\/api\/admin\/collections\/?$/,           handler: listCollections,          section: 'collections' },
  { method: 'GET',    pattern: /^\/api\/admin\/collections\/(\d+)\/?$/,    handler: getCollection,            section: 'collections' },
  { method: 'POST',   pattern: /^\/api\/admin\/collections\/?$/,           handler: createCollection,         section: 'collections' },
  { method: 'PATCH',  pattern: /^\/api\/admin\/collections\/(\d+)\/?$/,    handler: updateCollection,         section: 'collections' },
  { method: 'DELETE', pattern: /^\/api\/admin\/collections\/(\d+)\/?$/,    handler: deleteCollection,         section: 'collections' },
  { method: 'GET',    pattern: /^\/api\/admin\/collections\/(\d+)\/products\/?$/, handler: listCollectionProducts, section: 'collections' },
  { method: 'POST',   pattern: /^\/api\/admin\/collections\/(\d+)\/products\/?$/, handler: addCollectionProduct,  section: 'collections' },
  { method: 'DELETE', pattern: /^\/api\/admin\/collections\/(\d+)\/products\/(\d+)\/?$/,
    handler: (req, res, colId) => {
      const parts = req.url.split('?')[0].split('/');
      const prodId = parts[parts.length - 1] || parts[parts.length - 2];
      return removeCollectionProduct(req, res, colId, prodId);
    },
    section: 'collections',
  },

  // Sizes (solo lectura)
  { method: 'GET',    pattern: /^\/api\/admin\/sizes\/?$/,                 handler: listSizes,                section: 'sizes' },

  // Size systems / Settings (admin escribe)
  { method: 'GET',    pattern: /^\/api\/admin\/size-systems\/?$/,               handler: listSizeSystems,        section: 'size_systems' },
  { method: 'POST',   pattern: /^\/api\/admin\/size-systems\/?$/,               handler: createSizeSystem,       section: 'size_systems' },
  { method: 'PATCH',  pattern: /^\/api\/admin\/size-systems\/(\d+)\/?$/,        handler: updateSizeSystem,       section: 'size_systems' },
  { method: 'POST',   pattern: /^\/api\/admin\/size-systems\/(\d+)\/duplicate\/?$/, handler: duplicateSizeSystem,  section: 'size_systems' },
  { method: 'DELETE', pattern: /^\/api\/admin\/size-systems\/(\d+)\/?$/,        handler: deleteSizeSystem,       section: 'size_systems' },

  // Color systems / Settings (admin escribe). CREATE del color va dentro del
  // PATCH al sistema (lista completa); quedan endpoints puntuales para
  // PATCH/DELETE de un color existente.
  { method: 'GET',    pattern: /^\/api\/admin\/color-systems\/?$/,              handler: listColorSystems,       section: 'color_systems' },
  { method: 'POST',   pattern: /^\/api\/admin\/color-systems\/?$/,              handler: createColorSystem,      section: 'color_systems' },
  { method: 'PATCH',  pattern: /^\/api\/admin\/color-systems\/(\d+)\/?$/,       handler: updateColorSystem,      section: 'color_systems' },
  { method: 'POST',   pattern: /^\/api\/admin\/color-systems\/(\d+)\/duplicate\/?$/, handler: duplicateColorSystem, section: 'color_systems' },
  { method: 'DELETE', pattern: /^\/api\/admin\/color-systems\/(\d+)\/?$/,       handler: deleteColorSystem,      section: 'color_systems' },
  { method: 'PATCH',  pattern: /^\/api\/admin\/colors\/(\d+)\/?$/,              handler: updateColor,            section: 'color_systems' },
  { method: 'DELETE', pattern: /^\/api\/admin\/colors\/(\d+)\/?$/,              handler: deleteColor,            section: 'color_systems' },

  // Products (admin escribe)
  { method: 'GET',    pattern: /^\/api\/admin\/products\/?$/,              handler: listProducts,             section: 'products' },
  { method: 'GET',    pattern: /^\/api\/admin\/products\/(\d+)\/?$/,       handler: getProduct,               section: 'products' },
  { method: 'POST',   pattern: /^\/api\/admin\/products\/?$/,              handler: createProduct,            section: 'products' },
  { method: 'PATCH',  pattern: /^\/api\/admin\/products\/(\d+)\/?$/,       handler: updateProduct,            section: 'products' },
  { method: 'DELETE', pattern: /^\/api\/admin\/products\/(\d+)\/?$/,       handler: deleteProduct,            section: 'products' },

  // Inventory (admin + operator escriben)
  { method: 'GET',    pattern: /^\/api\/admin\/inventory\/items\/?$/,           handler: listInvItems,         section: 'inventory' },
  { method: 'GET',    pattern: /^\/api\/admin\/inventory\/items\/(\d+)\/?$/,    handler: getInvItem,           section: 'inventory' },
  { method: 'POST',   pattern: /^\/api\/admin\/inventory\/items\/?$/,           handler: createInvItem,        section: 'inventory' },
  { method: 'PATCH',  pattern: /^\/api\/admin\/inventory\/items\/(\d+)\/?$/,    handler: updateInvItem,        section: 'inventory' },
  { method: 'DELETE', pattern: /^\/api\/admin\/inventory\/items\/(\d+)\/?$/,    handler: deleteInvItem,        section: 'inventory' },
  // Colores (Fase 3): activar y desactivar la dimensión de color en un
  // producto existente. La migración del stock entre product_sizes y
  // product_variants se hace atómicamente acá.
  { method: 'POST',   pattern: /^\/api\/admin\/inventory\/items\/(\d+)\/colors\/activate\/?$/,   handler: activateColors,   section: 'inventory' },
  { method: 'POST',   pattern: /^\/api\/admin\/inventory\/items\/(\d+)\/colors\/deactivate\/?$/, handler: deactivateColors, section: 'inventory' },
  { method: 'PATCH',  pattern: /^\/api\/admin\/inventory\/items\/(\d+)\/colors\/(\d+)\/?$/, handler: (req, res, id) => {
    const colorId = req.url.split('?')[0].match(/\/colors\/(\d+)\/?$/)?.[1];
    return setProductColorActive(req, res, id, colorId);
  }, section: 'inventory' },
  { method: 'POST',   pattern: /^\/api\/admin\/inventory\/items\/(\d+)\/adjust\/?$/, handler: adjustInvStock,    section: 'inventory' },
  { method: 'POST',   pattern: /^\/api\/admin\/inventory\/items\/(\d+)\/promo\/?$/,  handler: setItemPromo,     section: 'inventory' },
  { method: 'DELETE', pattern: /^\/api\/admin\/inventory\/items\/(\d+)\/promo\/?$/,  handler: deleteItemPromo,  section: 'inventory' },

  // Sales (admin + operator escriben)
  { method: 'GET',    pattern: /^\/api\/admin\/sales\/?$/,                 handler: listSales,                section: 'sales' },
  { method: 'GET',    pattern: /^\/api\/admin\/sales\/(\d+)\/?$/,          handler: getSale,                  section: 'sales' },
  { method: 'POST',   pattern: /^\/api\/admin\/sales\/?$/,                 handler: createSale,               section: 'sales' },
  { method: 'POST',   pattern: /^\/api\/admin\/sales\/(\d+)\/void\/?$/,    handler: voidSale,                 section: 'sales' },

  // Cash (admin + operator escriben)
  { method: 'GET',    pattern: /^\/api\/admin\/cash\/balance\/?$/,         handler: cashBalance,              section: 'cash' },
  { method: 'GET',    pattern: /^\/api\/admin\/cash\/movements\/?$/,       handler: listCashMovements,        section: 'cash' },
  { method: 'POST',   pattern: /^\/api\/admin\/cash\/movements\/?$/,       handler: createCashMovement,       section: 'cash' },

  // Media (admin escribe)
  { method: 'GET',    pattern: /^\/api\/admin\/media\/?$/,                 handler: listMedia,                section: 'media' },
  { method: 'POST',   pattern: /^\/api\/admin\/media\/?$/,                 handler: uploadMedia,              section: 'media' },
  { method: 'PATCH',  pattern: /^\/api\/admin\/media\/(\d+)\/?$/,          handler: updateMedia,              section: 'media' },
  { method: 'DELETE', pattern: /^\/api\/admin\/media\/(\d+)\/?$/,          handler: deleteMedia,              section: 'media' },
  { method: 'POST',   pattern: /^\/api\/admin\/media\/cleanup\/?$/,        handler: cleanupOrphans,           section: 'media' },

  // Modules / Page builder (admin escribe)
  { method: 'GET',    pattern: /^\/api\/admin\/modules\/?$/,               handler: listModules,              section: 'modules' },
  { method: 'POST',   pattern: /^\/api\/admin\/modules\/?$/,               handler: createModule,             section: 'modules' },
  { method: 'PATCH',  pattern: /^\/api\/admin\/modules\/(\d+)\/?$/,        handler: updateModule,             section: 'modules' },
  { method: 'DELETE', pattern: /^\/api\/admin\/modules\/(\d+)\/?$/,        handler: deleteModule,             section: 'modules' },
  { method: 'POST',   pattern: /^\/api\/admin\/modules\/(\d+)\/move-up\/?$/,    handler: (req, res, id) => moveModule(req, res, id, 'up'),   section: 'modules' },
  { method: 'POST',   pattern: /^\/api\/admin\/modules\/(\d+)\/move-down\/?$/,  handler: (req, res, id) => moveModule(req, res, id, 'down'), section: 'modules' },

  // Site config (admin escribe)
  { method: 'GET',    pattern: /^\/api\/admin\/site-config\/?$/,           handler: getSiteConfig,            section: 'site_config' },
  { method: 'PATCH',  pattern: /^\/api\/admin\/site-config\/?$/,           handler: updateSiteConfig,         section: 'site_config' },

  // Reservations (admin + operator escriben)
  { method: 'GET',    pattern: /^\/api\/admin\/reservations\/?$/,          handler: listReservations,         section: 'reservations' },
  { method: 'GET',    pattern: /^\/api\/admin\/reservations\/(\d+)\/?$/,   handler: getReservation,           section: 'reservations' },
  { method: 'PATCH',  pattern: /^\/api\/admin\/reservations\/(\d+)\/?$/,   handler: updateReservation,         section: 'reservations' },
  { method: 'POST',   pattern: /^\/api\/admin\/reservations\/(\d+)\/confirm\/?$/,   handler: (req, res, id) => changeReservationStatus(req, res, id, 'confirmed'),  section: 'reservations' },
  { method: 'POST',   pattern: /^\/api\/admin\/reservations\/(\d+)\/cancel\/?$/,    handler: (req, res, id) => changeReservationStatus(req, res, id, 'cancelled'),  section: 'reservations' },
  { method: 'POST',   pattern: /^\/api\/admin\/reservations\/(\d+)\/complete\/?$/,  handler: (req, res, id) => changeReservationStatus(req, res, id, 'completed'),  section: 'reservations' },

  // Closures (admin escribe)
  { method: 'GET',    pattern: /^\/api\/admin\/closures\/?$/,              handler: listClosures,             section: 'closures' },
  { method: 'POST',   pattern: /^\/api\/admin\/closures\/?$/,              handler: createClosure,            section: 'closures' },
  { method: 'DELETE', pattern: /^\/api\/admin\/closures\/(\d+)\/?$/,       handler: deleteClosure,            section: 'closures' },

  // Users (solo admin)
  { method: 'GET',    pattern: /^\/api\/admin\/users\/?$/,                      handler: listUsers,          section: 'users' },
  { method: 'GET',    pattern: /^\/api\/admin\/users\/(\d+)\/?$/,               handler: getUser,            section: 'users' },
  { method: 'POST',   pattern: /^\/api\/admin\/users\/?$/,                      handler: createUser,         section: 'users' },
  { method: 'PATCH',  pattern: /^\/api\/admin\/users\/(\d+)\/?$/,               handler: updateUser,         section: 'users' },
  { method: 'POST',   pattern: /^\/api\/admin\/users\/(\d+)\/reset-password\/?$/, handler: resetUserPassword, section: 'users' },
  { method: 'POST',   pattern: /^\/api\/admin\/users\/(\d+)\/2fa\/setup\/?$/, handler: beginFirstAdminTwoFactor, section: 'users' },
  { method: 'DELETE', pattern: /^\/api\/admin\/users\/(\d+)\/?$/,               handler: deleteUser,         section: 'users' },
];

export async function handleAdmin(req, res) {
  const url = req.url || '/';
  const method = req.method || 'GET';

  // Strip query string para el match de rutas
  const pathname = url.split('?')[0];

  if (pathname === '/api/admin/health') {
    return json(res, 200, { ok: true, scope: 'admin' });
  }

  for (const route of routes) {
    if (route.method !== method) continue;
    const m = route.pattern.exec(pathname);
    if (!m) continue;
    return protect(route.handler, route.section)(req, res, m[1]);
  }

  return json(res, 404, { ok: false, error: 'not_found' });
}
