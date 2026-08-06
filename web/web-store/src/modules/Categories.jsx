// Módulo Categories (chips): lista horizontal de links a cada categoría.

import React from 'react';
import { Link } from 'react-router-dom';
import { useSite } from '../site/SiteContext.jsx';

export default function Categories({ settings = {} }) {
  const { title = 'Categorías' } = settings;
  const { categories } = useSite();
  if (!Array.isArray(categories) || categories.length === 0) return null;
  return (
    <section style={{ marginBottom: 32 }}>
      <h2>{title}</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {categories.map((c) => (
          <Link key={c.id} to={`/categoria/${c.slug}`} className="chip">
            {c.name}
          </Link>
        ))}
      </div>
    </section>
  );
}
