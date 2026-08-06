// API client para la tienda pública. Sin auth.

const base = '';

export async function api(path, options = {}) {
  const res = await fetch(base + path, {
    method: options.method || 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : {},
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  return { ok: res.ok, status: res.status, data };
}
