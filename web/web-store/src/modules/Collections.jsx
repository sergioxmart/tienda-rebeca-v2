// Grid de colecciones basado en las categorías existentes del catálogo.

import React from 'react';
import { Link } from 'react-router-dom';
import { useSite } from '../site/SiteContext.jsx';
import CustomCode from './CustomCode.jsx';

export default function Collections({ settings = {} }) {
  const { title = 'Explora nuestras categorías', variant = 'classic' } = settings;
  const { categories } = useSite();
  if (settings.custom_code_enabled && settings.custom_code) return <CustomCode code={settings.custom_code} className="collections-custom-code" />;
  if (!categories?.length) return null;
  return (
    <section className={`editorial-collections editorial-collections--${variant}`}>
      {title && <h2>{title}</h2>}
      <div className="editorial-collections__grid">
        {categories.map((category) => (
          <Link key={category.id} to={`/categoria/${category.slug}`} className="editorial-collection" style={category.hero_image ? { backgroundImage: `url(${category.hero_image})` } : undefined}>
            <span><strong>{category.name}</strong><small>Explorar →</small></span>
          </Link>
        ))}
      </div>
    </section>
  );
}
