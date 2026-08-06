// Wrapper de fetch para la tienda pública.
//
// Solo consume los endpoints `/api/public/*`. Sin auth, sin CSRF —
// las requests son anónimas. Cache-Control es responsabilidad del server
// (60s site-config, 300s attributes, 60s products).

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
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    const code = data.error || `http_${res.status}`;
    throw new ApiError(data.message || res.statusText, { status: res.status, code, details: data });
  }
  return data.data !== undefined ? data.data : data;
}

export const api = {
  siteConfig:  ()       => request('/api/public/site-config'),
  categories:  ()       => request('/api/public/categories'),
  attributes:  ()       => request('/api/public/attributes'),
  products:    (params) => {
    const q = new URLSearchParams(params).toString();
    return request(`/api/public/products${q ? '?' + q : ''}`);
  },
  product:     (slug)   => request(`/api/public/products/${slug}`),
};

export { ApiError };
