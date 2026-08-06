// Módulo Hero: banner principal con título, subtítulo, imagen y CTA.

import React from 'react';
import { Link } from 'react-router-dom';

export default function Hero({ settings = {} }) {
  const { title, subtitle, image_url, cta_text, cta_link } = settings;
  const style = image_url
    ? { backgroundImage: `linear-gradient(rgba(15,42,71,0.55), rgba(15,42,71,0.7)), url(${image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : undefined;
  return (
    <section className="hero" style={style}>
      {title && <h1>{title}</h1>}
      {subtitle && <p>{subtitle}</p>}
      {cta_text && cta_link && (
        cta_link.startsWith('http')
          ? <a href={cta_link} className="btn btn-accent">{cta_text}</a>
          : <Link to={cta_link} className="btn btn-accent">{cta_text}</Link>
      )}
    </section>
  );
}
