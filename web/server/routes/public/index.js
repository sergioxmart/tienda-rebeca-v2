// Entry point del router público. Matchea los paths de TechStore
// directamente. Si nada matchea, devuelve 404 (no hay legacy de Rebeca
// que mantener en este router — el catálogo público es nuevo).

import { json } from '../../lib/json.js';
import { listCategories, getCategoryBySlug } from './categories.js';
import { listAttributes } from './attributes.js';
import { getSiteConfig } from './site-config.js';
import { listProducts } from './products.js';
import { getProductBySlug } from './product-detail.js';
import { listPublicModules } from './page-modules.js';
import { validateCart } from './cart.js';
import { createOrder } from './orders.js';
import { createPaymentIntent } from './payment-intent.js';
import { geocodeAddress } from './geocode.js';
import { handleCustomer } from './customer.js';
import { listColombiaLocations } from './locations.js';
import { createReservationLead } from './reservation-leads.js';

export async function handlePublic(req, res) {
  const method = req.method || 'GET';
  const pathname = (req.url || '/').split('?')[0];

  // Health
  if (pathname === '/api/public/health') {
    return json(res, 200, { ok: true, scope: 'public' });
  }

  if (pathname.startsWith('/api/public/customer/')) {
    const handled = await handleCustomer(req, res);
    if (handled !== false) return handled;
  }

  // Cart validation (no auth: the cart is anonymous and client-side)
  if (pathname === '/api/public/cart/validate' && method === 'POST') {
    return validateCart(req, res);
  }

  // Checkout: crea un pedido real con estado pendiente.
  if (pathname === '/api/public/orders' && method === 'POST') {
    return createOrder(req, res);
  }

  if (pathname === '/api/public/reservation-leads' && method === 'POST') {
    return createReservationLead(req, res);
  }

  if (pathname === '/api/public/checkout/payment-intent' && method === 'POST') {
    return createPaymentIntent(req, res);
  }

  if (pathname === '/api/public/geocode' && method === 'GET') {
    return geocodeAddress(req, res);
  }

  if (pathname === '/api/public/locations/colombia' && method === 'GET') {
    return listColombiaLocations(req, res);
  }

  // Site config (path exacto)
  if (pathname === '/api/public/site-config' && method === 'GET') {
    return getSiteConfig(req, res);
  }

  // Categories
  if (pathname === '/api/public/categories' && method === 'GET') {
    return listCategories(req, res);
  }
  const catMatch = pathname.match(/^\/api\/public\/categories\/([a-z0-9-]+)\/?$/);
  if (catMatch && method === 'GET') {
    return getCategoryBySlug(req, res, catMatch[1]);
  }

  // Attributes
  if (pathname === '/api/public/attributes' && method === 'GET') {
    return listAttributes(req, res);
  }

  // Products
  if (pathname === '/api/public/products' && method === 'GET') {
    return listProducts(req, res);
  }
  const prodMatch = pathname.match(/^\/api\/public\/products\/([a-z0-9-]+)\/?$/);
  if (prodMatch && method === 'GET') {
    return getProductBySlug(req, res, prodMatch[1]);
  }

  // Page modules (Web Builder)
  if (pathname === '/api/public/page-modules' && method === 'GET') {
    return listPublicModules(req, res);
  }

  return json(res, 404, { ok: false, error: 'not_found' });
}
