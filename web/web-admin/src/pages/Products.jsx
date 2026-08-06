// Lista de productos. Búsqueda simple + botón "Editar" que va al form.

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import Empty from '../components/Empty.jsx';

function formatCOP(n) {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(n));
}

export default function Products() {
  const toast = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get('/api/admin/categories');
        setCategories(data.categories || []);
      } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const params = new URLSearchParams();
        if (q) params.set('q', q);
        if (categoryId) params.set('category_id', categoryId);
        params.set('limit', '100');
        const data = await api.get(`/api/admin/products?${params.toString()}`);
        if (cancelled) return;
        setItems(data.products || data.items || []);
      } catch (err) {
        toast.error('No se pudieron cargar los productos', err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [q, categoryId, reloadKey, toast]);

  return (
    <div>
      <div className="page-header">
        <h1>Productos</h1>
        <button className="btn btn-primary" onClick={() => navigate('/products/new')}>+ Nuevo producto</button>
      </div>

      <div className="toolbar">
        <input className="input search" placeholder="Buscar por nombre…"
               value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="">Todas las categorías</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="btn" onClick={() => setReloadKey((k) => k + 1)}>Refrescar</button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>
      ) : items.length === 0 ? (
        <Empty title="Sin productos" description="No hay productos que coincidan con tu búsqueda." action={
          <button className="btn btn-primary" onClick={() => navigate('/products/new')}>+ Nuevo producto</button>
        } />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Categoría</th>
              <th>Precio base</th>
              <th>Stock</th>
              <th>Estado</th>
              <th style={{ textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id}>
                <td>
                  <div style={{ fontWeight: 500 }}>{p.name}</div>
                  <div style={{ color: 'var(--color-muted)', fontSize: 12 }}><code>{p.slug}</code></div>
                </td>
                <td>{p.category_name || p.category_id}</td>
                <td>{formatCOP(p.base_price)}</td>
                <td>{p.total_stock ?? '—'}</td>
                <td>
                  {p.active
                    ? <span className="badge active">Activo</span>
                    : <span className="badge inactive">Inactivo</span>}
                  {p.featured && <span className="badge featured" style={{ marginLeft: 4 }}>Destacado</span>}
                </td>
                <td className="table-actions">
                  <Link className="btn btn-sm" to={`/products/${p.id}`}>Editar</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
