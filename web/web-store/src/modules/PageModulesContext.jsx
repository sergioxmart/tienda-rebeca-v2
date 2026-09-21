// Carga los módulos publicados o el borrador enviado por el Web Builder.

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { useBuilderPreview } from '../preview/BuilderPreviewContext.jsx';
import { useSite } from '../site/SiteContext.jsx';

const PageModulesContext = createContext({ modules: null, error: null, preview: false });

export function PageModulesProvider({ children }) {
  const builderPreview = useBuilderPreview();
  const location = useLocation();
  const { categories } = useSite();
  const pageKey = useMemo(() => {
    if (builderPreview.active) return builderPreview.pageKey || 'store';
    const slug = location.pathname.startsWith('/categoria/') ? location.pathname.split('/')[2] : '';
    const category = categories.find((item) => item.slug === slug);
    return category?.is_service ? `service:${category.slug}` : 'store';
  }, [builderPreview.active, builderPreview.pageKey, categories, location.pathname]);
  const [modules, setModules] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (builderPreview.active) {
      setModules(Array.isArray(builderPreview.draft?.modules)
        ? builderPreview.draft.modules.filter((module) => (module.page_key || 'store') === pageKey)
        : null);
      setError(null);
      return undefined;
    }
    let cancelled = false;
    api.pageModules(pageKey)
      .then((data) => {
        if (!cancelled) setModules(data.modules || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => { cancelled = true; };
  }, [builderPreview.active, builderPreview.draft, pageKey]);

  return <PageModulesContext.Provider value={{ modules, error, preview: builderPreview.active, pageKey }}>
    {children}
  </PageModulesContext.Provider>;
}

export function usePageModules() {
  return useContext(PageModulesContext);
}
