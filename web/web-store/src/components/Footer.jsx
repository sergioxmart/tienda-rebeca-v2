// Footer con datos de contacto del site_config.

import React from 'react';
import { useSite } from '../site/SiteContext.jsx';

export default function Footer() {
  const { site, categories } = useSite();
  if (!site) return null;

  return (
    <footer className="footer">
      <div className="footer-inner">
        <div>
          <h4>{site.site_name}</h4>
          <p style={{ fontSize: 13, margin: 0 }}>
            {site.contact_address_lines?.length > 0 ? site.contact_address_lines.join(', ') : 'Bogotá, Colombia'}
          </p>
        </div>
        {categories.length > 0 && (
          <div>
            <h4>Categorías</h4>
            {categories.slice(0, 6).map((c) => (
              <div key={c.id}><a href={`/categoria/${c.slug}`}>{c.name}</a></div>
            ))}
          </div>
        )}
        <div>
          <h4>Contacto</h4>
          {site.contact_email && <div>{site.contact_email}</div>}
          {site.contact_phone && <div>{site.contact_phone_display || site.contact_phone}</div>}
          {site.contact_instagram && <div><a href={site.contact_instagram} target="_blank" rel="noreferrer">Instagram</a></div>}
          {site.contact_facebook && <div><a href={site.contact_facebook} target="_blank" rel="noreferrer">Facebook</a></div>}
        </div>
      </div>
      <div className="footer-bottom">
        © {new Date().getFullYear()} {site.site_name} · Hecho con cariño en Colombia
      </div>
    </footer>
  );
}
