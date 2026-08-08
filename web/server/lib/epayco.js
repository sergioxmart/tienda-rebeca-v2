// Integración con ePayco Smart Checkout 2.
//
// La API actual crea sesiones a través de Apify. El SDK `epayco-sdk-node`
// sigue instalado para las operaciones legacy (token/charge), pero no se usa
// aquí porque no expone este endpoint de sesiones.

import { env } from './env.js';
import { log } from './logger.js';

const APIFY_URL = 'https://apify.epayco.co';

export class EpaycoConfigurationError extends Error {
  constructor(message = 'ePayco no está configurado') {
    super(message);
    this.code = 'epayco_not_configured';
  }
}

export class EpaycoApiError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
    this.code = 'epayco_api_error';
  }
}

function assertCredentials() {
  if (!env.EPAYCO_PUBLIC_KEY || !env.EPAYCO_PRIVATE_KEY) {
    throw new EpaycoConfigurationError(
      'Configura EPAYCO_PUBLIC_KEY y EPAYCO_PRIVATE_KEY en web/.env para usar pagos de prueba.',
    );
  }
}

async function readResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    log.warn('ePayco API rejected request', { status: response.status });
    throw new EpaycoApiError('ePayco no pudo crear la sesión de pago.', response.status >= 400 && response.status < 500 ? 502 : 503);
  }
  return body;
}

async function apifyToken() {
  assertCredentials();
  const authorization = Buffer.from(`${env.EPAYCO_PUBLIC_KEY}:${env.EPAYCO_PRIVATE_KEY}`).toString('base64');
  const response = await fetch(`${APIFY_URL}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${authorization}`,
    },
    signal: AbortSignal.timeout(10_000),
  });
  const body = await readResponse(response);
  if (!body.token) throw new EpaycoApiError('ePayco no devolvió un token de autenticación.');
  return body.token;
}

export async function createCheckoutSession({ order, siteName }) {
  const token = await apifyToken();
  const total = Math.max(0, Math.round(Number(order.total) || 0));
  const response = await fetch(`${APIFY_URL}/payment/session/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      checkout_version: '2',
      name: siteName || 'TechStore',
      description: `Pedido ${order.order_number}`,
      currency: 'COP',
      amount: total,
      lang: 'ES',
      country: 'CO',
      invoice: order.order_number,
      response: env.EPAYCO_RESPONSE_URL,
      confirmation: env.EPAYCO_CONFIRMATION_URL,
      method: 'POST',
      uniqueTransactionPerBill: true,
      extras: {
        extra1: String(order.id),
        extra2: order.order_number,
      },
      billing: {
        email: order.customer_email,
        name: order.customer_name,
        address: typeof order.shipping_address?.address === 'string' ? order.shipping_address.address : '',
        callingCode: '+57',
        mobilePhone: order.customer_phone,
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await readResponse(response);
  const sessionId = body?.data?.sessionId;
  if (!body?.success || !sessionId) {
    throw new EpaycoApiError('ePayco no devolvió un sessionId válido.');
  }
  return { sessionId, raw: body };
}

