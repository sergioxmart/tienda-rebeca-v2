// Wrapper de fetch para el admin.
//
// Maneja:
//   - Authorization header con el access_token (de sessionStorage).
//   - X-CSRF-Token en métodos que mutan (POST/PATCH/DELETE/PUT). El token
//     CSRF viene en una cookie de doble submit (no httpOnly) que el server
//     setea. En dev con Vite proxy y sameSite=lax funciona; si no aparece,
//     el server tira 403 con error 'csrf_missing' y le decimos al usuario.
//   - Parseo de respuesta: {ok, ...} o {ok: false, error: '...', ...}.
//   - Errores como Error con `.status`, `.code`, `.details`.
//
// Por qué sessionStorage y no localStorage: el token vive solo en esta
// pestaña. Si el admin abre múltiples pestañas, cada una maneja su propio
// token. Es un trade-off de seguridad vs UX. Para nuestro caso (uso admin
// interno) está bien.

const TOKEN_KEY = 'techstore.admin.token';
const CSRF_COOKIE = 'csrf_token';
let unauthorizedHandler = null;
let unauthorizedHandled = false;

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

export function getToken() {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
    if (token) unauthorizedHandled = false;
  } catch { /* ignore */ }
}

function getCsrfCookie() {
  const m = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(method, path, { body, isForm, headers } = {}) {
  const token = getToken();
  const finalHeaders = { ...headers };
  if (token) finalHeaders['Authorization'] = `Bearer ${token}`;

  let payload;
  if (isForm) {
    payload = body;  // FormData, browser sets Content-Type
  } else if (body !== undefined) {
    finalHeaders['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  // CSRF para métodos que mutan
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
    const csrf = getCsrfCookie();
    if (csrf) finalHeaders['X-CSRF-Token'] = csrf;
  }

  const res = await fetch(path, { method, headers: finalHeaders, body: payload, credentials: 'include' });

  // 204 No Content
  if (res.status === 204) return { ok: true };

  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = { ok: res.ok, error: await res.text().catch(() => 'unknown_error') };
  }

  if (!res.ok || (data && data.ok === false)) {
    if (res.status === 401 && path.startsWith('/api/admin/') && !unauthorizedHandled) {
      unauthorizedHandled = true;
      setToken(null);
      unauthorizedHandler?.();
    }
    const code = (data && data.error) || `http_${res.status}`;
    const message = (data && (data.message || data.error_human || (Array.isArray(data.errors) ? data.errors.filter((error) => typeof error === 'string').join(', ') : null))) || res.statusText;
    throw new ApiError(message, { status: res.status, code, details: data });
  }
  return data;
}

export const api = {
  get:    (path, opts)        => request('GET', path, opts),
  post:   (path, body, opts)  => request('POST', path, { ...opts, body }),
  patch:  (path, body, opts)  => request('PATCH', path, { ...opts, body }),
  put:    (path, body, opts)  => request('PUT', path, { ...opts, body }),
  delete: (path, opts)        => request('DELETE', path, opts),
  upload: (path, formData)    => request('POST', path, { body: formData, isForm: true }),

  // Auth helpers
  async login(email, password, totpCode) {
    const body = { email, password };
    if (totpCode) body.totp_code = totpCode;
    const data = await request('POST', '/api/auth/login', { body });
    if (data?.data?.access_token) setToken(data.data.access_token);
    return data;
  },
  firstTwoFactorSetup: (setupToken) => request('POST', '/api/auth/2fa/first-setup', { body: { setup_token: setupToken } }),
  async firstTwoFactorEnable(setupToken, totpCode) {
    const data = await request('POST', '/api/auth/2fa/first-enable', {
      body: { setup_token: setupToken, totp_code: totpCode },
    });
    if (data?.data?.access_token) setToken(data.data.access_token);
    return data;
  },
  recoverStart: (email) => request('POST', '/api/auth/password-recovery/start', { body: { email } }),
  recoverVerify: (recoveryToken, totpCode) => request('POST', '/api/auth/password-recovery/verify', { body: { recovery_token: recoveryToken, totp_code: totpCode } }),
  recoverComplete: (passwordToken, newPassword) => request('POST', '/api/auth/password-recovery/complete', { body: { password_token: passwordToken, new_password: newPassword } }),
  async logout() {
    try { await request('POST', '/api/auth/logout', { body: {} }); } catch { /* ignore */ }
    setToken(null);
  },
  async me() {
    return request('GET', '/api/auth/me');
  },
};

export { ApiError };
