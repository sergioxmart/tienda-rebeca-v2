// Runner de migraciones. Lee `migrations/*.sql` en orden lexicográfico y
// aplica los que no estén en la tabla `_migrations`.
// Idempotente: se puede llamar en cada boot.
//
// El runner es genérico; el llamador (típicamente `web/server/scripts/migrate.js`)
// le pasa:
//   - migrationsDir:  directorio con archivos .sql
//   - query:          función de query (core/lib/db.js#query)
//   - log:            logger
//   - tableName:      nombre de la tabla de tracking (default: '_migrations')

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Función pura: dada una lista de archivos en disco y un Set de nombres
// aplicados, devuelve los que faltan aplicar en orden.
export function listPendingMigrations(files, appliedSet) {
  return files
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => !appliedSet.has(f));
}

export async function runMigrations({
  migrationsDir,
  query,
  log,
  tableName = '_migrations',
} = {}) {
  if (!migrationsDir) throw new Error('runMigrations: migrationsDir es obligatorio');
  if (typeof query !== 'function') throw new Error('runMigrations: query es obligatorio');
  if (!log) throw new Error('runMigrations: log es obligatorio');

  // Asegurar la tabla de tracking. CREATE IF NOT EXISTS es idempotente.
  await query(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = readdirSync(migrationsDir);
  const { rows: appliedRows } = await query(`SELECT name FROM ${tableName}`);
  const appliedSet = new Set(appliedRows.map((r) => r.name));
  const pending = listPendingMigrations(files, appliedSet);

  for (const file of pending) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    log.info('applying migration', file);
    try {
      await query('BEGIN');
      await query(sql);
      await query(`INSERT INTO ${tableName} (name) VALUES ($1)`, [file]);
      await query('COMMIT');
    } catch (err) {
      await query('ROLLBACK');
      log.error('migration failed', file, err.message);
      throw err;
    }
  }

  return { applied: pending, total: files.filter((f) => f.endsWith('.sql')).length };
}
