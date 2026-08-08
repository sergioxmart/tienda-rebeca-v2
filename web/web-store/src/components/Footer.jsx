// Footer con datos de contacto del site_config.

import React from 'react';
import { useSite } from '../site/SiteContext.jsx';
import { usePageModules } from '../modules/PageModulesContext.jsx';
import CustomCode from '../modules/CustomCode.jsx';

function WhatsAppIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 3.5A11.8 11.8 0 0 0 12.08 0C5.54 0 .22 5.32.22 11.86c0 2.09.55 4.13 1.59 5.92L.1 24l6.37-1.67a11.84 11.84 0 0 0 5.61 1.42h.01c6.54 0 11.86-5.32 11.86-11.86 0-3.17-1.23-6.15-3.45-8.39ZM12.09 21.72h-.01a9.83 9.83 0 0 1-5.01-1.37l-.36-.21-3.78.99 1.01-3.68-.23-.38a9.84 9.84 0 1 1 8.38 4.65Zm5.4-7.38c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.27-.47-2.42-1.5-.89-.79-1.5-1.77-1.68-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.1 3.21 5.09 4.5.71.31 1.27.49 1.71.63.72.23 1.37.2 1.89.12.58-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35Z" /></svg>;
}

function InstagramIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4.1" /><circle cx="17.35" cy="6.65" r="1" className="footer-social-dot" /></svg>;
}

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
  if (settings.custom_code_enabled && settings.custom_code) {
    return <CustomCode code={settings.custom_code} className="footer-custom-code" />;
  }
  const title = settings.title || site.site_name;
  const description = settings.description || (site.contact_address_lines?.length > 0
    ? site.contact_address_lines.join(', ')
    : (site.contact_address || 'Bogotá, Colombia'));
  const showCategories = settings.show_categories !== false;
  const showContact = settings.show_contact !== false;
  const copyright = `© 2026 ${site.site_name} · Hecho con cariño en Colombia por Sergio Martinez`;

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
        <span>{copyright}</span>
        <span className="footer-social-signature">
          <a href="https://wa.me/sergioxmart" target="_blank" rel="noreferrer" aria-label="WhatsApp"><WhatsAppIcon /></a>
          <a href="https://instagram.com/sergioxmart" target="_blank" rel="noreferrer" aria-label="Instagram"><InstagramIcon /></a>
          <span>@sergioxmart</span>
        </span>
      </div>
    </footer>
  );
}
