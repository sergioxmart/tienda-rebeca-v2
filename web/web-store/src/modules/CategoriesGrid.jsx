// Módulo CategoriesGrid: grid de cards con cada categoría (imagen o letra inicial).

import React from 'react';
import { Link } from 'react-router-dom';
import { useSite } from '../site/SiteContext.jsx';

export default function CategoriesGrid({ settings = {} }) {
  const { title = 'Categorías' } = settings;
  const { categories } = useSite();
  if (!Array.isArray(categories) || categories.length === 0) return null;
  return (
    <section style={{ marginBottom: 32 }}>
      <h2>{title}</h2>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 12,
      }}>
        {categories.map((c) => (
          <Link key={c.id} to={`/categoria/${c.slug}`} style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            aspectRatio: '1/1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 4,
            textDecoration: 'none',
            color: 'var(--color-primary)',
            fontWeight: 500,
            transition: 'transform 0.15s',
          }}>
            {c.hero_image && (
              <img src={c.hero_image} alt={c.name} style={{ maxWidth: 60, maxHeight: 60, objectFit: 'contain' }} />
            )}
            {!c.hero_image && (
              <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--color-accent)' }}>
                {c.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div style={{ fontSize: 14 }}>{c.name}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
