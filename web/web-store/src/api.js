// Wrapper de fetch para la tienda pública.
//
// Solo consume los endpoints `/api/public/*`. Sin auth, sin CSRF —
// las requests son anónimas. Cache-Control es responsabilidad del server.
//
// El backend público NO envuelve en `data`: cada endpoint devuelve
// {ok, <key>} donde <key> es `config`, `categories`, `attributes`,
// `products`+`pagination`, o `product`. Acá extraemos lo relevante en
// cada método para que el resto de la app no tenga que conocer el shape.

class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(url, opts = {}) {
  const res = await fetch(url, { credentials: 'include', ...opts });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) {
    const code = body.error || `http_${res.status}`;
    throw new ApiError(body.message || res.statusText, { status: res.status, code, details: body });
  }
  return body;
}

export const api = {
  siteConfig: async () => {
    const r = await request('/api/public/site-config');
    return r.config || {};
  },
  categories: async () => {
    const r = await request('/api/public/categories');
    return r.categories || [];
  },
  attributes: async () => {
    const r = await request('/api/public/attributes');
    return r.attributes || [];
  },
  products: async (params = {}) => {
    const q = typeof params === 'string' ? params : new URLSearchParams(params).toString();
    const r = await request(`/api/public/products${q ? '?' + q : ''}`);
    return {
      products: r.products || [],
      pagination: r.pagination || { total: 0, page: 1, limit: 12, total_pages: 1 },
    };
  },
  product: async (slug) => {
    const r = await request(`/api/public/products/${slug}`);
    return r.product || null;
  },
  pageModules: async () => {
    const r = await request('/api/public/page-modules');
    return { modules: r.modules || [] };
  },
  validateCart: async (items) => {
    const r = await request('/api/public/cart/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    return { items: r.items || [], missing_variant_ids: r.missing_variant_ids || [] };
  },
};

export { ApiError };
