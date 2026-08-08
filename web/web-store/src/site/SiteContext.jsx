// SiteContext: cachea site-config + categorías para toda la app.
//
// En la primera carga, los trae en paralelo. Las pages que los necesitan
// los consumen con useSite().

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useBuilderPreview } from '../preview/BuilderPreviewContext.jsx';
import { applyStoreTheme } from './storeTheme.js';

const SiteContext = createContext(null);

export function SiteProvider({ children }) {
  const preview = useBuilderPreview();
  const [site, setSite] = useState(null);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [s, c] = await Promise.all([api.siteConfig(), api.categories()]);
        setSite(s);
        setCategories(c || []);
      } catch {
        // si falla, la app sigue con defaults vacíos
      }
    })();
  }, []);

  const visibleSite = useMemo(() => (
    preview.active && preview.draft?.site_config_subset
      ? { ...site, ...preview.draft.site_config_subset }
      : site
  ), [preview.active, preview.draft, site]);

  useEffect(() => {
    if (visibleSite) applyStoreTheme(visibleSite);
  }, [visibleSite]);

  return (
    <SiteContext.Provider value={{ site: visibleSite, categories }}>
      {children}
    </SiteContext.Provider>
  );
}

export function useSite() {
  const ctx = useContext(SiteContext);
  if (!ctx) throw new Error('useSite debe usarse dentro de SiteProvider');
  return ctx;
}
