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
  createOrder: async (payload) => {
    const r = await request('/api/public/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { order: r.order || null };
  },
  createReservationLead: async (payload) => {
    const r = await request('/api/public/reservation-leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { reservation: r.reservation || null };
  },
  createPaymentIntent: async (payload) => {
    const r = await request('/api/public/checkout/payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return r.payment || null;
  },
  geocodeAddress: async (address, city) => {
    const params = new URLSearchParams({ address: address || '', city: city || '' });
    const r = await request(`/api/public/geocode?${params.toString()}`);
    return r.location || null;
  },
  colombiaLocations: async () => {
    const r = await request('/api/public/locations/colombia');
    return r.departments || [];
  },
  customerLookup: async (email) => {
    const r = await request('/api/public/customer/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    return { has_history: Boolean(r.has_history), can_login: Boolean(r.can_login) };
  },
  requestCustomerOtp: async (email) => {
    const r = await request('/api/public/customer/auth/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    return { sent: Boolean(r.sent), expires_in_seconds: Number(r.expires_in_seconds || 0), message: r.message || '' };
  },
  verifyCustomerOtp: async (email, code) => {
    const r = await request('/api/public/customer/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });
    return { customer: r.customer || null, addresses: r.addresses || [] };
  },
  customerMe: async () => {
    const r = await request('/api/public/customer/me');
    return { authenticated: Boolean(r.authenticated), customer: r.customer || null, addresses: r.addresses || [] };
  },
  customerLogout: async () => {
    await request('/api/public/customer/auth/logout', { method: 'POST' });
  },
  customerDeactivate: async () => {
    const r = await request('/api/public/customer/account/deactivate', { method: 'POST' });
    return { message: r.message || '', reactivation_days: Number(r.reactivation_days || 30) };
  },
  updateCustomerProfile: async (payload) => {
    const r = await request('/api/public/customer/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return r.customer || null;
  },
  customerOrders: async () => {
    const r = await request('/api/public/customer/orders');
    return r.orders || [];
  },
  customerAddressCreate: async (payload) => {
    const r = await request('/api/public/customer/addresses', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    return r.address || null;
  },
  customerAddressUpdate: async (id, payload) => {
    const r = await request(`/api/public/customer/addresses/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    return r.address || null;
  },
  customerAddressDelete: async (id) => {
    await request(`/api/public/customer/addresses/${id}`, { method: 'DELETE' });
  },
};

export { ApiError };
