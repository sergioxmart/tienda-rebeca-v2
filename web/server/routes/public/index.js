// Entry point del router público. Matchea los paths de TechStore
// directamente. Si nada matchea, devuelve 404 (no hay legacy de Rebeca
// que mantener en este router — el catálogo público es nuevo).

import { json } from '../../lib/json.js';
import { listCategories, getCategoryBySlug } from './categories.js';
import { listAttributes } from './attributes.js';
import { getSiteConfig } from './site-config.js';
import { listProducts } from './products.js';
import { getProductBySlug } from './product-detail.js';

export async function handlePublic(req, res) {
  const method = req.method || 'GET';
  const pathname = (req.url || '/').split('?')[0];

  // Health
  if (pathname === '/api/public/health') {
    return json(res, 200, { ok: true, scope: 'public' });
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

  return json(res, 404, { ok: false, error: 'not_found' });
}

