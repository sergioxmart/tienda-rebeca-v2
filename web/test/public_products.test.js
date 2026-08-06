// Test del listado de products (público). El más complejo de los routers
// públicos por el filtrado por atributos.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { query } from '../server/lib/db.js';
import { listProducts } from '../server/routes/public/products.js';
import { mockReq, mockRes, parse } from './_helpers.js';

// `concurrency: false` evita que este test corra en paralelo con
// otros tests (admin_variants.test.js borra productos por name y podría
// borrar nuestro fixture).
describe('public products', { concurrency: false }, () => {

// Helper: inserta (o re-inserta) el producto de prueba con sus variants.
// Idempotente. Llamado al inicio de cada test para garantizar que el
// fixture existe sin importar el estado de la DB.
async function ensureFixture() {
  await query(
    `INSERT INTO attribute_values (attribute_id, value) VALUES (1, 'Rojo'), (1, 'Azul')
     ON CONFLICT (attribute_id, value) DO NOTHING`,
  );
  await query(`DELETE FROM products WHERE slug = 'test-public-fixture'`);
  const { rows: p } = await query(
    `INSERT INTO products (category_id, name, slug, brand, base_price, featured, active)
     VALUES (1, 'Test Public Fixture', 'test-public-fixture', 'TestBrand', 10000, TRUE, TRUE)
     RETURNING id`,
  );
  const pid = p[0].id;
  await query(`INSERT INTO product_attributes (product_id, attribute_id) VALUES ($1, 1) ON CONFLICT DO NOTHING`, [pid]);
  const { rows: av } = await query(
    `SELECT id, value FROM attribute_values WHERE attribute_id = 1 AND value IN ('Rojo','Azul')`,
  );
  const rojoId = av.find(a => a.value === 'Rojo').id;
  const azulId = av.find(a => a.value === 'Azul').id;
  const { rows: vars } = await query(
    `INSERT INTO product_variants (product_id, sku, stock, price, active) VALUES
       ($1, 'TEST-ROJO', 5, 10000, TRUE),
       ($1, 'TEST-AZUL', 3, 10000, TRUE)
     RETURNING id, sku`,
    [pid],
  );
  for (const v of vars) {
    const valueId = v.sku === 'TEST-ROJO' ? rojoId : azulId;
    await query(
      `INSERT INTO variant_attribute_values (variant_id, attribute_id, attribute_value_id) VALUES ($1, 1, $2)`,
      [v.id, valueId],
    );
  }
  return pid;
}

test('listProducts sin filtros devuelve el producto', async () => {
  await ensureFixture();
  const res = mockRes();
  await listProducts(mockReq(), res);
  const body = parse(res);
  assert.equal(res.statusCode, 200);
  const found = body.products.find(p => p.slug === 'test-public-fixture');
  assert.ok(found, 'producto de prueba no apareció');
  assert.equal(Number(found.total_stock), 8);  // 5 + 3 (pg NUMERIC viene como string)
});

test('listProducts filtra por attribute=color:Rojo', async () => {
  await ensureFixture();
  const req = mockReq();
  req.url = '/api/public/products?attribute=color:Rojo';
  const res = mockRes();
  await listProducts(req, res);
  const body = parse(res);
  const found = body.products.find(p => p.slug === 'test-public-fixture');
  assert.ok(found, 'producto con variante Roja debe aparecer');
});

test('listProducts filtra por attribute=color:Azul', async () => {
  await ensureFixture();
  const req = mockReq();
  req.url = '/api/public/products?attribute=color:Azul';
  const res = mockRes();
  await listProducts(req, res);
  const body = parse(res);
  const found = body.products.find(p => p.slug === 'test-public-fixture');
  assert.ok(found, 'producto con variante Azul debe aparecer');
});

test('listProducts filtra por attribute inexistente (0 resultados)', async () => {
  await ensureFixture();
  const req = mockReq();
  req.url = '/api/public/products?attribute=color:NoExisteColor';
  const res = mockRes();
  await listProducts(req, res);
  const body = parse(res);
  assert.equal(body.pagination.total, 0);
  assert.equal(body.products.length, 0);
});

test('listProducts paginación respeta page y limit', async () => {
  await ensureFixture();
  const req = mockReq();
  req.url = '/api/public/products?limit=1&page=1';
  const res = mockRes();
  await listProducts(req, res);
  const body = parse(res);
  assert.equal(body.pagination.limit, 1);
  assert.equal(body.pagination.page, 1);
  assert.equal(body.products.length, 1);
});

test('listProducts filtra por categoría', async () => {
  await ensureFixture();
  const req = mockReq();
  req.url = '/api/public/products?category=accesorios-telefono';
  const res = mockRes();
  await listProducts(req, res);
  const body = parse(res);
  assert.ok(body.pagination.total >= 1);
});

test('listProducts filtra por texto q', async () => {
  await ensureFixture();
  const req = mockReq();
  req.url = '/api/public/products?q=Public';  // matchea 'Test Public Fixture'
  const res = mockRes();
  await listProducts(req, res);
  const body = parse(res);
  const found = body.products.find(p => p.slug === 'test-public-fixture');
  assert.ok(found, 'q=Public debe matchear "Test Public Fixture"');
});

// Cleanup final
test('cleanup', async () => {
  await query(`DELETE FROM products WHERE slug = 'test-public-fixture'`);
  // NO cerramos el pool: otros tests del repo lo usan. El último
  // test que corra (sea este o cualquier otro) puede cerrarlo, pero
  // node:test cierra procesos al final de todos modos.
});

});
