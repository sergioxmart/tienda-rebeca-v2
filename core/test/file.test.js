import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { createServer } from 'node:http';
import { get as httpGet } from 'node:http';
import { serveFile } from '../lib/file.js';

function setupFile() {
  const dir = mkdtempSync(join(tmpdir(), 'serve-file-'));
  const path = join(dir, 'test.txt');
  writeFileSync(path, 'hello world');
  return { dir, path };
}

function startHandler(handler) {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => handler(req, res));
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
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

test('sirve archivo 200 con content-type por default', async () => {
  const { dir, path } = setupFile();
  const { srv, port } = await startHandler((req, res) => serveFile(path, req, res));
  try {
    const res = await get(port, '/');
    assert.equal(res.status, 200);
    assert.equal(res.body, 'hello world');
    assert.match(res.headers['content-type'], /text\/plain/);
  } finally { srv.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('archivo inexistente → 404', async () => {
  const { dir } = setupFile();
  const { srv, port } = await startHandler((req, res) => serveFile(join(dir, 'no.txt'), req, res));
  try {
    const res = await get(port, '/');
    assert.equal(res.status, 404);
  } finally { srv.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('rango: bytes=0-4 → 206 con slice', async () => {
  const { dir, path } = setupFile();
  const { srv, port } = await startHandler((req, res) => serveFile(path, req, res));
  try {
    const res = await get(port, '/', { Range: 'bytes=0-4' });
    assert.equal(res.status, 206);
    assert.equal(res.body, 'hello');
  } finally { srv.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('rango inválido → 416', async () => {
  const { dir, path } = setupFile();
  const { srv, port } = await startHandler((req, res) => serveFile(path, req, res));
  try {
    const res = await get(port, '/', { Range: 'bytes=999-1000' });
    assert.equal(res.status, 416);
  } finally { srv.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('contentTypes custom tiene precedencia', async () => {
  const { dir, path } = setupFile();
  const { srv, port } = await startHandler((req, res) => serveFile(path, req, res, {
    contentTypes: { '.txt': 'application/x-test' },
  }));
  try {
    const res = await get(port, '/');
    assert.equal(res.headers['content-type'], 'application/x-test');
  } finally { srv.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('cacheControl null no setea el header', async () => {
  const { dir, path } = setupFile();
  const { srv, port } = await startHandler((req, res) => serveFile(path, req, res, {
    cacheControl: null,
  }));
  try {
    const res = await get(port, '/');
    assert.equal(res.headers['cache-control'], undefined);
  } finally { srv.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('alwaysAcceptRanges=true setea Accept-Ranges sin range', async () => {
  const { dir, path } = setupFile();
  const { srv, port } = await startHandler((req, res) => serveFile(path, req, res, {
    alwaysAcceptRanges: true,
  }));
  try {
    const res = await get(port, '/');
    assert.equal(res.headers['accept-ranges'], 'bytes');
  } finally { srv.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('default NO setea Accept-Ranges sin range', async () => {
  const { dir, path } = setupFile();
  const { srv, port } = await startHandler((req, res) => serveFile(path, req, res));
  try {
    const res = await get(port, '/');
    assert.equal(res.headers['accept-ranges'], undefined);
  } finally { srv.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('extensión desconocida → application/octet-stream', async () => {
  const { dir } = setupFile();
  const path = join(dir, 'weird.weirdext');
  writeFileSync(path, 'data');
  const { srv, port } = await startHandler((req, res) => serveFile(path, req, res));
  try {
    const res = await get(port, '/');
    assert.equal(res.headers['content-type'], 'application/octet-stream');
  } finally { srv.close(); rmSync(dir, { recursive: true, force: true }); }
});
