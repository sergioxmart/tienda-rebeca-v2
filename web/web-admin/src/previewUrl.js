// Resuelve el origen de la tienda que se muestra dentro del Builder.
// En desarrollo admin y store usan puertos Vite distintos; en producción
// viven en hostnames distintos y no deben inventar :5173 sobre HTTPS.
export function getStorePreviewUrl() {
  const configured = import.meta.env.VITE_STORE_PREVIEW_URL;
  if (configured) return `${configured.replace(/\/$/, '')}/?builder_preview=1`;

  const url = new URL(window.location.origin);
  const isAdminHostname = url.hostname.startsWith('admin.');

  if (isAdminHostname && url.protocol === 'https:') {
    url.hostname = url.hostname.slice('admin.'.length);
    url.port = '';
  } else if (url.port === '5174') {
    url.port = '5173';
  } else if (url.port === '3001') {
    url.port = '3000';
  } else if (!url.port) {
    // Fallback local para hosts sin puerto explícito.
    url.port = '5173';
  }

  url.search = '?builder_preview=1';
  return url.toString();
}
