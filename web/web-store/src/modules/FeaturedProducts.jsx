// Módulo FeaturedProducts: grid de productos con featured=TRUE.

import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import ProductCard from '../components/ProductCard.jsx';
import Empty from '../components/Empty.jsx';

export default function FeaturedProducts({ settings = {} }) {
  const { title = 'Destacados', limit = 8 } = settings;
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.products({ featured: 'true', limit: String(limit) })
      .then((d) => setItems(d.products || []))
      .catch((e) => setError(e.message));
  }, [limit]);

  if (error) return null;
  if (items === null) return <section style={{ marginBottom: 32 }}><h2>{title}</h2><div className="center"><span className="spinner" /></div></section>;
  if (items.length === 0) return null;
  return (
    <section style={{ marginBottom: 32 }}>
      <h2>{title}</h2>
      <div className="product-grid">
        {items.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </section>
  );
}
