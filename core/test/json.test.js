import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { json } from '../lib/json.js';

function mockRes() {
  const res = {
    headers: {},
    body: null,
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(body) { this.body = body; },
  };
  return res;
}

test('status 200 con body {ok:true}', () => {
  const res = mockRes();
  json(res, 200, { ok: true, data: { id: 1 } });
  assert.equal(res.status, 200);
  assert.equal(res.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(res.body), { ok: true, data: { id: 1 } });
});

test('status 401 con error', () => {
  const res = mockRes();
  json(res, 401, { ok: false, error: 'invalid_credentials' });
  assert.equal(res.status, 401);
  assert.deepEqual(JSON.parse(res.body), { ok: false, error: 'invalid_credentials' });
});

test('stringifica aunque le pasen algo raro (Date)', () => {
  const res = mockRes();
  const d = new Date('2026-07-24T20:00:00.000Z');
  json(res, 200, { ok: true, when: d });
  assert.equal(res.status, 200);
  assert.match(res.body, /2026-07-24T20:00:00/);
});
