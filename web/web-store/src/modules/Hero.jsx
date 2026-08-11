// Módulo Hero: banner principal con título, subtítulo, imagen y CTA.

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Price from '../components/Price.jsx';
import CustomCode from './CustomCode.jsx';

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
    visual_mode = 'abstract',
    product_slug,
    visual_image_url,
    custom_code_enabled,
    custom_code,
  } = settings;
  const [product, setProduct] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (visual_mode !== 'product' || !product_slug) {
      setProduct(null);
      return undefined;
    }
    api.product(product_slug).then((data) => {
      if (!cancelled) setProduct(data);
    }).catch(() => {
      if (!cancelled) setProduct(null);
    });
    return () => { cancelled = true; };
  }, [product_slug, visual_mode]);

  const productImage = product?.image_url
    || product?.thumb_url
    || product?.media?.find((media) => media.kind === 'image')?.url
    || product?.variants?.flatMap((variant) => variant.media || []).find((media) => media.kind === 'image')?.url;
  const visualImage = visual_mode === 'image' ? visual_image_url : productImage;
  const style = image_url
    ? { backgroundImage: `linear-gradient(rgba(15,42,71,0.55), rgba(15,42,71,0.7)), url(${image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : undefined;
  if (custom_code_enabled && custom_code) {
    return <CustomCode code={custom_code} className="hero-custom-code" />;
  }
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
      <div className={`hero-visual ${visual_mode === 'product' ? 'hero-visual-product' : ''}`} aria-label={product ? `Producto destacado: ${product.name}` : undefined}>
        {visualImage
          ? <div className="hero-device hero-device-product"><img src={visualImage} alt={product?.name || 'Imagen destacada'} /></div>
          : <><div className="hero-orbit hero-orbit-one" /><div className="hero-orbit hero-orbit-two" /><div className="hero-device"><span>TS</span></div></>}
        <div className="hero-floating-card hero-floating-card-top"><span className="floating-dot" />{product ? product.name : 'Selección Rebeca Andrade'}</div>
        {product
          ? <div className="hero-floating-card hero-floating-card-bottom"><strong><Price value={product.base_price} /></strong><span>{product.brand || 'Producto destacado'}</span></div>
          : <div className="hero-floating-card hero-floating-card-bottom"><strong>+ calidad</strong><span>+ estilo</span></div>}
      </div>
    </section>
  );
}
