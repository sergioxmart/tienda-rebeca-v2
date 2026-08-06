import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { clientIp } from '../lib/client-ip.js';

function mockReq({ headers = {}, remoteAddress = null } = {}) {
  return {
    headers,
    socket: remoteAddress !== null ? { remoteAddress } : {},
  };
}

test('preferencia: cf-connecting-ip gana sobre todo', () => {
  const req = mockReq({
    headers: {
      'cf-connecting-ip': '203.0.113.1',
      'x-forwarded-for':  '10.0.0.1, 10.0.0.2',
    },
    remoteAddress: '127.0.0.1',
  });
  assert.equal(clientIp(req), '203.0.113.1');
});

test('fallback: x-forwarded-for toma la primera IP', () => {
  const req = mockReq({
    headers: { 'x-forwarded-for': '10.0.0.5, 10.0.0.6, 10.0.0.7' },
    remoteAddress: '127.0.0.1',
  });
  assert.equal(clientIp(req), '10.0.0.5');
});

test('fallback: socket.remoteAddress si no hay headers de proxy', () => {
  const req = mockReq({ headers: {}, remoteAddress: '192.168.1.42' });
  assert.equal(clientIp(req), '192.168.1.42');
});

test('sin nada devuelve string vacío, no null ni undefined', () => {
  const req = mockReq({ headers: {}, remoteAddress: null });
  const out = clientIp(req);
  assert.equal(typeof out, 'string');
  assert.equal(out, '');
});

test('cf-connecting-ip con comas: solo la primera', () => {
  const req = mockReq({ headers: { 'cf-connecting-ip': '1.2.3.4, 5.6.7.8' } });
  assert.equal(clientIp(req), '1.2.3.4');
});

test('trimea espacios', () => {
  const req = mockReq({ headers: { 'cf-connecting-ip': '   1.2.3.4   ' } });
  assert.equal(clientIp(req), '1.2.3.4');
});
