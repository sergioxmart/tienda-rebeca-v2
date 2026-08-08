import { json } from '../../lib/json.js';
import { handleEpaycoWebhook } from './epayco.js';
import { handleMercadoPagoWebhook } from './mercadopago.js';

export async function handleWebhooks(req, res) {
  const pathname = (req.url || '/').split('?')[0];
  if (pathname === '/api/webhooks/epayco' && ['GET', 'POST'].includes(req.method || 'GET')) {
    return handleEpaycoWebhook(req, res);
  }
  if (pathname === '/api/webhooks/mercadopago') {
    return handleMercadoPagoWebhook(req, res);
  }
  return json(res, 404, { ok: false, error: 'not_found' });
}
