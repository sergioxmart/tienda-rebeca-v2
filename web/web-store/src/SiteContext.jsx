// Contexto global: site_config + collections (para header, nav y módulos).

import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const Ctx = createContext(null);

export function SiteProvider({ children }) {
  const [site, setSite] = useState(null);
  const [collections, setCollections] = useState([]);
  const [modules, setModules] = useState(null);

  useEffect(() => {
    api('/api/public/site-config').then((r) => r.ok && setSite(r.data.data));
    api('/api/public/collections').then((r) => r.ok && setCollections(r.data.data));
    api('/api/public/modules?slot=home').then((r) => r.ok && setModules(r.data.data));
  }, []);

  if (!site || modules === null) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--gray)' }}>
        Cargando…
      </div>
    );
  }

  return <Ctx.Provider value={{ site, collections, modules }}>{children}</Ctx.Provider>;
}

export function useSite() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSite debe estar dentro de SiteProvider');
  return v;
}
