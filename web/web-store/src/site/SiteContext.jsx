// SiteContext: cachea site-config + categorías para toda la app.
//
// En la primera carga, los trae en paralelo. Las pages que los necesitan
// los consumen con useSite().

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { useBuilderPreview } from '../preview/BuilderPreviewContext.jsx';
import { applyStoreTheme } from './storeTheme.js';

const SiteContext = createContext(null);

export function SiteProvider({ children }) {
  const preview = useBuilderPreview();
  const location = useLocation();
  const [site, setSite] = useState(null);
  const [siteLoading, setSiteLoading] = useState(true);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [s, c] = await Promise.all([api.siteConfig(), api.categories()]);
        setSite(s);
        setCategories(c || []);
      } catch {
        // si falla, la app sigue con defaults vacíos
      } finally {
        setSiteLoading(false);
      }
    })();
  }, []);

  const visibleSite = useMemo(() => (
    preview.active && preview.draft?.site_config_subset
      ? { ...site, ...preview.draft.site_config_subset }
      : site
  ), [preview.active, preview.draft, site]);

  const activeCategory = useMemo(() => {
    const match = location.pathname.match(/^\/categoria\/([^/]+)/);
    if (!match) return null;
    try {
      const slug = decodeURIComponent(match[1]);
      return categories.find((category) => category.slug === slug) || null;
    } catch {
      return null;
    }
  }, [categories, location.pathname]);

  useEffect(() => {
    if (visibleSite) applyStoreTheme(visibleSite, activeCategory);
  }, [activeCategory, visibleSite]);

  useEffect(() => {
    if (!visibleSite) return;
    document.title = visibleSite.site_name || 'Rebeca Andrade';
    const iconUrl = visibleSite.navbar_custom_logo_url || visibleSite.logo_url;
    if (!iconUrl) return;
    let icon = document.querySelector('link[rel~="icon"]');
    if (!icon) {
      icon = document.createElement('link');
      icon.rel = 'icon';
      document.head.appendChild(icon);
    }
    icon.href = iconUrl;
  }, [visibleSite]);

  useEffect(() => {
    const styleId = 'store-custom-font-faces';
    let style = document.getElementById(styleId);
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }
    const formats = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' };
    const fonts = Array.isArray(visibleSite?.custom_fonts) ? visibleSite.custom_fonts : [];
    style.textContent = fonts.filter((font) => /^RebecaFont_[a-f0-9]+$/i.test(font?.family || '')
      && /^\/media\/site\/fonts\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.(woff2|woff|ttf|otf)$/i.test(font?.url || '')
      && formats[font?.format]).map((font) => `@font-face{font-family:"${font.family}";src:url("${font.url}") format("${formats[font.format]}");font-display:swap;}`).join('\n');
  }, [visibleSite?.custom_fonts]);

  return (
    <SiteContext.Provider value={{ site: visibleSite, categories, siteLoading }}>
      {children}
    </SiteContext.Provider>
  );
}

export function useSite() {
  const ctx = useContext(SiteContext);
  if (!ctx) throw new Error('useSite debe usarse dentro de SiteProvider');
  return ctx;
}
