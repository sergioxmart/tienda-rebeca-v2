import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { securityHeaders } from '../middleware/security-headers.js';

function mockReqRes() {
  const req = { headers: {} };
  const res = { headers: {} };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  return { req, res, nextCalled: false, next() { mockReqRes.nextCalled = true; } };
}

test('setea X-Content-Type-Options: nosniff', () => {
  const { req, res, next } = mockReqRes();
  securityHeaders(req, res, next);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
});

test('setea Referrer-Policy: strict-origin-when-cross-origin', () => {
  const { req, res, next } = mockReqRes();
  securityHeaders(req, res, next);
  assert.equal(res.headers['referrer-policy'], 'strict-origin-when-cross-origin');
});

test('llama a next() una vez', () => {
  const { req, res, next } = mockReqRes();
  let calls = 0;
  const nextFn = () => { calls += 1; };
  securityHeaders(req, res, nextFn);
  assert.equal(calls, 1);
});

test('no muta req', () => {
  const { req, res, next } = mockReqRes();
  const before = { ...req };
  securityHeaders(req, res, next);
  assert.deepEqual(req, before);
});

test('permite Cloudflare Insights y la vista previa de la tienda', () => {
  const { req, res, next } = mockReqRes();
  securityHeaders(req, res, next);
  const csp = res.headers['content-security-policy'];
  assert.match(csp, /script-src[^;]*https:\/\/static\.cloudflareinsights\.com/);
  assert.match(csp, /connect-src[^;]*https:\/\/cloudflareinsights\.com/);
  assert.match(csp, /frame-src[^;]*https:\/\/rebecandrade\.com/);
});
