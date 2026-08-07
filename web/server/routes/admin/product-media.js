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
//   DELETE /api/admin/media/:id                 → soft-delete (deleted_at=NOW())
//   POST   /api/admin/media/cleanup             → borra huérfanas >30d
//
// Soft-delete: cuando se borra una foto, se setea deleted_at=NOW() y se
// borra el archivo del disco. Si el product_id es NULL (huérfana) y
// deleted_at < NOW() - 30d, el cleanup las borra definitivamente.

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

  const where = ['deleted_at IS NULL'];
  const params = [];
  if (productId) { params.push(Number(productId)); where.push(`product_id = $${params.length}`); }
  if (variantId) { params.push(Number(variantId)); where.push(`variant_id = $${params.length}`); }
  if (kind)      { params.push(kind);                  where.push(`kind = $${params.length}`); }

  const { rows } = await query(
    `SELECT id, product_id, variant_id, kind, url, mime, size_bytes, width, height,
            alt_text, display_order, created_at
       FROM product_media
       WHERE ${where.join(' AND ')}
       ORDER BY display_order, id`,
    params,
  );
  return json(res, 200, { ok: true, media: rows });
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
    const { rows } = await query(
      `INSERT INTO product_media (product_id, variant_id, kind, url, mime, alt_text, display_order)
       VALUES ($1, $2, 'video_embed', $3, '', $4, $5)
       RETURNING id, product_id, variant_id, kind, url, mime, size_bytes, alt_text, display_order, created_at`,
      [productId, variantId, body.url.trim(), body.alt_text ?? '', Number(body.display_order ?? 0)],
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
    if (productId !== null) {
      const { rows: p } = await query('SELECT id FROM products WHERE id = $1', [productId]);
      if (p.length === 0) {
        // Borrar el archivo que acabamos de escribir
        await deleteUploadFile(url);
        return notFound(res);
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
      `INSERT INTO product_media (product_id, variant_id, kind, url, mime, size_bytes, alt_text, display_order)
       VALUES ($1, $2, 'image', $3, $4, $5, $6, $7)
       RETURNING id, product_id, variant_id, kind, url, mime, size_bytes, alt_text, display_order, created_at`,
      [productId, variantId, url, req.file.mimetype || '', size_bytes, body.alt_text ?? '', body.display_order ?? 0],
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
  ])) return;

  const fields = [];
  const values = [];
  let i = 1;
  if (body.alt_text !== undefined)      { fields.push(`alt_text = $${i++}`);      values.push(body.alt_text); }
  if (body.display_order !== undefined) { fields.push(`display_order = $${i++}`); values.push(body.display_order); }
  if (fields.length === 0) return json(res, 400, { ok: false, error: 'nothing_to_update' });
  values.push(id);

  const { rows } = await query(
    `UPDATE product_media SET ${fields.join(', ')} WHERE id = $${i}
      RETURNING id, product_id, variant_id, kind, url, mime, size_bytes, alt_text, display_order, created_at`,
    values,
  );
  await recordAudit(req.user?.id, 'media.update', req.ip, { id, fields: Object.keys(body) });
  return json(res, 200, { ok: true, media: rows[0] });
}

export async function deleteMedia(req, res, id) {
  const { rows: existing } = await query('SELECT id, url FROM product_media WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (existing.length === 0) return notFound(res);

  await query('UPDATE product_media SET deleted_at = NOW() WHERE id = $1', [id]);
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
