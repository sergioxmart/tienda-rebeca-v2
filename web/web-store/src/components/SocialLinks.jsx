import React from 'react';
import { useSite } from '../site/SiteContext.jsx';

function SocialIcon({ name }) {
  if (name === 'Teléfono') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 2.5 9.2 2c.7-.1 1.3.3 1.5 1l1.1 3.4c.2.6 0 1.2-.5 1.6l-1.6 1.3a14.7 14.7 0 0 0 6 6l1.3-1.6c.4-.5 1-.7 1.6-.5l3.4 1.1c.7.2 1.1.8 1 1.5l-.5 2.6c-.1.7-.8 1.2-1.5 1.2C10.5 19.6 4.4 13.5 5 4c0-.7.5-1.4 1.2-1.5Z" /></svg>;
  if (name === 'WhatsApp') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 3.5A11.8 11.8 0 0 0 12.08 0C5.54 0 .22 5.32.22 11.86c0 2.09.55 4.13 1.59 5.92L.1 24l6.37-1.67a11.84 11.84 0 0 0 5.61 1.42h.01c6.54 0 11.86-5.32 11.86-11.86 0-3.17-1.23-6.15-3.45-8.39ZM12.09 21.72h-.01a9.83 9.83 0 0 1-5.01-1.37l-.36-.21-3.78.99 1.01-3.68-.23-.38a9.84 9.84 0 1 1 8.38 4.65Zm5.4-7.38c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.27-.47-2.42-1.5-.89-.79-1.5-1.77-1.68-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.1 3.21 5.09 4.5.71.31 1.27.49 1.71.63.72.23 1.37.2 1.89.12.58-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35Z" /></svg>;
  if (name === 'Instagram') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4.1" /><circle cx="17.35" cy="6.65" r="1" className="social-icon-dot" /></svg>;
  if (name === 'Facebook') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.6 21v-8.2h2.8l.42-3.2H13.6V7.56c0-.93.26-1.56 1.6-1.56h1.7V3.14A22.6 22.6 0 0 0 14.42 3c-2.45 0-4.12 1.5-4.12 4.25V9.6H7.5v3.2h2.8V21h3.3Z" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.9 8.8a6.1 6.1 0 0 1-3.74-1.28v7.05a5.43 5.43 0 1 1-4.68-5.38v3.1a2.37 2.37 0 1 0 1.59 2.24V2.5h3.1c.2 2.05 1.65 3.67 3.73 3.87v2.43Z" /></svg>;
}

function configuredUrl(value) {
  const url = String(value || '').trim();
  return /^https?:\/\//i.test(url) ? url : '';
}

function getSocialLinks(site) {
  const phone = String(site?.contact_phone || '').replace(/\D/g, '');
  const whatsapp = configuredUrl(site?.contact_whatsapp) || (phone ? `https://wa.me/${phone}` : '');
  return [
    { name: 'Instagram', href: configuredUrl(site?.contact_instagram), external: true },
    { name: 'WhatsApp', href: whatsapp, external: true },
    { name: 'Facebook', href: configuredUrl(site?.contact_facebook), external: true },
    { name: 'TikTok', href: configuredUrl(site?.contact_tiktok), external: true },
  ].filter((social) => social.href);
}

function getPhoneOption(site) {
  const whatsAppPath = (() => {
    try {
      const url = new URL(configuredUrl(site?.contact_whatsapp));
      return url.hostname === 'wa.me' ? url.pathname.replace(/^\/+/, '') : '';
    } catch {
      return '';
    }
  })();
  const source = String(site?.contact_phone || site?.contact_phone_display || whatsAppPath || '').trim();
  const digits = source.replace(/\D/g, '');
  if (!digits) return null;
  const visibleNumber = site?.contact_phone_display || site?.contact_phone || `+${digits}`;
  return { name: 'Teléfono', href: `tel:+${digits}`, display: visibleNumber, external: false };
}

export function FooterSocialLinks({ site }) {
  const links = getSocialLinks(site);
  if (!links.length) return null;
  return <div className="footer-social-links">
    {links.map((social) => <a key={social.name} href={social.href} target="_blank" rel="noreferrer">
      <span className="footer-social-icon"><SocialIcon name={social.name} /></span>
      <span>{social.name}</span>
    </a>)}
  </div>;
}

export default function FloatingSocialLinks() {
  const { site } = useSite();
  const [open, setOpen] = React.useState(false);
  const phoneOption = getPhoneOption(site);
  const links = [...getSocialLinks(site), ...(phoneOption ? [phoneOption] : [])];

  React.useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!links.length) return null;
  return <div className="floating-social">
    {open && <div className="floating-social-menu" id="floating-social-menu" aria-label="Redes sociales y teléfono">
      {links.map((social) => <a key={social.name} href={social.href} target={social.external ? '_blank' : undefined} rel={social.external ? 'noreferrer' : undefined}>
        <span className="floating-social-icon"><SocialIcon name={social.name} /></span>
        <span>{social.display || social.name}</span>
      </a>)}
    </div>}
    <button className="floating-social-toggle" type="button" aria-expanded={open} aria-controls="floating-social-menu" aria-label={open ? 'Cerrar redes sociales' : 'Abrir redes sociales'} onClick={() => setOpen((value) => !value)}>
      <span aria-hidden="true">{open ? '×' : <SocialIcon name="WhatsApp" />}</span>
      <span className="sr-only">{open ? 'Cerrar redes sociales' : 'Abrir redes sociales'}</span>
    </button>
  </div>;
}
