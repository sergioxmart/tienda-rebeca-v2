// Footer con datos de contacto del site_config.

import React from 'react';
import { useSite } from '../site/SiteContext.jsx';
import { usePageModules } from '../modules/PageModulesContext.jsx';

export default function Footer() {
  const { site, categories } = useSite();
  const { modules } = usePageModules();
  if (!site) return null;

  const footerModule = modules?.find((module) => module.type === 'footer' && module.active !== false);
  // Cuando la respuesta de módulos ya llegó, la presencia del Footer queda
  // determinada por el Builder. Solo usamos el diseño por defecto mientras
  // la carga inicial todavía está pendiente o si una instalación antigua aún
  // no ha ejecutado la migración del módulo.
  if (modules && !footerModule) return null;
  const settings = footerModule?.settings || {};
  const title = settings.title || site.site_name;
  const description = settings.description || (site.contact_address_lines?.length > 0
    ? site.contact_address_lines.join(', ')
    : (site.contact_address || 'Bogotá, Colombia'));
  const showCategories = settings.show_categories !== false;
  const showContact = settings.show_contact !== false;
  const copyright = settings.copyright || `© ${new Date().getFullYear()} ${site.site_name} · Hecho con cariño en Colombia`;

  return (
    <footer className="footer">
      <div className="footer-inner">
        <div>
          <h4>{title}</h4>
          <p style={{ fontSize: 13, margin: 0 }}>
            {description}
          </p>
        </div>
        {showCategories && categories.length > 0 && (
          <div>
            <h4>Categorías</h4>
            {categories.slice(0, 6).map((c) => (
              <div key={c.id}><a href={`/categoria/${c.slug}`}>{c.name}</a></div>
            ))}
          </div>
        )}
        {showContact && <div>
          <h4>Contacto</h4>
          {site.contact_email && <div>{site.contact_email}</div>}
          {site.contact_phone && <div>{site.contact_phone_display || site.contact_phone}</div>}
          {site.contact_instagram && <div><a href={site.contact_instagram} target="_blank" rel="noreferrer">Instagram</a></div>}
          {site.contact_facebook && <div><a href={site.contact_facebook} target="_blank" rel="noreferrer">Facebook</a></div>}
        </div>}
      </div>
      <div className="footer-bottom">
        {copyright}
      </div>
    </footer>
  );
}
