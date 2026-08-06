#!/usr/bin/env node
// CLI: crea (o resetea) un usuario admin.
//
// Uso:
//   node server/scripts/create-admin.js <email> <password> [rol] [nombre]
//
//   rol: admin (default) | operator | viewer
//   nombre: opcional

import { query, pool } from '../lib/db.js';
import { hashPassword } from '../lib/auth.js';
import { log } from '../lib/logger.js';

async function main() {
  const [,, email, password, role = 'admin', name = ''] = process.argv;
  if (!email || !password) {
    console.error('Uso: node server/scripts/create-admin.js <email> <password> [rol] [nombre]');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('La contraseña debe tener al menos 8 caracteres.');
    process.exit(1);
  }
  if (!['admin', 'operator', 'viewer'].includes(role)) {
    console.error(`Rol inválido: ${role}. Válidos: admin, operator, viewer.`);
    process.exit(1);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error(`Email inválido: ${email}`);
    process.exit(1);
  }

  const emailLower = email.toLowerCase();
  const hash = await hashPassword(password);

  const { rows: existing } = await query(`SELECT id FROM auth_users WHERE email = $1`, [emailLower]);
  if (existing.length > 0) {
    await query(
      `UPDATE auth_users
         SET password_hash = $1, role = $2, name = $3, active = TRUE,
             updated_at = NOW()
       WHERE email = $4`,
      [hash, role, name, emailLower],
    );
    log.info(`admin actualizado: ${emailLower} (rol=${role})`);
  } else {
    await query(
      `INSERT INTO auth_users (email, password_hash, name, role, active)
       VALUES ($1, $2, $3, $4, TRUE)`,
      [emailLower, hash, name, role],
    );
    log.info(`admin creado: ${emailLower} (rol=${role})`);
  }
}

main()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    log.error('create-admin failed', err);
    process.exit(1);
  });
