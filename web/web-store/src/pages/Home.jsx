// Home: hero, categorías como chips, productos destacados y productos recientes.

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useSite } from '../site/SiteContext.jsx';
import ProductCard from '../components/ProductCard.jsx';
import Empty from '../components/Empty.jsx';

export default function Home() {
  const { site, categories } = useSite();
  const [featured, setFeatured] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [f, r] = await Promise.all([
          api.products({ featured: 'true', limit: 8 }),
          api.products({ sort: 'newest', limit: 8 }),
        ]);
        setFeatured(f.products || []);
        setRecent(r.products || []);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, []);

  const storeName = site?.site_name || 'TechStore';

  return (
    <div>
      <section className="hero">
        <h1>Todo para tu celular, en un solo lugar</h1>
        <p>Carcasas, forros, cargadores, audífonos y más. Envío a todo Colombia.</p>
        {categories[0] && (
          <Link to={`/categoria/${categories[0].slug}`} className="btn btn-accent">
            Ver catálogo
          </Link>
        )}
      </section>

      {categories.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2>Categorías</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {categories.map((c) => (
              <Link key={c.id} to={`/categoria/${c.slug}`} className="chip">
                {c.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section style={{ marginBottom: 32 }}>
        <h2>Destacados</h2>
        {loading ? (
          <div className="center"><span className="spinner" /></div>
        ) : featured.length === 0 ? (
          <Empty title="Sin destacados" description="Pronto vamos a marcar productos como destacados." />
        ) : (
          <div className="product-grid">
            {featured.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </section>

      <section>
        <h2>Lo más nuevo</h2>
        {loading ? (
          <div className="center"><span className="spinner" /></div>
        ) : recent.length === 0 ? (
          <Empty title="Sin productos aún" />
        ) : (
          <div className="product-grid">
            {recent.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </section>
    </div>
  );
}
