// Footer con datos de contacto del site_config.

import React from 'react';
import { useSite } from '../site/SiteContext.jsx';
import { usePageModules } from '../modules/PageModulesContext.jsx';
import CustomCode from '../modules/CustomCode.jsx';
import { FooterSocialLinks } from './SocialLinks.jsx';

export default function Footer() {
  const { site, categories } = useSite();
  const { modules, storeModules } = usePageModules();
  if (!site) return null;

  const globalModules = storeModules ?? modules;
  const footerModule = globalModules?.find((module) => module.type === 'footer' && module.active !== false);
  // Cuando la respuesta de módulos ya llegó, la presencia del Footer queda
  // determinada por el Builder. Solo usamos el diseño por defecto mientras
  // la carga inicial todavía está pendiente o si una instalación antigua aún
  // no ha ejecutado la migración del módulo.
  if (globalModules && !footerModule) return null;
  const settings = footerModule?.settings || {};
  if (settings.custom_code_enabled && settings.custom_code) {
    return <CustomCode code={settings.custom_code} className="footer-custom-code" />;
  }
  const title = settings.title || site.site_name;
  const description = settings.description || (site.contact_address_lines?.length > 0
    ? site.contact_address_lines.join(', ')
    : (site.contact_address || 'Bogotá, Colombia'));
  const showCategories = settings.show_categories !== false;
  const showContactSetting = settings.show_contact !== false;
  const showSocialLinks = settings.show_social_links !== false;
  const hasSocialLinks = Boolean(site.contact_whatsapp || site.contact_phone || site.contact_instagram || site.contact_facebook || site.contact_tiktok);
  const showContact = showContactSetting && Boolean(site.contact_email || site.contact_phone || (showSocialLinks && hasSocialLinks));
  const footerColumns = 1 + Number(showCategories && categories.length > 0) + Number(showContact);
  const copyright = settings.copyright_text || `© ${new Date().getFullYear()} ${site.site_name}`;
  const configuredColumnOrder = String(settings.column_order || 'brand-categories-contact').split('-');
  const validColumnOrder = ['brand', 'categories', 'contact'].every((column) => configuredColumnOrder.includes(column))
    && configuredColumnOrder.length === 3;
  const columnOrder = validColumnOrder ? configuredColumnOrder : ['brand', 'categories', 'contact'];
  const phoneDigits = String(site.contact_phone || site.contact_phone_display || '').replace(/\D/g, '');
  const whatsappPath = (() => {
    try {
      const url = new URL(site.contact_whatsapp);
      return url.hostname === 'wa.me' ? url.pathname.replace(/^\/+/, '') : '';
    } catch {
      return '';
    }
  })();
  const phoneNumber = site.contact_phone_display || site.contact_phone || (whatsappPath ? `+${whatsappPath}` : '');
  const phoneHref = phoneDigits ? `tel:+${phoneDigits}` : whatsappPath ? `tel:+${whatsappPath.replace(/\D/g, '')}` : '';

  const columns = {
    brand: <div className="footer-column footer-column--brand">
      <h4>{title}</h4>
      {description && <p className="footer-description">{description}</p>}
    </div>,
    categories: showCategories && categories.length > 0 ? <div className="footer-column footer-column--categories">
      <h4>Categorías</h4>
      {categories.slice(0, 6).map((c) => (
        <div key={c.id}><a href={`/categoria/${c.slug}`}>{c.name}</a></div>
      ))}
    </div> : null,
    contact: showContact ? <div className="footer-column footer-column--contact">
      <h4>Contacto</h4>
      {site.contact_email && <div><a href={`mailto:${site.contact_email}`}>{site.contact_email}</a></div>}
      {phoneNumber && <div><a href={phoneHref || undefined}>{phoneNumber}</a></div>}
      {showSocialLinks && <FooterSocialLinks site={site} />}
    </div> : null,
  };

  return (
    <footer className="footer">
      <div className={`footer-inner footer-inner--${footerColumns}`}>
        {columnOrder.map((column) => columns[column] && React.cloneElement(columns[column], { key: column }))}
      </div>
      <div className="footer-bottom">
        <span>{copyright}</span>
      </div>
    </footer>
  );
}
