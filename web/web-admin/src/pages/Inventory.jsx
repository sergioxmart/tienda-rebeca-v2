// Inventario: el producto y la variante se crean en Productos; aquí solo se
// consultan sus saldos y se registran entradas/salidas trazables.

import React, { useEffect, useState } from 'react';
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

  return (
    <div>
      <div className="page-header">
        <div><span className="eyebrow">Operación</span><h1>Inventario</h1></div>
        <div className="inventory-actions">
          {canWrite && <>
            <button className="btn btn-sm" disabled={!selectedId} onClick={() => openMovement('out')}>− Salida</button>
            <button className="btn btn-primary btn-sm" disabled={!selectedId} onClick={() => openMovement('in')}>＋ Entrada</button>
          </>}
        </div>
      </div>
      <p className="inventory-intro">Gestiona las unidades de variantes que ya existen en Productos. Cada movimiento queda registrado con su saldo anterior y posterior.</p>

      <div className="toolbar inventory-filters">
        <input className="input search" placeholder="Buscar producto o SKU…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select" value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">Todos los productos</option>
          {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
        </select>
        <input className="input" type="number" min={0} placeholder="Stock ≤" value={lowStock} onChange={(e) => setLowStock(e.target.value)} />
      </div>

      <div className="inventory-layout">
        <div>
          {loading ? <div className="inventory-loading"><span className="spinner" /></div> : variants.length === 0 ? <Empty title="Sin variantes" description="Crea primero las variantes desde Productos para poder asignarles inventario." /> : (
            <table className="data-table inventory-table">
              <thead><tr><th>Producto</th><th>Variante</th><th>SKU</th><th style={{ textAlign: 'right' }}>Stock actual</th></tr></thead>
              <tbody>{variants.map((variant) => <tr key={variant.variant_id} className={selectedId === variant.variant_id ? 'row-selected' : ''} onClick={() => selectVariant(variant.variant_id)}>
                <td><strong>{variant.product_name}</strong></td>
                <td>{variant.combination || 'Variante general'}</td>
                <td><code>{variant.sku || '—'}</code></td>
                <td className={`inventory-stock ${variant.stock === 0 ? 'is-empty' : variant.stock <= 5 ? 'is-low' : ''}`}>{variant.stock}</td>
              </tr>)}</tbody>
            </table>
          )}
        </div>

        <aside className="inventory-detail">
          {!selectedDetail ? <div className="inventory-detail-empty">Selecciona una variante para consultar su historial.</div> : <>
            <div className="inventory-detail-head"><div><span className="eyebrow">Variante seleccionada</span><h2>{selectedDetail.variant.product_name}</h2><p>{selectedDetail.variant.sku || 'Sin SKU'} · {selectedRow?.combination || 'Variante general'}</p></div><strong>{selectedDetail.variant.stock}</strong></div>
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
