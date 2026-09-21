// Módulo Categories (chips): lista horizontal de links a cada categoría.

import React from 'react';
import { Link } from 'react-router-dom';
import { useSite } from '../site/SiteContext.jsx';
import CustomCode from './CustomCode.jsx';

export default function Categories({ settings = {} }) {
  if (settings.custom_code_enabled && settings.custom_code) {
    return <CustomCode code={settings.custom_code} className="categories-custom-code" />;
  }
  const { title = 'Categorías' } = settings;
  const { categories } = useSite();
  const productCategories = Array.isArray(categories) ? categories.filter((category) => !category.is_service) : [];
  if (productCategories.length === 0) return null;
  return (
    <section className="store-section category-strip-section">
      <div className="section-heading"><div><span className="section-kicker">Encuentra lo que buscas</span><h2>{title}</h2></div></div>
      <div className="category-strip">
        {productCategories.map((c) => (
          <Link key={c.id} to={`/categoria/${c.slug}`} className="chip">
            {c.name}
          </Link>
        ))}
      </div>
    </section>
  );
}
