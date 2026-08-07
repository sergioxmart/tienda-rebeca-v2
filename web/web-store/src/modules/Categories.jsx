// Módulo Categories (chips): lista horizontal de links a cada categoría.

import React from 'react';
import { Link } from 'react-router-dom';
import { useSite } from '../site/SiteContext.jsx';

export default function Categories({ settings = {} }) {
  const { title = 'Categorías' } = settings;
  const { categories } = useSite();
  if (!Array.isArray(categories) || categories.length === 0) return null;
  return (
    <section className="store-section category-strip-section">
      <div className="section-heading"><div><span className="section-kicker">Encuentra lo que buscas</span><h2>{title}</h2></div></div>
      <div className="category-strip">
        {categories.map((c) => (
          <Link key={c.id} to={`/categoria/${c.slug}`} className="chip">
            {c.name}
          </Link>
        ))}
      </div>
    </section>
  );
}
