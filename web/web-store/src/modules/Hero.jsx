// Módulo Hero: banner principal con título, subtítulo, imagen y CTA.

import React from 'react';
import { Link } from 'react-router-dom';

export default function Hero({ settings = {} }) {
  const {
    title,
    subtitle,
    image_url,
    cta_text,
    cta_link,
    secondary_cta_text = 'Explorar catálogo',
    secondary_cta_link = '/categoria',
    eyebrow = 'Tecnología para tu día a día',
  } = settings;
  const style = image_url
    ? { backgroundImage: `linear-gradient(rgba(15,42,71,0.55), rgba(15,42,71,0.7)), url(${image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : undefined;
  return (
    <section className="hero" style={style}>
      <div className="hero-glow hero-glow-one" />
      <div className="hero-glow hero-glow-two" />
      <div className="hero-content">
        <span className="hero-eyebrow"><span />{eyebrow}</span>
        {title && <h1>{title}</h1>}
        {subtitle && <p>{subtitle}</p>}
        <div className="hero-actions">
          {cta_text && cta_link && (
            cta_link.startsWith('http')
              ? <a href={cta_link} className="btn btn-accent">{cta_text}<span>↗</span></a>
              : <Link to={cta_link} className="btn btn-accent">{cta_text}<span>→</span></Link>
          )}
          {secondary_cta_text && secondary_cta_link && <Link to={secondary_cta_link} className="hero-secondary-link">{secondary_cta_text}<span>→</span></Link>}
        </div>
        <div className="hero-proof"><span><strong>Compra segura</strong><small>Pago protegido</small></span><span><strong>Envíos nacionales</strong><small>A donde estés</small></span></div>
      </div>
      <div className="hero-visual" aria-hidden="true">
        {image_url ? <div className="hero-image-frame" /> : <><div className="hero-orbit hero-orbit-one" /><div className="hero-orbit hero-orbit-two" /><div className="hero-device"><span>TS</span></div></>}
        <div className="hero-floating-card hero-floating-card-top"><span className="floating-dot" />Selección TechStore</div>
        <div className="hero-floating-card hero-floating-card-bottom"><strong>+ calidad</strong><span>+ estilo</span></div>
      </div>
    </section>
  );
}
