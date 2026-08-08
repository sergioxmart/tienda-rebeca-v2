// Carga y valida variables de entorno. Falla rápido si falta algo crítico.
// Lee solo de process.env (el archivo .env se carga con --env-file al ejecutar).

import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Este archivo vive en <repo>/core/lib/env.js, así que dos niveles arriba es
// la raíz del repo.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function req(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Falta variable de entorno obligatoria: ${name}`);
  }
  return v;
}

function opt(name, def) {
  return process.env[name] ?? def;
}

export const env = {
  NODE_ENV:   opt('NODE_ENV', 'development'),
  HOST:       opt('HOST', '0.0.0.0'),
  PORT:       Number(opt('PORT', '3000')),

  // Postgres
  PGHOST:     opt('PGHOST', 'localhost'),
  PGPORT:     Number(opt('PGPORT', '5432')),
  PGUSER:     req('PGUSER'),
  PGPASSWORD: req('PGPASSWORD'),
  PGDATABASE: req('PGDATABASE'),

  // Auth
  JWT_SECRET:        req('JWT_SECRET'),
  REFRESH_SECRET:    req('REFRESH_SECRET'),
  COOKIE_SECRET:     req('COOKIE_SECRET'),
  ACCESS_TTL_MIN:    Number(opt('ACCESS_TTL_MIN', '15')),
  REFRESH_TTL_DAYS:  Number(opt('REFRESH_TTL_DAYS', '7')),

  // Checkout: un pedido sin pago confirmado no queda abierto para siempre.
  ORDER_PENDING_TTL_MINUTES:      Number(opt('ORDER_PENDING_TTL_MINUTES', '15')),
  ORDER_EXPIRATION_SWEEP_SECONDS: Number(opt('ORDER_EXPIRATION_SWEEP_SECONDS', '60')),

  // Webhook
  WEBHOOK_PORT:      Number(opt('WEBHOOK_PORT', '9001')),
  WEBHOOK_SECRET:    opt('WEBHOOK_SECRET', ''),

  // ePayco Smart Checkout. Las llaves privadas solo se consumen en el
  // backend; nunca se deben exponer en el bundle de la tienda.
  EPAYCO_TEST:             opt('EPAYCO_TEST', 'true').toLowerCase() === 'true',
  EPAYCO_PUBLIC_KEY:       opt('EPAYCO_PUBLIC_KEY', ''),
  EPAYCO_PRIVATE_KEY:      opt('EPAYCO_PRIVATE_KEY', ''),
  EPAYCO_CUSTOMER_ID:      opt('EPAYCO_CUSTOMER_ID', opt('P_CUST_ID_CLIENTE', '')),
  EPAYCO_P_KEY:            opt('EPAYCO_P_KEY', opt('P_KEY', '')),
  EPAYCO_CHECKOUT_URL:     opt('EPAYCO_CHECKOUT_URL', 'https://checkout.epayco.co/checkout-v2.js'),
  EPAYCO_RESPONSE_URL:     opt('EPAYCO_RESPONSE_URL', 'http://localhost:5173/pago/respuesta'),
  EPAYCO_CONFIRMATION_URL: opt('EPAYCO_CONFIRMATION_URL', 'http://localhost:3000/api/webhooks/epayco'),

  // Mercado Pago Checkout Pro. El access token y el secreto del webhook
  // permanecen únicamente en el backend.
  MERCADOPAGO_TEST:             opt('MERCADOPAGO_TEST', 'true').toLowerCase() === 'true',
  MERCADOPAGO_ACCESS_TOKEN:     opt('MERCADOPAGO_ACCESS_TOKEN', ''),
  MERCADOPAGO_PUBLIC_KEY:       opt('MERCADOPAGO_PUBLIC_KEY', ''),
  MERCADOPAGO_WEBHOOK_SECRET:   opt('MERCADOPAGO_WEBHOOK_SECRET', ''),
  MERCADOPAGO_SUCCESS_URL:      opt('MERCADOPAGO_SUCCESS_URL', 'http://localhost:5173/pago/respuesta'),
  MERCADOPAGO_FAILURE_URL:      opt('MERCADOPAGO_FAILURE_URL', 'http://localhost:5173/pago/respuesta'),
  MERCADOPAGO_PENDING_URL:      opt('MERCADOPAGO_PENDING_URL', 'http://localhost:5173/pago/respuesta'),
  MERCADOPAGO_NOTIFICATION_URL: opt('MERCADOPAGO_NOTIFICATION_URL', 'http://localhost:3000/api/webhooks/mercadopago'),

  // Uploads
  MAX_UPLOAD_BYTES:  Number(opt('MAX_UPLOAD_BYTES', String(20 * 1024 * 1024))), // 20 MB

  // Directorio de archivos subidos. Lo comparten quien escribe
  // (core/lib/uploads.js) y quien sirve (web/server/routes/media.js): si cada
  // uno lo resuelve por su cuenta terminan en carpetas distintas y /media/*
  // devuelve 404 con el archivo sano en disco. Que salga de acá lo hace
  // imposible.
  //
  // El resolve() no es cosmético: quien sirve compara este valor contra un path
  // ya normalizado (`fullPath.startsWith(env.UPLOADS_DIR)` en media.js). Sin
  // canonizar, un UPLOADS_DIR con el separador "equivocado" (C:/x en Windows) o
  // relativo no matchea nunca, el guard anti-traversal rechaza todo y cada
  // /media/* da 404 con la foto sana en disco. Las rutas relativas se anclan a
  // la raíz del repo, no al cwd: el server arranca desde web/server.
  UPLOADS_DIR:       resolve(REPO_ROOT, opt('UPLOADS_DIR', 'uploads')),
};
