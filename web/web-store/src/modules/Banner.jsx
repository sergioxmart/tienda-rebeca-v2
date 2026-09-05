// Módulo Banner: imagen clickeable.

import React from 'react';
import { Link } from 'react-router-dom';
import CustomCode from './CustomCode.jsx';
import { normalizeMediaPlacement } from './mediaPlacement.js';

export default function Banner({ settings = {} }) {
  if (settings.custom_code_enabled && settings.custom_code) {
    return <CustomCode code={settings.custom_code} className="banner-custom-code" />;
  }
  const { image_url, image_placement, link, alt } = settings;
  if (!image_url) return null;
  const placement = normalizeMediaPlacement(image_placement);
  const style = {
    '--banner-image-url': `url(${image_url})`,
    '--banner-image-desktop-position': `${placement.desktop.x}% ${placement.desktop.y}%`,
    '--banner-image-desktop-zoom': placement.desktop.zoom / 100,
    '--banner-image-mobile-position': `${placement.mobile.x}% ${placement.mobile.y}%`,
    '--banner-image-mobile-zoom': placement.mobile.zoom / 100,
  };
  const content = (
    <div className="promo-banner" style={style} role={alt ? 'img' : undefined} aria-label={alt} />
  );
  if (!link) return content;
  if (link.startsWith('http')) return <a href={link} style={{ display: 'block' }}>{content}</a>;
  return <Link to={link} style={{ display: 'block' }}>{content}</Link>;
}
