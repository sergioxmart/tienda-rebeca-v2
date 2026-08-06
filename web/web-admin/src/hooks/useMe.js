// Hook compartido: trae el usuario logueado desde /api/auth/me.
// Devuelve `null` mientras carga o si falla. Las páginas lo usan para
// mostrar/ocultar UI según rol via <RoleGate>.

import { useEffect, useState } from 'react';
import { api } from '../api.js';

export function useMe() {
  const [me, setMe] = useState(null);
  useEffect(() => {
    let alive = true;
    api('/api/auth/me').then((r) => {
      if (alive && r.ok) setMe(r.data.data);
    });
    return () => { alive = false; };
  }, []);
  return me;
}
