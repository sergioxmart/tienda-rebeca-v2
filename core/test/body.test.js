import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Readable } from 'node:stream';
import { readJsonBody } from '../lib/body.js';

function reqFromString(s) {
  return Readable.from([Buffer.from(s, 'utf8')]);
}

test('JSON válido → objeto', async () => {
  const req = reqFromString('{"a":1,"b":"x"}');
  const body = await readJsonBody(req);
  assert.deepEqual(body, { a: 1, b: 'x' });
});

test('body vacío → {} (no error)', async () => {
  const req = reqFromString('');
  const body = await readJsonBody(req);
  assert.deepEqual(body, {});
});

test('JSON inválido → reject con Error("invalid_json")', async () => {
  const req = reqFromString('{no json}');
  await assert.rejects(
    readJsonBody(req),
    (err) => err instanceof Error && err.message === 'invalid_json',
  );
});

test('JSON con unicode y caracteres especiales', async () => {
  const req = reqFromString('{"nombre":"Rebéca","emoji":"🎉"}');
  const body = await readJsonBody(req);
  assert.equal(body.nombre, 'Rebéca');
  assert.equal(body.emoji, '🎉');
});

test('acepta arrays como top-level', async () => {
  const req = reqFromString('[1,2,3]');
  const body = await readJsonBody(req);
  assert.deepEqual(body, [1, 2, 3]);
});
