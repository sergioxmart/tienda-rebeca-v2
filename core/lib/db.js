// Conexión a Postgres con `pg.Pool`.
// Patrón Fioratta: cada proceso crea su pool. Sin `__pool` global porque
// `node --watch` mata y arranca procesos (no hace HMR in-memory), entonces un
// global preservado apuntaría a un pool cerrado en el siguiente arranque.

import pg from 'pg';
import { env } from './env.js';
import { log } from './logger.js';

const { Pool } = pg;

// DATE (oid 1082) sin hora: devolverlo como string 'YYYY-MM-DD' en vez de
// Date con timezone. Si no, el JSON serializa '2026-12-24T05:00:00.000Z' y
// el frontend muestra "Invalid Date" o corre un día según la zona horaria.
pg.types.setTypeParser(1082, (v) => v);

function createPool() {
  const pool = new Pool({
    host:     env.PGHOST,
    port:     env.PGPORT,
    user:     env.PGUSER,
    password: env.PGPASSWORD,
    database: env.PGDATABASE,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  pool.on('error', (err) => {
    log.error('pg pool error', err.message);
  });

  return pool;
}

export const pool = createPool();

// Helper: ejecuta una query y devuelve filas como objetos planos (sin prototipo
// null que devuelve `pg` por defecto; React no los acepta en Server Components
// pero acá es un backend puro, así que la conversión es opcional).
export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const ms = Date.now() - start;
  if (ms > 200) log.warn('slow query', { ms, text: text.slice(0, 80) });
  return res;
}

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Para los endpoints que quieren un cliente (transacciones manuales, etc.).
export async function getClient() {
  return pool.connect();
}
