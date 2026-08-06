// Helpers de fetch para el admin. CSRF double-submit cookie.

let accessToken = null;

export function setAccessToken(t) { accessToken = t; }
export function getAccessToken() { return accessToken; }

export function getCookie(name) {
  try {
    // document.cookie ya devuelve los valores URL-decoded. NO decodificar de nuevo.
    const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export function authHeaders() {
  const h = {};
  if (accessToken) h['Authorization'] = `Bearer ${accessToken}`;
  const csrf = getCookie('csrf_token');
  if (csrf) h['X-CSRF-Token'] = csrf;
  return h;
}

// Refresh deduplicado: React 18 StrictMode monta los efectos dos veces en dev,
// y dos POST /api/auth/refresh concurrentes con la misma cookie hacen que el
// segundo llegue con el token ya rotado → 401 → el server borra las cookies y
// se cae la sesión. Compartimos una sola promesa entre llamadores concurrentes.
let refreshInFlight = null;
export function refreshSession() {
  if (!refreshInFlight) {
    refreshInFlight = api('/api/auth/refresh', { method: 'POST' }).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function doFetch(path, { method, body, json }) {
  // body puede ser:
  //  - undefined: sin body
  //  - FormData (uploads): se manda tal cual, sin Content-Type (el browser lo setea con boundary)
  //  - cualquier otro objeto: si json=true se JSON.stringify con Content-Type
  const isFormData = body instanceof FormData;

  const headers = authHeaders();
  if (json && body !== undefined && !isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  const fetchBody = body === undefined
    ? undefined
    : isFormData
      ? body
      : (json ? JSON.stringify(body) : body);

  const res = await fetch(path, {
    method,
    headers,
    body: fetchBody,
    credentials: 'include',
  });

  let data = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try { data = await res.json(); }
    catch { data = await res.text(); }
  } else {
    data = await res.text();
  }
  return { ok: res.ok, status: res.status, data };
}

export async function api(path, { method = 'GET', body, json = true } = {}) {
  const first = await doFetch(path, { method, body, json });

  // Si el access token venció (15 min), intentamos un refresh silencioso y
  // reintentamos UNA vez. Así la sesión no se corta mientras se usa el panel.
  // FormData no se puede reenviar de forma confiable después de consumido en
  // algunos browsers, pero fetch con el mismo objeto funciona en los modernos.
  const isAuthPath = path.startsWith('/api/auth/');
  if (first.status === 401 && !isAuthPath && getAccessToken()) {
    const r = await refreshSession();
    if (r.ok) {
      setAccessToken(r.data.data.access_token);
      return doFetch(path, { method, body, json });
    }
    setAccessToken(null);
  }
  return first;
}
