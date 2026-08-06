// Test del CRUD de attributes. Llama los handlers directamente
// (sin pasar por protect/requireAuth) — eso ya está cubierto por el
// HTTP test en la prueba manual.
//
// Pre-requisito: la DB 'techstore' existe y tiene aplicadas las
// migrations 001-008. Se corre con `npm run test:web` que carga .env.

import { test, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { query, pool } from '../server/lib/db.js';
import {
  listAttributes,
  getAttribute,
  createAttribute,
  updateAttribute,
  deleteAttribute,
} from '../server/routes/admin/attributes.js';
import { mockReq, mockRes, parse } from './_helpers.js';

before(async () => {
  // Limpia los atributos custom de tests anteriores para que el count sea
  // predecible. NO toca los 5 atributos seed (slug IN (...))
  await query(
    `DELETE FROM attributes WHERE slug NOT IN (
       'color', 'modelo-telefono', 'tipo-conexion', 'largo', 'capacidad-carga'
     )`,
  );
});

after(async () => {
  await pool.end();
});

test('listAttributes devuelve los 5 atributos seed', async () => {
  const res = mockRes();
  await listAttributes({}, res);
  const body = parse(res);
  assert.equal(res.statusCode, 200);
  assert.equal(body.ok, true);
  assert.equal(body.attributes.length, 5);
  const slugs = body.attributes.map((a) => a.slug);
  assert.ok(slugs.includes('color'));
  assert.ok(slugs.includes('modelo-telefono'));
});

test('createAttribute crea un atributo nuevo', async () => {
  const res = mockRes();
  await createAttribute(mockReq({ name: 'Material', type: 'text' }), res);
  const body = parse(res);
  assert.equal(res.statusCode, 201);
  assert.equal(body.ok, true);
  assert.equal(body.attribute.name, 'Material');
  assert.equal(body.attribute.slug, 'material');
  assert.equal(body.attribute.type, 'text');
  assert.equal(body.attribute.active, true);
});

test('createAttribute rechaza slug duplicado con 409', async () => {
  const res = mockRes();
  await createAttribute(mockReq({ name: 'Color', slug: 'color' }), res);
  assert.equal(res.statusCode, 409);
  const body = parse(res);
  assert.equal(body.error, 'slug_already_exists');
});

test('createAttribute rechaza type inválido con 400', async () => {
  const res = mockRes();
  await createAttribute(mockReq({ name: 'X', type: 'enum' }), res);
  assert.equal(res.statusCode, 400);
  const body = parse(res);
  assert.equal(body.error, 'invalid_payload');
});

test('createAttribute rechaza sin name con 400', async () => {
  const res = mockRes();
  await createAttribute(mockReq({}), res);
  assert.equal(res.statusCode, 400);
});

test('getAttribute devuelve un atributo existente', async () => {
  const res = mockRes();
  await getAttribute({}, res, 1);
  const body = parse(res);
  assert.equal(res.statusCode, 200);
  assert.equal(body.attribute.id, 1);
  assert.equal(body.attribute.slug, 'color');
});

test('getAttribute devuelve 404 si no existe', async () => {
  const res = mockRes();
  await getAttribute({}, res, 999999);
  assert.equal(res.statusCode, 404);
});

test('updateAttribute PATCHea solo los campos provistos', async () => {
  // Crear
  const createRes = mockRes();
  await createAttribute(mockReq({ name: 'Temp attr' }), createRes);
  const { id, slug: originalSlug } = parse(createRes).attribute;

  // PATCH solo display_order
  const res = mockRes();
  await updateAttribute(mockReq({ display_order: 99 }), res, id);
  const body = parse(res);
  assert.equal(res.statusCode, 200);
  assert.equal(body.attribute.display_order, 99);
  assert.equal(body.attribute.slug, originalSlug); // no cambió
});

test('updateAttribute rechaza PATCH vacío con 400', async () => {
  const res = mockRes();
  await updateAttribute(mockReq({}), res, 1);
  assert.equal(res.statusCode, 400);
  const body = parse(res);
  assert.equal(body.error, 'nothing_to_update');
});

test('updateAttribute devuelve 404 si no existe', async () => {
  const res = mockRes();
  await updateAttribute(mockReq({ name: 'x' }), res, 999999);
  assert.equal(res.statusCode, 404);
});

test('deleteAttribute borra un atributo sin uso', async () => {
  // Crear
  const createRes = mockRes();
  await createAttribute(mockReq({ name: 'Para borrar' }), createRes);
  const { id } = parse(createRes).attribute;

  const res = mockRes();
  await deleteAttribute(mockReq(), res, id);
  assert.equal(res.statusCode, 200);

  // Verificar que ya no existe
  const getRes = mockRes();
  await getAttribute({}, getRes, id);
  assert.equal(getRes.statusCode, 404);
});

test('deleteAttribute devuelve 404 si no existe', async () => {
  const res = mockRes();
  await deleteAttribute({}, res, 999999);
  assert.equal(res.statusCode, 404);
});
