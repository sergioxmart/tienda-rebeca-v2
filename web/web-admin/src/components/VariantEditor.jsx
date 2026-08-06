// Editor de variantes para un producto.
//
// Carga los attribute_values del catálogo al montar (los que el producto
// tiene vinculados). Permite:
//   - Listar las variantes existentes con valores legibles (no IDs).
//   - Crear variante nueva (modal).
//   - Editar variante existente (modal con mismos campos).
//   - Borrar con confirmación.
//   - Ajuste rápido de stock (input directo en la fila).
//
// Backend: ver web/server/routes/admin/variants.js. La invariante de
// "no dos variantes con la misma combinación" la enforces el server
// (409 duplicate_variant) — acá mostramos el error como toast.

import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../api.js';
import { useToast } from './Toast.jsx';
import Modal from './Modal.jsx';
import Confirm from './Confirm.jsx';
import Empty from './Empty.jsx';

function formatCOP(n) {
  if (n === null || n === undefined || n === '') return '—';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(n));
}

const EMPTY = {
  sku: '',
  price: '',
  stock: 0,
  active: true,
  attribute_values: [],  // [{ attribute_id, attribute_value_id }]
};

export default function VariantEditor({ productId, variants, attributes, onChange }) {
  const toast = useToast();
  const [allValues, setAllValues] = useState({});  // { [attribute_id]: [{id, value}] }
  const [editing, setEditing] = useState(null);    // variant en edición o { ...EMPTY } para nueva
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);
  const [stockBusy, setStockBusy] = useState(null);  // id de variante mientras se ajusta stock

  // Cargar todos los valores de los atributos del producto
  useEffect(() => {
    (async () => {
      const map = {};
      for (const a of attributes) {
        try {
          const { values } = await api.get(`/api/admin/attributes/${a.id}/values`);
          map[a.id] = values || [];
        } catch {
          map[a.id] = [];
        }
      }
      setAllValues(map);
    })();
  }, [attributes]);

  const reload = async () => { await onChange?.(); };

  const openNew = () => setEditing({ ...EMPTY, attribute_values: attributes.map((a) => ({ attribute_id: a.id, attribute_value_id: '' })) });
  const openEdit = (v) => setEditing({
    id: v.id,
    sku: v.sku || '',
    price: v.price ?? '',
    stock: v.stock,
    active: v.active,
    attribute_values: attributes.map((a) => {
      const found = (v.attribute_values || []).find((x) => x.attribute_id === a.id);
      return { attribute_id: a.id, attribute_value_id: found ? found.attribute_value_id : '' };
    }),
  });

  const handleSave = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      // Filtrar los attribute_values que sí tienen valor seleccionado
      const avs = editing.attribute_values
        .filter((x) => x.attribute_value_id !== '' && x.attribute_value_id !== null)
        .map((x) => ({ attribute_id: Number(x.attribute_id), attribute_value_id: Number(x.attribute_value_id) }));

      if (editing.id) {
        await api.patch(`/api/admin/variants/${editing.id}`, {
          sku: editing.sku || null,
          price: editing.price === '' ? null : Number(editing.price),
          stock: Number(editing.stock),
          active: !!editing.active,
        });
        // Si los attribute_values cambiaron, mandarlos aparte (update los acepta)
        const original = variants.find((v) => v.id === editing.id);
        const originalAvs = (original?.attribute_values || []).map((x) => ({ attribute_id: x.attribute_id, attribute_value_id: x.attribute_value_id }));
        const sameCombo = originalAvs.length === avs.length &&
          originalAvs.every((x) => avs.some((y) => y.attribute_id === x.attribute_id && y.attribute_value_id === x.attribute_value_id));
        if (!sameCombo) {
          await api.patch(`/api/admin/variants/${editing.id}`, { attribute_values: avs });
        }
        toast.success('Variante actualizada');
      } else {
        await api.post(`/api/admin/products/${productId}/variants`, {
          sku: editing.sku || null,
          price: editing.price === '' ? null : Number(editing.price),
          stock: Number(editing.stock),
          active: !!editing.active,
          attribute_values: avs,
        });
        toast.success('Variante creada');
      }
      setEditing(null);
      await reload();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'duplicate_variant') {
        toast.error('Ya existe una variante con esa combinación de atributos');
      } else {
        toast.error('No se pudo guardar', err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/api/admin/variants/${deleting.id}`);
      toast.success('Variante eliminada');
      setDeleting(null);
      await reload();
    } catch (err) {
      toast.error('No se pudo eliminar', err.message);
    }
  };

  const handleStockChange = async (variant, newStock) => {
    setStockBusy(variant.id);
    try {
      await api.patch(`/api/admin/variants/${variant.id}/stock`, { stock: Number(newStock) });
      toast.success('Stock actualizado');
      await reload();
    } catch (err) {
      toast.error('No se pudo actualizar el stock', err.message);
    } finally {
      setStockBusy(null);
    }
  };

  const setAv = (attrId, valueId) => {
    setEditing((cur) => ({
      ...cur,
      attribute_values: cur.attribute_values.map((x) =>
        x.attribute_id === attrId ? { ...x, attribute_value_id: valueId === '' ? '' : Number(valueId) } : x
      ),
    }));
  };

  if (attributes.length === 0) {
    return (
      <>
        <h2>Variantes</h2>
        <div className="empty" style={{ padding: 20 }}>
          Primero vinculá atributos al producto (arriba) para poder crear variantes.
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header" style={{ marginTop: 0 }}>
        <h2>Variantes</h2>
        <button className="btn btn-primary btn-sm" onClick={openNew}>+ Nueva variante</button>
      </div>

      {variants.length === 0 ? (
        <Empty title="Sin variantes" description="Creá la primera combinación." action={
          <button className="btn btn-primary btn-sm" onClick={openNew}>+ Nueva variante</button>
        } />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Combinación</th>
              <th>Stock</th>
              <th>Precio</th>
              <th>Estado</th>
              <th style={{ textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => (
              <tr key={v.id}>
                <td><code>{v.sku || '—'}</code></td>
                <td style={{ fontSize: 12 }}>
                  {(v.attribute_values || []).map((x) => (
                    <span key={x.attribute_id} className="badge" style={{ marginRight: 4 }}>
                      {x.attribute_name}: {x.value}
                    </span>
                  ))}
                </td>
                <td>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    style={{ width: 80, padding: '4px 6px' }}
                    defaultValue={v.stock}
                    onBlur={(e) => { if (Number(e.target.value) !== v.stock) handleStockChange(v, e.target.value); }}
                    disabled={stockBusy === v.id}
                  />
                </td>
                <td>{formatCOP(v.price)}</td>
                <td>
                  {v.active
                    ? <span className="badge active">Activa</span>
                    : <span className="badge inactive">Inactiva</span>}
                </td>
                <td className="table-actions">
                  <button className="btn btn-sm" onClick={() => openEdit(v)}>Editar</button>
                  <button className="btn btn-sm btn-danger" onClick={() => setDeleting(v)}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal
        open={!!editing}
        onClose={() => !saving && setEditing(null)}
        title={editing?.id ? 'Editar variante' : 'Nueva variante'}
        footer={
          <>
            <button className="btn" onClick={() => setEditing(null)} disabled={saving}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <span className="spinner" /> : 'Guardar'}
            </button>
          </>
        }
      >
        {editing && (
          <form onSubmit={handleSave}>
            <div className="form-row">
              <div className="form-group">
                <label>SKU <span style={{ color: 'var(--color-muted)' }}>(opcional)</span></label>
                <input className="input" maxLength={80}
                       value={editing.sku} onChange={(e) => setEditing({ ...editing, sku: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Precio <span style={{ color: 'var(--color-muted)' }}>(opcional, usa base del producto)</span></label>
                <input className="input" type="number" min={0}
                       value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Stock</label>
                <input className="input" type="number" min={0} required
                       value={editing.stock} onChange={(e) => setEditing({ ...editing, stock: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Estado</label>
                <select className="select" value={String(editing.active)}
                        onChange={(e) => setEditing({ ...editing, active: e.target.value === 'true' })}>
                  <option value="true">Activa</option>
                  <option value="false">Inactiva</option>
                </select>
              </div>
            </div>
            <h3 style={{ marginTop: 16 }}>Combinación de atributos</h3>
            {attributes.map((a) => (
              <div className="form-group" key={a.id}>
                <label>{a.name}</label>
                <select className="select" required
                        value={editing.attribute_values.find((x) => x.attribute_id === a.id)?.attribute_value_id ?? ''}
                        onChange={(e) => setAv(a.id, e.target.value)}>
                  <option value="">— Seleccioná —</option>
                  {(allValues[a.id] || []).map((v) => (
                    <option key={v.id} value={v.id}>{v.value}</option>
                  ))}
                </select>
              </div>
            ))}
          </form>
        )}
      </Modal>

      <Confirm
        open={!!deleting}
        title="¿Eliminar variante?"
        message="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
    </>
  );
}
