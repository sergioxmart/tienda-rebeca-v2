// Módulo CategoriesGrid: grid de cards con cada categoría (imagen o letra inicial).

import React from 'react';
import { Link } from 'react-router-dom';
import { useSite } from '../site/SiteContext.jsx';
import CustomCode from './CustomCode.jsx';

export default function CategoriesGrid({ settings = {} }) {
  if (settings.custom_code_enabled && settings.custom_code) {
    return <CustomCode code={settings.custom_code} className="categories-grid-custom-code" />;
  }
  const { title = 'Categorías' } = settings;
  const { categories } = useSite();
  if (!Array.isArray(categories) || categories.length === 0) return null;
  return (
    <section className="store-section">
      <div className="section-heading"><div><span className="section-kicker">Compra por categoría</span><h2>{title}</h2></div></div>
      <div className="category-grid">
        {categories.map((c) => (
          <Link key={c.id} to={`/categoria/${c.slug}`} className="category-card">
            {c.hero_image && (
              <img src={c.hero_image} alt={c.name} />
            )}
            {!c.hero_image && (
              <div className="category-card-icon">
                {c.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>{c.name}</div><span>Explorar →</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
