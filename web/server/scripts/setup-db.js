#!/usr/bin/env node
// Crea la DB y el rol del .env si no existen. Pensado para dev local.
//
// Por qué existe: hasta ahora había que correr 4-5 comandos de psql/createdb
// a mano (ver `Contexto/dev-setup.md` v1). Este script automatiza eso,
// verifica que el rol tiene permisos para crear DB/rol, y aborta con un
// mensaje claro si no es así (en vez de fallar a mitad de camino).
//
// Uso desde `web/`:
//   npm run db:setup
//
// Variables que lee del .env (en `web/.env`):
//   PGHOST, PGPORT        — host:puerto del servidor Postgres (default localhost:5432)
//   PGUSER                — rol app (queda como owner de la DB)
//   PGPASSWORD            — password del rol app
//   PGDATABASE            — nombre de la DB a crear
//   PG_SUPERUSER          — OPCIONAL. Si está, se conecta con este rol para
//                           crear la DB y el rol app. Útil cuando PGUSER aún
//                           no existe y no podés conectarte con él.
//                           Si no está, se usa PGUSER.
//   PG_SUPERPASSWORD      — OPCIONAL. Password del PG_SUPERUSER.
//
// Comportamiento:
//   1. Se conecta a la DB `postgres` (la default, garantizada a existir).
//   2. Verifica que el rol tiene CREATEDB+CREATEROLE (o es superuser). Aborta si no.
//   3. Crea el rol `PGUSER` con login+password si no existe.
//   4. Crea la DB `PGDATABASE` con owner `PGUSER` si no existe.
//   5. Se conecta a la DB nueva como `PGUSER` y aplica GRANTs sobre el schema
//      `public` y los defaults para objetos futuros (tablas, sequences).
//
// Es idempotente: se puede correr varias veces sin error. Si la DB y el rol
// ya existen, los pasos 3 y 4 son no-op y solo reaplica los GRANTs.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));

// Carga manual del .env (no asumimos --env-file en runtime; queremos que el
// script funcione aunque lo invoquen de distintas formas). Si el .env no
// existe, sigue con process.env.
function loadEnvFile() {
  const envPath = join(__dirname, '..', '..', '.env');
  let content = '';
  try {
    content = readFileSync(envPath, 'utf8');
  } catch {
    return;
  }
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvFile();

const PGHOST = process.env.PGHOST || 'localhost';
const PGPORT = Number(process.env.PGPORT || 5432);
const PGUSER = process.env.PGUSER;
const PGPASSWORD = process.env.PGPASSWORD;
const PGDATABASE = process.env.PGDATABASE;
const PG_SUPERUSER = process.env.PG_SUPERUSER || PGUSER;
const PG_SUPERPASSWORD = process.env.PG_SUPERPASSWORD || PGPASSWORD;

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const BLUE = '\x1b[34m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';

function die(msg) {
  console.error(`\n${RED}✗${RESET} ${msg}\n`);
  process.exit(1);
}
const ok   = (m) => console.log(`${GREEN}✓${RESET} ${m}`);
const info = (m) => console.log(`${BLUE}→${RESET} ${m}`);
const warn = (m) => console.log(`${YELLOW}!${RESET} ${m}`);

// Quotea un identificador SQL (nombre de rol/DB). Solo permite letras,
// dígitos y guión bajo; cualquier otra cosa se rechaza para evitar injection.
function quoteIdent(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    die(`Nombre inválido para rol/DB: "${name}". Solo letras, dígitos y guión bajo.`);
  }
  return `"${name}"`;
}

// Escapea un string para usarlo como literal SQL (entre comillas simples).
// Estándar: comilla simple se duplica.
function escapeLiteral(s) {
  return String(s).replace(/'/g, "''");
}

async function checkAdminPermissions(client) {
  const { rows } = await client.query(`
    SELECT
      current_user       AS user,
      rolsuper           AS is_super,
      rolcreatedb        AS can_create_db,
      rolcreaterole      AS can_create_role
    FROM pg_roles
    WHERE rolname = current_user
  `);
  if (rows.length === 0) die('No se pudo identificar el rol actual.');
  const r = rows[0];
  if (!r.is_super && !(r.can_create_db && r.can_create_role)) {
    die([
      `El rol "${r.user}" no tiene permisos para crear DBs ni roles.`,
      '',
      'Opciones:',
      '  1. Definí PG_SUPERUSER y PG_SUPERPASSWORD en .env con un rol que sea',
      '     superuser (o tenga CREATEDB + CREATEROLE).',
      `  2. O ejecutá manualmente antes de correr este script:`,
      `       CREATE ROLE ${quoteIdent(PGUSER)} CREATEDB CREATEROLE LOGIN PASSWORD '...';`,
      `       CREATE DATABASE ${quoteIdent(PGDATABASE)} OWNER ${quoteIdent(PGUSER)};`,
    ].join('\n'));
  }
  return r;
}

async function ensureRole(client) {
  const { rows } = await client.query(
    'SELECT 1 FROM pg_roles WHERE rolname = $1',
    [PGUSER]
  );
  if (rows.length > 0) {
    ok(`rol "${PGUSER}" ya existe`);
    return false;
  }
  info(`creando rol "${PGUSER}"...`);
  // CREATE ROLE no acepta placeholders para el nombre ni el password, así que
  // interpolamos con quoting validado.
  const sql = `CREATE ROLE ${quoteIdent(PGUSER)} LOGIN PASSWORD '${escapeLiteral(PGPASSWORD)}'`;
  await client.query(sql);
  ok(`rol "${PGUSER}" creado`);
  return true;
}

async function ensureDatabase(client) {
  const { rows } = await client.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [PGDATABASE]
  );
  if (rows.length > 0) {
    ok(`DB "${PGDATABASE}" ya existe`);
    return false;
  }
  info(`creando DB "${PGDATABASE}" con owner "${PGUSER}"...`);
  await client.query(
    `CREATE DATABASE ${quoteIdent(PGDATABASE)} OWNER ${quoteIdent(PGUSER)}`
  );
  ok(`DB "${PGDATABASE}" creada`);
  return true;
}

async function applyGrantsAsApp() {
  // El owner ya tiene todos los privilegios en su DB. Pero los ALTER DEFAULT
  // PRIVILEGES los dispara SOLO el rol que crea los objetos. Si vamos a
  // correr las migrations con PGUSER, lo más limpio es que PGUSER configure
  // sus propios defaults. Si falla, avisamos pero no abortamos.
  const appClient = new Client({
    host: PGHOST,
    port: PGPORT,
    user: PGUSER,
    password: PGPASSWORD,
    database: PGDATABASE,
  });
  await appClient.connect();
  try {
    await appClient.query('GRANT ALL ON SCHEMA public TO PUBLIC');
    await appClient.query(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${quoteIdent(PGUSER)} IN SCHEMA public ` +
      `GRANT ALL ON TABLES TO ${quoteIdent(PGUSER)}`
    );
    await appClient.query(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${quoteIdent(PGUSER)} IN SCHEMA public ` +
      `GRANT ALL ON SEQUENCES TO ${quoteIdent(PGUSER)}`
    );
    ok('GRANTs aplicados al rol en la DB nueva');
  } catch (err) {
    warn(`no se pudieron aplicar GRANTs automáticos: ${err.message}`);
    warn('si PGUSER no es realmente owner, corré los GRANTs manualmente:');
    warn(`  GRANT ALL ON SCHEMA public TO ${quoteIdent(PGUSER)};`);
  } finally {
    await appClient.end();
  }
}

async function main() {
  if (!PGUSER) die('Falta PGUSER en .env');
  if (!PGPASSWORD) die('Falta PGPASSWORD en .env');
  if (!PGDATABASE) die('Falta PGDATABASE en .env');

  console.log(`\nSetup DB: ${PGUSER}@${PGHOST}:${PGPORT}/${PGDATABASE}`);
  if (PG_SUPERUSER !== PGUSER) {
    info(`usando rol admin "${PG_SUPERUSER}" para crear la DB y el rol app`);
  }

  const adminClient = new Client({
    host: PGHOST,
    port: PGPORT,
    user: PG_SUPERUSER,
    password: PG_SUPERPASSWORD,
    database: 'postgres', // default, garantizada a existir
  });

  info(`conectando a postgres@${PGHOST}:${PGPORT} como "${PG_SUPERUSER}"...`);
  await adminClient.connect();
  try {
    const perms = await checkAdminPermissions(adminClient);
    info(
      `rol "${perms.user}" conectado ` +
      `(super=${perms.is_super}, createdb=${perms.can_create_db})`
    );

    await ensureRole(adminClient);
    await ensureDatabase(adminClient);
  } finally {
    await adminClient.end();
  }

  await applyGrantsAsApp();

  console.log(
    `\n${GREEN}Listo.${RESET} Próximo paso: ${BLUE}npm run migrate${RESET}\n`
  );
}

main().catch((err) => {
  console.error(`\n${RED}✗ Error:${RESET} ${err.message}\n`);
  if (err.code) console.error(`  código: ${err.code}`);
  if (err.code === 'ECONNREFUSED') {
    console.error(
      `\n  ¿Está corriendo Postgres? Probá: brew services start postgresql@16\n`
    );
  } else if (err.code === '28P01') {
    console.error(
      `\n  Password incorrecta para el rol "${PG_SUPERUSER}". Revisá .env.\n`
    );
  } else if (err.code === '3D000') {
    console.error(
      `\n  La DB "${PGDATABASE}" no existe y el rol actual no puede crearla.\n` +
      `  El rol "${PG_SUPERUSER}" no tiene CREATEDB. Ver el mensaje de más arriba.\n`
    );
  }
  process.exit(1);
});
