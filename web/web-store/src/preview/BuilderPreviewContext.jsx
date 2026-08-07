import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const BuilderPreviewContext = createContext({ active: false, draft: null });

export function BuilderPreviewProvider({ children }) {
  const active = useMemo(() => new URLSearchParams(window.location.search).has('builder_preview'), []);
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    if (!active) return undefined;

    const receive = (event) => {
      if (event.source !== window.parent || event.data?.type !== 'techstore-builder-preview') return;
      if (event.data.draft && Array.isArray(event.data.draft.modules)) setDraft(event.data.draft);
    };
    window.addEventListener('message', receive);
    window.parent.postMessage({ type: 'techstore-builder-preview-ready' }, '*');
    return () => window.removeEventListener('message', receive);
  }, [active]);

  return (
    <BuilderPreviewContext.Provider value={{ active, draft }}>
      {children}
    </BuilderPreviewContext.Provider>
  );
}

export function useBuilderPreview() {
  return useContext(BuilderPreviewContext);
}
