// Inventario: el producto y la variante se crean en Productos; aquí solo se
// consultan sus saldos y se registran entradas/salidas trazables.

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import Modal from '../components/Modal.jsx';
import Empty from '../components/Empty.jsx';

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function initials(value) {
  return String(value || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export default function Inventory() {
  const toast = useToast();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [variants, setVariants] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedId, setSelectedId] = useState(Number(searchParams.get('variant_id')) || null);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [productId, setProductId] = useState('');
  const [q, setQ] = useState('');
  const [lowStock, setLowStock] = useState('');
  const [loading, setLoading] = useState(true);
  const [movementType, setMovementType] = useState(null);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/admin/products?limit=100').then((data) => setProducts(data.products || [])).catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (productId) params.set('product_id', productId);
      if (q.trim()) params.set('q', q.trim());
      if (lowStock !== '') params.set('low_stock', lowStock);
      const data = await api.get(`/api/admin/inventory/variants?${params.toString()}`);
      const next = data.variants || [];
      setVariants(next);
      if (selectedId && !next.some((item) => item.variant_id === selectedId)) {
        setSelectedId(null);
        setSelectedDetail(null);
      }
    } catch (err) {
      toast.error('No se pudo cargar el inventario', err.message);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [productId, q, lowStock]);

  const selectVariant = async (variantId) => {
    setSelectedId(variantId);
    setSearchParams({ variant_id: String(variantId) });
    try {
      setSelectedDetail(await api.get(`/api/admin/inventory/variants/${variantId}`));
    } catch (err) { toast.error('No se pudo cargar el historial', err.message); }
  };

  useEffect(() => {
    if (selectedId && !selectedDetail) selectVariant(selectedId);
  }, [selectedId, selectedDetail]);

  const openMovement = (type) => {
    setMovementType(type);
    setQuantity('');
    setReason('');
  };

  const saveMovement = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post('/api/admin/inventory/movements', {
        variant_id: selectedId,
        movement_type: movementType,
        quantity: Number(quantity),
        reason,
      });
      toast.success(movementType === 'in' ? 'Entrada registrada' : 'Salida registrada');
      setMovementType(null);
      await load();
      if (selectedId) await selectVariant(selectedId);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'insufficient_stock') {
        toast.error('No hay unidades suficientes', `Stock actual: ${err.details?.stock ?? 0}`);
      } else toast.error('No se pudo registrar el movimiento', err.message);
    } finally { setSaving(false); }
  };

  const selectedRow = variants.find((item) => item.variant_id === selectedId);
  const canWrite = user?.role === 'admin' || user?.role === 'operator';
  const summary = useMemo(() => {
    const totalUnits = variants.reduce((sum, variant) => sum + Number(variant.stock || 0), 0);
    return {
      variants: variants.length,
      totalUnits,
      available: variants.filter((variant) => Number(variant.stock) > 0).length,
      low: variants.filter((variant) => Number(variant.stock) > 0 && Number(variant.stock) <= 5).length,
      empty: variants.filter((variant) => Number(variant.stock) <= 0).length,
    };
  }, [variants]);

  const hasFilters = productId || q || lowStock !== '';

  return (
    <div>
      <div className="page-header">
        <div><span className="eyebrow">Operación · existencias</span><h1>Inventario</h1><p className="page-subtitle">Controla entradas, salidas y saldos por variante.</p></div>
        <div className="inventory-actions">
          {canWrite && <>
            <button className="btn btn-sm" disabled={!selectedId} onClick={() => openMovement('out')}>− Salida</button>
            <button className="btn btn-primary btn-sm" disabled={!selectedId} onClick={() => openMovement('in')}>＋ Entrada</button>
          </>}
        </div>
      </div>

      <section className="inventory-overview" aria-label="Resumen del inventario">
        <div className="inventory-stat-card"><span className="inventory-stat-icon navy">▦</span><div><small>Variantes en vista</small><strong>{summary.variants}</strong></div></div>
        <div className="inventory-stat-card"><span className="inventory-stat-icon teal">＋</span><div><small>Unidades actuales</small><strong>{summary.totalUnits}</strong></div></div>
        <div className="inventory-stat-card"><span className="inventory-stat-icon orange">!</span><div><small>Stock bajo</small><strong>{summary.low}</strong></div></div>
        <div className="inventory-stat-card"><span className="inventory-stat-icon red">×</span><div><small>Agotadas</small><strong>{summary.empty}</strong></div></div>
      </section>

      <section className="inventory-filter-card">
        <div className="inventory-filter-heading"><div><strong>Filtrar inventario</strong><span>Busca una variante o revisa productos con pocas unidades.</span></div>{hasFilters && <button className="btn btn-sm" onClick={() => { setProductId(''); setQ(''); setLowStock(''); }}>Limpiar filtros</button>}</div>
        <div className="inventory-filters">
          <label className="inventory-filter-field"><span>Buscar</span><input className="input search" placeholder="Producto o SKU…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <label className="inventory-filter-field"><span>Producto</span><select className="select" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Todos los productos</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select></label>
          <label className="inventory-filter-field inventory-filter-stock"><span>Stock máximo</span><input className="input" type="number" min={0} placeholder="Ej. 5" value={lowStock} onChange={(e) => setLowStock(e.target.value)} /></label>
        </div>
      </section>

      <div className="inventory-layout">
        <div>
          {loading ? <div className="inventory-loading"><span className="spinner" /></div> : variants.length === 0 ? <Empty title="Sin variantes" description="Crea primero las variantes desde Productos para poder asignarles inventario." /> : (
            <section className="inventory-table-card">
              <div className="inventory-table-heading"><div><strong>Variantes</strong><span>Selecciona una fila para ver el historial y registrar movimientos.</span></div><span className="inventory-count">{variants.length} resultados</span></div>
              <div className="inventory-table-wrap"><table className="data-table inventory-table">
                <thead><tr><th>Producto</th><th>Variante</th><th>SKU</th><th style={{ textAlign: 'right' }}>Stock actual</th><th aria-label="Abrir detalle" /></tr></thead>
                <tbody>{variants.map((variant) => {
                  const stock = Number(variant.stock || 0);
                  const stockLabel = stock <= 0 ? 'Agotado' : stock <= 5 ? 'Stock bajo' : 'Disponible';
                  return <tr key={variant.variant_id} className={selectedId === variant.variant_id ? 'row-selected' : ''} onClick={() => selectVariant(variant.variant_id)}>
                    <td><div className="inventory-product-cell"><span className="inventory-avatar">{initials(variant.product_name)}</span><div><strong>{variant.product_name}</strong><small>Producto #{variant.product_id}</small></div></div></td>
                    <td><span className="inventory-combination">{variant.combination || 'Variante general'}</span></td>
                    <td><code>{variant.sku || '—'}</code></td>
                    <td><div className="inventory-stock-cell"><strong className={`inventory-stock ${stock === 0 ? 'is-empty' : stock <= 5 ? 'is-low' : ''}`}>{stock}</strong><span className={`inventory-status ${stock === 0 ? 'is-empty' : stock <= 5 ? 'is-low' : 'is-ok'}`}>{stockLabel}</span></div></td>
                    <td className="inventory-row-arrow">›</td>
                  </tr>;
                })}</tbody>
              </table></div>
            </section>
          )}
        </div>

        <aside className="inventory-detail">
          {!selectedDetail ? <div className="inventory-detail-empty"><span className="inventory-detail-empty-icon">↗</span><strong>Selecciona una variante</strong><span>Consulta el historial de movimientos y gestiona sus unidades.</span></div> : <>
            <div className="inventory-detail-head"><div><span className="eyebrow">Detalle de variante</span><h2>{selectedDetail.variant.product_name}</h2><p>{selectedDetail.variant.sku || 'Sin SKU'} · {selectedRow?.combination || 'Variante general'}</p></div><div className="inventory-stock-hero"><strong>{selectedDetail.variant.stock}</strong><span>unidades</span></div></div>
            <div className="inventory-detail-toolbar"><span className={`inventory-status ${Number(selectedDetail.variant.stock) <= 0 ? 'is-empty' : Number(selectedDetail.variant.stock) <= 5 ? 'is-low' : 'is-ok'}`}>{Number(selectedDetail.variant.stock) <= 0 ? 'Agotado' : Number(selectedDetail.variant.stock) <= 5 ? 'Stock bajo' : 'Disponible'}</span><span>SKU: {selectedDetail.variant.sku || '—'}</span></div>
            <div className="inventory-history"><h3>Movimientos recientes</h3>
              {selectedDetail.movements.length === 0 ? <p className="form-hint">Todavía no hay movimientos.</p> : selectedDetail.movements.map((movement) => <div className="inventory-movement" key={movement.id}><span className={`movement-dot ${movement.movement_type}`} /> <div><strong>{movement.movement_type === 'in' ? 'Entrada' : 'Salida'} · {movement.quantity} unidades</strong><small>{formatDate(movement.created_at)}{movement.reason ? ` · ${movement.reason}` : ''}</small></div><b>{movement.stock_after}</b></div>)}
            </div>
          </>}
        </aside>
      </div>

      <Modal open={!!movementType} onClose={() => !saving && setMovementType(null)} title={movementType === 'in' ? 'Registrar entrada' : 'Registrar salida'} footer={<><button className="btn" onClick={() => setMovementType(null)} disabled={saving}>Cancelar</button><button className="btn btn-primary" onClick={saveMovement} disabled={saving || !quantity}>{saving ? <span className="spinner" /> : 'Guardar movimiento'}</button></>}>
        <form onSubmit={saveMovement}>
          <div className="alert-info alert">{movementType === 'in' ? 'Las unidades se sumarán al stock actual.' : 'Las unidades se descontarán del stock actual. No puede quedar negativo.'}</div>
          <div className="form-group"><label>Cantidad</label><input className="input" type="number" min={1} required value={quantity} onChange={(e) => setQuantity(e.target.value)} autoFocus /></div>
          <div className="form-group"><label>Motivo <span className="form-hint">(opcional)</span></label><input className="input" maxLength={500} placeholder="Compra, devolución, venta manual…" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        </form>
      </Modal>
    </div>
  );
}
