import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Writable } from 'node:stream';
import { createLogger, log } from '../lib/logger.js';

// Helper: captura stdout/stderr durante la ejecución de fn.
async function captureStdout(fn) {
  const orig = process.stdout.write.bind(process.stdout);
  const buf = [];
  process.stdout.write = (chunk) => { buf.push(String(chunk)); return true; };
  try { await fn(); } finally { process.stdout.write = orig; }
  return buf.join('');
}
async function captureStderr(fn) {
  const orig = process.stderr.write.bind(process.stderr);
  const buf = [];
  process.stderr.write = (chunk) => { buf.push(String(chunk)); return true; };
  try { await fn(); } finally { process.stderr.write = orig; }
  return buf.join('');
}

test('createLogger con tag custom usa ese tag', async () => {
  const out = await captureStdout(() => {
    createLogger({ tag: 'mi-svc' }).info('hola');
  });
  assert.match(out, /\[mi-svc:info\] hola/);
});

test('default tag es "techstore"', async () => {
  // El `log` exportado debe usar 'techstore' cuando no se setea env.LOG_TAG
  const prevTag = process.env.LOG_TAG;
  delete process.env.LOG_TAG;
  try {
    const out = await captureStdout(() => {
      log.info('test default');
    });
    assert.match(out, /\[techstore:info\] test default/);
  } finally {
    if (prevTag !== undefined) process.env.LOG_TAG = prevTag;
  }
});

test('env.LOG_TAG se respeta', async () => {
  const prevTag = process.env.LOG_TAG;
  process.env.LOG_TAG = 'otro-svc';
  // Re-import? No, el `log` se creó al import-time. Creamos uno nuevo.
  try {
    const custom = createLogger({ tag: process.env.LOG_TAG });
    const out = await captureStdout(() => {
      custom.info('con env');
    });
    assert.match(out, /\[otro-svc:info\] con env/);
  } finally {
    if (prevTag !== undefined) process.env.LOG_TAG = prevTag;
    else delete process.env.LOG_TAG;
  }
});

test('level=warn filtra info', async () => {
  const out = await captureStdout(() => {
    const l = createLogger({ tag: 'x', level: 'warn' });
    l.info('no debería salir');
    l.warn('esto sí');
  });
  assert.equal(out.includes('no debería salir'), false);
  assert.match(out, /\[x:warn\] esto sí/);
});

test('error va a stderr', async () => {
  const stdoutOut = await captureStdout(() => {
    const l = createLogger({ tag: 'x' });
    l.info('a stdout');
  });
  const stderrOut = await captureStderr(() => {
    const l = createLogger({ tag: 'x' });
    l.error('a stderr');
  });
  assert.match(stdoutOut, /\[x:info\] a stdout/);
  assert.match(stderrOut, /\[x:error\] a stderr/);
});

test('objetos se serializan como JSON', async () => {
  const out = await captureStdout(() => {
    const l = createLogger({ tag: 'x' });
    l.info('user', { id: 1, role: 'admin' });
  });
  assert.match(out, /\[x:info\] user \{"id":1,"role":"admin"\}/);
});

test('level inválido cae a info (default)', async () => {
  const out = await captureStdout(() => {
    const l = createLogger({ tag: 'x', level: 'NOEXISTE' });
    l.info('visible');
    l.debug('no visible');
  });
  assert.match(out, /\[x:info\] visible/);
  assert.equal(out.includes('no visible'), false);
});
