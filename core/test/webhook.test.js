import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHmac } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { createWebhookServer } from '../webhook/server.js';

const SECRET = 'test_secret_xyz';
const PATH = '/deploy-techstore';

function captureLog() {
  const lines = [];
  return {
    info:  (...a) => lines.push(['info', ...a]),
    warn:  (...a) => lines.push(['warn', ...a]),
    error: (...a) => lines.push(['error', ...a]),
    debug: (...a) => lines.push(['debug', ...a]),
    lines,
  };
}

function makeServer(onPush) {
  return new Promise((resolve) => {
    const log = captureLog();
    const server = createWebhookServer({
      path: PATH,
      secret: SECRET,
      log,
      onPush,
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port, log });
    });
  });
}

function sign(body) {
  return 'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex');
}

function doRequest(port, method, urlPath, { body, signature } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(body) : null;
    const headers = {};
    if (data) headers['Content-Type'] = 'application/json';
    if (signature) headers['X-Hub-Signature-256'] = signature;
    if (data) headers['Content-Length'] = data.length;

    const req = httpRequest({
      host: '127.0.0.1', port, method, path: urlPath, headers,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end',  () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

test('GET /healthz responde 200 con {ok:true}', async () => {
  const { server, port } = await makeServer(() => {});
  try {
    const res = await doRequest(port, 'GET', '/healthz');
    assert.equal(res.status, 200);
    assert.match(res.body, /"ok":true/);
  } finally { server.close(); }
});

test('POST sin firma → 401', async () => {
  const { server, port } = await makeServer(() => {});
  try {
    const res = await doRequest(port, 'POST', PATH, { body: '{"ref":"refs/heads/main"}' });
    assert.equal(res.status, 401);
    assert.match(res.body, /bad_signature/);
  } finally { server.close(); }
});

test('POST firma inválida → 401', async () => {
  const { server, port } = await makeServer(() => {});
  try {
    const res = await doRequest(port, 'POST', PATH, {
      body: '{"ref":"refs/heads/main"}',
      signature: 'sha256=' + 'a'.repeat(64),
    });
    assert.equal(res.status, 401);
  } finally { server.close(); }
});

test('POST firma válida + ref main → 202 + onPush llamado', async () => {
  let called = null;
  const { server, port } = await makeServer(({ ref, headSha, rawBody, payload }) => {
    called = { ref, headSha, rawBody: rawBody.toString('utf8'), payload };
  });
  try {
    const body = JSON.stringify({
      ref: 'refs/heads/main',
      head_commit: { id: 'abc123def' },
    });
    const res = await doRequest(port, 'POST', PATH, {
      body,
      signature: sign(body),
    });
    assert.equal(res.status, 202);
    assert.match(res.body, /deploying/);
    // Esperar un toque para que onPush corra
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(called, 'onPush debería haberse llamado');
    assert.equal(called.ref, 'refs/heads/main');
    assert.equal(called.headSha, 'abc123def');
    assert.equal(called.rawBody, body);
  } finally { server.close(); }
});

test('POST firma válida + ref != main → 200 skipped, onPush NO llamado', async () => {
  let called = false;
  const { server, port } = await makeServer(() => { called = true; });
  try {
    const body = JSON.stringify({
      ref: 'refs/heads/feature-x',
      head_commit: { id: 'def456' },
    });
    const res = await doRequest(port, 'POST', PATH, {
      body,
      signature: sign(body),
    });
    assert.equal(res.status, 200);
    assert.match(res.body, /skipped/);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(called, false);
  } finally { server.close(); }
});

test('onPush que tira → server no se cae, loggea el error', async () => {
  const { server, port, log } = await makeServer(() => {
    throw new Error('boom');
  });
  try {
    const body = JSON.stringify({ ref: 'refs/heads/main' });
    const res = await doRequest(port, 'POST', PATH, {
      body,
      signature: sign(body),
    });
    assert.equal(res.status, 202); // sigue respondiendo 202
    await new Promise((r) => setTimeout(r, 50));
    const errorLogs = log.lines.filter((l) => l[0] === 'error');
    assert.ok(errorLogs.length > 0, 'debería loggear error');
  } finally { server.close(); }
});

test('createWebhookServer valida parámetros requeridos', () => {
  const log = captureLog();
  assert.throws(() => createWebhookServer({ secret: SECRET, log, onPush: () => {} }), /path/);
  assert.throws(() => createWebhookServer({ path: PATH, log, onPush: () => {} }),       /secret/);
  assert.throws(() => createWebhookServer({ path: PATH, secret: SECRET, log }),          /onPush/);
  assert.throws(() => createWebhookServer({ path: PATH, secret: SECRET, onPush: () => {} }), /log/);
});
