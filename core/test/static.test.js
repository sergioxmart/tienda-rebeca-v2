import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, get as httpGet } from 'node:http';
import { createStaticHandler } from '../lib/static.js';

// Setup: tmp dir con un par de HTMLs en store/ y admin/
function setupTmp() {
  const dir = mkdtempSync(join(tmpdir(), 'static-factory-'));
  const storeDir = join(dir, 'store');
  const adminDir = join(dir, 'admin');
  mkdirSync(storeDir, { recursive: true });
  mkdirSync(adminDir, { recursive: true });
  writeFileSync(join(storeDir, 'index.html'), '<h1>STORE</h1>');
  writeFileSync(join(adminDir, 'index.html'), '<h1>ADMIN</h1>');
  writeFileSync(join(storeDir, 'app.js'), 'console.log("store")');
  writeFileSync(join(adminDir, 'app.js'), 'console.log("admin")');
  return { dir, storeDir, adminDir };
}

function startServer(handler) {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => handler(req, res));
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      resolve({ srv, port });
    });
  });
}

function get(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = httpGet({ host: '127.0.0.1', port, path, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end',  () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
  });
}

test('createStaticHandler requiere publicDir', () => {
  assert.throws(() => createStaticHandler({}), /publicDir es obligatorio/);
});

test('sirve store/ en "/"', async () => {
  const { dir } = setupTmp();
  const handler = createStaticHandler({ publicDir: dir });
  const { srv, port } = await startServer(handler);
  try {
    const res = await get(port, '/');
    assert.equal(res.status, 200);
    assert.match(res.body, /STORE/);
  } finally { srv.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('sirve admin/ en "/admin/"', async () => {
  const { dir } = setupTmp();
  const handler = createStaticHandler({ publicDir: dir });
  const { srv, port } = await startServer(handler);
  try {
    const res = await get(port, '/admin/');
    assert.equal(res.status, 200);
    assert.match(res.body, /ADMIN/);
  } finally { srv.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('sirve admin/ en la raíz para un hostname dedicado', async () => {
  const { dir } = setupTmp();
  const handler = createStaticHandler({ publicDir: dir, adminPath: '/' });
  const { srv, port } = await startServer(handler);
  try {
    const res = await get(port, '/usuarios');
    assert.equal(res.status, 200);
    assert.match(res.body, /ADMIN/);
  } finally { srv.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('SPA fallback: /admin/users → admin/index.html', async () => {
  const { dir } = setupTmp();
  const handler = createStaticHandler({ publicDir: dir });
  const { srv, port } = await startServer(handler);
  try {
    const res = await get(port, '/admin/usuarios');
    assert.equal(res.status, 200);
    assert.match(res.body, /ADMIN/);
  } finally { srv.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('SPA fallback: /cualquier-ruta → store/index.html', async () => {
  const { dir } = setupTmp();
  const handler = createStaticHandler({ publicDir: dir });
  const { srv, port } = await startServer(handler);
  try {
    const res = await get(port, '/colecciones/novias');
    assert.equal(res.status, 200);
    assert.match(res.body, /STORE/);
  } finally { srv.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('asset directo: /app.js sirve el del store', async () => {
  const { dir } = setupTmp();
  const handler = createStaticHandler({ publicDir: dir });
  const { srv, port } = await startServer(handler);
  try {
    const res = await get(port, '/app.js');
    assert.equal(res.status, 200);
    assert.match(res.body, /console\.log\("store"\)/);
  } finally { srv.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('asset directo: /admin/app.js sirve el del admin', async () => {
  const { dir } = setupTmp();
  const handler = createStaticHandler({ publicDir: dir });
  const { srv, port } = await startServer(handler);
  try {
    const res = await get(port, '/admin/app.js');
    assert.equal(res.status, 200);
    assert.match(res.body, /console\.log\("admin"\)/);
  } finally { srv.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('rango: Range: bytes=0-3 responde 206 con slice', async () => {
  const { dir } = setupTmp();
  const handler = createStaticHandler({ publicDir: dir });
  const { srv, port } = await startServer(handler);
  try {
    const res = await get(port, '/app.js', { Range: 'bytes=0-2' });
    assert.equal(res.status, 206);
    assert.equal(res.body, 'con');
  } finally { srv.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('paths custom: storePath="/web", adminPath="/panel"', async () => {
  const { dir } = setupTmp();
  const handler = createStaticHandler({ publicDir: dir, storePath: '/web', adminPath: '/panel' });
  const { srv, port } = await startServer(handler);
  try {
    const res1 = await get(port, '/web/');
    const res2 = await get(port, '/panel/');
    assert.equal(res1.status, 200);
    assert.match(res1.body, /STORE/);
    assert.equal(res2.status, 200);
    assert.match(res2.body, /ADMIN/);
  } finally { srv.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('content-type correcto por extensión', async () => {
  const { dir } = setupTmp();
  const handler = createStaticHandler({ publicDir: dir });
  const { srv, port } = await startServer(handler);
  try {
    const res = await get(port, '/app.js');
    assert.match(res.headers['content-type'], /application\/javascript/);
  } finally { srv.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('safeJoin: null si el path sale del base (path traversal)', async () => {
  const { safeJoin } = await import('../lib/static.js');
  const base = '/tmp/store';
  assert.equal(safeJoin(base, '/../../../etc/passwd'), null);
  assert.equal(safeJoin(base, '/foo/../../escape'), null);
});

test('safeJoin: devuelve el path normalizado si está dentro del base', async () => {
  const { safeJoin } = await import('../lib/static.js');
  const base = '/tmp/store';
  const out = safeJoin(base, '/index.html');
  assert.ok(out, 'debería devolver un path');
  assert.match(out, /index\.html$/);
});

// Nota: el path traversal via HTTP no se puede testear con la API de URL de
// Node (normaliza /.. agresivamente y safeJoin nunca ve el path crudo). El
// unit de safeJoin cubre la lógica; un E2E real (curl + server deployado)
// complementa.
