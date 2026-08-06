// Sesión por inactividad: el access token dura 15 min. Mientras haya actividad
// (mouse, teclado, scroll), lo renovamos en silencio antes de que venza. Si
// pasan 15 min sin actividad, cerramos sesión.
//
// Vive en un hook porque lo usan los dos layouts (el Home y los supermódulos).
// Antes estaba dentro del Layout único; al partirlo en dos, dejarlo en uno solo
// haría que la otra pantalla nunca cerrara sesión.

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setAccessToken, refreshSession } from '../api.js';

const IDLE_LIMIT_MS = 15 * 60 * 1000;
const KEEPALIVE_EVERY_MS = 10 * 60 * 1000;

export function useIdleSession() {
  const navigate = useNavigate();

  useEffect(() => {
    let lastActivity = Date.now();
    let lastRefresh = Date.now();
    const markActivity = () => { lastActivity = Date.now(); };
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, markActivity, { passive: true }));

    const timer = setInterval(async () => {
      const now = Date.now();
      if (now - lastActivity > IDLE_LIMIT_MS) {
        // 15 min sin actividad: cerrar sesión
        await api('/api/auth/logout', { method: 'POST' });
        setAccessToken(null);
        navigate('/login', { replace: true });
        return;
      }
      // Hay actividad reciente: renovar el token antes de que venza
      if (now - lastRefresh > KEEPALIVE_EVERY_MS) {
        const r = await refreshSession();
        if (r.ok) {
          setAccessToken(r.data.data.access_token);
          lastRefresh = now;
        }
      }
    }, 60 * 1000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, markActivity));
      clearInterval(timer);
    };
  }, [navigate]);
}
