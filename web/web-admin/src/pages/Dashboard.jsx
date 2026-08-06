// Dashboard simple: conteos básicos de catálogo. Placeholder para v1.

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

function StatCard({ label, value, to }) {
  const content = (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius)',
      padding: 16,
      flex: 1,
      minWidth: 160,
    }}>
      <div style={{ color: 'var(--color-muted)', fontSize: 12, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--color-primary)' }}>{value}</div>
    </div>
  );
  return to ? <Link to={to} style={{ flex: 1, textDecoration: 'none' }}>{content}</Link> : content;
}

export default function Dashboard() {
  const [stats, setStats] = useState({ products: 0, categories: 0, attributes: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, c, a] = await Promise.all([
          api.get('/api/admin/products'),
          api.get('/api/admin/categories'),
          api.get('/api/admin/attributes'),
        ]);
        if (cancelled) return;
        setStats({
          products:   Array.isArray(p.products) ? p.products.length : 0,
          categories: Array.isArray(c.categories) ? c.categories.length : 0,
          attributes: Array.isArray(a.attributes) ? a.attributes.length : 0,
        });
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
      </div>
      <p style={{ color: 'var(--color-muted)' }}>Resumen rápido del catálogo.</p>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <StatCard label="Productos"   value={loading ? '…' : stats.products}   to="/products" />
        <StatCard label="Categorías"  value={loading ? '…' : stats.categories}  to="/categories" />
        <StatCard label="Atributos"   value={loading ? '…' : stats.attributes}  to="/attributes" />
      </div>
    </div>
  );
}
