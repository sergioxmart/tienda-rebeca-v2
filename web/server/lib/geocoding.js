// Geocodificación de direcciones de despacho para el panel administrativo.
// Se mantiene en backend para no exponer detalles de infraestructura ni
// depender de CORS del proveedor desde el navegador.

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map();

function addressQueries(shippingAddress) {
  if (!shippingAddress || typeof shippingAddress !== 'object') return [];
  const clean = (parts) => parts
    .filter((part) => typeof part === 'string' && part.trim())
    .map((part) => part.trim())
    .join(', ');
  const queries = [
    clean([shippingAddress.address, shippingAddress.city, 'Colombia']),
    clean([shippingAddress.notes, shippingAddress.city, 'Colombia']),
    clean([shippingAddress.address, shippingAddress.notes, shippingAddress.city, 'Colombia']),
  ];
  return [...new Set(queries)].filter(Boolean);
}

export async function geocodeShippingAddress(shippingAddress) {
  const queries = addressQueries(shippingAddress);
  if (queries.length === 0) return null;

  for (const query of queries) {
    const cached = cache.get(query);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const endpoint = new URL('https://nominatim.openstreetmap.org/search');
    endpoint.searchParams.set('format', 'jsonv2');
    endpoint.searchParams.set('limit', '1');
    endpoint.searchParams.set('countrycodes', 'co');
    endpoint.searchParams.set('q', query);

    try {
      const response = await fetch(endpoint, {
        headers: {
          Accept: 'application/json',
          'Accept-Language': 'es-CO,es;q=0.9',
          'User-Agent': 'TechStore-admin-order-map/1.0',
        },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) continue;
      const [place] = await response.json();
      const lat = Number(place?.lat);
      const lon = Number(place?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const value = {
        lat,
        lon,
        display_name: typeof place?.display_name === 'string' ? place.display_name : query,
      };
      cache.set(query, { value, expiresAt: Date.now() + CACHE_TTL_MS });
      return value;
    } catch {
      // Intentamos la siguiente forma de búsqueda; el detalle del pedido no
      // debe fallar si el proveedor externo está temporalmente indisponible.
    }
  }
  return null;
}
