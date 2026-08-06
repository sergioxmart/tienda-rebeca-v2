// Pantalla de login. Form simple email + password.
//
// Errores: el server puede devolver 401 con code 'invalid_credentials' o
// 'account_locked' (rate limit progresivo). Mostramos el mensaje tal cual.
//
// El color de fondo del shell se lee del site_config (key admin_login_bg).
// Como esta página es pública (no requiere auth), lo trae con fetch
// directo a /api/public/site-config, no via api wrapper con token.

import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { ApiError } from '../api.js';

export default function Login() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [bg, setBg] = useState('#0F2A47');  // default azul TechStore
  const [storeName, setStoreName] = useState('TechStore');
  const [logoUrl, setLogoUrl] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/public/site-config');
        const data = await res.json();
        const c = data?.config;
        if (c && typeof c.admin_login_bg === 'string' && /^#[0-9A-Fa-f]{3,8}$/.test(c.admin_login_bg)) {
          setBg(c.admin_login_bg);
        }
        // También usamos el site_name para el título de la pantalla
        // y como document.title (pestaña del browser).
        if (c && typeof c.site_name === 'string' && c.site_name.trim()) {
          setStoreName(c.site_name);
          document.title = `${c.site_name} · Admin`;
        }
        if (c && typeof c.logo_url === 'string' && c.logo_url) setLogoUrl(c.logo_url);
      } catch { /* fallback al default */ }
    })();
  }, []);

  if (status === 'auth') {
    return <Navigate to={location.state?.from?.pathname || '/'} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      const to = location.state?.from?.pathname || '/';
      navigate(to, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || 'No se pudo iniciar sesión.');
      } else {
        setError('Error de red. Intenta de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell" style={{ background: bg }}>
      <form className="login-card" onSubmit={handleSubmit}>
        {logoUrl && <img className="login-logo" src={logoUrl} alt={`Logo de ${storeName}`} />}
        <h1>{storeName} · Admin</h1>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="form-group">
          <label htmlFor="email">Correo</label>
          <input id="email" className="input" type="email" required
                 value={email} onChange={(e) => setEmail(e.target.value)}
                 autoComplete="username" autoFocus />
        </div>
        <div className="form-group">
          <label htmlFor="password">Contraseña</label>
          <input id="password" className="input" type="password" required
                 value={password} onChange={(e) => setPassword(e.target.value)}
                 autoComplete="current-password" />
        </div>
        <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
          {loading ? <span className="spinner" /> : 'Iniciar sesión'}
        </button>
      </form>
    </div>
  );
}
