// Módulo Hero: banner principal con título, subtítulo, imagen y CTA.

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Price from '../components/Price.jsx';
import CustomCode from './CustomCode.jsx';
import { normalizeMediaPlacement } from './mediaPlacement.js';

const HERO_FONT_FAMILIES = {
  display: 'var(--font-display)',
  serif: 'Georgia, "Times New Roman", serif',
  sans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  script: '"Brush Script MT", "Segoe Script", cursive',
};

function colorValue(value, fallback) {
  return /^#[0-9A-Fa-f]{6}$/.test(String(value || '')) ? value : fallback;
}

function colorToRgba(value, alpha) {
  const hex = colorValue(value, '#000000').slice(1);
  const channels = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  return `rgba(${channels.join(',')},${alpha})`;
}

export default function Hero({ settings = {} }) {
  const {
    title,
    subtitle,
    image_url,
    image_placement,
    cta_text,
    cta_link,
    secondary_cta_text = 'Explorar catálogo',
    secondary_cta_link = '/categoria',
    eyebrow = 'Tecnología para tu día a día',
    visual_mode = 'abstract',
    product_slug,
    visual_image_url,
    visual_placement,
    custom_code_enabled,
    custom_code,
    content_align = 'center',
    overlay_enabled = true,
    content_position,
    text_color,
    text_font,
    button_background_color,
    button_text_color,
    button_font,
    shadow_enabled = false,
    shadow_intensity = 45,
    shadow_color = '#000000',
  } = settings;
  const minimalVisual = visual_mode === 'none';
  const normalizedContentAlign = ['left', 'center', 'right'].includes(content_align) ? content_align : 'center';
  const contentPosition = ['desktop', 'mobile'].reduce((result, viewport) => {
    const source = content_position?.[viewport] || {};
    const x = Number(source.x);
    const y = Number(source.y);
    result[viewport] = {
      x: Number.isFinite(x) ? Math.min(100, Math.max(0, x)) : 50,
      y: Number.isFinite(y) ? Math.min(100, Math.max(0, y)) : 50,
    };
    return result;
  }, {});
  const textColor = colorValue(text_color, '#FFFFFF');
  const buttonBackgroundColor = colorValue(button_background_color, '#FFFFFF');
  const buttonTextColor = colorValue(button_text_color, '#0F2A47');
  const shadowIntensity = Number.isFinite(Number(shadow_intensity))
    ? Math.min(100, Math.max(0, Number(shadow_intensity)))
    : 45;
  const shadowBlur = Math.max(1, Math.round(shadowIntensity / 8));
  const shadowAlpha = (0.12 + (shadowIntensity / 100) * 0.5).toFixed(2);
  const shadowColor = colorToRgba(shadow_color, shadowAlpha);
  const textShadow = shadow_enabled ? `0 2px ${shadowBlur}px ${shadowColor}` : 'none';
  const buttonShadow = shadow_enabled ? `0 8px ${shadowBlur + 7}px ${shadowColor}` : 'none';
  const textFontFamily = HERO_FONT_FAMILIES[text_font];
  const buttonFontFamily = HERO_FONT_FAMILIES[button_font];
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
  const imagePlacement = normalizeMediaPlacement(image_placement);
  const visualPlacement = normalizeMediaPlacement(visual_placement);
  const style = image_url
    ? {
      '--hero-image-url': `url(${image_url})`,
      '--hero-image-desktop-position': `${imagePlacement.desktop.x}% ${imagePlacement.desktop.y}%`,
      '--hero-image-desktop-zoom': imagePlacement.desktop.zoom / 100,
      '--hero-image-mobile-position': `${imagePlacement.mobile.x}% ${imagePlacement.mobile.y}%`,
      '--hero-image-mobile-zoom': imagePlacement.mobile.zoom / 100,
      '--hero-visual-desktop-position': `${visualPlacement.desktop.x}% ${visualPlacement.desktop.y}%`,
      '--hero-visual-desktop-zoom': visualPlacement.desktop.zoom / 100,
      '--hero-visual-mobile-position': `${visualPlacement.mobile.x}% ${visualPlacement.mobile.y}%`,
      '--hero-visual-mobile-zoom': visualPlacement.mobile.zoom / 100,
      '--hero-content-desktop-offset-x': `${contentPosition.desktop.x - 50}%`,
      '--hero-content-desktop-offset-y': `${contentPosition.desktop.y - 50}%`,
      '--hero-content-desktop-anchor-x': `${50 - contentPosition.desktop.x}%`,
      '--hero-content-desktop-anchor-y': `${50 - contentPosition.desktop.y}%`,
      '--hero-content-mobile-offset-x': `${contentPosition.mobile.x - 50}%`,
      '--hero-content-mobile-offset-y': `${contentPosition.mobile.y - 50}%`,
      '--hero-content-mobile-anchor-x': `${50 - contentPosition.mobile.x}%`,
      '--hero-content-mobile-anchor-y': `${50 - contentPosition.mobile.y}%`,
      '--hero-text-color': textColor,
      '--hero-button-background': buttonBackgroundColor,
      '--hero-button-text-color': buttonTextColor,
      '--hero-text-shadow': textShadow,
      '--hero-button-shadow': buttonShadow,
      ...(textFontFamily ? { '--hero-text-font-family': textFontFamily } : {}),
      ...(buttonFontFamily ? { '--hero-button-font-family': buttonFontFamily } : {}),
    }
    : {
      '--hero-visual-desktop-position': `${visualPlacement.desktop.x}% ${visualPlacement.desktop.y}%`,
      '--hero-visual-desktop-zoom': visualPlacement.desktop.zoom / 100,
      '--hero-visual-mobile-position': `${visualPlacement.mobile.x}% ${visualPlacement.mobile.y}%`,
      '--hero-visual-mobile-zoom': visualPlacement.mobile.zoom / 100,
      '--hero-content-desktop-offset-x': `${contentPosition.desktop.x - 50}%`,
      '--hero-content-desktop-offset-y': `${contentPosition.desktop.y - 50}%`,
      '--hero-content-desktop-anchor-x': `${50 - contentPosition.desktop.x}%`,
      '--hero-content-desktop-anchor-y': `${50 - contentPosition.desktop.y}%`,
      '--hero-content-mobile-offset-x': `${contentPosition.mobile.x - 50}%`,
      '--hero-content-mobile-offset-y': `${contentPosition.mobile.y - 50}%`,
      '--hero-content-mobile-anchor-x': `${50 - contentPosition.mobile.x}%`,
      '--hero-content-mobile-anchor-y': `${50 - contentPosition.mobile.y}%`,
      '--hero-text-color': textColor,
      '--hero-button-background': buttonBackgroundColor,
      '--hero-button-text-color': buttonTextColor,
      '--hero-text-shadow': textShadow,
      '--hero-button-shadow': buttonShadow,
      ...(textFontFamily ? { '--hero-text-font-family': textFontFamily } : {}),
      ...(buttonFontFamily ? { '--hero-button-font-family': buttonFontFamily } : {}),
    };
  if (custom_code_enabled && custom_code) {
    return <CustomCode code={custom_code} className="hero-custom-code" />;
  }
  return (
    <section className={`hero hero-content-align-${normalizedContentAlign}${minimalVisual ? ' hero-minimal' : ''}${image_url ? ' hero-with-image' : ''}`} style={style}>
      {image_url && <div className={`hero-image-background${overlay_enabled === false ? ' is-without-overlay' : ''}`} aria-hidden="true" />}
      {!minimalVisual && <>
        <div className="hero-glow hero-glow-one" />
        <div className="hero-glow hero-glow-two" />
      </>}
      <div className="hero-content">
        {!minimalVisual && <span className="hero-eyebrow"><span />{eyebrow}</span>}
        {title && <h1>{title}</h1>}
        {subtitle && <p>{subtitle}</p>}
        <div className="hero-actions">
          {cta_text && cta_link && (
            cta_link.startsWith('http')
              ? <a href={cta_link} className="btn btn-accent">{cta_text}<span>↗</span></a>
              : <Link to={cta_link} className="btn btn-accent">{cta_text}<span>→</span></Link>
          )}
          {!minimalVisual && secondary_cta_text && secondary_cta_link && <Link to={secondary_cta_link} className="hero-secondary-link">{secondary_cta_text}<span>→</span></Link>}
        </div>
        {!minimalVisual && <div className="hero-proof"><span><strong>Compra segura</strong><small>Pago protegido</small></span><span><strong>Envíos nacionales</strong><small>A donde estés</small></span></div>}
      </div>
      {!minimalVisual && <div className={`hero-visual ${visual_mode === 'product' ? 'hero-visual-product' : ''}`} aria-label={product ? `Producto destacado: ${product.name}` : undefined}>
        {visualImage
          ? <div className="hero-device hero-device-product"><img className="hero-visual-image" src={visualImage} alt={product?.name || 'Imagen destacada'} /></div>
          : <><div className="hero-orbit hero-orbit-one" /><div className="hero-orbit hero-orbit-two" /><div className="hero-device"><span>TS</span></div></>}
        <div className="hero-floating-card hero-floating-card-top"><span className="floating-dot" />{product ? product.name : 'Selección Rebeca Andrade'}</div>
        {product
          ? <div className="hero-floating-card hero-floating-card-bottom"><strong><Price value={product.base_price} /></strong><span>{product.brand || 'Producto destacado'}</span></div>
          : <div className="hero-floating-card hero-floating-card-bottom"><strong>+ calidad</strong><span>+ estilo</span></div>}
      </div>}
    </section>
  );
}
