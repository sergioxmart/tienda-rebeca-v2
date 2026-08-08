// Integración de Mercado Pago Checkout Pro usando el SDK oficial de Node.
// El access token nunca sale del backend.

import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';
import { env } from './env.js';
import { log } from './logger.js';

export class MercadoPagoConfigurationError extends Error {
  constructor(message = 'Mercado Pago no está configurado') {
    super(message);
    this.code = 'mercadopago_not_configured';
  }
}

export class MercadoPagoApiError extends Error {
  constructor(message = 'Mercado Pago no respondió correctamente.', cause) {
    super(message, { cause });
    this.code = 'mercadopago_api_error';
  }
}

function getClient() {
  if (!env.MERCADOPAGO_ACCESS_TOKEN) {
    throw new MercadoPagoConfigurationError(
      'Configura MERCADOPAGO_ACCESS_TOKEN en web/.env para usar Checkout Pro.',
    );
  }
  return new MercadoPagoConfig({
    accessToken: env.MERCADOPAGO_ACCESS_TOKEN,
    options: { timeout: 10_000 },
  });
}

export async function createCheckoutPreference({ order, siteName }) {
  const client = getClient();
  const preference = new Preference(client);
  const body = {
    items: order.items.map((item) => ({
      id: String(item.variant_id || item.item_id),
      title: item.variant_sku ? `${item.product_name} · ${item.variant_sku}` : item.product_name,
      quantity: Number(item.quantity),
      currency_id: 'COP',
      unit_price: Math.round(Number(item.unit_price) || 0),
    })),
    payer: {
      name: order.customer_name,
      email: order.customer_email,
    },
    external_reference: order.order_number,
    metadata: {
      order_id: String(order.id),
      order_number: order.order_number,
    },
    back_urls: {
      success: env.MERCADOPAGO_SUCCESS_URL,
      failure: env.MERCADOPAGO_FAILURE_URL,
      pending: env.MERCADOPAGO_PENDING_URL,
    },
    auto_return: 'approved',
    notification_url: env.MERCADOPAGO_NOTIFICATION_URL,
    statement_descriptor: String(siteName || 'TechStore').slice(0, 22),
  };

  try {
    return await preference.create({
      body,
      requestOptions: { idempotencyKey: `techstore-order-${order.id}` },
    });
  } catch (error) {
    log.warn('Mercado Pago preference creation failed', { message: error.message });
    throw new MercadoPagoApiError('Mercado Pago no pudo crear la preferencia.', error);
  }
}

export async function getMercadoPagoPayment(paymentId) {
  const client = getClient();
  try {
    return await new Payment(client).get({ id: paymentId });
  } catch (error) {
    log.warn('Mercado Pago payment lookup failed', { paymentId: String(paymentId), message: error.message });
    throw new MercadoPagoApiError('No pudimos consultar el pago en Mercado Pago.', error);
  }
}

