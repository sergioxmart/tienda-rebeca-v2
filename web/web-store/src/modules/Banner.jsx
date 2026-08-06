// Módulo Banner: imagen clickeable.

import React from 'react';
import { Link } from 'react-router-dom';

export default function Banner({ settings = {} }) {
  const { image_url, link, alt } = settings;
  if (!image_url) return null;
  const content = (
    <div style={{
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      aspectRatio: '4/1',
      background: '#F3F4F6',
      backgroundImage: `url(${image_url})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }} role={alt ? 'img' : undefined} aria-label={alt} />
  );
  if (!link) return content;
  if (link.startsWith('http')) return <a href={link} style={{ display: 'block' }}>{content}</a>;
  return <Link to={link} style={{ display: 'block' }}>{content}</Link>;
}
