// Script específico de TechStore para correr migraciones. Delega en el runner
// genérico de core/scripts/migrate.js pasándole el dir de migrations/ y los
// helpers del server.
//
// Si lo corrés directo: `node server/scripts/migrate.js`

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pool, query } from '../lib/db.js';
import { log } from '../lib/logger.js';
import { runMigrations as runMigrationsBase } from '../../../core/scripts/migrate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations');

export async function runMigrations() {
  return runMigrationsBase({ migrationsDir: MIGRATIONS_DIR, query, log });
}

const argUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (import.meta.url === argUrl) {
  runMigrations()
    .then((r) => {
      log.info('migrations done', { applied: r.applied.length, total: r.total });
      return pool.end();
    })
    .then(() => process.exit(0))
    .catch((err) => {
      log.error('migrate script failed', err);
      process.exit(1);
    });
}
