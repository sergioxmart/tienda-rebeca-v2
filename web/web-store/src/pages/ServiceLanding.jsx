import React from 'react';
import { useLocation } from 'react-router-dom';
import { usePageModules } from '../modules/PageModulesContext.jsx';
import { MODULE_RENDERERS } from '../modules/registry.js';
import { useSite } from '../site/SiteContext.jsx';

export default function ServiceLanding() {
  const { modules, error } = usePageModules();
  const { categories } = useSite();
  const location = useLocation();
  const slug = location.pathname.startsWith('/categoria/') ? location.pathname.split('/')[2] : '';
  const activeCategory = categories.find((category) => category.slug === slug);

  if (error) {
    return <div className="empty"><h3>No se pudo cargar esta página</h3><p>{error}</p></div>;
  }
  if (modules === null) return <div className="center"><span className="spinner" /></div>;
  if (modules.length === 0) {
    return (
      <div className="service-landing-empty empty">
        <span className="section-kicker">{activeCategory?.name || 'Servicio'}</span>
        <h1>Esta página estará disponible pronto</h1>
        <p>El contenido del servicio todavía no ha sido configurado.</p>
      </div>
    );
  }

  return (
    <div className="service-landing">
      {modules.map((module) => {
        if (module.type === 'footer') return null;
        const Renderer = MODULE_RENDERERS[module.type];
        if (!Renderer) return null;
        return <Renderer key={module.id} settings={module.settings || {}} />;
      })}
    </div>
  );
}
