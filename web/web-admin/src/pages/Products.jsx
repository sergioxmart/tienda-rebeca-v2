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

function ChevronIcon({ direction }) {
  return <svg className="icon-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d={direction === 'up' ? 'm6 14 6-6 6 6' : 'm6 10 6 6 6-6'} /></svg>;
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
  const [selectedId, setSelectedId] = useState(null);
  const [moving, setMoving] = useState(false);

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

  const moveSelected = async (direction) => {
    const index = items.findIndex((item) => item.id === selectedId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= items.length || q || categoryId) return;
    const current = items[index];
    const target = items[targetIndex];
    setMoving(true);
    try {
      await Promise.all([
        api.patch(`/api/admin/products/${current.id}`, { display_order: target.display_order }),
        api.patch(`/api/admin/products/${target.id}`, { display_order: current.display_order }),
      ]);
      toast.success('Orden actualizado');
      setReloadKey((key) => key + 1);
    } catch (err) {
      toast.error('No se pudo cambiar el orden', err.message);
    } finally {
      setMoving(false);
    }
  };

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

      <div className="order-toolbar">
        <span>{selectedId ? 'Producto seleccionado' : 'Selecciona un producto para cambiar su posición'}</span>
        <div className="order-toolbar-actions">
          <button className="btn btn-sm" title="Subir" aria-label="Subir producto"
                  disabled={!selectedId || moving || !!q || !!categoryId || items.findIndex((p) => p.id === selectedId) <= 0}
                  onClick={() => moveSelected(-1)}><ChevronIcon direction="up" /></button>
          <button className="btn btn-sm" title="Bajar" aria-label="Bajar producto"
                  disabled={!selectedId || moving || !!q || !!categoryId || items.findIndex((p) => p.id === selectedId) === items.length - 1}
                  onClick={() => moveSelected(1)}><ChevronIcon direction="down" /></button>
          {(q || categoryId) && <small>Quita los filtros para ordenar.</small>}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>
      ) : items.length === 0 ? (
        <Empty title="Sin productos" description="No hay productos que coincidan con tu búsqueda." action={
          <button className="btn btn-primary" onClick={() => navigate('/products/new')}>+ Nuevo producto</button>
        } />
      ) : (
        <table className="data-table products-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Categoría</th>
              <th>Precio base</th>
              <th>Estado</th>
              <th className="table-actions-heading">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className={selectedId === p.id ? 'row-selected' : ''} onClick={() => setSelectedId(p.id)}>
                <td>
                  <div style={{ fontWeight: 500 }}>{p.name}</div>
                  <div style={{ color: 'var(--color-muted)', fontSize: 12 }}><code>{p.slug}</code></div>
                </td>
                <td>{p.category_name || p.category_id}</td>
                <td>{formatCOP(p.base_price)}</td>
                <td>
                  {p.active
                    ? <span className="badge active">Activo</span>
                    : <span className="badge inactive">Inactivo</span>}
                  {p.featured && <span className="badge featured" style={{ marginLeft: 4 }}>Destacado</span>}
                </td>
                <td className="table-actions">
                  <Link className="btn btn-sm" to={`/products/${p.id}`} onClick={(e) => e.stopPropagation()}>Editar</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
