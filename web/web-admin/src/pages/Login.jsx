// Pantalla de login. Form simple email + password.
//
// Errores: el server puede devolver 401 con code 'invalid_credentials' o
// 'account_locked' (rate limit progresivo). Mostramos el mensaje tal cual.

import React, { useState } from 'react';
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
        setError('Error de red. Intentá de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>TechStore · Admin</h1>
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
