import { json } from '../../lib/json.js';
import { geocodeShippingAddress } from '../../lib/geocoding.js';

export async function geocodeAddress(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  const clientKey = String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'anonymous').split(',')[0].trim();
  const now = Date.now();
  const lastRequestAt = geocodeAddress.lastRequestAt || new Map();
  const previous = lastRequestAt.get(clientKey) || 0;
  if (now - previous < 1000) {
    return json(res, 429, { ok: false, error: 'geocode_rate_limited', message: 'Espera un momento antes de volver a ubicar la dirección.' });
  }
  lastRequestAt.set(clientKey, now);
  geocodeAddress.lastRequestAt = lastRequestAt;
  const address = (url.searchParams.get('address') || '').trim().slice(0, 300);
  const city = (url.searchParams.get('city') || '').trim().slice(0, 120);
  if (!address) return json(res, 400, { ok: false, error: 'address_required', message: 'Escribe una dirección para ubicarla.' });
  const location = await geocodeShippingAddress({ address, city });
  return json(res, 200, { ok: true, location });
}
