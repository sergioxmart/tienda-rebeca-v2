// Contexto de auth para el admin. Maneja:
//   - token (en sessionStorage, via api.js)
//   - user (id, email, role)
//   - estado: 'loading' (verificando sesión al boot), 'auth' (logueado),
//     'guest' (sin sesión).
//   - login(email, password) -> setea token + user, navega al dashboard.
//   - logout() -> limpia todo, navega a /login.
//
// Boot: si NO hay token en sessionStorage, asumimos 'guest' directo
//   (sin gastar el request a /me que tiraría 401 y dejaría ruido en la
//   pestaña Network del browser). Si hay token, intentamos /me.

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, getToken, setToken, setUnauthorizedHandler } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [status, setStatus] = useState('loading');
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setUser(null);
      setStatus('guest');
      navigate('/login', { replace: true, state: { sessionExpired: true } });
    });
    return () => setUnauthorizedHandler(null);
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;

    // Sin token → guest inmediato, sin pegarle al server.
    if (!getToken()) {
      setStatus('guest');
      return () => { cancelled = true; };
    }

    // Con token → verificar que sigue vivo.
    (async () => {
      try {
        const data = await api.me();
        if (cancelled) return;
        setUser(data?.user || data?.data?.user || data?.data || null);
        setStatus('auth');
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 401 || err.code === 'unauthorized')) {
          // Token expirado o inválido → limpiar y guest.
          // api.js no tiene logout acá, pero seteamos status y el
          // siguiente render ya no muestra nada protegido.
          setToken(null);
          setStatus('guest');
        } else {
          // Error de red u otro: tratar como guest pero log.
          console.error('auth boot error', err);
          setStatus('guest');
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email, password, totpCode) => {
    const data = await api.login(email, password, totpCode);
    const u = data?.user || data?.data?.user || null;
    setUser(u);
    setStatus('auth');
    return u;
  }, []);

  const completeFirstTwoFactor = useCallback(async (setupToken, code) => {
    const data = await api.firstTwoFactorEnable(setupToken, code);
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

  const value = { status, user, login, completeFirstTwoFactor, logout };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
