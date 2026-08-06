// Contexto de auth para el admin. Maneja:
//   - token (en sessionStorage, via api.js)
//   - user (id, email, role)
//   - estado: 'loading' (verificando sesión al boot), 'auth' (logueado),
//     'guest' (sin sesión).
//   - login(email, password) -> setea token + user, navega al dashboard.
//   - logout() -> limpia todo, navega a /login.
//
// Boot: si hay token, intenta /api/auth/me. Si falla (401), limpia.
//   Mientras tanto, status='loading' y la UI muestra un spinner.

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, ApiError } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [status, setStatus] = useState('loading');
  const [user, setUser] = useState(null);

  // Al montar, intentar /me si hay token
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.me();
        if (cancelled) return;
        setUser(data?.user || data?.data?.user || null);
        setStatus('auth');
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 401 || err.code === 'unauthorized')) {
          setStatus('guest');
        } else {
          // Error de red u otro: tratar como guest pero log
          console.error('auth boot error', err);
          setStatus('guest');
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await api.login(email, password);
    const u = data?.user || data?.data?.user || null;
    setUser(u);
    setStatus('auth');
    return u;
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    setStatus('guest');
  }, []);

  const value = { status, user, login, logout };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
