// Módulo RecentProducts: grid de productos ordenados por más nuevos.

import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import ProductCard from '../components/ProductCard.jsx';

export default function RecentProducts({ settings = {} }) {
  const { title = 'Lo más nuevo', limit = 8 } = settings;
  const [items, setItems] = useState(null);

  useEffect(() => {
    api.products({ sort: 'newest', limit: String(limit) })
      .then((d) => setItems(d.products || []))
      .catch(() => setItems([]));
  }, [limit]);

  if (items === null) return <section className="store-section"><h2>{title}</h2><div className="center"><span className="spinner" /></div></section>;
  if (items.length === 0) return null;
  return (
    <section className="store-section">
      <div className="section-heading"><div><span className="section-kicker">Recién llegados</span><h2>{title}</h2></div><a href="/categoria?sort=newest">Ver todos <span>→</span></a></div>
      <div className="product-grid">
        {items.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </section>
  );
}
