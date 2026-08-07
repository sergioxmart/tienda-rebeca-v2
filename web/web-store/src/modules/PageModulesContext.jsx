// Carga los módulos publicados o el borrador enviado por el Web Builder.

import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useBuilderPreview } from '../preview/BuilderPreviewContext.jsx';

const PageModulesContext = createContext({ modules: null, error: null, preview: false });

export function PageModulesProvider({ children }) {
  const builderPreview = useBuilderPreview();
  const [modules, setModules] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (builderPreview.active) {
      setModules(Array.isArray(builderPreview.draft?.modules) ? builderPreview.draft.modules : null);
      setError(null);
      return undefined;
    }
    let cancelled = false;
    api.pageModules()
      .then((data) => {
        if (!cancelled) setModules(data.modules || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => { cancelled = true; };
  }, [builderPreview.active, builderPreview.draft]);

  return <PageModulesContext.Provider value={{ modules, error, preview: builderPreview.active }}>
    {children}
  </PageModulesContext.Provider>;
}

export function usePageModules() {
  return useContext(PageModulesContext);
}
