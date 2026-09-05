// Pruebas de multimedia vinculada a variantes.

import { test, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { query, pool } from '../server/lib/db.js';
import {
  detachMediaFromVariant,
  matchProductMediaRoute,
} from '../server/routes/admin/product-media.js';
import { mockReq, mockRes, parse } from './_helpers.js';

const TEST_SLUG = 'test-media-detach';
let mediaId;
let variantId;
let productId;

before(async () => {
  await query('DELETE FROM products WHERE slug = $1', [TEST_SLUG]);
  const { rows: categories } = await query('SELECT id FROM categories ORDER BY id LIMIT 1');
  assert.ok(categories[0], 'se necesita una categoría seed para el fixture');

  const { rows: products } = await query(
    `INSERT INTO products (category_id, name, slug, base_price)
     VALUES ($1, 'Test media detach', $2, 100)
     RETURNING id`,
    [categories[0].id, TEST_SLUG],
  );
  productId = products[0].id;

  const { rows: variants } = await query(
    `INSERT INTO product_variants (product_id, sku, stock)
     VALUES ($1, 'TEST-MEDIA-DETACH', 1)
     RETURNING id`,
    [productId],
  );
  variantId = variants[0].id;

  const { rows: media } = await query(
    `INSERT INTO product_media (product_id, variant_id, kind, url)
     VALUES ($1, $2, 'image', '/media/test-media-detach.jpg')
     RETURNING id`,
    [productId, variantId],
  );
  mediaId = media[0].id;
  await query(
    'INSERT INTO product_media_variants (media_id, variant_id) VALUES ($1, $2)',
    [mediaId, variantId],
  );
});

after(async () => {
  await query('DELETE FROM products WHERE id = $1', [productId]);
  await pool.end();
});

test('el router conserva mediaId y variantId en la ruta de desvinculación', () => {
  const match = matchProductMediaRoute({
    method: 'DELETE',
    url: '/api/admin/media/2/variants/18',
  });

  assert.ok(match);
  assert.deepEqual(match.params, ['2', '18']);
});

test('detachMediaFromVariant elimina la relación y limpia variant_id', async () => {
  const res = mockRes();
  await detachMediaFromVariant(mockReq(), res, mediaId, variantId);

  assert.equal(res.statusCode, 200);
  assert.equal(parse(res).ok, true);

  const { rows: media } = await query(
    'SELECT variant_id FROM product_media WHERE id = $1',
    [mediaId],
  );
  const { rows: relation } = await query(
    'SELECT 1 FROM product_media_variants WHERE media_id = $1 AND variant_id = $2',
    [mediaId, variantId],
  );
  assert.equal(media[0].variant_id, null);
  assert.equal(relation.length, 0);
});

test('detachMediaFromVariant devuelve 404 si la relación ya no existe', async () => {
  const res = mockRes();
  await detachMediaFromVariant(mockReq(), res, mediaId, variantId);
  assert.equal(res.statusCode, 404);
  assert.equal(parse(res).error, 'not_found');
});
