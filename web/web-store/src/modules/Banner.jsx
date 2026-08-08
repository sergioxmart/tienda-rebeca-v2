// Módulo Banner: imagen clickeable.

import React from 'react';
import { Link } from 'react-router-dom';
import CustomCode from './CustomCode.jsx';

export default function Banner({ settings = {} }) {
  if (settings.custom_code_enabled && settings.custom_code) {
    return <CustomCode code={settings.custom_code} className="banner-custom-code" />;
  }
  const { image_url, link, alt } = settings;
  if (!image_url) return null;
  const content = (
    <div className="promo-banner" style={{ backgroundImage: `url(${image_url})` }} role={alt ? 'img' : undefined} aria-label={alt} />
  );
  if (!link) return content;
  if (link.startsWith('http')) return <a href={link} style={{ display: 'block' }}>{content}</a>;
  return <Link to={link} style={{ display: 'block' }}>{content}</Link>;
}
