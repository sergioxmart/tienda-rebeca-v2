/**
 * PM2 ecosystem para TechStore.
 *
 * Procesos:
 *   - store-web       → backend Node (server/server.js) en :3000
 *   - store-admin     → SPA admin compilada + proxy interno en :3001
 *   - store-webhook   → receptor de deploy desde GitHub en :9001
 *
 * Uso:
 *   pm2 start ecosystem.config.cjs
 *   pm2 restart store-web
 *   pm2 logs store-web
 *   pm2 save
 *
 * Por que .cjs y no .js: PM2 7.x no parsea bien el `export default` de ESM
 * en el ecosystem. Con la extension `.cjs`, el archivo se trata como CommonJS
 * sin importar el `package.json#type` del directorio. Ver conventions.md.
 */
const path = require('node:path');
const logDir = path.join(__dirname, 'logs', 'pm2-store');

module.exports = {
  apps: [
    {
      name: 'store-web',
      cwd: __dirname,
      script: 'server/server.js',
      exec_mode: 'fork',
      // --env-file carga web/.env ANTES de que ESM ejecute cualquier
      // import. Sin esto, `lib/env.js` (importado por server.js) intenta
      // leer process.env.PG* antes de que tengamos chance de setearlo.
      // El path es relativo al cwd de PM2 (que en este ecosystem es web/).
      // El ecosistema de PM2 no hereda el flag, hay que pasarlo aca.
      node_args: '--env-file=.env',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      out_file: path.join(logDir, 'out.log'),
      error_file: path.join(logDir, 'error.log'),
      merge_logs: true,
      time: true,
    },
    {
      name: 'store-admin',
      cwd: __dirname,
      script: 'admin/server.js',
      exec_mode: 'fork',
      node_args: '--env-file=.env',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '128M',
      env: {
        NODE_ENV: 'production',
        ADMIN_PORT: 3001,
        BACKEND_HOST: '127.0.0.1',
        BACKEND_PORT: 3000,
      },
      env_development: {
        NODE_ENV: 'development',
        ADMIN_PORT: 3001,
        BACKEND_HOST: '127.0.0.1',
        BACKEND_PORT: 3000,
      },
      out_file: path.join(logDir, 'admin-out.log'),
      error_file: path.join(logDir, 'admin-error.log'),
      merge_logs: true,
      time: true,
    },
    {
      name: 'store-webhook',
      cwd: __dirname,
      script: 'webhook/server.mjs',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '128M',
      env: {
        NODE_ENV: 'production',
        WEBHOOK_PORT: 9001,
      },
      env_development: {
        NODE_ENV: 'development',
        WEBHOOK_PORT: 9001,
      },
      out_file: path.join(logDir, 'webhook-out.log'),
      error_file: path.join(logDir, 'webhook-error.log'),
      merge_logs: true,
      time: true,
    },
  ],
};
