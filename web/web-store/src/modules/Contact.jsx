import React from 'react';
import { useSite } from '../site/SiteContext.jsx';
import CustomCode from './CustomCode.jsx';

export default function Contact({ settings = {} }) {
  const { site } = useSite();
  if (settings.custom_code_enabled && settings.custom_code) return <CustomCode code={settings.custom_code} className="contact-custom-code" />;
  if (!site) return null;
  return (
    <section className="editorial-contact">
      <div>
        <span className="section-kicker">Estamos para ayudarte</span>
        <h2>Contacto</h2>
        {site.contact_address_lines?.map((line, index) => <p key={index}>{line}</p>)}
        {site.contact_phone_display && <p><strong>WhatsApp</strong><br />{site.contact_phone_display}</p>}
      </div>
      <div>
        <h3>Horarios</h3>
        {site.business_hours_weekday && <p>{site.business_hours_weekday}</p>}
        {site.business_hours_holiday && <p>{site.business_hours_holiday}</p>}
        {(site.contact_instagram || site.contact_facebook) && <><h3>Redes</h3>{site.contact_instagram && <p><a href={site.contact_instagram} target="_blank" rel="noreferrer">Instagram</a></p>}{site.contact_facebook && <p><a href={site.contact_facebook} target="_blank" rel="noreferrer">Facebook</a></p>}</>}
      </div>
    </section>
  );
}
