// Rutas admin para product_media (galería).
//
// En v1: fotos del producto (template), no por variante. Las variantes
// comparten las fotos del producto.
//
// El upload usa multer con memoryStorage (de core/lib/uploads.js): el
// archivo se valida (MIME, tamaño) y se escribe a
// `uploads/media/<yyyy>/<mm>/<uuid>.<ext>` con `writeUploadFile`. La URL
// resultante es lo que se guarda en product_media.url.
//
// Endpoints:
//   GET    /api/admin/media                     → lista con ?product_id=&kind=
//   POST   /api/admin/media                     → upload (multipart)
//   PATCH  /api/admin/media/:id                 → edita alt_text/display_order
//   POST   /api/admin/media/:id/attach          → reutiliza un archivo en una variante
//   DELETE /api/admin/media/:id                 → borrado definitivo
//   DELETE /api/admin/media/:id/variants/:id    → desvincula de una variante
//   POST   /api/admin/media/cleanup             → borra huérfanas >30d
//
// El borrado desde la biblioteca es definitivo. El editor de variantes usa
// la ruta de desvinculación y nunca elimina el archivo central.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { query } from '../../lib/db.js';
import { log } from '../../lib/logger.js';
import { json } from '../../lib/json.js';
import { upload, writeUploadFile, deleteUploadFile } from '../../lib/uploads.js';
import { env } from '../../lib/env.js';
import { protect, recordAudit, validators, validate, notFound, conflict } from './_helpers.js';

// --- Handlers -------------------------------------------------------------

export async function listMedia(req, res) {
  const url = new URL(req.url, 'http://x');
  const productId = url.searchParams.get('product_id');
  const variantId = url.searchParams.get('variant_id');
  const kind = url.searchParams.get('kind');
  const categoryId = url.searchParams.get('category_id');
  if (categoryId !== null && (!Number.isInteger(Number(categoryId)) || Number(categoryId) < 1)) {
    return json(res, 400, { ok: false, error: 'category_id_invalid' });
  }

  const where = ['deleted_at IS NULL'];
  const params = [];
  if (productId) { params.push(Number(productId)); where.push(`product_id = $${params.length}`); }
  if (variantId) {
    params.push(Number(variantId));
    where.push(`(product_media.variant_id = $${params.length} OR EXISTS (
      SELECT 1 FROM product_media_variants pmv
       WHERE pmv.media_id = product_media.id AND pmv.variant_id = $${params.length}
    ))`);
  }
  if (kind)      { params.push(kind);                  where.push(`kind = $${params.length}`); }
  if (categoryId) { params.push(Number(categoryId));  where.push(`category_id = $${params.length}`); }

  const { rows } = await query(
    `SELECT id, product_id, category_id, variant_id, kind, url, mime, size_bytes, width, height,
            alt_text, display_order, created_at
       FROM product_media
       WHERE ${where.join(' AND ')}
       ORDER BY display_order, id`,
    params,
  );
  // La biblioteca muestra archivos físicos únicos. Las asociaciones
  // antiguas podían haber creado varias filas con la misma URL; se ocultan
  // aquí para que no aparezcan como imágenes duplicadas.
  const visibleRows = !productId && !variantId
    ? rows.filter((item, index, list) => list.findIndex((candidate) => candidate.kind === item.kind && candidate.url === item.url) === index)
    : rows;
  return json(res, 200, { ok: true, media: visibleRows });
}

/**
 * Asocia una multimedia existente a una variante sin moverla de su ubicación
 * original. Se crea otra fila que reutiliza la misma URL física.
 */
export async function attachMedia(req, res, id) {
  const body = req.body || {};
  const productId = Number(body.product_id);
  const variantId = Number(body.variant_id);
  if (!Number.isInteger(productId) || productId < 1
      || !Number.isInteger(variantId) || variantId < 1) {
    return json(res, 400, { ok: false, error: 'product_and_variant_required' });
  }

  const { rows: source } = await query(
    `SELECT id, kind, url, mime, size_bytes, width, height, alt_text
       FROM product_media
      WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  if (source.length === 0) return notFound(res);

  const { rows: variant } = await query(
    'SELECT id FROM product_variants WHERE id = $1 AND product_id = $2',
    [variantId, productId],
  );
  if (variant.length === 0) return notFound(res);

  const item = source[0];
  const { rows: duplicate } = await query(
    `SELECT pm.id
       FROM product_media pm
      WHERE pm.url = $1 AND pm.deleted_at IS NULL
        AND (pm.variant_id = $2 OR EXISTS (
          SELECT 1 FROM product_media_variants pmv
           WHERE pmv.media_id = pm.id AND pmv.variant_id = $2
        ))`,
    [item.url, variantId],
  );
  if (duplicate.length > 0) return conflict(res, 'media_already_attached', { id: duplicate[0].id });

  const { rows } = await query(
    `INSERT INTO product_media_variants (media_id, variant_id)
     VALUES ($1, $2)
     RETURNING media_id, variant_id, created_at`,
    [item.id, variantId],
  );
  await recordAudit(req.user?.id, 'media.attach_variant', req.ip, {
    id: item.id, sourceId: item.id, productId, variantId,
  });
  return json(res, 201, { ok: true, media: { ...item, variant_id: rows[0].variant_id } });
}

export async function uploadMedia(req, res) {
  if ((req.headers['content-type'] || '').includes('application/json')) {
    const body = req.body || {};
    if (body.kind !== 'video_embed' || typeof body.url !== 'string' || !/^https:\/\//i.test(body.url)) {
      return json(res, 400, { ok: false, error: 'video_url_invalid' });
    }
    const productId = body.product_id ? Number(body.product_id) : null;
    const variantId = body.variant_id ? Number(body.variant_id) : null;
    if (!productId || !variantId) return json(res, 400, { ok: false, error: 'product_and_variant_required' });
    const { rows: variant } = await query(
      'SELECT id FROM product_variants WHERE id = $1 AND product_id = $2',
      [variantId, productId],
    );
    if (variant.length === 0) return notFound(res);
    const { rows: product } = await query('SELECT category_id FROM products WHERE id = $1', [productId]);
    const categoryId = body.category_id === undefined || body.category_id === null || body.category_id === ''
      ? product[0]?.category_id || null
      : Number(body.category_id);
    if (categoryId !== null && (!Number.isInteger(categoryId) || categoryId < 1)) {
      return json(res, 400, { ok: false, error: 'category_id_invalid' });
    }
    if (categoryId !== null) {
      const { rows: category } = await query('SELECT id FROM categories WHERE id = $1', [categoryId]);
      if (category.length === 0) return json(res, 400, { ok: false, error: 'category_not_found' });
    }
    const { rows } = await query(
      `INSERT INTO product_media (product_id, category_id, variant_id, kind, url, mime, alt_text, display_order)
       VALUES ($1, $2, $3, 'video_embed', $4, '', $5, $6)
       RETURNING id, product_id, category_id, variant_id, kind, url, mime, size_bytes, alt_text, display_order, created_at`,
      [productId, categoryId, variantId, body.url.trim(), body.alt_text ?? '', Number(body.display_order ?? 0)],
    );
    await recordAudit(req.user?.id, 'media.video_embed', req.ip, { id: rows[0].id, productId, variantId });
    return json(res, 201, { ok: true, media: rows[0] });
  }

  // multer procesa el multipart y guarda el archivo en req.file
  upload.single('file')(req, res, async (err) => {
    if (err) {
      log.warn('upload error', { msg: err.message });
      return json(res, 400, { ok: false, error: 'upload_failed', message: err.message });
    }
    if (!req.file) return json(res, 400, { ok: false, error: 'file_required' });

    // Escribir a disco (carpeta por año/mes). Devuelve la URL relativa.
    const result = await writeUploadFile(req.file, { subdir: 'media' });
    const { url, size_bytes } = result;

    // product_id puede no venir (huérfana, se asocia después)
    const body = req.body || {};
    const productId = body.product_id ? Number(body.product_id) : null;
    const variantId = body.variant_id ? Number(body.variant_id) : null;
    let categoryId = body.category_id === undefined || body.category_id === null || body.category_id === ''
      ? null
      : Number(body.category_id);
    if (categoryId !== null && (!Number.isInteger(categoryId) || categoryId < 1)) {
      await deleteUploadFile(url);
      return json(res, 400, { ok: false, error: 'category_id_invalid' });
    }
    if (productId !== null) {
      const { rows: p } = await query('SELECT id, category_id FROM products WHERE id = $1', [productId]);
      if (p.length === 0) {
        // Borrar el archivo que acabamos de escribir
        await deleteUploadFile(url);
        return notFound(res);
      }
      if (categoryId === null) categoryId = p[0].category_id;
    }
    if (categoryId !== null) {
      const { rows: category } = await query('SELECT id FROM categories WHERE id = $1', [categoryId]);
      if (category.length === 0) {
        await deleteUploadFile(url);
        return json(res, 400, { ok: false, error: 'category_not_found' });
      }
    }
    if (variantId !== null) {
      const { rows: variant } = await query(
        'SELECT id FROM product_variants WHERE id = $1 AND product_id = $2',
        [variantId, productId],
      );
      if (variant.length === 0) {
        await deleteUploadFile(url);
        return notFound(res);
      }
    }

    const { rows } = await query(
      `INSERT INTO product_media (product_id, category_id, variant_id, kind, url, mime, size_bytes, alt_text, display_order)
       VALUES ($1, $2, $3, 'image', $4, $5, $6, $7, $8)
       RETURNING id, product_id, category_id, variant_id, kind, url, mime, size_bytes, alt_text, display_order, created_at`,
      [productId, categoryId, variantId, url, req.file.mimetype || '', size_bytes, body.alt_text ?? '', body.display_order ?? 0],
    );
    await recordAudit(req.user?.id, 'media.upload', req.ip, { id: rows[0].id, productId });
    log.info('media uploaded', { id: rows[0].id, url, size: size_bytes, by: req.user?.email });
    return json(res, 201, { ok: true, media: rows[0] });
  });
}

export async function updateMedia(req, res, id) {
  const { rows: existing } = await query('SELECT id FROM product_media WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (existing.length === 0) return notFound(res);

  const body = req.body || {};
  if (!validate(res, body, [
    validators.optionalString(body.alt_text, 'alt_text', { max: 500 }),
    body.display_order !== undefined && validators.int(body.display_order, 'display_order'),
    body.category_id !== undefined && body.category_id !== null && validators.int(body.category_id, 'category_id', { min: 1 }),
  ])) return;

  const fields = [];
  const values = [];
  let i = 1;
  if (body.alt_text !== undefined)      { fields.push(`alt_text = $${i++}`);      values.push(body.alt_text); }
  if (body.display_order !== undefined) { fields.push(`display_order = $${i++}`); values.push(body.display_order); }
  if (body.category_id !== undefined) {
    if (body.category_id !== null) {
      const { rows: category } = await query('SELECT id FROM categories WHERE id = $1', [Number(body.category_id)]);
      if (category.length === 0) return json(res, 400, { ok: false, error: 'category_not_found' });
    }
    fields.push(`category_id = $${i++}`);
    values.push(body.category_id === null ? null : Number(body.category_id));
  }
  if (fields.length === 0) return json(res, 400, { ok: false, error: 'nothing_to_update' });
  values.push(id);

  const { rows } = await query(
    `UPDATE product_media SET ${fields.join(', ')} WHERE id = $${i}
      RETURNING id, product_id, category_id, variant_id, kind, url, mime, size_bytes, alt_text, display_order, created_at`,
    values,
  );
  await recordAudit(req.user?.id, 'media.update', req.ip, { id, fields: Object.keys(body) });
  return json(res, 200, { ok: true, media: rows[0] });
}

export async function detachMediaFromVariant(req, res, mediaId, variantId) {
  const { rows: media } = await query(
    'SELECT id, variant_id FROM product_media WHERE id = $1 AND deleted_at IS NULL',
    [mediaId],
  );
  if (media.length === 0) return notFound(res);

  const relation = await query(
    'DELETE FROM product_media_variants WHERE media_id = $1 AND variant_id = $2',
    [mediaId, variantId],
  );
  let detached = relation.rowCount > 0;
  if (media[0].variant_id === Number(variantId)) {
    const result = await query(
      'UPDATE product_media SET variant_id = NULL WHERE id = $1 AND variant_id = $2',
      [mediaId, variantId],
    );
    detached = detached || result.rowCount > 0;
  }
  if (!detached) return notFound(res);

  await recordAudit(req.user?.id, 'media.detach_variant', req.ip, { mediaId, variantId });
  return json(res, 200, { ok: true });
}

export async function deleteMedia(req, res, id) {
  const { rows: existing } = await query('SELECT id, url FROM product_media WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (existing.length === 0) return notFound(res);

  await query('DELETE FROM product_media WHERE id = $1', [id]);
  const { rows: references } = await query(
    'SELECT id FROM product_media WHERE url = $1 AND deleted_at IS NULL LIMIT 1',
    [existing[0].url],
  );
  if (references.length === 0) await deleteUploadFile(existing[0].url);
  await recordAudit(req.user?.id, 'media.delete', req.ip, { id });
  return json(res, 200, { ok: true });
}

// Borra archivos de huérfanas (product_id NULL, deleted_at < NOW() - 30d).
// Hard-delete: borra la fila Y el archivo del disco.
export async function cleanupOrphans(req, res) {
  const { rows: orphans } = await query(
    `SELECT id, url FROM product_media
       WHERE deleted_at IS NOT NULL
         AND deleted_at < NOW() - INTERVAL '30 days'`,
  );
  for (const o of orphans) {
    try { await deleteUploadFile(o.url); } catch (e) { /* best effort */ }
    await query('DELETE FROM product_media WHERE id = $1', [o.id]);
  }
  await recordAudit(req.user?.id, 'media.cleanup', req.ip, { count: orphans.length });
  log.info('media cleanup', { count: orphans.length, by: req.user?.email });
  return json(res, 200, { ok: true, deleted: orphans.length });
}

// --- Router ---------------------------------------------------------------

const routes = [
  { method: 'GET',    pattern: /^\/api\/admin\/media\/?$/,                  handler: listMedia,     section: 'media' },
  { method: 'POST',   pattern: /^\/api\/admin\/media\/?$/,                  handler: uploadMedia,   section: 'media' },
  { method: 'POST',   pattern: /^\/api\/admin\/media\/(\d+)\/attach\/?$/, handler: attachMedia,  section: 'media' },
  { method: 'DELETE', pattern: /^\/api\/admin\/media\/(\d+)\/variants\/(\d+)\/?$/, handler: detachMediaFromVariant, section: 'media' },
  { method: 'PATCH',  pattern: /^\/api\/admin\/media\/(\d+)\/?$/,           handler: updateMedia,   section: 'media' },
  { method: 'DELETE', pattern: /^\/api\/admin\/media\/(\d+)\/?$/,           handler: deleteMedia,   section: 'media' },
  { method: 'POST',   pattern: /^\/api\/admin\/media\/cleanup\/?$/,         handler: cleanupOrphans, section: 'media' },
];

export async function tryHandleProductMedia(req, res) {
  const method = req.method || 'GET';
  const pathname = (req.url || '/').split('?')[0];
  for (const route of routes) {
    if (route.method !== method) continue;
    const m = route.pattern.exec(pathname);
    if (!m) continue;
    return protect(route.handler, route.section)(req, res, m[1]) || true;
  }
  return false;
}
