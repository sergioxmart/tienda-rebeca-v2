// Módulo FeaturedProducts: grid de productos con featured=TRUE.

import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import ProductCard from '../components/ProductCard.jsx';
import Empty from '../components/Empty.jsx';
import CustomCode from './CustomCode.jsx';

export default function FeaturedProducts({ settings = {} }) {
  if (settings.custom_code_enabled && settings.custom_code) {
    return <CustomCode code={settings.custom_code} className="featured-products-custom-code" />;
  }
  const { title = 'Destacados', limit = 8 } = settings;
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.products({ featured: 'true', limit: String(limit) })
      .then((d) => setItems(d.products || []))
      .catch((e) => setError(e.message));
  }, [limit]);

  if (error) return null;
  if (items === null) return <section className="store-section"><h2>{title}</h2><div className="center"><span className="spinner" /></div></section>;
  if (items.length === 0) return null;
  return (
    <section className="store-section">
      <div className="section-heading"><div><span className="section-kicker">Elegidos para ti</span><h2>{title}</h2></div><a href="/categoria?featured=true">Ver todos <span>→</span></a></div>
      <div className="product-grid">
        {items.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </section>
  );
}
