import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as lib from '../lib/index.js';
import * as mw  from '../middleware/index.js';

test('core/lib/index.js exporta los modulos principales', () => {
  for (const name of [
    // auth
    'hashPassword', 'verifyPassword', 'signAccessToken', 'verifyAccessToken',
    'generateRefreshToken', 'hashRefreshToken', 'refreshTokenExpiry',
    'ROLES', 'isValidRole',
    // body
    'readJsonBody',
    // client-ip
    'clientIp',
    // cookies
    'setRefreshCookie', 'setCsrfCookie', 'clearAuthCookies',
    'getRefreshFromCookie', 'getCsrfFromCookie',
    // csrf
    'generateCsrfToken', 'verifyCsrf',
    // db
    'pool', 'query', 'tx', 'getClient',
    // email
    'isValidEmail',
    // env
    'env',
    // file
    'serveFile',
    // json
    'json',
    // logger
    'log', 'createLogger',
    // static
    'createStaticHandler', 'serveStatic', 'safeJoin',
    // uploads
    'upload', 'writeUploadFile', 'deleteUploadFile',
  ]) {
    assert.ok(name in lib, `falta export en lib/index.js: ${name}`);
  }
});

test('core/middleware/index.js exporta los middlewares', () => {
  for (const name of [
    'requireAuth', 'optionalAuth', 'requireRole',
    'csrf',
    'rateLimit',
    'securityHeaders',
  ]) {
    assert.ok(name in mw, `falta export en middleware/index.js: ${name}`);
  }
});

test('lib y mw se importan sin side effects raros', () => {
  // Si la carga de estos barrels disparara, por ejemplo, una conexión a DB,
  // este test detectaría un hang o un error. Como solo re-exportan, debería
  // ser instantáneo.
  assert.equal(typeof lib.pool, 'object');
  assert.equal(typeof lib.query, 'function');
  assert.equal(typeof mw.securityHeaders, 'function');
});
