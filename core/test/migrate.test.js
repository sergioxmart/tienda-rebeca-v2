import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listPendingMigrations, runMigrations } from '../scripts/migrate.js';

test('listPendingMigrations: ordena y filtra las no aplicadas', () => {
  const files = ['001_init.sql', '002_users.sql', '003_xyz.sql', 'README.md'];
  const applied = new Set(['001_init.sql']);
  const result = listPendingMigrations(files, applied);
  assert.deepEqual(result, ['002_users.sql', '003_xyz.sql']);
});

test('listPendingMigrations: vacío si todas están aplicadas', () => {
  const files = ['001_init.sql', '002_users.sql'];
  const applied = new Set(['001_init.sql', '002_users.sql']);
  assert.deepEqual(listPendingMigrations(files, applied), []);
});

test('listPendingMigrations: ignora archivos que no son .sql', () => {
  const files = ['001_init.sql', 'README.md', 'notas.txt'];
  const applied = new Set();
  assert.deepEqual(listPendingMigrations(files, applied), ['001_init.sql']);
});

test('listPendingMigrations: ordena lexicográficamente', () => {
  const files = ['010_z.sql', '002_a.sql', '001_init.sql'];
  const applied = new Set();
  assert.deepEqual(listPendingMigrations(files, applied),
    ['001_init.sql', '002_a.sql', '010_z.sql']);
});

test('runMigrations: aplica las pendientes en orden, registra cada una', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'migrate-test-'));
  writeFileSync(join(dir, '001_first.sql'),  'CREATE TABLE foo (id INT);');
  writeFileSync(join(dir, '002_second.sql'), 'CREATE TABLE bar (id INT);');

  const calls = []; // registro de queries ejecutadas
  const mockQuery = async (sql, params) => {
    calls.push({ sql: sql.trim().split('\n')[0].slice(0, 60), params });
    if (/^INSERT INTO _migrations/.test(sql.trim())) {
      return { rows: [{ id: calls.length, name: params[0], applied_at: new Date() }] };
    }
    if (/^SELECT name FROM _migrations/.test(sql.trim())) {
      return { rows: [] }; // ninguna aplicada
    }
    return { rows: [] };
  };
  const log = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

  const result = await runMigrations({ migrationsDir: dir, query: mockQuery, log });

  assert.equal(result.applied.length, 2);
  assert.equal(result.total, 2);
  // Verificar que corrió BEGIN, el SQL, INSERT, COMMIT para cada migration
  const begins = calls.filter((c) => c.sql === 'BEGIN').length;
  const commits = calls.filter((c) => c.sql === 'COMMIT').length;
  assert.equal(begins, 2);
  assert.equal(commits, 2);
  // Las INSERT en _migrations son 2 (una por archivo)
  const inserts = calls.filter((c) => /^INSERT INTO _migrations/.test(c.sql));
  assert.equal(inserts.length, 2);
  assert.equal(inserts[0].params[0], '001_first.sql');
  assert.equal(inserts[1].params[0], '002_second.sql');

  rmSync(dir, { recursive: true, force: true });
});

test('runMigrations: no reaplica las ya en _migrations', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'migrate-test-'));
  writeFileSync(join(dir, '001_first.sql'),  'CREATE TABLE foo (id INT);');
  writeFileSync(join(dir, '002_second.sql'), 'CREATE TABLE bar (id INT);');

  const calls = [];
  const mockQuery = async (sql, params) => {
    calls.push({ sql: sql.trim().split('\n')[0].slice(0, 60), params });
    if (/^INSERT INTO _migrations/.test(sql.trim())) {
      return { rows: [] };
    }
    if (/^SELECT name FROM _migrations/.test(sql.trim())) {
      // Simular que 001 ya está aplicada
      return { rows: [{ name: '001_first.sql' }] };
    }
    return { rows: [] };
  };
  const log = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

  const result = await runMigrations({ migrationsDir: dir, query: mockQuery, log });

  assert.deepEqual(result.applied, ['002_second.sql']);
  // Solo 1 BEGIN, no 2
  const begins = calls.filter((c) => c.sql === 'BEGIN').length;
  assert.equal(begins, 1);

  rmSync(dir, { recursive: true, force: true });
});

test('runMigrations: si una falla, hace ROLLBACK y tira el error', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'migrate-test-'));
  writeFileSync(join(dir, '001_first.sql'),  'CREATE TABLE foo (id INT);');
  writeFileSync(join(dir, '002_bad.sql'),    'BROKEN SQL;');

  const calls = [];
  const mockQuery = async (sql, params) => {
    calls.push(sql.trim());
    if (sql.trim() === 'BROKEN SQL;') throw new Error('syntax error');
    if (/^SELECT name FROM _migrations/.test(sql.trim())) return { rows: [] };
    return { rows: [] };
  };
  let errorMsg = null;
  const log = { info: () => {}, warn: () => {}, error: (m) => { errorMsg = m; }, debug: () => {} };

  await assert.rejects(
    runMigrations({ migrationsDir: dir, query: mockQuery, log }),
    /syntax error/,
  );
  // Se hizo ROLLBACK
  assert.ok(calls.includes('ROLLBACK'));
  assert.equal(errorMsg, 'migration failed');

  rmSync(dir, { recursive: true, force: true });
});

test('runMigrations: valida parámetros requeridos', async () => {
  const log = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  const q = async () => ({ rows: [] });

  await assert.rejects(
    runMigrations({ query: q, log }),
    /migrationsDir/,
  );
  await assert.rejects(
    runMigrations({ migrationsDir: '/tmp', log }),
    /query/,
  );
  await assert.rejects(
    runMigrations({ migrationsDir: '/tmp', query: q }),
    /log/,
  );
});
