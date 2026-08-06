// Test del flow de variants: el más complejo de los routers admin.
// Cubre creación, validación de unicidad (duplicate), y stock adjust.

import { test, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { query, pool, tx } from '../server/lib/db.js';
import {
  listVariants, getVariant, createVariant, updateVariant,
  deleteVariant, adjustVariantStock,
} from '../server/routes/admin/variants.js';
import { mockReq, mockRes, parse } from './_helpers.js';

before(async () => {
  // Limpia productos custom de tests anteriores. Mantiene el seed.
  await query(`DELETE FROM products WHERE name NOT IN ('Test fixture')`);
});

after(async () => {
  await pool.end();
});

test('createVariant rechaza sin attribute_values con 400', async () => {
  // Crear product
  const product = await query(
    `INSERT INTO products (category_id, name, slug, base_price)
     VALUES (1, 'Test fixture', 'test-fixture', 100) RETURNING id`,
  );
  const productId = product.rows[0].id;

  const res = mockRes();
  await createVariant(mockReq({ stock: 5 }), res, productId);
  assert.equal(res.statusCode, 400);
  const body = parse(res);
  assert.equal(body.error, 'invalid_payload');
  // El mensaje específico viene en `errors`
  assert.ok(body.errors.some(e => e.includes('attribute_values')));
});

test('createVariant crea variante con attribute_values nuevos', async () => {
  // Reusar el product del test anterior o crear uno nuevo
  const product = await query(
    `SELECT id FROM products WHERE name = 'Test fixture' ORDER BY id DESC LIMIT 1`,
  );
  const productId = product.rows[0].id;

  const res = mockRes();
  await createVariant(
    mockReq({ sku: 'TEST-A', stock: 5, attribute_values: [{ attribute_id: 1, value: 'Rojo' }] }),
    res,
    productId,
  );
  assert.equal(res.statusCode, 201);
  const body = parse(res);
  assert.equal(body.variant.sku, 'TEST-A');
  assert.equal(body.variant.stock, 5);
});

test('createVariant rechaza duplicado con 409', async () => {
  const product = await query(
    `SELECT id FROM products WHERE name = 'Test fixture' ORDER BY id DESC LIMIT 1`,
  );
  const productId = product.rows[0].id;

  const res = mockRes();
  await createVariant(
    mockReq({ sku: 'TEST-A-DUP', stock: 1, attribute_values: [{ attribute_id: 1, value: 'Rojo' }] }),
    res,
    productId,
  );
  assert.equal(res.statusCode, 409);
  const body = parse(res);
  assert.equal(body.error, 'duplicate_variant');
});

test('createVariant acepta combinación diferente', async () => {
  const product = await query(
    `SELECT id FROM products WHERE name = 'Test fixture' ORDER BY id DESC LIMIT 1`,
  );
  const productId = product.rows[0].id;

  const res = mockRes();
  await createVariant(
    mockReq({ sku: 'TEST-B', stock: 3, attribute_values: [{ attribute_id: 1, value: 'Azul' }] }),
    res,
    productId,
  );
  assert.equal(res.statusCode, 201);
  const body = parse(res);
  assert.equal(body.variant.sku, 'TEST-B');
});

test('adjustVariantStock cambia el stock', async () => {
  const product = await query(
    `SELECT id FROM products WHERE name = 'Test fixture' ORDER BY id DESC LIMIT 1`,
  );
  const productId = product.rows[0].id;
  const { rows } = await query(
    `SELECT id, stock FROM product_variants WHERE product_id = $1 AND sku = 'TEST-A'`,
    [productId],
  );
  const variantId = rows[0].id;

  const res = mockRes();
  await adjustVariantStock(mockReq({ stock: 99, reason: 'test' }), res, variantId);
  assert.equal(res.statusCode, 200);
  const body = parse(res);
  assert.equal(body.variant.stock, 99);
});

test('adjustVariantStock rechaza stock negativo', async () => {
  const product = await query(
    `SELECT id FROM products WHERE name = 'Test fixture' ORDER BY id DESC LIMIT 1`,
  );
  const productId = product.rows[0].id;
  const { rows } = await query(
    `SELECT id FROM product_variants WHERE product_id = $1 AND sku = 'TEST-A'`,
    [productId],
  );

  const res = mockRes();
  await adjustVariantStock(mockReq({ stock: -5 }), res, rows[0].id);
  assert.equal(res.statusCode, 400);
  const body = parse(res);
  assert.equal(body.error, 'stock_invalid');
});

test('listVariants devuelve variantes con attribute_values', async () => {
  const product = await query(
    `SELECT id FROM products WHERE name = 'Test fixture' ORDER BY id DESC LIMIT 1`,
  );
  const productId = product.rows[0].id;

  const res = mockRes();
  await listVariants({}, res, productId);
  assert.equal(res.statusCode, 200);
  const body = parse(res);
  assert.ok(body.variants.length >= 2);
  for (const v of body.variants) {
    assert.ok(Array.isArray(v.attribute_values));
  }
});

test('deleteVariant borra una variante', async () => {
  const product = await query(
    `SELECT id FROM products WHERE name = 'Test fixture' ORDER BY id DESC LIMIT 1`,
  );
  const productId = product.rows[0].id;
  const { rows } = await query(
    `SELECT id FROM product_variants WHERE product_id = $1 AND sku = 'TEST-B'`,
    [productId],
  );

  const res = mockRes();
  await deleteVariant({}, res, rows[0].id);
  assert.equal(res.statusCode, 200);

  const getRes = mockRes();
  await getVariant({}, getRes, rows[0].id);
  assert.equal(getRes.statusCode, 404);
});
