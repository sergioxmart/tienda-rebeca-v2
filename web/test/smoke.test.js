// Smoke test: verifica que el worktree tiene la estructura esperada y que los
// módulos core se cargan sin error. No toca DB ni HTTP.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

test('worktree tiene la estructura esperada', () => {
  for (const rel of [
    'core/lib/auth.js',
    'core/lib/cookies.js',
    'core/lib/csrf.js',
    'core/lib/db.js',
    'core/lib/env.js',
    'core/lib/logger.js',
    'core/lib/static.js',
    'core/lib/uploads.js',
    'core/middleware/auth.js',
    'core/middleware/csrf.js',
    'core/middleware/rate-limit.js',
    'web/server/server.js',
    'web/server/routes/auth.js',
    'web/server/routes/public.js',
    'web/server/routes/admin/index.js',
    'web/server/routes/admin/legacy.js',
    'web/server/routes/admin/attributes.js',
    'web/server/routes/admin/attribute-values.js',
    'web/server/routes/admin/categories.js',
    'web/server/routes/admin/products.js',
    'web/server/routes/admin/variants.js',
    'web/server/routes/admin/product-media.js',
    'web/server/routes/admin/site-config.js',
    'web/server/routes/admin/users.js',
    'web/server/routes/admin/_helpers.js',
    'web/server/routes/admin/_section_perms.js',
    'web/server/routes/media.js',
    'web/admin/server.js',
    'web/webhook/server.mjs',
  ]) {
    assert.ok(existsSync(join(REPO_ROOT, rel)), `falta: ${rel}`);
  }
});

test('core/lib/auth.js carga sus exports esperadas', async () => {
  const mod = await import('../../core/lib/auth.js');
  for (const name of [
    'hashPassword', 'verifyPassword',
    'signAccessToken', 'verifyAccessToken',
    'generateRefreshToken', 'hashRefreshToken', 'refreshTokenExpiry',
    'ROLES', 'isValidRole',
  ]) {
    assert.ok(name in mod, `falta export: ${name}`);
  }
});

test('core/lib/cookies.js carga sus exports esperadas', async () => {
  const mod = await import('../../core/lib/cookies.js');
  for (const name of [
    'setRefreshCookie', 'setCsrfCookie', 'clearAuthCookies',
    'getRefreshFromCookie', 'getCsrfFromCookie',
  ]) {
    assert.ok(name in mod, `falta export: ${name}`);
  }
});

test('web/server/lib/auth.js re-exporta de core sin pisar nada', async () => {
  const web = await import('../server/lib/auth.js');
  const core = await import('../../core/lib/auth.js');
  // Las mismas exports (mismas referencias de funciones, idealmente)
  for (const name of ['hashPassword', 'signAccessToken', 'verifyAccessToken']) {
    assert.equal(web[name], core[name], `re-export roto en: ${name}`);
  }
});

test('webhook genérico de core valida firma + ref main', async () => {
  const fs = await import('node:fs/promises');
  const coreSrc = await fs.readFile(join(REPO_ROOT, 'core/webhook/server.js'), 'utf8');
  assert.match(coreSrc, /x-hub-signature-256/i, 'falta verificación de firma en core');
  assert.match(coreSrc, /refs\/heads\/main/, 'falta match del ref main en core');

  const webSrc = await fs.readFile(join(REPO_ROOT, 'web/webhook/server.mjs'), 'utf8');
  // El subdominio dedicado del webhook (deploy.<cliente>) es el patrón
  // genérico. Para TechStore aún no hay dominio, así que verificamos
  // que la doc/comentario lo mencione.
  assert.match(webSrc, /deploy\.\<cliente\>/, 'falta referencia al subdominio dedicado (deploy.<cliente>) en web');
  assert.match(webSrc, /path:\s*['"]\/['"]/, 'webhook cableado a path raíz (subdominio dedicado)');
  assert.match(webSrc, /createWebhookServer/, 'falta uso de createWebhookServer en web');
});
